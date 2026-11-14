// handlers/admin.js
const config = require('../config');
const db = require('../services/database');
const { isAdmin } = require('../helpers/auth');
const { getTargetUser } = require('../helpers/user');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { autoDeleteMessage } = require('../helpers/auto-delete');

const MAX_WARN = config.MAX_WARN || 3;

function parseDuration(str) {
    const m = str?.match(/^(\d+)([smhd])$/);
    if (!m) return null;
    const n = parseInt(m[1]);
    const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
    return n * unit;
}

function registerAdminHandler(bot) {
    bot.command('kick', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return replyRich(ctx, premiumMessage({ heading: 'Gagal', headingEmoji: '❌', body: 'Reply user atau beri ID.' }));
        try {
            await ctx.telegram.banChatMember(ctx.chat.id, target.id);
            await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
            await replyRich(ctx, premiumMessage({
                heading: 'User Dikick', headingEmoji: '👢',
                body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> telah dikick.`,
                accent: '✅',
            }));
        } catch (e) {
            await replyRich(ctx, premiumMessage({ heading: 'Gagal', headingEmoji: '❌', body: e.message }));
        }
    });

    bot.command('ban', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        try {
            await ctx.telegram.banChatMember(ctx.chat.id, target.id);
            await replyRich(ctx, premiumMessage({
                heading: 'User Dibanned', headingEmoji: '🔨',
                body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> dibanned.`,
                accent: '💀',
            }));
        } catch (e) {}
    });

    bot.command('unban', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        try {
            await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
            await replyRich(ctx, premiumMessage({ heading: 'User Diunban', headingEmoji: '✅', accent: '🎉' }));
        } catch (e) {}
    });

    bot.command('mute', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        try {
            await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
                permissions: { can_send_messages: false },
                until_date: 0,
            });
            await replyRich(ctx, premiumMessage({
                heading: 'User Di-Mute', headingEmoji: '🔇',
                body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> di-mute permanen.`,
                accent: '🔇',
            }));
        } catch (e) {}
    });

    bot.command('tmute', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const args = ctx.message.text.split(' ');
        const dur = parseDuration(args[1]);
        if (!dur) return replyRich(ctx, premiumMessage({ heading: 'Format Salah', headingEmoji: '❌', body: 'Gunakan: /tmute 10m (reply user)' }));
        const target = await getTargetUser(ctx);
        if (!target) return;
        const until = Math.floor(Date.now() / 1000) + dur / 1000;
        try {
            await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
                permissions: { can_send_messages: false },
                until_date: until,
            });
            await replyRich(ctx, premiumMessage({
                heading: 'User Di-Tmute', headingEmoji: '⏱️',
                body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> di-mute ${args[1]}.`,
            }));
        } catch (e) {}
    });

    bot.command('tban', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const args = ctx.message.text.split(' ');
        const dur = parseDuration(args[1]);
        if (!dur) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        const until = Math.floor(Date.now() / 1000) + dur / 1000;
        try {
            await ctx.telegram.banChatMember(ctx.chat.id, target.id, { until_date: until });
            await replyRich(ctx, premiumMessage({
                heading: 'User Di-Tban', headingEmoji: '🔨',
                body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> dibanned ${args[1]}.`,
            }));
        } catch (e) {}
    });

    // Warn system
    bot.command('warn', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return replyRich(ctx, premiumMessage({ heading: 'Gagal', headingEmoji: '❌' }));
        const count = db.getWarn(ctx.chat.id, target.id) + 1;
        db.setWarn(ctx.chat.id, target.id, count);
        const msg = await replyRich(ctx, premiumMessage({
            heading: `Peringatan (${count}/${MAX_WARN})`, headingEmoji: '⚠️',
            body: `User <a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> di-warn.`,
            blockquote: count >= MAX_WARN ? 'Batas tercapai!' : `Sisa: <b>${MAX_WARN - count}</b>`,
            buttons: [{ text: '♻️ Reset Warn', callback: `resetwarn_${target.id}`, color: 'success' }],
            accent: '📌',
        }));
        autoDeleteMessage(ctx.chat.id, msg.message_id, 10000);
    });

    bot.command('resetwarn', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        db.resetWarn(ctx.chat.id, target.id);
        // sync dengan satpam
        require('../middleware/satpam').resetStrike(ctx.chat.id, target.id);
        const msg = await replyRich(ctx, premiumMessage({
            heading: 'Warn Direset', headingEmoji: '✅',
            body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> warn dihapus.`,
            accent: '🔄',
        }));
        autoDeleteMessage(ctx.chat.id, msg.message_id, 5000);
    });

    bot.command('warns', async (ctx) => {
        const target = ctx.message.reply_to_message?.from || ctx.from;
        const count = db.getWarn(ctx.chat.id, target.id);
        await replyRich(ctx, premiumMessage({
            heading: 'Info Warning', headingEmoji: '⚠️',
            body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a>`,
            listItems: [`Warn: <b>${count}</b>/${MAX_WARN}`, `Sisa: <b>${MAX_WARN - count}</b>`],
            accent: '📊',
        }));
    });

    bot.command('promote', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        try {
            await ctx.telegram.promoteChatMember(ctx.chat.id, target.id, {
                can_delete_messages: true,
                can_restrict_members: true,
                can_pin_messages: true,
                can_invite_users: true,
            });
            await replyRich(ctx, premiumMessage({
                heading: 'Promoted!', headingEmoji: '⬆️',
                body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> jadi admin.`,
                accent: '👑',
            }));
        } catch (e) {}
    });

    bot.command('demote', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const target = await getTargetUser(ctx);
        if (!target) return;
        try {
            await ctx.telegram.promoteChatMember(ctx.chat.id, target.id, {});
            await replyRich(ctx, premiumMessage({ heading: 'Demoted', headingEmoji: '⬇️', accent: '📉' }));
        } catch (e) {}
    });

    // Tag all
    bot.command(['tagall', 'all', 'everyone'], async (ctx) => {
        if (!await isAdmin(ctx)) return ctx.reply('❌ Hanya Admin!');
        const args = ctx.message.text.split(' ').slice(1).join(' ');
        const reason = args || 'Panggilan untuk semua member!';
        const waitMsg = await ctx.reply('⏳ Mengumpulkan data member...');
        try {
            const dbUsers = db.getTargets('user');
            if (!dbUsers || dbUsers.length === 0) {
                await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
                return ctx.reply('⚠️ Tidak ada user di database.');
            }
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);

            const chunkSize = 5;
            for (let i = 0; i < dbUsers.length; i += chunkSize) {
                const chunk = dbUsers.slice(i, i + chunkSize)
                    .map(u => `<a href="tg://user?id=${u}">\u200b</a>`)
                    .join(' ');
                await ctx.reply(chunk, { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id, allow_sending_without_reply: true });
                await new Promise(r => setTimeout(r, 1000));
            }

            await ctx.reply(`📢 <b>PENGUMUMAN</b>\n\n${escapeHtml(reason)}`, {
                parse_mode: 'HTML',
                reply_to_message_id: ctx.message.message_id,
                allow_sending_without_reply: true,
            });
        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await ctx.reply('❌ Gagal tag all.');
        }
    });

    // Resetwarn callback
    bot.action(/^resetwarn_(.+)/, async (ctx) => {
        if (!await isAdmin(ctx)) return ctx.answerCbQuery('❌ Admin only');
        const targetId = parseInt(ctx.match[1]);
        db.resetWarn(ctx.chat.id, targetId);
        require('../middleware/satpam').resetStrike(ctx.chat.id, targetId);
        await ctx.answerCbQuery('✅ Peringatan direset!');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    // Unmute callback
    bot.action(/^unmute_(.+)/, async (ctx) => {
        if (!await isAdmin(ctx)) return ctx.answerCbQuery('❌ Admin only');
        const targetId = parseInt(ctx.match[1]);
        try {
            await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
                permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true },
            });
            await ctx.answerCbQuery('🔊 Unmute berhasil!');
            try { await ctx.deleteMessage(); } catch (e) {}
        } catch (err) {
            await ctx.answerCbQuery('❌ Gagal: ' + err.message, { show_alert: true });
        }
    });
}

module.exports = { registerAdminHandler };