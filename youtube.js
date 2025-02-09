import fs from 'fs/promises'
import path from 'path'
import ytDlpPkg from 'yt-dlp-wrap'
import stream from 'stream'

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

  // Функция для получения JSON-информации о видео
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

    // Ищем ссылки на youtube.com и youtu.be
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/g
    const links = text.match(youtubeRegex)
    if (!links) return

    for (const link of links) {
      try {
        // Получаем информацию о видео
        const info = await getVideoInfo(link)
        const duration = info.duration || 0
        if (duration > 1800) {
          // Видео длиннее 30 минут – скачивание не допускается
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
          // до 3 минут – 720p
          format = 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]'
        } else if (duration <= 600) {
          // до 10 минут – 480p
          format = 'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]'
        } else {
          // до 30 минут – 240p
          format = 'bestvideo[ext=mp4][height<=240]+bestaudio[ext=m4a]/best[ext=mp4][height<=240]'
        }

        // Опции для yt-dlp с выводом в stdout для потоковой передачи
        const ytDlpOptions = [
          link,
          '-f', format,
          '--no-playlist',
          '-o', '-', // вывод в stdout
          ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : [])
        ]

        // Запускаем процесс скачивания с помощью yt-dlp
        const ytDlpEmitter = ytDlpWrap.exec(ytDlpOptions)

        // Создаём PassThrough-стрим, в который будем передавать потоковые данные
        const { PassThrough } = stream
        const videoStream = new PassThrough()
        ytDlpEmitter.stdout.pipe(videoStream)

        ytDlpEmitter.on('progress', (progress) => {
          console.log(
            `Progress: ${progress.percent}%`,
            `Total Size: ${progress.totalSize}`,
            `Speed: ${progress.currentSpeed}`,
            `ETA: ${progress.eta}`
          )
        })

        ytDlpEmitter.on('ytDlpEvent', (eventType, eventData) => {
          console.log('yt-dlp event:', eventType, eventData)
        })

        ytDlpEmitter.on('error', async (error) => {
          console.error('yt-dlp error:', error)
          await telegramBot.sendMessage(
            chatId,
            'Ошибка при скачивании видео.',
            { reply_to_message_id: msg.message_id }
          )
        })

        // Отправляем видео, используя поток. Передаём имя файла, чтобы Telegram определил тип файла.
        await telegramBot.sendVideo(chatId, videoStream, {
          filename: `${info.id}.mp4`,
          reply_to_message_id: msg.message_id
        })

        ytDlpEmitter.on('close', () => {
          console.log('yt-dlp завершил потоковую передачу.')
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
