export const vk = {
  userToken: process.env.VK_USER_TOKEN,
  botToken: process.env.VK_BOT_TOKEN,
  userChatId: parseInt(process.env.VK_USER_CHAT_ID),
  botChatId: parseInt(process.env.VK_BOT_CHAT_ID),
  groupId: parseInt(process.env.VK_GROUP_ID)
}
export const telegram = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: parseInt(process.env.TELEGRAM_CHAT_ID)
}
export const redis = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT)
}
