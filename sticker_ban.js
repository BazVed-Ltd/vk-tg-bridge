import getRedis from './redis.js'

const redis = getRedis('sticker_ban')

export default function setupStickerBan(telegramBot) {
  // Handle /ban_stickerpack command
  telegramBot.onText(/\/ban_stickerpack/, async (msg) => {
    // Ensure the command is a reply to a sticker
    if (!msg.reply_to_message || !msg.reply_to_message.sticker) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Get chat administrators to verify the user is the owner
      const administrators = await telegramBot.getChatAdministrators(chatId);
      const owner = administrators.find(admin => admin.status === 'creator');
      if (!owner || owner.user.id !== userId) {
        // Not the chat owner
        await telegramBot.sendMessage(chatId, 'Похрюкай, ты не владелец')
        return;
      }
    } catch (error) {
      console.error('Error fetching chat administrators:', error);
      return;
    }

    // Get the sticker pack name
    const stickerSetName = msg.reply_to_message.sticker.set_name;
    if (!stickerSetName) return;

    // Add the sticker pack to the blacklist
    const blacklistKey = `${chatId}`;
    await redis.sadd(blacklistKey, stickerSetName);

    // Send confirmation
    await telegramBot.sendMessage(chatId, `Этого больше тут не будет: '${stickerSetName}'`);
  });

  // Handle /unban_stickerpack command
  telegramBot.onText(/\/unban_stickerpack/, async (msg) => {
    // Ensure the command is a reply to a sticker
    if (!msg.reply_to_message || !msg.reply_to_message.sticker) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Get chat administrators to verify the user is the owner
      const administrators = await telegramBot.getChatAdministrators(chatId);
      const owner = administrators.find(admin => admin.status === 'creator');
      if (!owner || owner.user.id !== userId) {
        // Not the chat owner
        return;
      }
    } catch (error) {
      console.error('Error fetching chat administrators:', error);
      return;
    }

    // Get the sticker pack name
    const stickerSetName = msg.reply_to_message.sticker.set_name;
    if (!stickerSetName) return;

    // Remove the sticker pack from the blacklist
    const blacklistKey = `${chatId}`;
    await redis.srem(blacklistKey, stickerSetName);

    // Send confirmation
    await telegramBot.sendMessage(chatId, `Теперь можно отправлять стикеры из '${stickerSetName}'`);
  });

  // Monitor messages for banned stickers
  telegramBot.on('message', async (msg) => {
    if (!msg.sticker) return;

    const chatId = msg.chat.id;
    const stickerSetName = msg.sticker.set_name;
    if (!stickerSetName) return;

    // Check if the sticker pack is banned
    const blacklistKey = `${chatId}`;
    const isBanned = await redis.sismember(blacklistKey, stickerSetName);

    if (isBanned) {
      // Try to delete the message
      try {
        await telegramBot.deleteMessage(chatId, msg.message_id);
      } catch (error) {
        // Ignore if the bot lacks permissions
      }
    }
  });
}
