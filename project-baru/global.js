const config = require('../config');
const { state } = require('../state/maps');
const { whitelist, disabledCmds } = require('../handlers/owner-tools');

function registerGlobalMiddleware(bot) {
    bot.use(async (ctx, next) => {
        const isOwner = ctx.from?.id === config.OWNER_ID;
        const text = ctx.message?.text || '';

        // ── 1. CEK MAINTENANCE MODE
        if (state.maintenance && !isOwner && !whitelist.has(ctx.from?.id)) {
            const msg = "🛠️ <b>Bot sedang dalam maintenance.</b>\nSilakan coba lagi nanti.";
            
            if (ctx.callbackQuery) {
                return ctx.answerCbQuery('🛠️ Bot sedang maintenance.', { show_alert: true });
            }
            return ctx.reply(msg, { parse_mode: 'HTML' });
        }

        // ── 2. DEKLARASI VARIABEL CMD DI SINI (Agar bisa diakses di bawah)
        let cmd = '';
        if (text.startsWith('/')) {
            cmd = text.split(' ')[0].slice(1).split('@')[0].toLowerCase();
        }

        // ── 3. CEK DISABLED COMMAND (Teks / Command)
        if (cmd && disabledCmds.has(cmd) && !isOwner) {
            return ctx.reply(`🚫 Command <code>/${cmd}</code> sedang dinonaktifkan oleh Owner.`, { parse_mode: 'HTML' });
        }

        // ── 4. CEK DISABLED COMMAND (Tombol / Callback Query)
        if (ctx.callbackQuery) {
            const cbData = ctx.callbackQuery.data || '';
            
            for (const disabledCmd of disabledCmds) {
                // Cek apakah callback_data mengandung nama fitur yang di-disable
                if (cbData.toLowerCase().includes(disabledCmd.toLowerCase()) && !isOwner) {
                    return ctx.answerCbQuery(`🚫 Fitur ini sedang dinonaktifkan.`, { show_alert: true });
                }
            }
        }

        // ── 5. CEK DISABLED COMMAND (Hears / Regex tanpa slash)
        if (text && !text.startsWith('/')) {
            const firstWord = text.split(' ')[0].toLowerCase();
            if (disabledCmds.has(firstWord) && !isOwner) {
                return ctx.reply(`🚫 Fitur <code>${firstWord}</code> sedang dinonaktifkan oleh Owner.`, { parse_mode: 'HTML' });
            }
        }

        // Lanjut ke handler berikutnya
        return next();
    });
}

module.exports = { registerGlobalMiddleware };