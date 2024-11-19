import getRedis from './redis.js'
import { tmpName } from 'tmp-promise'
import fs from 'fs/promises'
import ytDlpPkg from 'yt-dlp-wrap'
const YTDlpWrap = ytDlpPkg.default

const redis = getRedis('x')

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

  // Handle /set_x_cookie command
  telegramBot.onText(/\/set_x_cookie (.+)/, async (msg, match) => {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (String(msg.chat.id) !== adminChatId) return
    const cookieValue = match[1]

    // Save the cookie value in Redis
    await redis.set('x_cookies', cookieValue)
    await telegramBot.sendMessage(msg.chat.id, 'Cookie value has been set.')
  })

  // Handle messages in TELEGRAM_CHAT_ID
  telegramBot.on('message', async (msg) => {
    const chatId = msg.chat.id
    const targetChatId = process.env.TELEGRAM_CHAT_ID
    if (String(chatId) !== targetChatId) return

    const text = msg.text
    if (!text) return

    // Check for x.com links
    const xComRegex = /https?:\/\/x\.com\/[^\s]+/g
    const links = text.match(xComRegex)
    if (!links || links.length === 0) return

    for (const link of links) {
      // Download the video using yt-dlp-wrap
      try {
        // Get the cookie value from Redis, if any
        const cookieValue = await redis.get('x_cookies')

        // Prepare yt-dlp options
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

        let cookieFilePath
        if (cookieValue) {
          // Create a temporary file to store the cookies
          const tmpFile = await tmpName({ prefix: 'yt-dlp-cookies-', postfix: '.txt' })
          await fs.writeFile(tmpFile, cookieValue)
          cookieFilePath = tmpFile
          ytDlpOptions.push('--cookies', cookieFilePath)
        }

        const videoBuffer = await ytDlpWrap.execBuffer(ytDlpOptions)

        // Send the video back as a reply
        await telegramBot.sendVideo(chatId, videoBuffer, { reply_to_message_id: msg.message_id })

        // Clean up temporary cookie file if needed
        if (cookieFilePath) {
          await fs.unlink(cookieFilePath)
        }
      } catch (error) {
        console.error('Error downloading video:', error)
        await telegramBot.sendMessage(chatId, 'Не удалось скачать видео.', { reply_to_message_id: msg.message_id })
      }
    }
  })
}
