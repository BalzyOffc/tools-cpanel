// ═══════════════════════════════════════════════════════════════
// 📄 handlers/email.js — Email sementara (mail.tm)
// ═══════════════════════════════════════════════════════════════
const axios = require('axios');
const config = require('../config');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { isPV } = require('../helpers/auth');
const { checkCooldown, setCooldown, getTodayStr } = require('../helpers/cooldown');
const {
    tempMailCooldown,
    tempMailDaily,
    tempEmailSessions,
} = require('../state/maps');

const MAILTM_BASE = 'https://api.mail.tm';

// ─────────────────────────────────────────────────────────────
// Helper: bikin akun mail.tm
// ─────────────────────────────────────────────────────────────
async function mailtmCreateAccount() {
    const domRes = await axios.get(`${MAILTM_BASE}/domains`, { timeout: 15000 });
    const domains = domRes.data['hydra:member'] || [];
    if (domains.length === 0) throw new Error('Tidak ada domain tersedia.');
    const domain = domains[0].domain;

    const randUser = 'tg' + Math.random().toString(36).substring(2, 10);
    const address = `${randUser}@${domain}`;
    const password = Math.random().toString(36).substring(2, 14) + 'Aa1!';

    await axios.post(`${MAILTM_BASE}/accounts`, { address, password }, { timeout: 15000 });

    const loginRes = await axios.post(`${MAILTM_BASE}/token`, { address, password }, { timeout: 15000 });

    return {
        address,
        password,
        token: loginRes.data.token,
        accountId: loginRes.data.id,
    };
}

