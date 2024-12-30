export default function setupUnpinChannelMessages (bot) {
  bot.on('message', async (msg) => {
    // Проверяем, что мы в нужном чате и сообщение автопереслано
    if (
      String(msg.chat.id) === String(process.env.TELEGRAM_CHAT_ID) &&
      msg.is_automatic_forward
    ) {
      // Проверяем, что отправитель совпадает с каналом, откуда идёт пересылка
      if (
        String(msg.sender_chat?.id) === String(process.env.TELEGRAM_CHANNEL_SENDER_CHAT_ID)
      ) {
        try {
          await bot.unpinChatMessage({
            chat_id: msg.chat.id,
            message_id: msg.message_id
          })

          console.log('Открепили сообщение из канала', msg.message_id)
        } catch (error) {
          console.error('Не удалось открепить сообщение:', error)
        }
      }
    }
  })
}
