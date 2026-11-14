// middleware/satpam.js
const db = require('../services/database');
const config = require('../config');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { autoDeleteMessage } = require('../helpers/auto-delete');
const { isAdmin } = require('../helpers/auth');
const { escapeHtml } = require('../helpers/html');
const { state } = require('../state/maps');

// ─────────────────────────────────────────────────────────────
// GLOBAL BAN
// ─────────────────────────────────────────────────────────────
const globalBanCache = new Map();

function loadGlobalBans() {
    try {
        const raw = db.getSetting('global', 'global_bans', {}) || {};
        globalBanCache.clear();
        for (const [id, data] of Object.entries(raw)) {
            if (!data.until || data.until > Date.now()) globalBanCache.set(id, data);
        }
    } catch (e) { console.error('loadGlobalBans:', e.message); }
}
loadGlobalBans();
setInterval(loadGlobalBans, 60 * 1000);

function isGlobalBanned(userId) {
    const b = globalBanCache.get(String(userId));
    if (!b) return false;
    if (b.until && b.until < Date.now()) { globalBanCache.delete(String(userId)); return false; }
    return true;
}

function addGlobalBan(userId, reason, untilMs = 0, addedBy = null) {
    const data = { reason, until: untilMs ? Date.now() + untilMs : 0, addedBy, at: Date.now() };
    globalBanCache.set(String(userId), data);
    const raw = db.getSetting('global', 'global_bans', {}) || {};
    raw[String(userId)] = data;
    db.setSetting('global', 'global_bans', raw);
}

function removeGlobalBan(userId) {
    globalBanCache.delete(String(userId));
    const raw = db.getSetting('global', 'global_bans', {}) || {};
    delete raw[String(userId)];
    db.setSetting('global', 'global_bans', raw);
}

// ─────────────────────────────────────────────────────────────
// STRIKE SYSTEM
// ─────────────────────────────────────────────────────────────
const STRIKE_DECAY_MS = 24 * 60 * 60 * 1000;
const strikeCache = new Map();

function getStrike(chatId, userId) {
    const key = `${chatId}_${userId}`;
    const s = strikeCache.get(key);
    if (!s) return 0;
    if (Date.now() - s.lastAt > STRIKE_DECAY_MS) { strikeCache.delete(key); return 0; }
    return s.count;
}

function addStrike(chatId, userId, reason) {
    const key = `${chatId}_${userId}`;
    const s = strikeCache.get(key) || { count: 0, lastAt: 0, reasons: [] };
    if (Date.now() - s.lastAt > STRIKE_DECAY_MS) s.count = 0;
    s.count++; s.lastAt = Date.now();
    s.reasons.push({ reason, at: Date.now() });
    if (s.reasons.length > 10) s.reasons.shift();
    strikeCache.set(key, s);
    return s.count;
}

function resetStrike(chatId, userId) {
    strikeCache.delete(`${chatId}_${userId}`);
}

// ─────────────────────────────────────────────────────────────
// DETECTORS
// ─────────────────────────────────────────────────────────────
const SUSPICIOUS_LINK_PATTERNS = [
    /https?:\/\/[^\s]+/i,
    /\bwww\.[^\s]+/i,
    /\bt\.me\/[^\s]+/i,
    /\bwa\.me\/[^\s]+/i,
    /\bbit\.ly\/[^\s]+/i,
    /\btinyurl\.[^\s]+/i,
    /\btelegram\.[a-z]+\/[^\s]+/i,
    /\b(h\s*t\s*t\s*p|hxxp|hxxps):\/\//i,
    /\b[a-z0-9-]+\s*[\.\[\]\(\)]\s*(com|net|org|id|me|ly|link|site|xyz|online|app)\b/i,
    /\b[a-z0-9-]+\[\.\][a-z]{2,}/i,
    /\b[a-z0-9-]+\(\.\)[a-z]{2,}/i,
    /\b[a-z0-9-]+\.?\(dot\)\.?[a-z]{2,}/i,
    /\b[a-z0-9-]+\s*\[\s*dot\s*\]\s*[a-z]{2,}/i,
];

function detectLink(text) {
    if (!text) return null;
    for (const re of SUSPICIOUS_LINK_PATTERNS) {
        const m = text.match(re);
        if (m) return m[0];
    }
    return null;
}

function detectForward(msg) {
    if (msg.forward_from || msg.forward_from_chat || msg.forward_sender_name) return true;
    if (msg.forward_origin) return true;
    if (msg.quote && msg.quote.from) return true;
    if (msg.external_reply) return true;
    return false;
}

