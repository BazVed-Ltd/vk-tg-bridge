import { VK } from 'vk-io'
import TelegramBot from 'node-telegram-bot-api'
import Redis from 'ioredis'
import { redis as _redis, vk, telegram } from './config.js'

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

// Хранилище для ожидающих сообщений VK, отправленных из Telegram
const pendingVkMessages = new Map();

(async () => {
  await vkUser.updates.startPolling()
  await vkBot.updates.startPolling()

  vkBot.updates.on('message_new', async (context) => {
    // Здесь отслеживаем исходящие сообщения от бота
    if (context.peerId === vk.botChatId && context.isOutbox) {
      const randomId = context.message.random_id
      const vkMessageId = context.conversationMessageId

      // Проверяем, есть ли сообщение с таким randomId в ожидающих
      const pendingMessage = pendingVkMessages.get(randomId)
      if (!pendingMessage) return

      const { telegramMessageId } = pendingMessage

      // Обновляем соответствие telegram_to_vk
      const existingVkIdsStr = await redis.hget('telegram_to_vk', telegramMessageId)
      const vkMessageIds = existingVkIdsStr ? existingVkIdsStr.split(',') : []
      vkMessageIds.push(vkMessageId.toString())
      await redis.hset('telegram_to_vk', telegramMessageId, vkMessageIds.join(','))

      // Обновляем соответствие vk_to_telegram
      const existingTelegramIdsStr = await redis.hget('vk_to_telegram', vkMessageId)
      const telegramMessageIds = existingTelegramIdsStr ? existingTelegramIdsStr.split(',') : []
      telegramMessageIds.push(telegramMessageId.toString())
      await redis.hset('vk_to_telegram', vkMessageId, telegramMessageIds.join(','))

      // Удаляем из ожидающих
      pendingVkMessages.delete(randomId)
    }
  })

  vkUser.updates.on('message_new', async (context) => {
    // Здесь отслеживаем входящие сообщения от пользователя
    if (context.isOutbox) return
    if (context.peerId !== Number(vk.userChatId)) return
    if (context.senderId === -vk.groupId) return

    const messageText = context.text
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

    const telegramOptions = {}
    if (replyToTelegramMessageId) {
      telegramOptions.reply_to_message_id = replyToTelegramMessageId
    }

    telegramBot.sendMessage(telegram.chatId, messageText, telegramOptions)
      .then(async (telegramMessage) => {
        // Обновляем соответствие vk_to_telegram
        const existingTelegramIdsStr = await redis.hget('vk_to_telegram', messageId)
        const telegramMessageIds = existingTelegramIdsStr ? existingTelegramIdsStr.split(',') : []
        telegramMessageIds.push(telegramMessage.message_id.toString())
        await redis.hset('vk_to_telegram', messageId, telegramMessageIds.join(','))

        // Обновляем соответствие telegram_to_vk
        const existingVkIdsStr = await redis.hget('telegram_to_vk', telegramMessage.message_id)
        const vkMessageIds = existingVkIdsStr ? existingVkIdsStr.split(',') : []
        vkMessageIds.push(messageId.toString())
        await redis.hset('telegram_to_vk', telegramMessage.message_id, vkMessageIds.join(','))
      })
      .catch(console.error)
  })

  telegramBot.on('message', async (msg) => {
    if (msg.text === 'Дай ID') {
      telegramBot.sendMessage(msg.chat.id, msg.chat.id)
    }
    if (msg.chat.id !== telegram.chatId) return

    const telegramMessageId = msg.message_id
    const messageText = msg.text

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

    // Сохраняем сообщение в ожидающие
    pendingVkMessages.set(randomId, {
      telegramMessageId
    })

    vkBot.api.messages.send(vkParams)
      .catch(console.error)
  })
})()
