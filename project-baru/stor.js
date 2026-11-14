// ═══════════════════════════════════════════════════════════════
// 📄 handlers/stor.js — Channel storan media
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { isAdmin } = require('../helpers/auth');
const { autoDeleteMessage } = require('../helpers/auto-delete');

function registerStorHandler(bot) {
    // ═══════════════════════════════════════════════════════════
    // /setstor — Owner set channel storan global
    // ═══════════════════════════════════════════════════════════
    bot.command('setstor', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Fitur ini hanya untuk Owner.',
                accent: '🔒',
            }));
        }

        const target = ctx.message.text.split(' ').slice(1)[0];

        // Tanpa argumen → status
        if (!target) {
            const currentId = db.getSetting('global', 'stor_channel', config.STOR_CHANNEL_ID || null);
            let channelInfo = 'Belum diatur';

            if (currentId) {
                try {
                    const chat = await ctx.telegram.getChat(currentId);
                    channelInfo = `<b>${escapeHtml(chat.title)}</b>\n🆔 <code>${chat.id}</code>\n🔗 ${chat.username ? `https://t.me/${chat.username}` : 'Private Channel'}`;
                } catch (e) {
                    channelInfo = `ID: <code>${currentId}</code> (Gagal ambil info)`;
                }
            }

            return replyRich(ctx, premiumMessage({
                heading: 'Channel Storan Global', headingEmoji: '📢',
                body: 'Channel storan saat ini:',
                blockquote: channelInfo,
                listItems: [
                    '📌 <code>/setstor @channel</code>',
                    '📌 <code>/setstor -1001234567890</code>',
                    '📌 <code>/setstor off</code>',
                ],
                footer: 'Pastikan bot sudah admin di channel.',
                accent: '⚙️',
            }));
        }

        // Off
        if (target.toLowerCase() === 'off') {
            db.setSetting('global', 'stor_channel', null);
            return replyRich(ctx, premiumMessage({
                heading: 'Channel Storan Dihapus', headingEmoji: '🗑️',
                body: 'Fitur /stor tidak mengirim ke channel manapun.',
                accent: '✅',
            }));
        }

        // Set channel
        try {
            const chat = await ctx.telegram.getChat(target);

            if (chat.type !== 'channel') {
                return replyRich(ctx, premiumMessage({
                    heading: 'Bukan Channel', headingEmoji: '❌',
                    body: 'Target bukan channel.',
                    blockquote: `Tipe: <b>${chat.type}</b>`,
                    accent: '⚠️',
                }));
            }

            const botMember = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id);
            if (botMember.status !== 'administrator' && botMember.status !== 'creator') {
                return replyRich(ctx, premiumMessage({
                    heading: 'Bot Belum Admin', headingEmoji: '⚠️',
                    body: `Bot belum jadi admin di <b>${escapeHtml(chat.title)}</b>.`,
                    listItems: [
                        '1. Buka channel',
                        '2. Tambahkan bot sebagai Admin',
                        '3. Beri izin "Post Messages"',
                        '4. Coba /setstor lagi',
                    ],
                    accent: '⚙️',
                }));
            }

            db.setSetting('global', 'stor_channel', chat.id);

            await replyRich(ctx, premiumMessage({
                heading: 'Channel Storan Diatur!', headingEmoji: '✅',
                body: `Channel: <b>${escapeHtml(chat.title)}</b>`,
                listItems: [
                    `🆔 ID: <code>${chat.id}</code>`,
                    `🔗 Link: ${chat.username ? `https://t.me/${chat.username}` : 'Private'}`,
                    `🤖 Bot: ${botMember.status === 'creator' ? '✅ Creator' : '✅ Administrator'}`,
                ],
                footer: 'Semua /stor dari grup manapun akan dikirim ke sini.',
                accent: '📢',
                buttons: chat.username ? [{ text: '🔗 Buka Channel', url: `https://t.me/${chat.username}`, color: 'primary' }] : [],
            }));

        } catch (err) {
            let errMsg = err.message;
            if (errMsg.includes('chat not found')) errMsg = 'Channel tidak ditemukan.';
            if (errMsg.includes('username not found')) errMsg = 'Username tidak valid.';
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Set Channel', headingEmoji: '❌',
                body: `<code>${escapeHtml(errMsg)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /setstorgrup — Admin grup set channel khusus grup
    // ═══════════════════════════════════════════════════════════
    bot.command('setstorgrup', async (ctx) => {
        if (!await isAdmin(ctx) && ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Hanya Admin Grup atau Owner.',
                accent: '🔒',
            }));
        }

        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
            return replyRich(ctx, premiumMessage({
                heading: 'Khusus Grup', headingEmoji: '🔒',
                body: 'Hanya bisa dipakai di grup.',
                accent: '📢',
            }));
        }

        const target = ctx.message.text.split(' ').slice(1)[0];

        // Tanpa argumen → status
        if (!target) {
            const currentGrup = db.getSetting(ctx.chat.id, 'stor_channel', null);
            const currentGlobal = db.getSetting('global', 'stor_channel', config.STOR_CHANNEL_ID || null);

            let infoGrup = 'Ikut Global';
            if (currentGrup) {
                try {
                    const chat = await ctx.telegram.getChat(currentGrup);
                    infoGrup = `<b>${escapeHtml(chat.title)}</b>\n🆔 <code>${chat.id}</code>`;
                } catch (e) {
                    infoGrup = `ID: <code>${currentGrup}</code>`;
                }
            }

            let infoGlobal = 'Belum diatur';
            if (currentGlobal) {
                try {
                    const chat = await ctx.telegram.getChat(currentGlobal);
                    infoGlobal = `<b>${escapeHtml(chat.title)}</b>\n🆔 <code>${chat.id}</code>`;
                } catch (e) {
                    infoGlobal = `ID: <code>${currentGlobal}</code>`;
                }
            }

            return replyRich(ctx, premiumMessage({
                heading: 'Channel Storan Grup', headingEmoji: '📢',
                body: 'Setting channel storan untuk grup ini:',
                blockquote: `📁 <b>Khusus Grup:</b>\n${infoGrup}\n\n🌐 <b>Global:</b>\n${infoGlobal}`,
                listItems: [
                    '📌 <code>/setstorgrup @channel</code>',
                    '📌 <code>/setstorgrup off</code>',
                ],
                footer: 'Pastikan bot sudah admin di channel.',
                accent: '⚙️',
            }));
        }

        // Off
        if (target.toLowerCase() === 'off') {
            db.setSetting(ctx.chat.id, 'stor_channel', null);
            return replyRich(ctx, premiumMessage({
                heading: 'Channel Grup Dihapus', headingEmoji: '🗑️',
                body: 'Grup ini pakai channel storan global.',
                accent: '✅',
            }));
        }

        // Set channel
        try {
            const chat = await ctx.telegram.getChat(target);

            if (chat.type !== 'channel') {
                return replyRich(ctx, premiumMessage({
                    heading: 'Bukan Channel', headingEmoji: '❌',
                    accent: '⚠️',
                }));
            }

            const botMember = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id);
            if (botMember.status !== 'administrator' && botMember.status !== 'creator') {
                return replyRich(ctx, premiumMessage({
                    heading: 'Bot Belum Admin', headingEmoji: '⚠️',
                    body: `Bot belum jadi admin di <b>${escapeHtml(chat.title)}</b>.`,
                    accent: '⚙️',
                }));
            }

            db.setSetting(ctx.chat.id, 'stor_channel', chat.id);

            await replyRich(ctx, premiumMessage({
                heading: 'Channel Storan Grup Diatur!', headingEmoji: '✅',
                body: `Channel: <b>${escapeHtml(chat.title)}</b>`,
                listItems: [
                    `🆔 ID: <code>${chat.id}</code>`,
                    `🔗 Link: ${chat.username ? `https://t.me/${chat.username}` : 'Private'}`,
                ],
                footer: 'Semua /stor dari grup ini akan dikirim ke sini.',
                accent: '📢',
                buttons: chat.username ? [{ text: '🔗 Buka Channel', url: `https://t.me/${chat.username}`, color: 'primary' }] : [],
            }));

        } catch (err) {
            let errMsg = err.message;
            if (errMsg.includes('chat not found')) errMsg = 'Channel tidak ditemukan.';
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Set Channel', headingEmoji: '❌',
                body: `<code>${escapeHtml(errMsg)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /stor — User kirim media ke channel storan
    // ═══════════════════════════════════════════════════════════
    bot.command(['stor', 'storan'], async (ctx) => {
        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
            return replyRich(ctx, premiumMessage({
                heading: 'Khusus Grup', headingEmoji: '🔒',
                body: 'Fitur /stor hanya bisa dipakai di grup.',
                accent: '📢',
            }));
        }

        const chatId = ctx.chat.id;
        let storChannel = db.getSetting(chatId, 'stor_channel', null);
        if (!storChannel) storChannel = db.getSetting('global', 'stor_channel', null);
        if (!storChannel) storChannel = config.STOR_CHANNEL_ID || null;

        if (!storChannel) {
            return replyRich(ctx, premiumMessage({
                heading: 'Channel Storan Belum Diatur', headingEmoji: '⚠️',
                body: 'Hubungi Owner untuk atur channel storan.',
                blockquote: `Owner bisa atur via:\n<code>/setstor @channelstoran</code>`,
                accent: '⚙️',
            }));
        }

        const replied = ctx.message.reply_to_message;
        if (!replied) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply <b>FOTO</b> atau <b>VIDEO</b> yang mau di-stor, lalu ketik:',
                pre: '/stor',
                listItems: [
                    '📸 Hanya menerima <b>Foto</b> & <b>Video</b>',
                    '🚫 Teks/stiker/dokumen tidak bisa',
                ],
                accent: '📢',
            }));
        }

        const isPhoto = !!replied.photo;
        const isVideo = !!replied.video;
        const isAnimation = !!replied.animation;

        if (!isPhoto && !isVideo && !isAnimation) {
            return replyRich(ctx, premiumMessage({
                heading: 'Hanya Media!', headingEmoji: '🚫',
                body: 'Fitur /stor hanya menerima <b>FOTO</b> atau <b>VIDEO</b>.',
                blockquote: `Pesan yang kamu reply: <b>${replied.text ? 'Teks' : replied.sticker ? 'Stiker' : replied.document ? 'Dokumen' : 'Bukan Media'}</b>`,
                accent: '⚠️',
            }));
        }

        const waitMsg = await ctx.reply('⏳ Mengirim media ke channel storan...');

        try {
            const userMention = `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a>`;
            const username = ctx.from.username ? ` (@${ctx.from.username})` : '';
            const groupName = ctx.chat.title || 'Grup';

            const additionalInfo = `
<b>━━━━━━━━━━━━━━━━━━</b>
👤 <b>Dari:</b> ${userMention}${username}
🆔 <b>ID:</b> <code>${ctx.from.id}</code>
📢 <b>Grup:</b> ${escapeHtml(groupName)}
🕐 <b>Waktu:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
<b>━━━━━━━━━━━━━━━━━━</b>`;

            const userCaption = replied.caption || '';
            const finalCaption = userCaption
                ? `${escapeHtml(userCaption)}\n\n${additionalInfo}`
                : additionalInfo;

            if (isPhoto) {
                const fileId = replied.photo[replied.photo.length - 1].file_id;
                await bot.telegram.sendPhoto(storChannel, fileId, {
                    caption: finalCaption,
                    parse_mode: 'HTML',
                });
            } else if (isVideo) {
                await bot.telegram.sendVideo(storChannel, replied.video.file_id, {
                    caption: finalCaption,
                    parse_mode: 'HTML',
                    supports_streaming: true,
                });
            } else if (isAnimation) {
                await bot.telegram.sendAnimation(storChannel, replied.animation.file_id, {
                    caption: finalCaption,
                    parse_mode: 'HTML',
                });
            }

            try { await ctx.telegram.deleteMessage(chatId, waitMsg.message_id); } catch (e) {}

            const confirmMsg = await replyRich(ctx, premiumMessage({
                heading: 'Berhasil Di-Stor!', headingEmoji: '✅',
                body: 'Media sudah dikirim ke channel storan.',
                blockquote: 'Terima kasih sudah melapor!',
                accent: '📢',
            }));
            autoDeleteMessage(chatId, confirmMsg.message_id, 10000);

            try { await ctx.deleteMessage(); } catch (e) {}

        } catch (err) {
            console.error('Stor Error:', err.message);
            try { await ctx.telegram.deleteMessage(chatId, waitMsg.message_id); } catch (e) {}

            let errMsg = err.message;
            if (errMsg.includes('chat not found')) errMsg = 'Channel tidak ditemukan.';
            if (errMsg.includes('not enough rights')) errMsg = 'Bot tidak punya akses admin.';
            if (errMsg.includes('CHAT_WRITE_FORBIDDEN')) errMsg = 'Bot tidak bisa kirim ke channel.';
            if (errMsg.includes('file is too big')) errMsg = 'File terlalu besar (max 20MB).';

            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Mengirim', headingEmoji: '❌',
                body: `<code>${escapeHtml(errMsg)}</code>`,
                footer: 'Laporkan error ke Owner.',
                accent: '⚠️',
            }));
        }
    });
}

module.exports = { registerStorHandler };