export default function setupUnpinChannelMessages (bot) {
  bot.on('message', async (msg) => {
    // Проверяем: а точно ли это сообщение - автопересланное из канала?
    if (msg.is_automatic_forward) {
      if (String(msg.chat.id) === String(process.env.TELEGRAM_CHAT_ID)) {
        // Проверяем, что sender_chat совпадает
        if (String(msg.sender_chat?.id) === String(process.env.TELEGRAM_CHANNEL_SENDER_CHAT_ID)) {
          try {
            await bot.unpinChatMessage(
              msg.message_id,
              msg.chat.id
            )
            console.log('Открепили сообщение из канала', msg.message_id)
          } catch (error) {
            console.error('Не удалось открепить сообщение:', error)
          }
        }
      }
    }
  })
}
