import fs from 'fs/promises'
import ytDlpPkg from 'yt-dlp-wrap'
import { tmpName } from 'tmp-promise'

const YTDlpWrap = ytDlpPkg.default

export default async function setupYouTubeDownload (telegramBot) {
  const ytDlpBinaryPath = './yt-dlp'

  async function ensureYtDlpDownloaded () {
    try {
      await fs.access(ytDlpBinaryPath)
    } catch (err) {
      await YTDlpWrap.downloadFromGithub()
    }
  }

  await ensureYtDlpDownloaded()
  const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath)
  const targetChatId = process.env.TELEGRAM_CHAT_ID

  // Helper to get video duration (in seconds)
  async function getVideoDuration (url) {
    try {
      // --dump-single-json outputs one JSON line with all info
      const result = await ytDlpWrap.execPromise([
        url,
        '--dump-single-json',
        // If you need a proxy
        ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : [])
      ])
      const info = JSON.parse(result)
      return info.duration || 0
    } catch (err) {
      console.error('Error fetching video info:', err)
      throw err
    }
  }

  telegramBot.on('message', async (msg) => {
    // Only handle messages in the targetChatId
    if (String(msg.chat.id) !== targetChatId) return
    if (!msg.text) return

    const chatId = msg.chat.id
    const text = msg.text

    // Match youtube.com or youtu.be links
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/g
    const links = text.match(youtubeRegex)
    if (!links) return

    for (const link of links) {
      try {
        const duration = await getVideoDuration(link)
        if (duration > 1800) {
          // Longer than 30 minutes
          await telegramBot.sendMessage(
            chatId,
            'Видео длиннее 30 минут',
            { reply_to_message_id: msg.message_id }
          )
          continue
        }

        // Choose format based on duration
        let format = ''
        if (duration <= 180) {
          // up to 3 min => 720p
          format = 'bestvideo[height<=720]+bestaudio/best[height<=720]'
        } else if (duration <= 600) {
          // up to 10 min => 480p
          format = 'bestvideo[height<=480]+bestaudio/best[height<=480]'
        } else {
          // up to 30 min => 240p
          format = 'bestvideo[height<=240]+bestaudio/best[height<=240]'
        }

        // Build yt-dlp options
        const ytDlpOptions = [
          link,
          '-f',
          format,
          '--no-playlist',
          ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : [])
        ]

        // Generate a temporary file path for the output
        const tempFilePath = await tmpName({ prefix: 'video-', postfix: '.mp4' })
        ytDlpOptions.push('-o', tempFilePath)

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
          .on('error', (error) => {
            console.error('yt-dlp error:', error)
            telegramBot.sendMessage(
              chatId,
              'Ошибка при скачивании видео.',
              { reply_to_message_id: msg.message_id }
            )
          })
          .on('close', async () => {
            console.log('Download completed:', tempFilePath)
            try {
              await telegramBot.sendVideo(chatId, tempFilePath, {
                reply_to_message_id: msg.message_id
              })
              await fs.unlink(tempFilePath)
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
