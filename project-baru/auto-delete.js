// helpers/auto-delete.js
const { bot } = require('../core/bot-instance');

function autoDeleteMessage(chatId, messageId, delayMs = 10000) {
    setTimeout(async () => {
        try {
            await bot.telegram.deleteMessage(chatId, messageId);
        } catch (e) {}
    }, delayMs);
}

module.exports = { autoDeleteMessage };