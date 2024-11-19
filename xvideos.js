import fs from 'fs/promises'
import ytDlpPkg from 'yt-dlp-wrap'

const YTDlpWrap = ytDlpPkg.default

export default async function setupXVideosDownload (telegramBot) {
  const ytDlpBinaryPath = './yt-dlp'

  // Ensure that yt-dlp is downloaded
  async function ensureYtDlpDownloaded () {
    try {
      await fs.access(ytDlpBinaryPath)
      // yt-dlp exists
    } catch (err) {
      // yt-dlp does not exist, download it
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
        await fs.writeFile('xcom/cookies.txt', Buffer.from(data))
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

        // If we have process.env.X_PROXY, add proxy options
        if (process.env.X_PROXY) {
          ytDlpOptions.push('--proxy', process.env.X_PROXY)
        }

        // Check if cookies.txt exists
        try {
          await fs.access('cookies.txt')
          ytDlpOptions.push('--cookies', 'xcom/cookies.txt')
        } catch (err) {
          // cookies.txt does not exist; proceed without it
        }

        // Use execStream to download the video
        const videoStream = ytDlpWrap.execStream(ytDlpOptions)

        // Collect the streamed data into a buffer
        const chunks = []
        for await (const chunk of videoStream) {
          chunks.push(chunk)
        }
        const videoBuffer = Buffer.concat(chunks)

        // Send the video back as a reply
        await telegramBot.sendVideo(chatId, videoBuffer, { reply_to_message_id: msg.message_id })
      } catch (error) {
        console.error('Error downloading video:', error)
        await telegramBot.sendMessage(chatId, 'Не удалось скачать видео.', { reply_to_message_id: msg.message_id })
      }
    }
  })
}
