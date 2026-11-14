// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-broadcast.js
// /cfd /cfdonline /cfdrole — Broadcast pesan ke user/grup
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { bot } = require('../core/bot-instance');
const { replyRich, premiumMessage, sendRichMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { listUsersByRole } = require('../helpers/role');
const { pendingBroadcast, state, userActivity } = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════
function isOwner(ctx) {
    return ctx.from?.id === config.OWNER_ID;
}

// ═══════════════════════════════════════════════════════════════
// CORE: fungsi broadcast
// ═══════════════════════════════════════════════════════════════
async function doBroadcast(ctx, pending, targetType) {
    const chatId = ctx.chat.id;

    let targets = [];
    if (targetType === 'pv') targets = db.getTargets('user');
    else if (targetType === 'group') targets = db.getTargets('group');
    else if (targetType === 'all') targets = [...db.getTargets('user'), ...db.getTargets('group')];
    else if (Array.isArray(targetType)) targets = targetType;
    else targets = [...db.getTargets('user'), ...db.getTargets('group')];

    // Filter valid (numeric)
    targets = targets.filter(t => {
        const n = parseInt(t);
        return !isNaN(n);
    });

    if (targets.length === 0) {
        return sendRichMessage(chatId, premiumMessage({
            heading: 'Tidak Ada Target', headingEmoji: '📭',
            body: 'Tidak ada user/grup untuk dikirimi.',
            accent: '⚠️',
        }));
    }

    // Lock: jangan broadcast bareng
    if (state.broadcastRunning) {
        return sendRichMessage(chatId, premiumMessage({
            heading: 'Broadcast Sedang Berjalan', headingEmoji: '⏳',
            body: 'Tunggu broadcast sebelumnya selesai.',
            accent: '🚫',
        }));
    }

    state.broadcastRunning = true;

    const waitMsg = await sendRichMessage(chatId, premiumMessage({
        heading: 'Broadcast Dimulai', headingEmoji: '🚀',
        body: `Mengirim ke <b>${targets.length}</b> target...`,
        blockquote: 'Jangan tutup bot. Proses berjalan di background.',
        accent: '⏳',
    }));

    let success = 0;
    let failed = 0;
    const failedIds = [];

    for (const id of targets) {
        try {
            if (pending.messageId && pending.fromChatId) {
                // Copy media/message dari source
                await bot.telegram.copyMessage(id, pending.fromChatId, pending.messageId);
            } else if (pending.text) {
                // Kirim text biasa
                await bot.telegram.sendMessage(id, pending.text, { parse_mode: 'HTML' });
            }
            success++;
        } catch (e) {
            failed++;
            failedIds.push(id);
        }

        // Progress update setiap 50 pesan
        if ((success + failed) % 50 === 0) {
            try {
                await ctx.telegram.editMessageText(chatId, waitMsg.message_id, null,
                    `🚀 <b>Broadcast Berjalan...</b>\n\n` +
                    `✅ Sukses: ${success}\n` +
                    `❌ Gagal: ${failed}\n` +
                    `📊 Progress: ${success + failed}/${targets.length}`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }

        // Anti-flood Telegram: max 30 pesan/detik
        await new Promise(r => setTimeout(r, 50));
    }

    state.broadcastRunning = false;

    try { await ctx.telegram.deleteMessage(chatId, waitMsg.message_id); } catch (e) {}

    const failedPreview = failedIds.length > 0
        ? `\n\n<b>Gagal (max 10):</b>\n${failedIds.slice(0, 10).map(id => `<code>${id}</code>`).join('\n')}`
        : '';

    await sendRichMessage(chatId, premiumMessage({
        heading: 'Broadcast Selesai!', headingEmoji: '✅',
        body: `Pesan terkirim ke <b>${targets.length}</b> target.`,
        listItems: [
            `🟢 Sukses: <b>${success}</b>`,
            `🔴 Gagal: <b>${failed}</b>`,
            `📊 Total: <b>${targets.length}</b>`,
        ],
        blockquote: `Target gagal biasanya karena user memblokir bot atau akun dihapus.${failedPreview}`,
        accent: '🎉',
    }));
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerBroadcastHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /cfd — Broadcast ke user & grup
    // ═══════════════════════════════════════════════════════════
    bot.command(['cfd', 'broadcast'], async (ctx) => {
        if (!isOwner(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Khusus Owner.',
                accent: '🔒',
            }));
        }

        const replied = ctx.message.reply_to_message;
        const textArgs = ctx.message.text.split(' ').slice(1).join(' ');

        let broadcastContent = '';
        if (replied) {
            broadcastContent = replied.text || replied.caption || '[Media]';
        } else if (textArgs) {
            broadcastContent = textArgs;
        } else {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply pesan yang mau di-broadcast, atau ketik langsung.',
                pre: '/cfd Halo semua, ini pengumuman!',
                listItems: [
                    '📌 Reply media (foto/video) untuk broadcast media',
                    '📌 Ketik teks untuk broadcast teks',
                ],
                accent: '📢',
            }));
        }

        pendingBroadcast.set(ctx.from.id, {
            messageId: replied ? replied.message_id : null,
            fromChatId: ctx.chat.id,
            text: replied ? null : textArgs,
            contentPreview: broadcastContent.substring(0, 50),
        });

        const counts = db.getTargetCounts();

        await replyRich(ctx, premiumMessage({
            heading: 'Menu Broadcast', headingEmoji: '📢',
            body: `Pesan siap dikirim. Pilih target:`,
            listItems: [
                `👥 User (PV): <b>${counts.users}</b>`,
                `👥 Grup: <b>${counts.groups}</b>`,
                `📊 Total: <b>${counts.users + counts.groups}</b>`,
            ],
            blockquote: `Preview:\n<i>${escapeHtml(broadcastContent)}</i>`,
            footer: 'Pilih tombol di bawah.',
            accent: '📨',
            buttons: [
                { text: '👤 User (PV)', callback: 'bc_send_pv', color: 'success' },
                { text: '👥 Grup', callback: 'bc_send_group', color: 'primary' },
            ],
        }));

        // Baris kedua tombol (pakai pesan susulan karena premiumMessage max 2 tombol)
        // Bisa diabaikan kalau sudah cukup 2 tombol
    });

    // ═══════════════════════════════════════════════════════════
    // /cfdonline — Broadcast ke user aktif 7 hari terakhir
    // ═══════════════════════════════════════════════════════════
    bot.command('cfdonline', async (ctx) => {
        if (!isOwner(ctx)) return;

        const replied = ctx.message.reply_to_message;
        const textArgs = ctx.message.text.split(' ').slice(1).join(' ');

        let content = '';
        if (replied) content = replied.text || replied.caption || '[Media]';
        else if (textArgs) content = textArgs;
        else return;

        // Ambil user aktif 7 hari terakhir
        const sevenDaysAgo = Date.now() - 7 * 86400000;
        const onlineUsers = [...userActivity.entries()]
            .filter(([, t]) => t > sevenDaysAgo)
            .map(([id]) => id);

        if (onlineUsers.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tidak Ada User Online', headingEmoji: '📭',
                body: 'Belum ada user aktif dalam 7 hari terakhir.',
                accent: '⚠️',
            }));
        }

        const pending = {
            messageId: replied ? replied.message_id : null,
            fromChatId: ctx.chat.id,
            text: replied ? null : textArgs,
        };

        await doBroadcast(ctx, pending, onlineUsers);
    });

    // ═══════════════════════════════════════════════════════════
    // /cfdrole — Broadcast ke user dengan role tertentu
    // ═══════════════════════════════════════════════════════════
    bot.command('cfdrole', async (ctx) => {
        if (!isOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const role = args[0]?.toLowerCase();
        const textContent = args.slice(1).join(' ');
        const replied = ctx.message.reply_to_message;

        const validRoles = ['vip', 'reseller', 'pt', 'owner'];

        if (!role || !validRoles.includes(role)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Pilih role yang valid.',
                pre: '/cfdrole <role> <pesan>',
                listItems: [
                    '📌 Role: <code>vip</code>, <code>reseller</code>, <code>pt</code>, <code>owner</code>',
                    '📌 Contoh: <code>/cfdrole vip Promo khusus VIP!</code>',
                    '📌 Atau reply pesan + <code>/cfdrole vip</code>',
                ],
                accent: '🎭',
            }));
        }

        if (!textContent && !replied) {
            return replyRich(ctx, premiumMessage({
                heading: 'Pesan Kosong', headingEmoji: '❌',
                body: 'Tambahkan pesan atau reply media.',
                accent: '⚠️',
            }));
        }

        const users = await listUsersByRole(role);
        if (users.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tidak Ada User', headingEmoji: '📭',
                body: `Belum ada user dengan role <b>${role}</b>.`,
                accent: '🎭',
            }));
        }

        const ids = users.map(u => parseInt(u.userId)).filter(id => !isNaN(id));

        const pending = {
            messageId: replied ? replied.message_id : null,
            fromChatId: ctx.chat.id,
            text: replied ? null : textContent,
        };

        await doBroadcast(ctx, pending, ids);
    });

    // ═══════════════════════════════════════════════════════════
    // /cfdstop — Hentikan broadcast (set flag)
    // ═══════════════════════════════════════════════════════════
    bot.command('cfdstop', async (ctx) => {
        if (!isOwner(ctx)) return;

        if (!state.broadcastRunning) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tidak Ada Broadcast', headingEmoji: 'ℹ️',
                body: 'Tidak ada broadcast yang sedang berjalan.',
                accent: '📢',
            }));
        }

        // Set flag false — loop akan selesai iterasi saat ini lalu stop (soft)
        state.broadcastRunning = false;

        await replyRich(ctx, premiumMessage({
            heading: 'Broadcast Dihentikan', headingEmoji: '🛑',
            body: 'Broadcast akan berhenti setelah pesan yang sedang diproses selesai.',
            blockquote: 'Beberapa pesan mungkin sudah terkirim sebelum stop.',
            accent: '⚠️',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK HANDLERS
    // ═══════════════════════════════════════════════════════════

    bot.action('bc_send_pv', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        const pending = pendingBroadcast.get(ctx.from.id);
        if (!pending) return ctx.answerCbQuery('❌ Sesi habis. Ketik /cfd lagi.', { show_alert: true });

        await ctx.answerCbQuery('⏳ Memulai broadcast ke user...');
        try { await ctx.deleteMessage(); } catch (e) {}

        await doBroadcast(ctx, pending, 'pv');
        pendingBroadcast.delete(ctx.from.id);
    });

    bot.action('bc_send_group', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        const pending = pendingBroadcast.get(ctx.from.id);
        if (!pending) return ctx.answerCbQuery('❌ Sesi habis.', { show_alert: true });

        await ctx.answerCbQuery('⏳ Memulai broadcast ke grup...');
        try { await ctx.deleteMessage(); } catch (e) {}

        await doBroadcast(ctx, pending, 'group');
        pendingBroadcast.delete(ctx.from.id);
    });

    bot.action('bc_send_all', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        const pending = pendingBroadcast.get(ctx.from.id);
        if (!pending) return ctx.answerCbQuery('❌ Sesi habis.', { show_alert: true });

        await ctx.answerCbQuery('⏳ Memulai broadcast ke semua...');
        try { await ctx.deleteMessage(); } catch (e) {}

        await doBroadcast(ctx, pending, 'all');
        pendingBroadcast.delete(ctx.from.id);
    });

    bot.action('bc_cancel', async (ctx) => {
        pendingBroadcast.delete(ctx.from.id);
        await ctx.answerCbQuery('❌ Dibatalkan');
        try { await ctx.deleteMessage(); } catch (e) {}
    });
}

module.exports = { registerOwnerBroadcastHandler };