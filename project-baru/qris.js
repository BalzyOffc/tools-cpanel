// ═══════════════════════════════════════════════════════════════
// 📄 handlers/qris.js
// /qris /donasi — QRIS dari gambar profil (offline)
// /qris2 /bayar2 — QRIS via API BuatQRIS
// + semua callback qris_*, owner_accept_*, owner_reject_*
// ═══════════════════════════════════════════════════════════════
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const { bot } = require('../core/bot-instance');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { isPV } = require('../helpers/auth');
const {
    sendQrisToUser,
    generateFromProfileImage,
    generateViaBuatQris,
} = require('../helpers/qris');
const { pendingQris, pendingQrisSessions } = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerQrisHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /qris /donasi — QRIS dari gambar profil
    // ═══════════════════════════════════════════════════════════
    bot.command(['qris', 'donasi'], async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const nominal = parseInt(args[0]);
        const description = args.slice(1).join(' ') || 'Donasi Bot';

        if (!nominal || nominal < 100) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan nominal (minimal Rp 100).',
                pre: '/qris 25000 Pembayaran VIP',
                listItems: [
                    '📌 <code>/qris 25000</code> — nominal saja',
                    '📌 <code>/qris 25000 Donasi</code> — dengan keterangan',
                ],
                accent: '💳',
            }));
        }

        const waitMsg = await ctx.reply('⏳ Membaca QRIS & membuat tagihan...');

        try {
            await generateFromProfileImage(ctx, nominal, description);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            console.error('QRIS Error:', err);

            let errMsg = err.message;
            if (errMsg.includes('qris_profil')) {
                errMsg = 'File qris_profil.png tidak ada. Hubungi Owner untuk setup.';
            }

            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Membuat QRIS', headingEmoji: '❌',
                body: `<code>${escapeHtml(errMsg)}</code>`,
                blockquote: 'Kalau error persisten, coba pakai <code>/qris2</code> sebagai alternatif.',
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /qris2 /donasi2 /bayar2 — QRIS via BuatQRIS API
    // ═══════════════════════════════════════════════════════════
    bot.command(['qris2', 'donasi2', 'bayar2'], async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const nominal = parseInt(args[0]);
        const textPesan = args.slice(1).join(' ') || 'Pembayaran';

        if (!nominal || nominal < 1000) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan nominal (minimal Rp 1.000).',
                pre: '/qris2 25000 VIP',
                accent: '💳',
            }));
        }

        const waitMsg = await ctx.reply('⏳ Membuat QRIS via API...');

        try {
            await generateViaBuatQris(ctx, nominal, textPesan);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            console.error('BuatQRIS Error:', err);

            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Membuat QRIS', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                blockquote: 'Coba lagi nanti atau pakai <code>/qris</code>.',
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: Ganti Nominal (versi offline — qris_profil.png)
    // ═══════════════════════════════════════════════════════════
    bot.action(/^qris_change_([a-f0-9]+)$/, async (ctx) => {
        const sessionId = ctx.match[1];
        const session = pendingQris.get(sessionId) || pendingQrisSessions.get(sessionId);

        if (!session) {
            return ctx.answerCbQuery('⏱️ Sesi QRIS sudah expired. Buat baru dengan /qris.', { show_alert: true });
        }

        if (session.userId !== ctx.from.id) {
            return ctx.answerCbQuery('❌ Ini bukan QRIS kamu.', { show_alert: true });
        }

        await ctx.answerCbQuery('🔄 Silakan kirim nominal baru...');

        // Hapus pesan QRIS lama
        try { await ctx.deleteMessage(); } catch (e) {}

        // Tentukan mode (offline vs API) berdasarkan session mana yang ada
        const isOffline = pendingQris.has(sessionId);

        if (isOffline) {
            pendingQris.set(`waiting_${ctx.from.id}`, {
                originalSessionId: sessionId,
                qrisString: session.qrisString,
                description: session.description,
                mode: 'offline',
            });
        } else {
            pendingQrisSessions.set(`waiting_${ctx.from.id}`, {
                textPesan: session.textPesan,
                mode: 'api',
            });
        }

        await ctx.reply(`
🔄 <b>Ganti Nominal QRIS</b>

Silakan ketik nominal baru (contoh: <code>50000</code>).

Ketik <code>/cancel</code> untuk membatalkan.`, { parse_mode: 'HTML' });
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: Batalkan
    // ═══════════════════════════════════════════════════════════
    bot.action(/^qris_cancel_([a-f0-9]+)$/, async (ctx) => {
        const sessionId = ctx.match[1];
        const session = pendingQris.get(sessionId) || pendingQrisSessions.get(sessionId);

        if (!session) {
            return ctx.answerCbQuery('⏱️ Sesi QRIS sudah expired.', { show_alert: true });
        }

        if (session.userId !== ctx.from.id) {
            return ctx.answerCbQuery('❌ Ini bukan QRIS kamu.', { show_alert: true });
        }

        await ctx.answerCbQuery('❌ QRIS dibatalkan');
        pendingQris.delete(sessionId);
        pendingQrisSessions.delete(sessionId);

        try { await ctx.deleteMessage(); } catch (e) {}
        await ctx.reply('✅ Pembuatan QRIS telah dibatalkan.');
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: Kirim Bukti Transfer
    // ═══════════════════════════════════════════════════════════
    bot.action(/^qris_bukti_([a-f0-9]+)$/, async (ctx) => {
        const sessionId = ctx.match[1];
        const session = pendingQris.get(sessionId) || pendingQrisSessions.get(sessionId);

        if (!session) {
            return ctx.answerCbQuery('⏱️ Sesi QRIS sudah expired.', { show_alert: true });
        }

        if (session.userId !== ctx.from.id) {
            return ctx.answerCbQuery('❌ Ini bukan QRIS kamu.', { show_alert: true });
        }

        await ctx.answerCbQuery('📤 Silakan kirim bukti transfer...');
        try { await ctx.deleteMessage(); } catch (e) {}

        pendingQris.set(`waiting_bukti_${ctx.from.id}`, {
            sessionId,
            nominal: session.nominal,
            description: session.description || session.textPesan,
        });

        await ctx.reply(`
📤 <b>Kirim Bukti Transfer</b>

Silakan kirim screenshot/foto bukti transfer kamu sekarang.
Pastikan nominal <b>Rp ${session.nominal.toLocaleString('id-ID')}</b> terlihat jelas.

Ketik <code>/cancel</code> untuk membatalkan.`, { parse_mode: 'HTML' });
    });

    // ═══════════════════════════════════════════════════════════
    // HANDLER: Terima foto bukti transfer (kirim ke Owner)
    // ═══════════════════════════════════════════════════════════
    bot.on('photo', async (ctx) => {
        const waitingKey = `waiting_bukti_${ctx.from.id}`;
        if (!pendingQris.has(waitingKey)) return; // bukan mode bukti

        const waiting = pendingQris.get(waitingKey);
        pendingQris.delete(waitingKey);

        const waitMsg = await ctx.reply('⏳ Meneruskan bukti ke Owner...');

        try {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileId = photo.file_id;
            const userName = ctx.from.first_name + (ctx.from.username ? ` (@${ctx.from.username})` : '');
            const userId = ctx.from.id;

            await bot.telegram.sendPhoto(config.OWNER_ID, fileId, {
                caption: `💰 <b>Bukti Transfer Masuk!</b>\n\n` +
                         `👤 <b>Pengirim:</b> ${escapeHtml(userName)}\n` +
                         `🆔 <b>User ID:</b> <code>${userId}</code>\n` +
                         `💵 <b>Nominal:</b> Rp ${waiting.nominal.toLocaleString('id-ID')}\n` +
                         `📝 <b>Pesan:</b> ${escapeHtml(waiting.description || '-')}\n\n` +
                         `<i>Klik tombol di bawah untuk konfirmasi.</i>`,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Terima', callback_data: `owner_accept_${userId}_${waiting.nominal}` },
                            { text: '❌ Tolak', callback_data: `owner_reject_${userId}` },
                        ],
                    ],
                },
            });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await ctx.reply(`✅ Bukti transfer kamu sudah dikirim ke Owner.\n\nTunggu konfirmasi dari Owner ya.`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            console.error('Bukti TF Error:', err);
            await ctx.reply(`❌ Gagal meneruskan bukti: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: Owner Accept
    // ═══════════════════════════════════════════════════════════
    bot.action(/^owner_accept_(\d+)_(\d+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return ctx.answerCbQuery('❌ Hanya Owner yang bisa konfirmasi.', { show_alert: true });
        }

        const userId = parseInt(ctx.match[1]);
        const nominal = parseInt(ctx.match[2]);

        await ctx.answerCbQuery('✅ Membalas user...');

        try {
            await bot.telegram.sendMessage(userId,
                `✅ <b>Pembayaran Dikonfirmasi!</b>\n\n` +
                `Owner sudah memverifikasi bukti transfer kamu.\n` +
                `Nominal: <b>Rp ${nominal.toLocaleString('id-ID')}</b>\n\n` +
                `Terima kasih! 🙏`,
                { parse_mode: 'HTML' }
            );

            try {
                await ctx.editMessageCaption(
                    ctx.callbackQuery.message.caption + '\n\n✅ <b>STATUS: DITERIMA</b>',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {
                await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
            }

        } catch (err) {
            await ctx.answerCbQuery(`❌ Gagal kirim ke user: ${err.message}`, { show_alert: true });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: Owner Reject
    // ═══════════════════════════════════════════════════════════
    bot.action(/^owner_reject_(\d+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return ctx.answerCbQuery('❌ Hanya Owner yang bisa konfirmasi.', { show_alert: true });
        }

        const userId = parseInt(ctx.match[1]);

        await ctx.answerCbQuery('❌ Membalas penolakan...');

        try {
            await bot.telegram.sendMessage(userId,
                `❌ <b>Pembayaran Ditolak</b>\n\n` +
                `Bukti transfer kamu tidak valid atau belum masuk ke rekening Owner.\n\n` +
                `Silakan hubungi Owner untuk klarifikasi.`,
                { parse_mode: 'HTML' }
            );

            try {
                await ctx.editMessageCaption(
                    ctx.callbackQuery.message.caption + '\n\n❌ <b>STATUS: DITOLAK</b>',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {
                await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
            }

        } catch (err) {
            await ctx.answerCbQuery(`❌ Gagal kirim ke user: ${err.message}`, { show_alert: true });
        }
    });
}

module.exports = { registerQrisHandler };