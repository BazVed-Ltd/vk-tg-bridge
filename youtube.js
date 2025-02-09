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

  // Получение полной JSON-информации по видео
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

    // Поиск ссылок на youtube.com и youtu.be
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/g
    const links = text.match(youtubeRegex)
    if (!links) return

    for (const link of links) {
      try {
        // Получаем информацию о видео
        const info = await getVideoInfo(link)
        const duration = info.duration || 0
        if (duration > 1800) {
          await telegramBot.sendMessage(
            chatId,
            'Видео длиннее 30 минут, скачивание не допускается.',
            { reply_to_message_id: msg.message_id }
          )
          continue
        }

        // Определяем максимальное разрешение:
        // до 3 минут — 720p, до 10 минут — 480p, иначе — 240p.
        const maxHeight = duration <= 180 ? 720 : (duration <= 600 ? 480 : 240)

        // Выбираем лучший видео-формат в рамках нужного разрешения.
        // Обратите внимание: мы не фильтруем по кодеку, так как в любом случае будем выполнять перекодировку.
        const format = `bestvideo[height<=${maxHeight}]+bestaudio[ext=m4a]/best[height<=${maxHeight}]`

        // Форсируем перекодировку:
        // 1. --recode-video mp4: перекодировать видео в контейнер mp4.
        // 2. --postprocessor-args: передаем ffmpeg аргументы для принудительного кодирования видео с libaom-av1
        //    и добавляем -movflags +faststart для обеспечения потоковой загрузки.
        const extraOptions = [
          '--recode-video', 'mp4',
          '--postprocessor-args', '-c:v libaom-av1 -movflags +faststart'
        ]

        // Создаём временную директорию для загрузки
        const tempDir = await tmp.dir({ prefix: 'youtube-' })

        // Формируем путь для итогового файла (имя файла = ID видео, расширение подставится автоматически)
        const outPath = path.join(tempDir.path, `${info.id}.%(ext)s`)

        // Собираем параметры для yt-dlp
        const ytDlpOptions = [
          link,
          '-f', format,
          '--no-playlist',
          '-o', outPath,
          ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : []),
          ...extraOptions
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
              // После завершения скачивания найдём файл (с нужным расширением)
              const files = await fs.readdir(tempDir.path)
              const downloadedFile = files.find((file) => file.startsWith(info.id + '.'))
              if (!downloadedFile) {
                throw new Error('Файл не найден после скачивания.')
              }

              const finalPath = path.join(tempDir.path, downloadedFile)
              await telegramBot.sendVideo(chatId, finalPath, {
                reply_to_message_id: msg.message_id
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
