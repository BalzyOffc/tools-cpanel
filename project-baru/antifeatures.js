// ═══════════════════════════════════════════════════════════════
// 📄 handlers/antifeatures.js — /antilink /antiforward /antispam /antitoxic
//                                + /globalban /globalunban /globallist
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { isAdmin } = require('../helpers/auth');
const { getTargetUser } = require('../helpers/user');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const satpam = require('../middleware/satpam');

// ─────────────────────────────────────────────────────────────
// Helper: parse on/off
// ─────────────────────────────────────────────────────────────
function parseOnOff(arg) {
    if (!arg) return null;
    const a = arg.toLowerCase();
    if (['on', 'enable', 'aktif'].includes(a)) return true;
    if (['off', 'disable', 'mati'].includes(a)) return false;
    return null;
}

function isGroupAdminOrOwner(ctx) {
    return isAdmin(ctx).then(admin => admin || ctx.from.id === config.OWNER_ID);
}

function registerAntiFeaturesHandler(bot) {
    // ═══════════════════════════════════════════════════════════
    // /antiforward
    // ═══════════════════════════════════════════════════════════
    bot.command(['antiforward', 'af'], async (ctx) => {
        if (!await isGroupAdminOrOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const sub = args[0]?.toLowerCase();
        const enabled = db.getSetting(ctx.chat.id, 'antiforward', false);
        const action = db.getSetting(ctx.chat.id, 'antiforward_action', 'delete');

        // Tanpa argumen → status
        if (!sub) {
            return replyRich(ctx, premiumMessage({
                heading: 'Antiforward', headingEmoji: '🚫',
                body: `Status: <b>${enabled ? '🟢 ON' : '🔴 OFF'}</b>\nAksi: <b>${action}</b>`,
                listItems: [
                    '📌 <code>/antiforward on</code> — aktifkan',
                    '📌 <code>/antiforward off</code> — matikan',
                    '📌 <code>/antiforward action delete|warn|kick|mute|ban</code>',
                ],
                blockquote: 'Antiforward menghapus/menghukum user yang forward pesan dari luar.',
                accent: '🚫',
            }));
        }

        // Aksi
        if (['delete', 'warn', 'kick', 'mute', 'ban'].includes(sub)) {
            db.setSetting(ctx.chat.id, 'antiforward_action', sub);
            return replyRich(ctx, premiumMessage({
                heading: 'Aksi Antiforward Diatur', headingEmoji: '⚙️',
                body: `Aksi: <b>${sub.toUpperCase()}</b>`,
                accent: '✅',
            }));
        }

        // On/off
        const status = parseOnOff(sub);
        if (status === null) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Gunakan: <code>/antiforward on|off</code>',
                accent: '⚠️',
            }));
        }

        db.setSetting(ctx.chat.id, 'antiforward', status);
        await replyRich(ctx, premiumMessage({
            heading: `Antiforward ${status ? 'ON' : 'OFF'}`,
            headingEmoji: status ? '✅' : '❌',
            body: status
                ? `Antiforward aktif. Aksi: <b>${action}</b>`
                : 'Antiforward dimatikan.',
            footer: 'Hanya admin grup.',
            accent: status ? '🚫' : '🔓',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /antilink
    // ═══════════════════════════════════════════════════════════
    bot.command(['antilink', 'al'], async (ctx) => {
        if (!await isGroupAdminOrOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const sub = args[0]?.toLowerCase();
        const enabled = db.getSetting(ctx.chat.id, 'antilink', false);
        const action = db.getSetting(ctx.chat.id, 'antilink_action', 'delete');
        const whitelist = db.getSetting(ctx.chat.id, 'antilink_whitelist', config.REQUIRED_CHANNEL_LINK || '');

        // Tanpa argumen → status
        if (!sub) {
            return replyRich(ctx, premiumMessage({
                heading: 'Antilink', headingEmoji: '🔗',
                body: `Status: <b>${enabled ? '🟢 ON' : '🔴 OFF'}</b>\nAksi: <b>${action}</b>`,
                listItems: [
                    '📌 <code>/antilink on</code> — aktifkan',
                    '📌 <code>/antilink off</code> — matikan',
                    '📌 <code>/antilink action delete|warn|kick|mute|ban</code>',
                    '📌 <code>/antilink whitelist &lt;url|domain&gt;</code>',
                ],
                blockquote: `Whitelist: <code>${escapeHtml(whitelist || '-')}</code>`,
                accent: '🔗',
            }));
        }

        // Aksi
        if (sub === 'action') {
            const act = args[1]?.toLowerCase();
            if (!['delete', 'warn', 'kick', 'mute', 'ban'].includes(act)) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Aksi Tidak Valid', headingEmoji: '❌',
                    body: 'Pilih: delete, warn, kick, mute, ban',
                    accent: '⚠️',
                }));
            }
            db.setSetting(ctx.chat.id, 'antilink_action', act);
            return replyRich(ctx, premiumMessage({
                heading: 'Aksi Antilink Diatur', headingEmoji: '⚙️',
                body: `Aksi: <b>${act.toUpperCase()}</b>`,
                accent: '✅',
            }));
        }

        // Whitelist
        if (sub === 'whitelist') {
            const wl = args.slice(1).join(' ').trim();
            if (!wl) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Whitelist Kosong', headingEmoji: '❌',
                    body: 'Masukkan URL atau domain.',
                    accent: '⚠️',
                }));
            }
            db.setSetting(ctx.chat.id, 'antilink_whitelist', wl);
            return replyRich(ctx, premiumMessage({
                heading: 'Whitelist Diperbarui', headingEmoji: '✅',
                body: `Whitelist: <code>${escapeHtml(wl)}</code>`,
                accent: '🔗',
            }));
        }

        // On/off
        const status = parseOnOff(sub);
        if (status === null) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                accent: '⚠️',
            }));
        }

        db.setSetting(ctx.chat.id, 'antilink', status);
        await replyRich(ctx, premiumMessage({
            heading: `Antilink ${status ? 'ON' : 'OFF'}`,
            headingEmoji: status ? '✅' : '❌',
            body: status
                ? `Antilink aktif. Aksi: <b>${action}</b>`
                : 'Antilink dimatikan.',
            accent: status ? '🔗' : '🔓',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /antispam
    // ═══════════════════════════════════════════════════════════
    bot.command(['antispam', 'as'], async (ctx) => {
        if (!await isGroupAdminOrOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const sub = args[0]?.toLowerCase();
        const enabled = db.getSetting(ctx.chat.id, 'antispam', false);
        const limit = db.getSetting(ctx.chat.id, 'antispam_limit', 6);
        const windowMs = db.getSetting(ctx.chat.id, 'antispam_window', 8000);
        const action = db.getSetting(ctx.chat.id, 'antispam_action', 'mute');

        // Tanpa argumen → status
        if (!sub) {
            return replyRich(ctx, premiumMessage({
                heading: 'Antispam', headingEmoji: '🛡️',
                body: `Status: <b>${enabled ? '🟢 ON' : '🔴 OFF'}</b>\nAksi: <b>${action}</b>`,
                listItems: [
                    `Limit: <b>${limit}</b> pesan / <b>${windowMs / 1000}</b> detik`,
                    '📌 <code>/antispam on|off</code>',
                    '📌 <code>/antispam limit &lt;angka&gt;</code>',
                    '📌 <code>/antispam window &lt;detik&gt;</code>',
                    '📌 <code>/antispam action delete|warn|kick|mute|ban</code>',
                ],
                blockquote: 'Antispam = filter pesan berulang sangat cepat.',
                accent: '🛡️',
            }));
        }

        // Limit
        if (sub === 'limit') {
            const n = parseInt(args[1]);
            if (isNaN(n) || n < 2 || n > 30) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Limit Tidak Valid', headingEmoji: '❌',
                    body: 'Range: 2-30',
                    accent: '⚠️',
                }));
            }
            db.setSetting(ctx.chat.id, 'antispam_limit', n);
            return replyRich(ctx, premiumMessage({
                heading: 'Limit Diatur', headingEmoji: '✅',
                body: `Limit: <b>${n}</b> pesan`,
                accent: '🛡️',
            }));
        }

        // Window
        if (sub === 'window') {
            const n = parseInt(args[1]);
            if (isNaN(n) || n < 1 || n > 60) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Window Tidak Valid', headingEmoji: '❌',
                    body: 'Range: 1-60 detik',
                    accent: '⚠️',
                }));
            }
            db.setSetting(ctx.chat.id, 'antispam_window', n * 1000);
            return replyRich(ctx, premiumMessage({
                heading: 'Window Diatur', headingEmoji: '✅',
                body: `Window: <b>${n}</b> detik`,
                accent: '🛡️',
            }));
        }

        // Aksi
        if (sub === 'action') {
            const act = args[1]?.toLowerCase();
            if (!['delete', 'warn', 'kick', 'mute', 'ban'].includes(act)) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Aksi Tidak Valid', headingEmoji: '❌',
                    accent: '⚠️',
                }));
            }
            db.setSetting(ctx.chat.id, 'antispam_action', act);
            return replyRich(ctx, premiumMessage({
                heading: 'Aksi Antispam Diatur', headingEmoji: '⚙️',
                body: `Aksi: <b>${act.toUpperCase()}</b>`,
                accent: '✅',
            }));
        }

        // On/off
        const status = parseOnOff(sub);
        if (status === null) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                accent: '⚠️',
            }));
        }

        db.setSetting(ctx.chat.id, 'antispam', status);
        await replyRich(ctx, premiumMessage({
            heading: `Antispam ${status ? 'ON' : 'OFF'}`,
            headingEmoji: status ? '✅' : '❌',
            body: status ? `Antispam aktif. Aksi: <b>${action}</b>` : 'Antispam dimatikan.',
            accent: status ? '🛡️' : '🔓',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /antitoxic (BARU)
    // ═══════════════════════════════════════════════════════════
    bot.command(['antitoxic', 'at'], async (ctx) => {
        if (!await isGroupAdminOrOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const sub = args[0]?.toLowerCase();
        const enabled = db.getSetting(ctx.chat.id, 'antitoxic', false);
        const action = db.getSetting(ctx.chat.id, 'antitoxic_action', 'delete');

        // Tanpa argumen → status
        if (!sub) {
            return replyRich(ctx, premiumMessage({
                heading: 'Anti-Toxic', headingEmoji: '🤬',
                body: `Status: <b>${enabled ? '🟢 ON' : '🔴 OFF'}</b>\nAksi: <b>${action}</b>`,
                listItems: [
                    '📌 <code>/antitoxic on</code> — aktifkan',
                    '📌 <code>/antitoxic off</code> — matikan',
                    '📌 <code>/antitoxic action delete|warn|kick|mute|ban</code>',
                ],
                blockquote: 'Antitoxic mendeteksi kata kasar/toxic otomatis.',
                accent: '🛡️',
            }));
        }

        // Aksi
        if (sub === 'action') {
            const act = args[1]?.toLowerCase();
            if (!['delete', 'warn', 'kick', 'mute', 'ban'].includes(act)) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Aksi Tidak Valid', headingEmoji: '❌',
                    accent: '⚠️',
                }));
            }
            db.setSetting(ctx.chat.id, 'antitoxic_action', act);
            return replyRich(ctx, premiumMessage({
                heading: 'Aksi Anti-Toxic Diatur', headingEmoji: '⚙️',
                body: `Aksi: <b>${act.toUpperCase()}</b>`,
                accent: '✅',
            }));
        }

        // On/off
        const status = parseOnOff(sub);
        if (status === null) return;

        db.setSetting(ctx.chat.id, 'antitoxic', status);
        await replyRich(ctx, premiumMessage({
            heading: `Anti-Toxic ${status ? 'ON' : 'OFF'}`,
            headingEmoji: status ? '✅' : '❌',
            accent: status ? '🛡️' : '🔓',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /globalban (Owner only)
    // ═══════════════════════════════════════════════════════════
    bot.command(['globalban', 'gb'], async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Owner Only', headingEmoji: '🚫',
                accent: '🔒',
            }));
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return replyRich(ctx, premiumMessage({
                heading: 'Target Tidak Valid', headingEmoji: '❌',
                body: 'Reply user atau beri ID.',
                accent: '⚠️',
            }));
        }

        const reason = ctx.message.text.split(' ').slice(2).join(' ') || 'No reason';
        satpam.addGlobalBan(target.id, reason, 0, ctx.from.id);

        await replyRich(ctx, premiumMessage({
            heading: 'Global Ban', headingEmoji: '🚫',
            body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> diblokir dari semua grup.`,
            blockquote: `Reason: ${escapeHtml(reason)}`,
            accent: '⛔',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /globalunban (Owner only)
    // ═══════════════════════════════════════════════════════════
    bot.command(['globalunban', 'gub'], async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({ heading: 'Owner Only', headingEmoji: '🚫', accent: '🔒' }));
        }

        const target = await getTargetUser(ctx);
        if (!target) return;

        satpam.removeGlobalBan(target.id);

        await replyRich(ctx, premiumMessage({
            heading: 'Global Ban Dicabut', headingEmoji: '✅',
            body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a> bisa pakai bot lagi.`,
            accent: '🔓',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /globallist (Owner only)
    // ═══════════════════════════════════════════════════════════
    bot.command('globallist', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({ heading: 'Owner Only', headingEmoji: '🚫', accent: '🔒' }));
        }

        const raw = db.getSetting('global', 'global_bans', {}) || {};
        const ids = Object.keys(raw);

        if (!ids.length) {
            return replyRich(ctx, premiumMessage({
                heading: 'Global Ban Kosong', headingEmoji: '📭',
                body: 'Belum ada user di-global-ban.',
                accent: '✅',
            }));
        }

        let html = `<h1>🚫 Global Ban List</h1>`;
        html += `<p>Total: <b>${ids.length}</b> user</p>`;
        html += `<table bordered striped><tr><th>#</th><th>User ID</th><th>Alasan</th></tr>`;
        ids.slice(0, 50).forEach((id, i) => {
            html += `<tr><td>${i + 1}</td><td><code>${id}</code></td><td>${escapeHtml(raw[id].reason || '-')}</td></tr>`;
        });
        html += `</table>`;
        if (ids.length > 50) html += `<footer>... dan ${ids.length - 50} lainnya</footer>`;
        html += `<tg-button-row><tg-button type="callback_data" style="primary" data="back_menu">🔙 Menu</tg-button></tg-button-row>`;

        await replyRich(ctx, html);
    });
}

module.exports = { registerAntiFeaturesHandler };