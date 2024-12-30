export default function setupUnpinChannelMessages (bot) {
  bot.on('message', async (msg) => {
    if (
      String(msg.chat.id) === String(process.env.TELEGRAM_CHAT_ID) &&
      msg.is_automatic_forward
    ) {
      // Если прикреплённое сообщение пришло из нашего канала — сразу открепляем
      if (
        String(msg.sender_chat?.id) ===
        String(process.env.TELEGRAM_CHANNEL_SENDER_CHAT_ID)
      ) {
        try {
          await bot.unpinChatMessage(
            process.env.TELEGRAM_CHAT_ID,
            msg.message_id
          )
          console.log('Открепили сообщение из канала', msg.message_id)
        } catch (error) {
          console.error('Не удалось открепить сообщение:', error)
        }
      }
    }
  })
}
