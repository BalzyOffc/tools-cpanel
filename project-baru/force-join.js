// middleware/force-join.js
const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { isAdmin } = require('../helpers/auth');
const { pendingJoinLock } = require('../state/maps');

async function isUserJoinedChannel(chatId, userId) {
    const targetChannel = db.getSetting(chatId, 'force_channel', config.REQUIRED_CHANNEL_ID);
    if (!targetChannel) return true;
    try {
        const m = await require('../core/bot-instance').bot.telegram.getChatMember(targetChannel, userId);
        return ['creator', 'administrator', 'member'].includes(m.status);
    } catch (e) {
        console.log('Error cek join:', e.message);
        return true;
    }
}

function registerForceJoin(bot) {
    bot.use(async (ctx, next) => {
        if (!ctx.from || ctx.from.is_bot) return next();
        if (ctx.from.id === config.OWNER_ID) return next();
        if (ctx.chat?.type !== 'private' && await isAdmin(ctx)) return next();
        if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('global_verify_join_')) return next();

        const chatId = ctx.chat?.id || ctx.from.id;
        const targetChannelStr = db.getSetting(chatId, 'force_channel', config.REQUIRED_CHANNEL_ID);
        if (!targetChannelStr) return next();

        const targetChannels = targetChannelStr.split(',').map(c => c.trim()).filter(Boolean);
        if (targetChannels.length === 0) return next();

        const notJoined = [];
        for (const chId of targetChannels) {
            try {
                const member = await bot.telegram.getChatMember(chId, ctx.from.id);
                if (!['creator', 'administrator', 'member'].includes(member.status)) notJoined.push(chId);
            } catch (e) {
                notJoined.push(chId);
            }
        }

        if (notJoined.length === 0) {
            const lock = pendingJoinLock.get(ctx.from.id);
            if (lock && lock.msgId && lock.chatId === ctx.chat?.id) {
                try { await bot.telegram.deleteMessage(lock.chatId, lock.msgId); } catch (e) {}
                pendingJoinLock.delete(ctx.from.id);
            }
            return next();
        }

        // Belum join
        if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
            try { await ctx.deleteMessage(); } catch (e) {}
            const existingLock = pendingJoinLock.get(ctx.from.id);
            if (existingLock && existingLock.chatId === ctx.chat.id) {
                if (ctx.callbackQuery) return ctx.answerCbQuery('⚠️ Join channel dulu!', { show_alert: true });
                return;
            }

            let buttons = [];
            for (let i = 0; i < notJoined.length; i++) {
                const chId = notJoined[i];
                let chLink = `https://t.me/${chId}`;
                let chName = `Channel ${i + 1}`;
                try {
                    const info = await bot.telegram.getChat(chId);
                    chName = info.title || chName;
                    if (info.username) chLink = `https://t.me/${info.username}`;
                    else {
                        const invite = await bot.telegram.createChatInviteLink(chId, { member_limit: 1 });
                        chLink = invite.invite_link;
                    }
                } catch (e) {}
                buttons.push({ text: `📢 Join ${chName}`, url: chLink, color: 'primary' });
            }
            buttons.push({ text: '✅ Saya Sudah Join Semua', callback: `global_verify_join_${ctx.from.id}`, color: 'success' });

            const msg = await replyRich(ctx, premiumMessage({
                heading: 'Akses Dikunci', headingEmoji: '🔒',
                body: `Halo <a href="tg://user?id=${ctx.from.id}"><b>${escapeHtml(ctx.from.first_name)}</b></a>.\n\nKamu harus join ke <b>${notJoined.length}</b> channel dulu.`,
                blockquote: `📢 <b>Channel Wajib:</b>\n${notJoined.join('\n')}`,
                footer: 'Klik tombol di bawah setelah join.',
                accent: '⚠️',
                buttons,
            }));

            pendingJoinLock.set(ctx.from.id, {
                chatId: ctx.chat.id, msgId: msg.message_id, targetChannel: targetChannelStr, timestamp: Date.now(),
            });

            setTimeout(async () => {
                const lock = pendingJoinLock.get(ctx.from.id);
                if (lock && lock.msgId === msg.message_id) {
                    try { await bot.telegram.deleteMessage(lock.chatId, lock.msgId); } catch (e) {}
                    pendingJoinLock.delete(ctx.from.id);
                }
            }, 5 * 60 * 1000);

            if (ctx.callbackQuery) return ctx.answerCbQuery('⚠️ Join channel dulu!', { show_alert: true });
            return;
        }

        // PV
        if (ctx.message) {
            let buttons = [];
            for (let i = 0; i < notJoined.length; i++) {
                const chId = notJoined[i];
                let chLink = `https://t.me/${chId}`;
                let chName = `Channel ${i + 1}`;
                try {
                    const info = await bot.telegram.getChat(chId);
                    chName = info.title || chName;
                    if (info.username) chLink = `https://t.me/${info.username}`;
                    else {
                        const invite = await bot.telegram.createChatInviteLink(chId, { member_limit: 1 });
                        chLink = invite.invite_link;
                    }
                } catch (e) {}
                buttons.push({ text: `📢 Join ${chName}`, url: chLink, color: 'primary' });
            }
            buttons.push({ text: '✅ Saya Sudah Join Semua', callback: 'pv_verify_join', color: 'success' });

            return replyRich(ctx, premiumMessage({
                heading: 'Wajib Join Channel', headingEmoji: '🔒',
                body: `Halo <b>${escapeHtml(ctx.from.first_name)}</b>.`,
                blockquote: `📢 <b>Channel Wajib:</b>\n${notJoined.join('\n')}`,
                footer: 'Klik tombol di bawah setelah join.',
                accent: '📢',
                buttons,
            }));
        }

        if (ctx.callbackQuery) return ctx.answerCbQuery('⚠️ Join channel dulu!', { show_alert: true });
        return;
    });

    // Callback verify grup
    bot.action(/^global_verify_join_(\d+)$/, async (ctx) => {
        const targetUserId = parseInt(ctx.match[1]);
        if (ctx.from.id !== targetUserId) return ctx.answerCbQuery('❌ Tombol ini bukan untuk kamu.', { show_alert: true });

        const chatId = ctx.chat?.id || ctx.from.id;
        const targetChannel = db.getSetting(chatId, 'force_channel', config.REQUIRED_CHANNEL_ID);

        let joined = false;
        try {
            const m = await bot.telegram.getChatMember(targetChannel, ctx.from.id);
            joined = ['creator', 'administrator', 'member'].includes(m.status);
        } catch { joined = false; }

        if (joined) {
            await ctx.answerCbQuery('✅ Verifikasi Berhasil!', { show_alert: false });
            try { await ctx.deleteMessage(); } catch (e) {}
            pendingJoinLock.delete(ctx.from.id);
            if (ctx.chat.type !== 'private') {
                try {
                    await ctx.telegram.restrictChatMember(ctx.chat.id, ctx.from.id, {
                        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true },
                    });
                } catch (e) {}
            }
            const confirmMsg = await replyRich(ctx, premiumMessage({
                heading: 'Akses Terbuka!', headingEmoji: '🎉',
                body: `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> sudah terverifikasi.`,
                accent: '✅',
            }));
            if (ctx.chat.type !== 'private') {
                require('../helpers/auto-delete').autoDeleteMessage(ctx.chat.id, confirmMsg.message_id, 10000);
            }
        } else {
            await ctx.answerCbQuery('❌ Kamu belum join channel.', { show_alert: true });
        }
    });

    // Callback verify PV
    bot.action('pv_verify_join', async (ctx) => {
        const joined = await isUserJoinedChannel(ctx.chat.id, ctx.from.id);
        if (joined) {
            await ctx.answerCbQuery('✅ Verifikasi Berhasil!');
            try { await ctx.deleteMessage(); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Verifikasi Berhasil!', headingEmoji: '🎉',
                body: `Terima kasih <b>${escapeHtml(ctx.from.first_name)}</b>.`,
                accent: '✅',
            }));
        } else {
            await ctx.answerCbQuery('❌ Kamu belum join channel.', { show_alert: true });
        }
    });
}

module.exports = { registerForceJoin, isUserJoinedChannel };