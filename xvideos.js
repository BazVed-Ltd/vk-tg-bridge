import fs from 'fs/promises'
import ytDlpPkg from 'yt-dlp-wrap'
import { tmpName } from 'tmp-promise'

const YTDlpWrap = ytDlpPkg.default

export default async function setupXVideosDownload (telegramBot) {
  const ytDlpBinaryPath = './yt-dlp'

  // Ensure that yt-dlp is downloaded
  async function ensureYtDlpDownloaded () {
    try {
      await fs.access(ytDlpBinaryPath)
    } catch (err) {
      await YTDlpWrap.downloadFromGithub()
    }
  }

  await ensureYtDlpDownloaded()
  const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath)

  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  const targetChatId = process.env.TELEGRAM_CHAT_ID

  // Handle documents sent in the admin chat
  telegramBot.on('message', async (msg) => {
    if (String(msg.chat.id) !== adminChatId) return

    if (msg.document) {
      try {
        const fileId = msg.document.file_id
        const fileLink = await telegramBot.getFileLink(fileId)
        const response = await fetch(fileLink)
        const data = await response.arrayBuffer()
        await fs.writeFile('cookies.txt', Buffer.from(data))
        await telegramBot.sendMessage(adminChatId, 'Cookies saved successfully.')
      } catch (error) {
        console.error('Error saving cookies:', error)
        await telegramBot.sendMessage(adminChatId, 'Failed to save cookies.')
      }
    }
  })

  // Handle messages in TELEGRAM_CHAT_ID
  telegramBot.on('message', async (msg) => {
    const chatId = msg.chat.id
    if (String(chatId) !== targetChatId) return

    const text = msg.text
    if (!text) return

    // Check for x.com links
    const xComRegex = /https?:\/\/x\.com\/[^\s]+/g
    const links = text.match(xComRegex)
    if (!links || links.length === 0) return

    for (const link of links) {
      try {
        const ytDlpOptions = [
          link,
          '-f',
          'best[ext=mp4]',
          '--no-playlist'
        ]

        if (process.env.X_PROXY) {
          ytDlpOptions.push('--proxy', process.env.X_PROXY)
        }

        try {
          await fs.access('cookies.txt')
          ytDlpOptions.push('--cookies', 'cookies.txt')
        } catch (err) {
          // cookies.txt does not exist; proceed without it
        }

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
            telegramBot.sendMessage(chatId, 'Error downloading video.', { reply_to_message_id: msg.message_id })
          })
          .on('close', async () => {
            console.log('Download completed:', tempFilePath)
            try {
              // Send the video file
              await telegramBot.sendVideo(chatId, tempFilePath, { reply_to_message_id: msg.message_id })
              // Delete the temporary file
              await fs.unlink(tempFilePath)
            } catch (err) {
              console.error('Error sending video:', err)
              await telegramBot.sendMessage(chatId, 'Error sending video.', { reply_to_message_id: msg.message_id })
            }
          })
      } catch (error) {
        console.error('Error initializing video download:', error)
        await telegramBot.sendMessage(chatId, 'Failed to initialize video download.', { reply_to_message_id: msg.message_id })
      }
    }
  })
}