const TOXIC_PATTERNS = [
    /\b(anjing|anjg|anj|bangsat|bgst|kontol|kntl|memek|mmk|jembut|peler|tai|babi|kimak|kampang|goblok|gblk|tolol|idiot|bego|dungu|sialan|brengsek)\b/i,
    /\b(fuck|shit|bitch|asshole|dick|pussy|cunt|bastard)\b/i,
];

function detectToxic(text) {
    if (!text) return null;
    for (const re of TOXIC_PATTERNS) {
        const m = text.match(re);
        if (m) return m[0];
    }
    return null;
}

const spamWindow = new Map();
function checkAdaptiveSpam(chatId, userId, text, opts = {}) {
    const key = `${chatId}_${userId}`;
    const now = Date.now();
    const windowMs = opts.windowMs || 8000;
    const maxMsgs = opts.maxMsgs || 6;
    const maxDupes = opts.maxDupes || 3;

    let data = spamWindow.get(key) || { msgs: [] };
    data.msgs = data.msgs.filter(m => now - m.at < windowMs);
    data.msgs.push({ text: (text || '').toLowerCase().trim(), at: now });
    spamWindow.set(key, data);

    if (data.msgs.length > maxMsgs) return { spam: true, reason: `flood (${data.msgs.length} pesan / ${windowMs / 1000}s)` };

    const dupes = data.msgs.filter(m => m.text === (text || '').toLowerCase().trim()).length;
    if (dupes > maxDupes) return { spam: true, reason: `duplikat ${dupes}x` };

    const shortMsgs = data.msgs.filter(m => m.text.length > 0 && m.text.length <= 3).length;
    if (shortMsgs >= maxMsgs - 1) return { spam: true, reason: 'spam karakter pendek' };

    return { spam: false };
}

