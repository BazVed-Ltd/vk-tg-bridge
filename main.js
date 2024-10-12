import { VK } from 'vk-io'
import TelegramBot from 'node-telegram-bot-api'
import Redis from 'ioredis'
import { redis as _redis, vk, telegram } from './config.js'
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const redis = new Redis({
  host: _redis.host,
  port: _redis.port
})

const vkUser = new VK({
  token: vk.userToken
})

const vkBot = new VK({
  token: vk.botToken
})

const telegramBot = new TelegramBot(telegram.botToken, { polling: true })

// Storage for pending VK messages sent from Telegram
const pendingVkMessages = new Map();

(async () => {
  await vkUser.updates.startPolling()
  await vkBot.updates.startPolling()

  // Listen for outgoing messages from the VK bot
  vkBot.updates.on('message_new', async (context) => {
    if (context.peerId === vk.botChatId && context.isOutbox) {
      const randomId = context.message.random_id
      const vkMessageId = context.conversationMessageId

      // Check if the message with this randomId is pending
      const pendingMessage = pendingVkMessages.get(randomId)
      if (!pendingMessage) return

      const { telegramMessageId } = pendingMessage

      // Update telegram_to_vk mapping
      const existingVkIdsStr = await redis.hget('telegram_to_vk', telegramMessageId)
      const vkMessageIds = existingVkIdsStr ? existingVkIdsStr.split(',') : []
      vkMessageIds.push(vkMessageId.toString())
      await redis.hset('telegram_to_vk', telegramMessageId, vkMessageIds.join(','))

      // Update vk_to_telegram mapping
      const existingTelegramIdsStr = await redis.hget('vk_to_telegram', vkMessageId)
      const telegramMessageIds = existingTelegramIdsStr ? existingTelegramIdsStr.split(',') : []
      telegramMessageIds.push(telegramMessageId.toString())
      await redis.hset('vk_to_telegram', vkMessageId, telegramMessageIds.join(','))

      // Remove from pending messages
      pendingVkMessages.delete(randomId)
    }
  })

  // Listen for incoming messages from VK user
  vkUser.updates.on('message_new', async (context) => {
    if (context.isOutbox) return
    if (context.peerId !== Number(vk.userChatId)) return
    if (context.senderId === -vk.groupId) return

    // Fetch sender's information
    const senderId = context.senderId
    const senderInfo = await vkUser.api.users.get({ user_ids: senderId.toString() })
    const senderName = senderInfo[0] ? `${senderInfo[0].first_name} ${senderInfo[0].last_name}` : 'Unknown'

    // Escape HTML characters in the sender's name and message text
    function escapeHTML (text) {
      return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    const messageText = `<b>${escapeHTML(senderName)}:</b>\n${escapeHTML(context.text || '')}`

    const messageId = context.conversationMessageId

    let replyToTelegramMessageId = null
    if (context.replyMessage) {
      const repliedVkMessageId = context.replyMessage.conversationMessageId

      const telegramMessageIdsStr = await redis.hget('vk_to_telegram', repliedVkMessageId)
      const telegramMessageIds = telegramMessageIdsStr ? telegramMessageIdsStr.split(',') : []

      if (telegramMessageIds.length > 0) {
        replyToTelegramMessageId = parseInt(telegramMessageIds[telegramMessageIds.length - 1])
      }
    }

    const telegramOptions = { parse_mode: 'HTML' }
    if (replyToTelegramMessageId) {
      telegramOptions.reply_to_message_id = replyToTelegramMessageId
    }

    // Arrays to hold file paths of downloaded media
    const photoFiles = []
    const videoFiles = []

    // Process attachments if any
    if (context.hasAttachments()) {
      for (const attachment of context.attachments) {
        if (attachment.type === 'photo') {
          // Get the largest photo size
          const sizes = attachment.sizes
          const largestSize = sizes.reduce((prev, current) => (prev.width > current.width ? prev : current))
          const url = largestSize.url

          // Download the photo
          try {
            const response = await axios.get(url, { responseType: 'stream' })
            const filename = path.basename(url)
            const filepath = path.join('/tmp', filename)
            const writer = fs.createWriteStream(filepath)
            response.data.pipe(writer)

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve)
              writer.on('error', reject)
            })

            photoFiles.push(filepath)
          } catch (error) {
            console.error('Error downloading photo:', error)
          }
        } else if (attachment.type === 'video') {
          const ownerId = attachment.ownerId
          const videoId = attachment.id
          const accessKey = attachment.accessKey || ''

          // Get video details using vkUser
          try {
            const videoInfo = await vkUser.api.video.get({
              videos: `${ownerId}_${videoId}${accessKey ? '_' + accessKey : ''}`
            })

            if (videoInfo.items && videoInfo.items.length > 0) {
              const files = videoInfo.items[0].files

              // Choose the highest quality available
              const url = files?.mp4_720 || files?.mp4_480 || files?.mp4_360 || files?.mp4_240 || files?.external

              if (url) {
                const response = await axios.get(url, { responseType: 'stream' })
                const filename = `video_${ownerId}_${videoId}.mp4`
                const filepath = path.join('/tmp', filename)
                const writer = fs.createWriteStream(filepath)
                response.data.pipe(writer)

                await new Promise((resolve, reject) => {
                  writer.on('finish', resolve)
                  writer.on('error', reject)
                })

                videoFiles.push(filepath)
              }
            }
          } catch (error) {
            console.error('Error downloading video:', error)
          }
        }
      }
    }

    // Send media or message to Telegram
    if (photoFiles.length === 0 && videoFiles.length === 0) {
      // No media, send message as usual
      telegramBot.sendMessage(telegram.chatId, messageText, telegramOptions)
        .then(async (telegramMessage) => {
          // Update vk_to_telegram mapping
          const existingTelegramIdsStr = await redis.hget('vk_to_telegram', messageId)
          const telegramMessageIds = existingTelegramIdsStr ? existingTelegramIdsStr.split(',') : []
          telegramMessageIds.push(telegramMessage.message_id.toString())
          await redis.hset('vk_to_telegram', messageId, telegramMessageIds.join(','))

          // Update telegram_to_vk mapping
          const existingVkIdsStr = await redis.hget('telegram_to_vk', telegramMessage.message_id)
          const vkMessageIds = existingVkIdsStr ? existingVkIdsStr.split(',') : []
          vkMessageIds.push(messageId.toString())
          await redis.hset('telegram_to_vk', telegramMessage.message_id, vkMessageIds.join(','))
        })
        .catch(console.error)
    } else {
      // Prepare media group for Telegram
      const media = []

      // Prepare media group for Telegram
      for (const filepath of photoFiles) {
        media.push({
          type: 'photo',
          media: fs.createReadStream(filepath) // Use fs.createReadStream for local file paths
        })
      }

      for (const filepath of videoFiles) {
        media.push({
          type: 'video',
          media: fs.createReadStream(filepath) // Same for video files
        })
      }

      // Add caption to the first media item if messageText is present
      if (messageText.trim()) {
        media[0].caption = messageText
        media[0].parse_mode = 'HTML'
      }

      telegramBot.sendMediaGroup(telegram.chatId, media)
        .then(async (telegramMessages) => {
          // Use the first Telegram message to update the mappings
          const telegramMessage = telegramMessages[0]

          // Update vk_to_telegram mapping
          const existingTelegramIdsStr = await redis.hget('vk_to_telegram', messageId)
          const telegramMessageIds = existingTelegramIdsStr ? existingTelegramIdsStr.split(',') : []
          telegramMessageIds.push(telegramMessage.message_id.toString())
          await redis.hset('vk_to_telegram', messageId, telegramMessageIds.join(','))

          // Update telegram_to_vk mapping
          const existingVkIdsStr = await redis.hget('telegram_to_vk', telegramMessage.message_id)
          const vkMessageIds = existingVkIdsStr ? existingVkIdsStr.split(',') : []
          vkMessageIds.push(messageId.toString())
          await redis.hset('telegram_to_vk', telegramMessage.message_id, vkMessageIds.join(','))
        })
        .catch(console.error)
        .finally(() => {
          // Clean up downloaded files
          for (const filepath of photoFiles.concat(videoFiles)) {
            fs.unlink(filepath, (err) => {
              if (err) console.error('Failed to delete file:', filepath, err)
            })
          }
        })
    }
  })

  // Listen for messages from Telegram
  telegramBot.on('message', async (msg) => {
    if (msg.text === 'Дай ID') {
      telegramBot.sendMessage(msg.chat.id, msg.chat.id)
    }
    if (msg.chat.id !== telegram.chatId) return

    const telegramMessageId = msg.message_id

    // Get sender's name
    const senderName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '')

    const messageText = `${senderName}: ${msg.text || ''}`

    let replyToVkMessageId = null
    if (msg.reply_to_message) {
      const repliedTelegramMessageId = msg.reply_to_message.message_id
      const vkMessageIdsStr = await redis.hget('telegram_to_vk', repliedTelegramMessageId)
      const vkMessageIds = vkMessageIdsStr ? vkMessageIdsStr.split(',') : []

      if (vkMessageIds.length > 0) {
        replyToVkMessageId = Number(vkMessageIds[vkMessageIds.length - 1])
      }
    }

    const randomId = Math.floor(Math.random() * 1e9)

    const vkParams = {
      peer_id: Number(vk.botChatId),
      message: messageText,
      random_id: randomId
    }

    if (replyToVkMessageId) {
      vkParams.reply_to = replyToVkMessageId
    }

    // Save the message as pending
    pendingVkMessages.set(randomId, {
      telegramMessageId
    })

    vkBot.api.messages.send(vkParams)
      .catch(console.error)
  })
})()
