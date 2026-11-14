// middleware/panic-safe.js
const config = require('../config');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { systemBlacklist, state } = require('../state/maps');

function registerPanicSafe(bot) {
    bot.use(async (ctx, next) => {
        if (!ctx.from || ctx.from.is_bot) return next();
        if (ctx.from.id === config.OWNER_ID) return next();

        if (systemBlacklist.has(ctx.from.id)) {
            if (ctx.callbackQuery) return ctx.answerCbQuery('🚫 Kamu diblokir.', { show_alert: true });
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Diblokir', headingEmoji: '🚫',
                body: 'Kamu diblokir dari bot ini.', accent: '🔒',
            }));
        }

        if (state.panicMode) {
            if (ctx.callbackQuery) return ctx.answerCbQuery('🚨 Bot PANIC mode.', { show_alert: true });
            return replyRich(ctx, premiumMessage({
                heading: 'Panic Mode', headingEmoji: '🚨',
                body: 'Semua fitur dinonaktifkan sementara.', accent: '⛔',
            }));
        }

        if (state.safeMode) {
            const text = ctx.message?.text || '';
            if (ctx.callbackQuery) {
                const data = ctx.callbackQuery.data || '';
                if (!data.startsWith('menu_') && !data.startsWith('back_') && !data.startsWith('help_')) {
                    return ctx.answerCbQuery('🛡️ Safe mode aktif.', { show_alert: true });
                }
                return next();
            }
            if (text && !text.startsWith('/start') && !text.startsWith('/help')) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Safe Mode', headingEmoji: '🛡️',
                    body: 'Hanya /start & /help tersedia.', accent: '🔒',
                }));
            }
        }

        return next();
    });
}

module.exports = { registerPanicSafe };