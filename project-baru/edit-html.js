// ═══════════════════════════════════════════════════════════════
// 📄 helpers/edit-html.js
// ═══════════════════════════════════════════════════════════════
const { sanitizeTelegramHtml } = require('./html');
const { bot } = require('../core/bot-instance');

async function editHtml(ctx, html, keyboard) {
    html = sanitizeTelegramHtml(html); // 🛡️ Pencegahan otomatis
    
    const baseOpts = {
        parse_mode: 'HTML',
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    };
    const textOpts = { ...baseOpts, disable_web_page_preview: true };

    try {
        await ctx.editMessageText(html, textOpts);
        return;
    } catch (e) {
        const desc = e.description || '';
        if (/message is not modified/i.test(desc)) return;

        if (/no text in the message/i.test(desc)) {
            try {
                await ctx.editMessageCaption(html, baseOpts);
                return;
            } catch (_) {}
        }
        try { await ctx.reply(html, textOpts); } catch (_) {}
    }
}

async function replyHtml(ctx, html, keyboard) {
    html = sanitizeTelegramHtml(html); // 🛡️ Pencegahan otomatis
    return ctx.reply(html, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
}

async function sendHtml(chatId, html, keyboard) {
    html = sanitizeTelegramHtml(html); // 🛡️ Pencegahan otomatis
    return bot.telegram.sendMessage(chatId, html, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
}

module.exports = { editHtml, replyHtml, sendHtml };