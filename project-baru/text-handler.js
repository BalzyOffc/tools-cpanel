// ═══════════════════════════════════════════════════════════════
// 📄 handlers/text-handler.js — FINAL VERSION
// Menangani semua input non-command (Text)
// ═══════════════════════════════════════════════════════════════

const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage, sendRichMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { isAdmin, isPrivileged } = require('../helpers/auth');
const { autoDeleteMessage } = require('../helpers/auto-delete');
const { formatDuration } = require('../helpers/cooldown');
const { isUserJoinedChannel } = require('../middleware/force-join');
const {
    pendingQris,
    pendingConfess,
    activeUserConfess,
    pendingVerification,
    mutedUsers,
    userMessageTimes,
    pendingSlotBet,
    state,
} = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// LEGACY HELPERS (untuk fallback antiflood & antilink)
// ═══════════════════════════════════════════════════════════════
const MAX_WARN = config.MAX_WARN || 3;

function detectViolation(message) {
    const text = message.text || message.caption || '';
    if (!text) {
        if (message.forward_from || message.forward_from_chat || message.forward_origin) return 'forward';
        return null;
    }
    if (message.forward_from || message.forward_from_chat || message.forward_origin) return 'forward';

    const linkPatterns = ['http', 'www', 'https', 't.me', 'wa.me', 'bit.ly', 'tinyurl', 'whatsapp'];
    const antikata = require('../services/antikata');
    if (antikata.checkPattern && antikata.checkPattern(text, linkPatterns)) return 'link';
    if (config.LINK_REGEX && config.LINK_REGEX.test(text)) return 'link';

    if (antikata.checkPattern && config.PROMO_WORDS) {
        const promoHit = antikata.checkPattern(text, config.PROMO_WORDS);
        if (promoHit) return 'promosi';
    }
    if (antikata.checkBadWords && config.BAD_WORDS) {
        const badHit = antikata.checkBadWords(text, config.BAD_WORDS);
        if (badHit) return `kata terlarang: "${badHit}"`;
    }
    return null;
}

function checkFlood(chatId, userId) {
    const key = `${chatId}_${userId}`;
    const now = Date.now();
    let times = userMessageTimes.get(key) || [];
    times = times.filter(t => now - t < config.FLOOD_TIME);
    times.push(now);
    userMessageTimes.set(key, times);
    if (times.length > config.FLOOD_LIMIT) {
        userMessageTimes.set(key, []);
        return true;
    }
    return false;
}

async function punishFlood(ctx, userId) {
    if (userId === config.OWNER_ID) return;
    try {
        const m = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        if (m.status === 'creator' || m.status === 'administrator') return;
    } catch (e) { return; }

    const action = config.FLOOD_ACTION || 'mute';
    try {
        if (action === 'ban') {
            await ctx.telegram.banChatMember(ctx.chat.id, userId);
        } else if (action === 'kick') {
            await ctx.telegram.banChatMember(ctx.chat.id, userId);
            await ctx.telegram.unbanChatMember(ctx.chat.id, userId);
        } else if (action === 'mute' || action === 'tmute') {
            const until = action === 'tmute'
                ? Math.floor(Date.now() / 1000) + (config.FLOOD_MUTE_DURATION || 60000) / 1000
                : 0;
            await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
                permissions: { can_send_messages: false },
                until_date: until,
            });
            mutedUsers.add(`${ctx.chat.id}_${userId}`);
        }
    } catch (e) {}

    await replyRich(ctx, premiumMessage({
        heading: 'Antiflood!', headingEmoji: '🌊',
        body: `User <a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a> spam.`,
        blockquote: `Batas: ${config.FLOOD_LIMIT}/${(config.FLOOD_TIME || 10000) / 1000}s\nSanksi: ${action.toUpperCase()}`,
        footer: 'Santai aja~',
        accent: '⏱️',
    }));
}

