import fs from 'fs/promises'
import path from 'path'
import tmp from 'tmp-promise'
import ytDlpPkg from 'yt-dlp-wrap'

const YTDlpWrap = ytDlpPkg.default

export default async function setupYouTubeDownload(telegramBot) {
  const ytDlpBinaryPath = './yt-dlp'

  async function ensureYtDlpDownloaded() {
    try {
      await fs.access(ytDlpBinaryPath)
    } catch (err) {
      await YTDlpWrap.downloadFromGithub()
    }
  }

  await ensureYtDlpDownloaded()
  const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath)

  const targetChatId = process.env.TELEGRAM_CHAT_ID

  // Получение всей JSON-информации по видео
  async function getVideoInfo(url) {
    const result = await ytDlpWrap.execPromise([
      url,
      '--dump-single-json',
      ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : [])
    ])
    return JSON.parse(result)
  }

  telegramBot.on('message', async (msg) => {
    if (String(msg.chat.id) !== targetChatId) return
    if (!msg.text) return

    const chatId = msg.chat.id
    const text = msg.text

    // Ссылки на youtube.com и youtu.be
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/g
    const links = text.match(youtubeRegex)
    if (!links) return

    for (const link of links) {
      try {
        // Получаем информацию о видео
        const info = await getVideoInfo(link)
        const duration = info.duration || 0
        if (duration > 1800) {
          // Больше 30 минут — не скачиваем
          await telegramBot.sendMessage(
            chatId,
            'Видео длиннее 30 минут, скачивание не допускается.',
            { reply_to_message_id: msg.message_id }
          )
          continue
        }

        // Выбираем формат в зависимости от продолжительности
        let format = ''
        if (duration <= 180) {
          // до 3 минут => 720p
          format = 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]'
        } else if (duration <= 600) {
          // до 10 минут => 480p
          format = 'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]'
        } else {
          // до 30 минут => 240p
          format = 'bestvideo[ext=mp4][height<=240]+bestaudio[ext=m4a]/best[ext=mp4][height<=240]'
        }

        // Создаём временную директорию
        const tempDir = await tmp.dir({ prefix: 'youtube-' })

        // Формируем путь для итогового файла:
        // Имя файла = ID видео, расширение определяется yt-dlp (с использованием %(ext)s)
        const outPath = path.join(tempDir.path, `${info.id}.%(ext)s`)

        // Параметры для yt-dlp с дополнительными флагами для потокового воспроизведения
        const ytDlpOptions = [
          link,
          '-f', format,
          '--no-playlist',
          '-o', outPath,
          '--hls-use-mpegts',
          '--postprocessor-args', 'ffmpeg:-movflags +faststart',
          ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : [])
        ]

        const ytDlpEmitter = ytDlpWrap.exec(ytDlpOptions)

        ytDlpEmitter
          .on('progress', (progress) => {
            console.log(
              `Progress: ${progress.percent}%`,
              `Total Size: ${progress.totalSize}`,
              `Speed: ${progress.currentSpeed}`,
              `ETA: ${progress.eta}`
            )
          })
          .on('ytDlpEvent', (eventType, eventData) => {
            console.log('yt-dlp event:', eventType, eventData)
          })
          .on('error', async (error) => {
            console.error('yt-dlp error:', error)
            await telegramBot.sendMessage(
              chatId,
              'Ошибка при скачивании видео.',
              { reply_to_message_id: msg.message_id }
            )
          })
          .on('close', async () => {
            try {
              // После завершения скачивания ищем файл с нужным расширением
              const files = await fs.readdir(tempDir.path)
              const downloadedFile = files.find((file) => file.startsWith(info.id + '.'))
              if (!downloadedFile) {
                throw new Error('Файл не найден после скачивания.')
              }

              const finalPath = path.join(tempDir.path, downloadedFile)
              // Отправляем видео в Telegram с указанием, что оно поддерживает потоковое воспроизведение
              await telegramBot.sendVideo(chatId, finalPath, {
                reply_to_message_id: msg.message_id,
                supports_streaming: true
              })

              // Удаляем временные файлы
              await fs.rm(tempDir.path, { recursive: true, force: true })
            } catch (err) {
              console.error('Error sending video:', err)
              await telegramBot.sendMessage(
                chatId,
                'Ошибка при отправке видео.',
                { reply_to_message_id: msg.message_id }
              )
            }
          })
      } catch (err) {
        console.error('Error initializing video download:', err)
        await telegramBot.sendMessage(
          chatId,
          'Не удалось инициализировать скачивание.',
          { reply_to_message_id: msg.message_id }
        )
      }
    }
  })
}
