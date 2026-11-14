// helpers/rich-message.js
const { bot } = require('../core/bot-instance');
const { cleanHtmlForFallback } = require('./html');

async function sendRichMessage(chatId, htmlContent, extraMarkup = null) {
    const payload = { chat_id: chatId, rich_message: { html: htmlContent } };
    if (extraMarkup) payload.reply_markup = extraMarkup;

    try {
        return await bot.telegram.callApi('sendRichMessage', payload);
    } catch (err) {
        console.log('Rich Message gagal, fallback ke HTML:', err.message);
        return await bot.telegram.sendMessage(chatId, cleanHtmlForFallback(htmlContent), {
            parse_mode: 'HTML',
            reply_markup: extraMarkup,
        });
    }
}

async function replyRich(ctx, content, extra = {}) {
    return sendRichMessage(ctx.chat.id, content, extra.reply_markup || null);
}

async function replyRichPhoto(ctx, photo, captionHtml, extra = {}) {
    try {
        const cleanCaption = cleanHtmlForFallback(captionHtml);
        return await ctx.replyWithPhoto(photo, {
            ...extra,
            caption: cleanCaption,
            parse_mode: 'HTML',
            reply_markup: extra.reply_markup || null,
        });
    } catch (err) {
        console.error('Gagal kirim gambar:', err.message);
    }
}

function premiumMessage({ heading, headingEmoji, body, blockquote, listItems, footer, buttons, accent = '✨', pre }) {
    let html = '';
    if (heading) html += `<h1>${headingEmoji ? headingEmoji + ' ' : ''}${heading}</h1>`;
    if (body) html += `<p>${body}</p>`;
    if (blockquote) html += `<blockquote>${blockquote}</blockquote>`;
    if (listItems && listItems.length > 0) {
        html += '<ul>';
        listItems.forEach(i => html += `<li>${i}</li>`);
        html += '</ul>';
    }
    if (pre) html += `<pre>${pre}</pre>`;
    if (footer) html += `<footer>${accent} ${footer}</footer>`;
    if (buttons && buttons.length > 0) {
        html += '<tg-button-row>';
        buttons.forEach(b => {
            const style = b.color || 'primary';
            if (b.url) html += `<tg-button type="url" url="${b.url}" style="${style}">${b.text}</tg-button>`;
            else if (b.callback) html += `<tg-button type="callback_data" data="${b.callback}" style="${style}">${b.text}</tg-button>`;
        });
        html += '</tg-button-row>';
    }
    return html;
}

async function editRichMessage(ctx, htmlContent, extraMarkup = null) {
    const payload = {
        chat_id: ctx.chat.id,
        message_id: ctx.callbackQuery.message.message_id,
        rich_message: { html: htmlContent },
    };
    if (extraMarkup) payload.reply_markup = extraMarkup;

    try {
        const orig = ctx.callbackQuery.message;
        const hasMedia = orig.photo || orig.video || orig.audio || orig.document || orig.animation;
        return await bot.telegram.callApi(hasMedia ? 'editMessageCaption' : 'editMessageText', payload);
    } catch (err) {
        console.log('Edit Rich gagal, fallback ke HTML:', err.message);
        const cleanText = cleanHtmlForFallback(htmlContent);
        const orig = ctx.callbackQuery.message;
        const hasMedia = orig.photo || orig.video || orig.audio || orig.document || orig.animation;

        if (hasMedia) {
            return await ctx.editMessageCaption(cleanText, { parse_mode: 'HTML', reply_markup: extraMarkup });
        }
        return await ctx.editMessageText(cleanText, { parse_mode: 'HTML', reply_markup: extraMarkup });
    }
}

module.exports = { sendRichMessage, replyRich, replyRichPhoto, premiumMessage, editRichMessage };