async function mailtmFetchInbox(token) {
    const res = await axios.get(`${MAILTM_BASE}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
    });
    return res.data['hydra:member'] || [];
}

function registerEmailHandler(bot) {
    // ═══════════════════════════════════════════════════════════
    // /tempemail
    // ═══════════════════════════════════════════════════════════
    bot.command('tempemail', async (ctx) => {
        if (!isPV(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Khusus PV', headingEmoji: '🔒',
                body: 'Fitur /tempemail hanya di Private Chat.',
                accent: '📧',
            }));
        }

        const roleLevel = ctx.state.roleLevel || 0;
        const ROLE_LEVELS = require('../core/constants').ROLE_LEVELS;
        const isPremium = roleLevel >= ROLE_LEVELS.vip;

        // Cooldown
        if (!isPremium) {
            const cd = checkCooldown(tempMailCooldown, ctx.from.id, config.TEMPEMAIL_COOLDOWN || 300000, 'Temp Email');
            if (cd.blocked) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Cooldown Aktif', headingEmoji: '⏳',
                    body: `Tunggu <b>${cd.remainStr}</b>.`,
                    blockquote: '⭐ VIP bisa bypass cooldown ini!',
                    accent: '📧',
                }));
            }
        }

        // Limit harian
        const today = getTodayStr();
        let daily = tempMailDaily.get(ctx.from.id) || { count: 0, dateStr: today };
        if (daily.dateStr !== today) daily = { count: 0, dateStr: today };

        if (daily.count >= (config.TEMPEMAIL_MAX_PER_DAY || 3)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Limit Harian Tercapai', headingEmoji: '📊',
                body: `Kamu sudah buat <b>${daily.count}</b> email hari ini.`,
                blockquote: `Batas: <b>${config.TEMPEMAIL_MAX_PER_DAY || 3}</b> email/hari.\nCoba lagi besok.`,
                accent: '📧',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Membuat Email Sementara...', headingEmoji: '⏳',
            body: 'Menghubungi mail.tm...',
            accent: '📧',
        }));

        try {
            const acc = await mailtmCreateAccount();

            setCooldown(tempMailCooldown, ctx.from.id);
            daily.count++;
            tempMailDaily.set(ctx.from.id, daily);
            tempEmailSessions.set(ctx.from.id, acc);

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRich(ctx, premiumMessage({
                heading: 'Email Sementara Siap!', headingEmoji: '📧',
                body: 'Gunakan untuk verifikasi:',
                pre: `Email    : ${acc.address}\nPassword : ${acc.password}`,
                listItems: [
                    `📬 Sisa jatah hari ini: <b>${(config.TEMPEMAIL_MAX_PER_DAY || 3) - daily.count}</b>`,
                    `⏱️ Email aktif ~7 hari`,
                    `📥 Cek inbox: <code>/inbox</code>`,
                ],
                blockquote: '⚠️ Jangan pakai untuk akun penting (bank, medsos utama).',
                footer: 'Simpan email & password!',
                accent: '✉️',
                buttons: [
                    { text: '📥 Cek Inbox', callback: 'tempmail_inbox', color: 'success' },
                    { text: '🔄 Bikin Lagi', callback: 'tempmail_new', color: 'primary' },
                ],
            }));

        } catch (err) {
            console.error('TempEmail Error:', err.message);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Bikin Email', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                footer: 'mail.tm mungkin sedang down. Coba lagi nanti.',
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /inbox
    // ═══════════════════════════════════════════════════════════
    bot.command(['inbox', 'cekemail'], async (ctx) => {
        if (!isPV(ctx)) return;

        const sess = tempEmailSessions.get(ctx.from.id);
        if (!sess) {
            return replyRich(ctx, premiumMessage({
                heading: 'Belum Ada Email', headingEmoji: '📭',
                body: 'Kamu belum membuat email sementara.',
                pre: '/tempemail',
                accent: '📧',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Mengambil Inbox...', headingEmoji: '⏳',
            accent: '📥',
        }));

        try {
            const messages = await mailtmFetchInbox(sess.token);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (messages.length === 0) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Inbox Kosong', headingEmoji: '📭',
                    body: `Email: <code>${escapeHtml(sess.address)}</code>`,
                    blockquote: 'Belum ada pesan.\nTunggu lalu cek lagi.',
                    accent: '📥',
                    buttons: [{ text: '🔄 Cek Lagi', callback: 'tempmail_inbox', color: 'success' }],
                }));
            }

            const preview = messages.slice(0, 5).map((m, i) =>
                `${i + 1}. <b>${escapeHtml(m.from?.name || m.from?.address || 'Unknown')}</b>\n   <i>${escapeHtml(m.subject || '(no subject)')}</i>\n   ${new Date(m.createdAt).toLocaleString('id-ID')}`
            ).join('\n\n');

            await replyRich(ctx, premiumMessage({
                heading: `Inbox (${messages.length} pesan)`, headingEmoji: '📥',
                body: `Email: <code>${escapeHtml(sess.address)}</code>`,
                pre: preview,
                footer: 'Klik pesan untuk lihat detail',
                accent: '✉️',
                buttons: messages.slice(0, 5).map((m, i) => ({
                    text: `📄 ${(m.subject || 'Pesan').substring(0, 20)}`,
                    callback: `tempmail_read_${i}`,
                    color: 'primary',
                })),
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Ambil Inbox', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACKS
    // ═══════════════════════════════════════════════════════════
    bot.action('tempmail_new', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.message = ctx.callbackQuery.message;
        return bot.command('tempemail', ctx);
    });

    bot.action('tempmail_inbox', async (ctx) => {
        await ctx.answerCbQuery('📥 Mengambil inbox...');
        ctx.message = ctx.callbackQuery.message;
        return bot.command('inbox', ctx);
    });

    bot.action(/tempmail_read_(\d+)/, async (ctx) => {
        const idx = parseInt(ctx.match[1]);
        const sess = tempEmailSessions.get(ctx.from.id);
        if (!sess) return ctx.answerCbQuery('❌ Sesi habis.', { show_alert: true });

        await ctx.answerCbQuery('📄 Mengambil detail...');
        try {
            const messages = await mailtmFetchInbox(sess.token);
            const msg = messages[idx];
            if (!msg) return ctx.answerCbQuery('❌ Pesan sudah hilang.', { show_alert: true });

            const detail = await axios.get(`${MAILTM_BASE}/messages/${msg.id}`, {
                headers: { Authorization: `Bearer ${sess.token}` },
                timeout: 15000,
            });

            const textBody = (detail.data.text || detail.data.html?.join('') || '(no body)').substring(0, 1500);

            await replyRich(ctx, premiumMessage({
                heading: (msg.subject || 'Pesan').substring(0, 50), headingEmoji: '📄',
                body: `Dari: <b>${escapeHtml(msg.from?.address || 'Unknown')}</b>`,
                blockquote: `Tanggal: ${new Date(msg.createdAt).toLocaleString('id-ID')}`,
                pre: textBody,
                footer: 'Isi pesan max 1500 karakter.',
                accent: '✉️',
            }));

        } catch (err) {
            await ctx.answerCbQuery('❌ ' + err.message, { show_alert: true });
        }
    });
}

module.exports = { registerEmailHandler };