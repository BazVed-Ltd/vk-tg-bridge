import getRedis from './redis.js'
import { tmpName } from 'tmp-promise'
import fs from 'fs/promises'
import ytDlpPkg from 'yt-dlp-wrap'
const YTDlpWrap = ytDlpPkg.default

const redis = getRedis('x')

function cookieStringToNetscapeFormat (cookieString, domain) {
  const lines = []
  const cookies = cookieString.split('; ')
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=')
    const value = valueParts.join('=')
    // Fields: domain, include_subdomains, path, secure, expiration, name, value
    const domainField = domain.startsWith('.') ? domain : '.' + domain
    const includeSubdomains = 'TRUE'
    const path = '/'
    const secure = 'FALSE' // Set to 'TRUE' if the site requires HTTPS
    const expiration = Math.floor(new Date('2030-12-31').getTime() / 1000) // Arbitrary future date
    const line = [
      domainField,
      includeSubdomains,
      path,
      secure,
      expiration,
      name.trim(),
      value.trim()
    ].join('\t')
    lines.push(line)
  }
  return lines.join('\n')
}

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
      try {
        const cookieValue = await redis.get('x_cookies')

        const ytDlpOptions = [
          link,
          '-f',
          'best[ext=mp4]',
          '--no-playlist'
        ]

        if (process.env.X_PROXY) {
          ytDlpOptions.push('--proxy', process.env.X_PROXY)
        }

        let cookieFilePath
        if (cookieValue) {
          const tmpFile = await tmpName({ prefix: 'yt-dlp-cookies-', postfix: '.txt' })

          // Convert the cookie string to Netscape format
          const netscapeCookieString = cookieStringToNetscapeFormat(cookieValue, 'x.com')
          await fs.writeFile(tmpFile, netscapeCookieString)
          cookieFilePath = tmpFile
          ytDlpOptions.push('--cookies', cookieFilePath)
        }

        // Use execStream instead of execBuffer
        const videoStream = ytDlpWrap.execStream(ytDlpOptions)

        // Collect the streamed data into a buffer
        const chunks = []
        for await (const chunk of videoStream) {
          chunks.push(chunk)
        }
        const videoBuffer = Buffer.concat(chunks)

        // Send the video back as a reply
        await telegramBot.sendVideo(chatId, videoBuffer, { reply_to_message_id: msg.message_id })

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
