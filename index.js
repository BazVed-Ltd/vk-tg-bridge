import { VK } from 'vk-io'
import TelegramBot from 'node-telegram-bot-api'
import { vk, telegram } from './config.js'
import axios from 'axios'
import fr from 'follow-redirects'
import { promisify } from 'util'
import getInlineHandler from './inlines.js'
import setupStickerBan from './sticker_ban.js'
import getRedis from './redis.js'

const redis = getRedis('main')

// Initialize VK clients
const vkUser = new VK({
  token: vk.userToken
})

const vkBot = new VK({
  token: vk.botToken
})

// Initialize Telegram Bot with polling
const telegramBot = new TelegramBot(telegram.botToken, { polling: true })
telegramBot.on('inline_query', getInlineHandler(telegramBot))
setupStickerBan(telegramBot)

// Storage for pending VK messages sent from Telegram
const pendingVkMessages = new Map()

function _getFinalUrl (startUrl, callback) {
  const request = fr.https.get(startUrl, (response) => {
    callback(null, response.responseUrl)
  })

  request.on('error', (err) => {
    callback(err)
  })
}

const getFinalUrl = promisify(_getFinalUrl)

// Utility function to escape HTML
function escapeHTML (text) {
  if (!text) return ''
  return text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Utility function to get VK user's name with caching
async function getVkUserName (senderId) {
  const cacheKey = `vk_user_${senderId}`

  // Try fetching from cache
  let senderName = await redis.get(cacheKey)

  if (senderName) {
    return senderName
  }

  // If not in cache, fetch from VK
  try {
    const senderInfo = await vkUser.api.users.get({ user_ids: senderId.toString() })
    senderName = senderInfo[0] ? `${senderInfo[0].first_name} ${senderInfo[0].last_name}` : 'Unknown'

    // Store in Redis with TTL of 15 minutes (900 seconds)
    await redis.set(cacheKey, senderName, 'EX', 900)

    return senderName
  } catch (error) {
    console.error('Error fetching VK user info:', error)
    return 'Unknown'
  }
}

(async () => {
  // Start polling for VK clients
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

    // Fetch sender's information with caching
    const senderId = context.senderId
    const senderName = await getVkUserName(senderId)

    // Prepare the message text with HTML formatting
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

    // Arrays to hold media buffers
    const photoBuffers = []
    const videoBuffers = []

    // Process attachments if any
    if (context.hasAttachments()) {
      let hasRawAttachments = false
      for (const attachment of context.attachments) {
        if (attachment.type === 'photo') {
          hasRawAttachments = true
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
                const response = await axios.get(url, { responseType: 'arraybuffer' })
                const buffer = Buffer.from(response.data, 'binary')
                videoBuffers.push(buffer)
              }
            }
          } catch (error) {
            console.error('Error downloading video:', error)
          }
        } else if (attachment.type === 'doc') {
          hasRawAttachments = true
        }
      }

      if (hasRawAttachments) {
        const rawMessage = (await vkUser.api.messages.getById({ message_ids: [context.id] })).items[0]

        for (const attachment of rawMessage.attachments) {
          if (attachment.type === 'photo') {
          // Get the largest photo size
            const photo = attachment.photo
            const sizes = photo.sizes
            const largestSize = sizes.reduce((prev, current) => (prev.width > current.width ? prev : current))
            const url = largestSize.url

            // Download the photo into memory
            try {
              const response = await axios.get(url, { responseType: 'arraybuffer' })
              const buffer = Buffer.from(response.data, 'binary')
              photoBuffers.push(buffer)
            } catch (error) {
              console.error('Error downloading photo:', error)
            }
          // лапша))
          } else if (attachment.type === 'doc') {
            const doc = attachment.doc
            const url = await getFinalUrl(doc.url)
            try {
              await telegramBot.sendAnimation(telegram.chatId, url, {
                reply_to_message_id: replyToTelegramMessageId || undefined,
                caption: messageText,
                parse_mode: 'HTML'
              })
            } catch (e) {
              try {
                axios.get(url, { responseType: 'arraybuffer' }).then(async response => {
                  await telegramBot.sendAnimation(telegram.chatId, response.data, {
                    reply_to_message_id: replyToTelegramMessageId || undefined,
                    caption: messageText,
                    parse_mode: 'HTML'
                  })
                }).catch(error => {
                  console.error('Error downloading document:', error)
                })
              } catch (error) {
                console.error('Error downloading document:', error)
              }
            }
          }
        }
      }
    }

    // Function to send media or message to Telegram with placeholder
    const sendToTelegramWithPlaceholder = async () => {
      let placeholderMessageId = null

      if (photoBuffers.length > 0 || videoBuffers.length > 0) {
        const placeholderUrl = 'https://i.imgur.com/6RMhx.gif' // A loading GIF

        try {
          const placeholderMessage = await telegramBot.sendPhoto(telegram.chatId, placeholderUrl, {
            caption: 'Uploading media...',
            parse_mode: 'HTML',
            reply_to_message_id: replyToTelegramMessageId || undefined
          })

          placeholderMessageId = placeholderMessage.message_id
        } catch (error) {
          console.error('Error sending placeholder message to Telegram:', error)
        }
      } else if (context.text) {
        // No media, send message as usual
        try {
          const telegramMessage = await telegramBot.sendMessage(telegram.chatId, messageText, telegramOptions)

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
        } catch (error) {
          console.error('Error sending message to Telegram:', error)
        }
      }

      // Proceed to upload media in the background
      if (photoBuffers.length > 0 || videoBuffers.length > 0) {
        try {
          const media = []

          // Add photos to media
          for (const buffer of photoBuffers) {
            media.push({
              type: 'photo',
              media: buffer
            })
          }

          // Add videos to media
          for (const buffer of videoBuffers) {
            media.push({
              type: 'video',
              media: buffer
            })
          }

          // Add caption to the first media item if messageText is present
          if (messageText.trim() && media.length > 0) {
            media[0].caption = messageText
            media[0].parse_mode = 'HTML'
          }

          // Send media group to Telegram
          const telegramMessages = await telegramBot.sendMediaGroup(telegram.chatId, media)

          // Assuming media is sent as separate messages, get the first one
          const telegramMediaMessage = telegramMessages[0]

          // Update vk_to_telegram mapping with the actual media message
          const existingTelegramIdsStr = await redis.hget('vk_to_telegram', messageId)
          const telegramMessageIds = existingTelegramIdsStr ? existingTelegramIdsStr.split(',') : []
          telegramMessageIds.push(telegramMediaMessage.message_id.toString())
          await redis.hset('vk_to_telegram', messageId, telegramMessageIds.join(','))

          // Update telegram_to_vk mapping
          const existingVkIdsStr = await redis.hget('telegram_to_vk', telegramMediaMessage.message_id)
          const vkMessageIds = existingVkIdsStr ? existingVkIdsStr.split(',') : []
          vkMessageIds.push(messageId.toString())
          await redis.hset('telegram_to_vk', telegramMediaMessage.message_id, vkMessageIds.join(','))

          // Delete the placeholder message
          if (placeholderMessageId) {
            try {
              await telegramBot.deleteMessage(telegram.chatId, placeholderMessageId)
            } catch (error) {
              console.error('Error deleting placeholder message:', error)
            }
          }
        } catch (error) {
          console.error('Error sending media group to Telegram:', error)
          // Optionally, edit the placeholder message to indicate failure
          if (placeholderMessageId) {
            try {
              await telegramBot.editMessageCaption('Failed to upload media.', {
                chat_id: telegram.chatId,
                message_id: placeholderMessageId
              })
            } catch (editError) {
              console.error('Error editing placeholder message after failure:', editError)
            }
          }
        }
      }
    }

    // Send to Telegram with placeholder and handle media upload
    sendToTelegramWithPlaceholder()
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

    if (!telegram.transferMessages) {
      return
    }

    try {
      await vkBot.api.messages.send(vkParams)
    } catch (error) {
      console.error('Error sending message to VK:', error)
    }
  })
})()