function isLinkWhitelisted(link, whitelist) {
    if (!whitelist || !link) return false;
    const entries = String(whitelist).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (entries.length === 0) return false;
    const l = link.toLowerCase();
    for (const w of entries) {
        const clean = w.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!clean) continue;
        const re = new RegExp(`(^|[/.])${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([/.]|$)`);
        if (re.test(l)) return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────
// PUNISH
// ─────────────────────────────────────────────────────────────
async function punish(ctx, userId, action, opts = {}) {
    const chatId = ctx.chat.id;
    const { reason, duration } = opts;
    try {
        switch (action) {
            case 'warn':
                return { type: 'warn', strikes: addStrike(chatId, userId, reason) };
            case 'mute':
            case 'tmute': {
                const until = action === 'tmute' && duration ? Math.floor(Date.now() / 1000) + Math.floor(duration / 1000) : 0;
                await ctx.telegram.restrictChatMember(chatId, userId, {
                    permissions: { can_send_messages: false, can_send_media_messages: false, can_send_other_messages: false, can_add_web_page_previews: false },
                    until_date: until,
                });
                return { type: 'mute', until };
            }
            case 'kick':
                await ctx.telegram.banChatMember(chatId, userId);
                await ctx.telegram.unbanChatMember(chatId, userId);
                return { type: 'kick' };
            case 'ban':
                await ctx.telegram.banChatMember(chatId, userId);
                return { type: 'ban' };
            case 'delete':
            default:
                try { await ctx.deleteMessage(); } catch (e) {}
                return { type: 'delete' };
        }
    } catch (e) {
        return { type: 'error', error: e.message };
    }
}

// ─────────────────────────────────────────────────────────────
// MAIN INSPECTOR
// ─────────────────────────────────────────────────────────────
async function inspectMessage(ctx) {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const msg = ctx.message || ctx.channelPost;
    if (!chatId || !userId || !msg) return { handled: false };
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return { handled: false };
    if (userId === config.OWNER_ID) return { handled: false };

    const admin = await isAdmin(ctx).catch(() => false);
    if (admin) return { handled: false };

    // Global ban
    if (isGlobalBanned(userId)) {
        try { await ctx.telegram.banChatMember(chatId, userId); } catch (e) {}
        const m = await replyRich(ctx, premiumMessage({
            heading: 'Global Ban', headingEmoji: '🚫',
            body: `User <a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a> diblokir global.`,
            accent: '⛔',
        })).catch(() => null);
        if (m) autoDeleteMessage(chatId, m.message_id, 8000);
        return { handled: true, reason: 'global_ban' };
    }

    const text = msg.text || msg.caption || '';

    // Antiforward
    if (db.getSetting(chatId, 'antiforward', false) && detectForward(msg)) {
        const action = db.getSetting(chatId, 'antiforward_action', 'delete');
        const r = await punish(ctx, userId, action === 'warn' ? 'warn' : action, { reason: 'forward' });
        const strikes = r.type === 'warn' ? r.strikes : getStrike(chatId, userId);
        const m = await replyRich(ctx, premiumMessage({
            heading: 'Forward Terdeteksi', headingEmoji: '🚫',
            body: `<a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a>, forward tidak diizinkan.`,
            blockquote: `Aksi: <b>${action.toUpperCase()}</b>\nStrike: <b>${strikes}/${config.MAX_WARN || 3}</b>`,
            accent: '⚠️',
        })).catch(() => null);
        if (m) autoDeleteMessage(chatId, m.message_id, 8000);
        return { handled: true, reason: 'forward' };
    }

    // Antilink
    if (db.getSetting(chatId, 'antilink', false)) {
        const found = detectLink(text);
        if (found) {
            const whitelist = db.getSetting(chatId, 'antilink_whitelist', '');
            if (!isLinkWhitelisted(found, whitelist)) {
                const action = db.getSetting(chatId, 'antilink_action', 'delete');
                const r = await punish(ctx, userId, action === 'warn' ? 'warn' : action, { reason: `link` });
                const strikes = r.type === 'warn' ? r.strikes : getStrike(chatId, userId);
                const m = await replyRich(ctx, premiumMessage({
                    heading: 'Link Terdeteksi', headingEmoji: '🔗',
                    body: `<a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a>, link tidak diizinkan.`,
                    blockquote: `Terdeteksi: <code>${escapeHtml(found)}</code>\nAksi: <b>${action.toUpperCase()}</b>\nStrike: <b>${strikes}/${config.MAX_WARN || 3}</b>`,
                    accent: '⚠️',
                })).catch(() => null);
                if (m) autoDeleteMessage(chatId, m.message_id, 8000);
                return { handled: true, reason: 'link' };
            }
        }
    }

    // Antitoxic
    if (db.getSetting(chatId, 'antitoxic', false)) {
        const bad = detectToxic(text);
        if (bad) {
            const action = db.getSetting(chatId, 'antitoxic_action', 'delete');
            const r = await punish(ctx, userId, action === 'warn' ? 'warn' : action, { reason: `toxic` });
            const strikes = r.type === 'warn' ? r.strikes : getStrike(chatId, userId);
            const m = await replyRich(ctx, premiumMessage({
                heading: 'Kata Kasar', headingEmoji: '🤬',
                body: `<a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a>, jaga ucapan.`,
                blockquote: `Kata: <b>${escapeHtml(bad)}</b>\nStrike: <b>${strikes}/${config.MAX_WARN || 3}</b>`,
                accent: '⚠️',
            })).catch(() => null);
            if (m) autoDeleteMessage(chatId, m.message_id, 8000);
            return { handled: true, reason: 'toxic' };
        }
    }

    // Antispam adaptif
    if (db.getSetting(chatId, 'antispam', false)) {
        const limit = db.getSetting(chatId, 'antispam_limit', 6);
        const windowMs = db.getSetting(chatId, 'antispam_window', 8000);
        const result = checkAdaptiveSpam(chatId, userId, text, { maxMsgs: limit, windowMs });
        if (result.spam) {
            const action = db.getSetting(chatId, 'antispam_action', 'mute');
            const r = await punish(ctx, userId, action === 'warn' ? 'warn' : action, { reason: result.reason });
            const strikes = r.type === 'warn' ? r.strikes : getStrike(chatId, userId);
            if (strikes >= (config.MAX_WARN || 3) && action !== 'ban') {
                await punish(ctx, userId, 'ban', { reason: 'strike limit' });
            }
            const m = await replyRich(ctx, premiumMessage({
                heading: 'Spam Terdeteksi', headingEmoji: '🛡️',
                body: `<a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a>, jangan spam.`,
                blockquote: `Alasan: <b>${escapeHtml(result.reason)}</b>\nAksi: <b>${action.toUpperCase()}</b>\nStrike: <b>${strikes}/${config.MAX_WARN || 3}</b>`,
                accent: '⚠️',
            })).catch(() => null);
            if (m) autoDeleteMessage(chatId, m.message_id, 8000);
            return { handled: true, reason: 'spam' };
        }
    }

    return { handled: false };
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE REGISTRAR
// ─────────────────────────────────────────────────────────────
function registerSatpam(bot) {
    bot.use(async (ctx, next) => {
        if (!ctx.message && !ctx.channelPost) return next();
        const r = await inspectMessage(ctx).catch(err => {
            console.error('satpam error:', err.message);
            return { handled: false };
        });
        if (r.handled) return;
        return next();
    });
}

module.exports = {
    registerSatpam, inspectMessage, punish,
    isGlobalBanned, addGlobalBan, removeGlobalBan,
    getStrike, addStrike, resetStrike,
    detectLink, detectForward, detectToxic, checkAdaptiveSpam, isLinkWhitelisted,
};