function pickReactionBySentiment(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (config.REACTION_SENTIMENTS) {
        for (const [, data] of Object.entries(config.REACTION_SENTIMENTS)) {
            for (const keyword of data.keywords || []) {
                if (lower.includes(keyword)) {
                    return data.emojis[Math.floor(Math.random() * data.emojis.length)];
                }
            }
        }
    }
    const neutral = config.REACTION_NEUTRAL || ['👍', '🔥', '🎉'];
    return neutral[Math.floor(Math.random() * neutral.length)];
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerTextHandler(bot) {

    bot.on('text', async (ctx, next) => {
        const text = ctx.message.text;
        if (!text || text.startsWith('/')) return next();

        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const isPV = ctx.chat.type === 'private';
        const key = `${chatId}_${userId}`;

        // ─── 0. SIMPAN TARGET BROADCAST ───
        if (isPV) db.addTarget(chatId, 'user');
        else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') db.addTarget(chatId, 'group');

        // ═══════════════════════════════════════════════════════
        // 1. AFK CHECK (Berjalan di PV & Grup)
        // ═══════════════════════════════════════════════════════
        // (Cek dulu jika ada yang tag/reply user AFK, baru hapus AFK pengirim)
        const afkTargets = new Set();

        // Deteksi Reply
        if (ctx.message.reply_to_message?.from) {
            afkTargets.add(ctx.message.reply_to_message.from.id);
        }

        // Deteksi Mention (@username)
        if (ctx.message.entities) {
            for (const ent of ctx.message.entities) {
                if (ent.type === 'text_mention' && ent.user) {
                    afkTargets.add(ent.user.id);
                } else if (ent.type === 'mention') {
                    const username = text.substring(ent.offset + 1, ent.offset + ent.length);
                    const found = db.findUserByUsername(username);
                    if (found) afkTargets.add(found.id);
                }
            }
        }

        // Khusus di PV: Deteksi nama di dalam teks (misal ngetik "Budi")
        if (isPV && db.findUserByFirstName) {
            const words = text.split(/[\s,?.!]+/);
            for (const word of words) {
                if (word.length >= 3) {
                    const found = db.findUserByFirstName(word);
                    if (found) afkTargets.add(found.id);
                }
            }
        }

        // Proses AFK Targets
        for (const targetId of afkTargets) {
            if (targetId === userId) continue; // Skip jika tag diri sendiri
            const afk = db.getAfk(targetId);
            
            if (afk) {
                const durasi = Math.floor((Date.now() - afk.since) / 60000);
                const jam = Math.floor(durasi / 60);
                const menit = durasi % 60;
                const durasiStr = jam > 0 ? `${jam} jam ${menit} menit` : `${menit} menit`;

                let targetName = 'User tersebut';
                try {
                    const chatInfo = await ctx.telegram.getChat(targetId);
                    targetName = `<a href="tg://user?id=${targetId}">${escapeHtml(chatInfo.first_name)}</a>`;
                } catch (e) {}

                await replyRich(ctx, premiumMessage({
                    heading: 'User Sedang AFK', headingEmoji: '💤',
                    body: `${targetName} sedang AFK sejak ${durasiStr} lalu.`,
                    blockquote: `📝 Alasan: <i>${escapeHtml(afk.reason)}</i>`,
                    footer: 'Jangan di-spam ya, nanti dibalas saat online.',
                    accent: '🌙',
                }));
                break; // Cukup balas 1x per pesan
            }
        }

        // Auto-remove AFK pengirim (hapus jika dia sendiri yang chat)
        // (Sesuai permintaan, kita gunakan /unafk manual, jadi blok ini di-comment)
        /*
        const selfAfk = db.getAfk(userId);
        if (selfAfk) {
            db.delAfk(userId);
            const durasi = Math.floor((Date.now() - selfAfk.since) / 60000);
            await replyRich(ctx, premiumMessage({
                heading: 'Selamat Datang Kembali!', headingEmoji: '👋',
                body: `<a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a> sudah tidak AFK.`,
                blockquote: `AFK selama: ${durasi} menit`,
                accent: '✅',
            }));
        }
        */

        // ═══════════════════════════════════════════════════════
        // 2. KHUSUS PV (PRIVATE CHAT) — QRIS, CONFESS, DLL
        // ═══════════════════════════════════════════════════════
        if (isPV) {
            // --- QRIS Waiting Bukti ---
            if (pendingQris.has(`waiting_bukti_${userId}`)) {
                if (text.trim().toLowerCase() === '/cancel') {
                    pendingQris.delete(`waiting_bukti_${userId}`);
                    return ctx.reply('✅ Pengiriman bukti transfer dibatalkan.');
                }
                return ctx.reply('📤 Silakan kirim FOTO/SCREENSHOT bukti transfer, atau ketik /cancel untuk batal.');
            }

            // --- QRIS Waiting Nominal ---
            if (pendingQris.has(`waiting_${userId}`)) {
                const waiting = pendingQris.get(`waiting_${userId}`);
                if (text.trim().toLowerCase() === '/cancel') {
                    pendingQris.delete(`waiting_${userId}`);
                    return ctx.reply('✅ Ganti nominal dibatalkan.');
                }

                const newNominal = parseInt(text.trim());
                if (isNaN(newNominal) || newNominal < 100) {
                    return ctx.reply('❌ Nominal tidak valid. Masukkan angka minimal Rp 100, atau /cancel untuk batal.');
                }

                pendingQris.delete(`waiting_${userId}`);
                const waitMsg = await ctx.reply('⏳ Membuat QRIS baru...');

                try {
                    const { GenerateQris } = require('@fhylabs/qris-dynamic');
                    const result = await GenerateQris({
                        qris: waiting.qrisString,
                        amount: newNominal,
                        type: 'base64',
                    });
                    try { await ctx.telegram.deleteMessage(chatId, waitMsg.message_id); } catch (e) {}
                    try { await ctx.deleteMessage(); } catch (e) {}

                    const { sendQrisToUser } = require('../helpers/qris');
                    await sendQrisToUser(ctx, result, newNominal, waiting.description, waiting.qrisString);
                } catch (err) {
                    try { await ctx.telegram.deleteMessage(chatId, waitMsg.message_id); } catch (e) {}
                    await ctx.reply(`❌ Gagal membuat QRIS baru: ${err.message}`);
                }
                return;
            }

            // --- CONFESS BALASAN ---
            if (ctx.message.reply_to_message) {
                const repliedMsgId = ctx.message.reply_to_message.message_id;
                const confessKey = `confess_${chatId}_${repliedMsgId}`;
                const confessData = pendingConfess.get(confessKey);

                if (confessData) {
                    try { await ctx.deleteMessage(); } catch (e) {}
                    try {
                        await bot.telegram.sendMessage(confessData.senderId,
                            `💌 <b>Balasan Pesan Rahasia Kamu!</b>\n\n` +
                            `Pesan kamu: "<i>${escapeHtml(confessData.originalText)}</i>"\n\n` +
                            `Balasan: "<b>${escapeHtml(text)}</b>"`,
                            { parse_mode: 'HTML' }
                        );
                        const notif = await ctx.reply('✅ Balasan kamu sudah terkirim ke pengirim (anonim).');
                        autoDeleteMessage(chatId, notif.message_id, 5000);
                    } catch (e) {
                        await ctx.reply(`❌ Gagal mengirim ke pelaku: ${e.message}`);
                    }

                    pendingConfess.delete(confessKey);
                    const senderSessions = activeUserConfess.get(confessData.senderId);
                    if (senderSessions) {
                        const newSessions = senderSessions.filter(k => k !== confessKey);
                        if (newSessions.length > 0) activeUserConfess.set(confessData.senderId, newSessions);
                        else activeUserConfess.delete(confessData.senderId);
                    }
                    return;
                }
            }

            // --- GUARD GCONLY DI PV ---
            if (state.gcOnlyGlobal && userId !== config.OWNER_ID) {
                const allowedCmds = ['/start', '/help', '/id', '/ping', '/gconly', '/menu', '/afk', '/unafk'];
                if (text && !allowedCmds.some(c => text.toLowerCase().startsWith(c))) {
                    return replyRich(ctx, premiumMessage({
                        heading: 'Mode Group Only', headingEmoji: '🔒',
                        body: 'Bot sedang dalam mode <b>Group Only</b>.',
                        blockquote: 'Silakan gunakan bot di grup.',
                        accent: '🔐',
                    }));
                }
            }
            
            // PV selesai diproses, lanjut ke handler berikutnya (tapi jangan diproses sebagai grup)
            return next();
        }

        // ═══════════════════════════════════════════════════════
        // 3. KHUSUS GRUP (GROUP / SUPERGROUP)
        // ═══════════════════════════════════════════════════════
        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return next();

        const admin = await isPrivileged(ctx);

        // --- FILTER AUTO-REPLY ---
        const filterMatch = db.findFilter(chatId, text);
        if (filterMatch) {
            try { await ctx.deleteMessage(); } catch (e) {}
            if (filterMatch.message_id && filterMatch.from_chat_id) {
                try {
                    await ctx.telegram.copyMessage(chatId, filterMatch.from_chat_id, filterMatch.message_id);
                } catch (e) {
                    if (filterMatch.response) {
                        await replyRich(ctx, premiumMessage({ heading: 'Auto Reply', headingEmoji: '🔍', body: filterMatch.response, accent: '💬' }));
                    }
                }
            } else if (filterMatch.response) {
                await replyRich(ctx, premiumMessage({ heading: 'Auto Reply', headingEmoji: '🔍', body: filterMatch.response, accent: '💬' }));
            }
            return;
        }

        // --- AUTO-REACT ---
        if (config.AUTO_REACT_ENABLED && !ctx.from.is_bot) {
            if (Math.random() >= (config.AUTO_REACT_SKIP_CHANCE || 0)) {
                const emoji = pickReactionBySentiment(text);
                if (emoji) {
                    const delayMin = config.AUTO_REACT_DELAY_MIN || 200;
                    const delayMax = config.AUTO_REACT_DELAY_MAX || 800;
                    const delay = delayMin + Math.random() * (delayMax - delayMin);
                    setTimeout(async () => {
                        try {
                            await bot.telegram.callApi('setMessageReaction', {
                                chat_id: chatId, message_id: ctx.message.message_id,
                                reaction: [{ type: 'emoji', emoji }], is_big: false,
                            });
                        } catch (err) {}
                    }, delay);
                }
            }
        }

        // --- INPUT BET SLOT CUSTOM ---
        if (pendingSlotBet.has(userId)) {
            pendingSlotBet.delete(userId);
            const bet = parseInt(text);
            if (!isNaN(bet)) {
                try { await ctx.deleteMessage(); } catch (e) {}
                try {
                    const games = require('./games');
                    if (games.runSlot) return games.runSlot(ctx, bet);
                } catch (e) {}
            }
        }

        // --- CEK VERIFIKASI CHANNEL ---
        if (pendingVerification.has(key)) {
            const joined = await isUserJoinedChannel(chatId, userId);
            if (joined) {
                pendingVerification.delete(key);
                try {
                    await ctx.telegram.restrictChatMember(chatId, userId, {
                        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true },
                    });
                } catch (e) {}
            } else {
                try { await ctx.deleteMessage(); } catch (e) {}
                return;
            }
        }

        // --- CEK MUTE MANUAL ---
        if (mutedUsers.has(key)) {
            try { await ctx.deleteMessage(); } catch (e) {}
            return;
        }

        // --- ANTIFLOOD (Jika Satpam Mati) ---
        if (!admin && db.getSetting(chatId, 'flood', true) && checkFlood(chatId, userId)) {
            return punishFlood(ctx, userId);
        }

        // --- DETEKSI PELANGGARAN LEGACY ---
        if (!admin) {
            const violation = detectViolation(ctx.message);
            if (violation) {
                try { await ctx.deleteMessage(); } catch (e) {}
                const currentWarns = db.getWarn(chatId, userId) + 1;
                db.setWarn(chatId, userId, currentWarns);

                if (currentWarns >= MAX_WARN) {
                    try {
                        await ctx.telegram.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false }, until_date: 0 });
                        mutedUsers.add(key);
                        const msg = await replyRich(ctx, premiumMessage({
                            heading: 'MUTE PERMANEN', headingEmoji: '🔨',
                            body: `User <a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a> di-mute permanen.`,
                            listItems: [`Pelanggaran: <b>${escapeHtml(violation)}</b>`, `Total: ${MAX_WARN}x`],
                            accent: '💀',
                            buttons: [{ text: '🔊 Unmute', callback: `unmute_${userId}`, color: 'success' }],
                        }));
                        autoDeleteMessage(chatId, msg.message_id, 10000);
                    } catch (e) {}
                    db.resetWarn(chatId, userId);
                } else {
                    const msg = await replyRich(ctx, premiumMessage({
                        heading: `Peringatan (${currentWarns}/${MAX_WARN})`, headingEmoji: '⚠️',
                        body: `Pesan kamu dihapus karena melanggar <mark>${escapeHtml(violation)}</mark>.`,
                        blockquote: `Sisa peringatan: <b>${MAX_WARN - currentWarns}</b>.`,
                        accent: '📌',
                        buttons: [
                            { text: '✅ Saya Paham', callback: 'warn_ok', color: 'success' },
                            { text: '📜 Lihat Aturan', callback: 'show_rules', color: 'primary' },
                        ],
                    }));
                    autoDeleteMessage(chatId, msg.message_id, 10000);
                }
                return;
            }
        }

        // Selesai
        return next();
    });
}

module.exports = { registerTextHandler };