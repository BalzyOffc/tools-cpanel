// ═══════════════════════════════════════════════════════════════
// 📄 handlers/confess.js — Pesan rahasia anonim
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { pendingConfess, activeUserConfess } = require('../state/maps');

function registerConfessHandler(bot) {
    // ═══════════════════════════════════════════════════════════
    // /confess @username pesan
    // ═══════════════════════════════════════════════════════════
    bot.command(['confess', 'menfess'], async (ctx) => {
        if (ctx.chat.type !== 'private') {
            return replyRich(ctx, premiumMessage({
                heading: 'Khusus Private Chat', headingEmoji: '🔒',
                body: 'Fitur ini hanya bisa digunakan di PV bot.',
                accent: '🤫',
            }));
        }

        const args = ctx.message.text.split(' ');
        const targetUsername = args[1]?.replace('@', '');
        const text = args.slice(2).join(' ');

        if (!targetUsername || !text) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Gunakan format:',
                pre: '/confess @username Pesan rahasia kamu',
                accent: '🤫',
            }));
        }

        const targetData = db.findUserByUsername(targetUsername);

        if (!targetData) {
            return ctx.reply(
                `❌ User @${targetUsername} belum terdaftar.\n\nSolusi:\n1. Suruh target ketik /start di bot ini.\n2. Pastikan tidak ada typo.`
            );
        }

        const targetId = targetData.id || targetData.userId || targetData.user_id;

        if (parseInt(targetId) === ctx.from.id) {
            return ctx.reply('❌ Kamu tidak bisa mengirim confess ke diri sendiri.');
        }

        const confessId = crypto.randomBytes(3).toString('hex').toUpperCase();

        try {
            const sentMsg = await bot.telegram.sendMessage(targetId, `
🕵️‍♂️ <b>Pesan Rahasia Masuk #${confessId}</b>

"<i>${escapeHtml(text)}</i>"

<blockquote>💬 Balas pesan ini (ketik apa saja) untuk membalas secara anonim.</blockquote>
`, { parse_mode: 'HTML' });

            const key = `confess_${targetId}_${sentMsg.message_id}`;
            pendingConfess.set(key, {
                senderId: ctx.from.id,
                targetId: parseInt(targetId),
                originalText: text,
            });

            if (!activeUserConfess.has(ctx.from.id)) {
                activeUserConfess.set(ctx.from.id, []);
            }
            activeUserConfess.get(ctx.from.id).push(key);

            setTimeout(() => pendingConfess.delete(key), 24 * 60 * 60 * 1000);

            await ctx.reply(`✅ Pesan rahasia berhasil dikirim ke @${targetUsername}!`);

        } catch (err) {
            await ctx.reply(`❌ Gagal: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /stopmenfes — Hentikan semua confess aktif
    // ═══════════════════════════════════════════════════════════
    bot.command(['stopmenfes', 'stopconfess'], async (ctx) => {
        if (ctx.chat.type !== 'private') {
            return ctx.reply('❌ Fitur ini hanya bisa digunakan di Private Chat.');
        }

        const userId = ctx.from.id;
        const userSessions = activeUserConfess.get(userId);

        if (!userSessions || userSessions.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tidak Ada Sesi Aktif', headingEmoji: 'ℹ️',
                body: 'Kamu tidak memiliki percakapan confess yang berjalan.',
                footer: 'Kirim baru dengan /confess @username pesan',
                accent: '🤫',
            }));
        }

        let deletedCount = 0;
        userSessions.forEach(key => {
            if (pendingConfess.delete(key)) deletedCount++;
        });

        activeUserConfess.delete(userId);

        await replyRich(ctx, premiumMessage({
            heading: 'Sesi Confess Dihentikan', headingEmoji: '✅',
            body: 'Semua percakapan rahasia kamu telah ditutup.',
            blockquote: `Total sesi dihentikan: <b>${deletedCount}</b>\n\nJika target membalas pesan lama, balasannya tidak akan diteruskan lagi.`,
            footer: 'Kamu bisa mulai confess baru kapan saja.',
            accent: '🤫',
        }));
    });
}

module.exports = { registerConfessHandler };