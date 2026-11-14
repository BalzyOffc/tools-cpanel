// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-emergency.js
// /gconly /panic /safemode /bansistem /unbansistem /listbansistem
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { getTargetUser, resolveUser } = require('../helpers/user');
const {
    systemBlacklist,
    state,
} = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// HELPER: cek owner
// ═══════════════════════════════════════════════════════════════
function isOwner(ctx) {
    return ctx.from?.id === config.OWNER_ID;
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerEmergencyHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /gconly — Toggle Group Only mode
    // ═══════════════════════════════════════════════════════════
    bot.command('gconly', async (ctx) => {
        if (!isOwner(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Fitur ini hanya untuk Owner.',
                accent: '🔒',
            }));
        }

        const arg = ctx.message.text.split(' ')[1]?.toLowerCase();

        if (arg === 'on') {
            state.gcOnlyGlobal = true;
            try { db.setSetting('global', 'gconly', true); } catch (e) {}

            return replyRich(ctx, premiumMessage({
                heading: 'Group Only: ON', headingEmoji: '🔒',
                body: 'Bot sekarang dalam mode <b>Group Only</b>.',
                listItems: [
                    '✅ Owner tetap bisa akses PV',
                    '🚫 User biasa hanya bisa: <code>/start</code>, <code>/help</code>, <code>/id</code>, <code>/ping</code>, <code>/menu</code>',
                    '📢 Bot fokus di grup',
                ],
                footer: 'Gunakan /gconly off untuk mengaktifkan PV lagi.',
                accent: '🔐',
                buttons: [
                    { text: '🔓 Matikan GCONLY', callback: 'gconly_off', color: 'success' },
                ],
            }));
        }

        if (arg === 'off') {
            state.gcOnlyGlobal = false;
            try { db.setSetting('global', 'gconly', false); } catch (e) {}

            return replyRich(ctx, premiumMessage({
                heading: 'Group Only: OFF', headingEmoji: '🔓',
                body: 'Bot kembali ke mode <b>Full Access</b>.',
                listItems: [
                    '✅ PV aktif normal',
                    '✅ Semua fitur PV bisa diakses user',
                    '✅ Fitur grup tetap berjalan',
                ],
                footer: 'Gunakan /gconly on untuk membatasi PV lagi.',
                accent: '🌐',
                buttons: [
                    { text: '🔒 Aktifkan GCONLY', callback: 'gconly_on', color: 'danger' },
                ],
            }));
        }

        // Tanpa argumen → status
        return replyRich(ctx, premiumMessage({
            heading: 'Group Only Mode', headingEmoji: '⚙️',
            body: 'Status saat ini:',
            pre: `GCONLY: ${state.gcOnlyGlobal ? '🔒 ON (PV dibatasi)' : '🔓 OFF (PV full)'}`,
            listItems: [
                '📌 <code>/gconly on</code> — batasi PV',
                '📌 <code>/gconly off</code> — PV kembali normal',
            ],
            footer: 'Hanya owner yang bisa mengubah.',
            accent: '🔐',
        }));
    });

    // ─── Callback tombol GCONLY ───
    bot.action('gconly_on', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        state.gcOnlyGlobal = true;
        try { db.setSetting('global', 'gconly', true); } catch (e) {}
        await ctx.answerCbQuery('🔒 GCONLY ON');
        try { await ctx.deleteMessage(); } catch (e) {}
        await replyRich(ctx, premiumMessage({
            heading: 'Group Only: ON', headingEmoji: '🔒',
            body: 'Bot sekarang fokus di grup. PV user biasa dibatasi.',
            accent: '🔐',
            buttons: [{ text: '🔓 Matikan', callback: 'gconly_off', color: 'success' }],
        }));
    });

    bot.action('gconly_off', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        state.gcOnlyGlobal = false;
        try { db.setSetting('global', 'gconly', false); } catch (e) {}
        await ctx.answerCbQuery('🔓 GCONLY OFF');
        try { await ctx.deleteMessage(); } catch (e) {}
        await replyRich(ctx, premiumMessage({
            heading: 'Group Only: OFF', headingEmoji: '🔓',
            body: 'PV kembali normal. Semua fitur PV aktif.',
            accent: '🌐',
            buttons: [{ text: '🔒 Aktifkan', callback: 'gconly_on', color: 'danger' }],
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /panic — Panic mode (blokir SEMUA user kecuali owner)
    // ═══════════════════════════════════════════════════════════
    bot.command('panic', async (ctx) => {
        if (!isOwner(ctx)) return;

        const arg = ctx.message.text.split(' ')[1]?.toLowerCase();
        state.panicMode = arg === 'on';

        await replyRich(ctx, premiumMessage({
            heading: `Panic Mode: ${state.panicMode ? 'ON 🚨' : 'OFF 🟢'}`,
            headingEmoji: state.panicMode ? '🚨' : '🟢',
            body: state.panicMode
                ? 'Semua user diblokir dari bot (kecuali Owner).'
                : 'Bot kembali normal. Semua user bisa pakai bot lagi.',
            blockquote: state.panicMode
                ? '⚠️ Gunakan ini hanya dalam keadaan darurat.\nUser akan melihat pesan "Panic Mode" setiap kali chat.'
                : 'Sistem berjalan normal.',
            listItems: [
                '📌 <code>/panic on</code> — aktifkan panic',
                '📌 <code>/panic off</code> — matikan panic',
                `📌 Status saat ini: <b>${state.panicMode ? '🔴 ON' : '🟢 OFF'}</b>`,
            ],
            accent: state.panicMode ? '⛔' : '✅',
            buttons: [
                { text: state.panicMode ? '🟢 Matikan Panic' : '🚨 Aktifkan Panic', callback: `panic_toggle_${state.panicMode ? 'off' : 'on'}`, color: state.panicMode ? 'success' : 'danger' },
            ],
        }));
    });

    bot.action(/^panic_toggle_(on|off)$/, async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        state.panicMode = ctx.match[1] === 'on';
        await ctx.answerCbQuery(state.panicMode ? '🚨 PANIC ON' : '🟢 PANIC OFF');
        try { await ctx.deleteMessage(); } catch (e) {}
        await replyRich(ctx, premiumMessage({
            heading: `Panic: ${state.panicMode ? 'ON' : 'OFF'}`,
            headingEmoji: state.panicMode ? '🚨' : '🟢',
            body: state.panicMode ? 'Semua user diblokir.' : 'Bot normal.',
            accent: state.panicMode ? '⛔' : '✅',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /safemode — Safe mode (hanya /start & /help)
    // ═══════════════════════════════════════════════════════════
    bot.command('safemode', async (ctx) => {
        if (!isOwner(ctx)) return;

        const arg = ctx.message.text.split(' ')[1]?.toLowerCase();
        state.safeMode = arg === 'on';

        await replyRich(ctx, premiumMessage({
            heading: `Safe Mode: ${state.safeMode ? 'ON 🛡️' : 'OFF 🟢'}`,
            headingEmoji: state.safeMode ? '🛡️' : '🟢',
            body: state.safeMode
                ? 'Hanya <code>/start</code> & <code>/help</code> yang tersedia.'
                : 'Bot kembali normal. Semua fitur aktif.',
            blockquote: state.safeMode
                ? '🛡️ Mode aman untuk maintenance/debug.'
                : 'Sistem berjalan normal.',
            listItems: [
                '📌 <code>/safemode on</code> — aktifkan safe mode',
                '📌 <code>/safemode off</code> — matikan safe mode',
                `📌 Status saat ini: <b>${state.safeMode ? '🟡 ON' : '🟢 OFF'}</b>`,
            ],
            accent: state.safeMode ? '🛡️' : '✅',
            buttons: [
                { text: state.safeMode ? '🟢 Matikan Safe' : '🛡️ Aktifkan Safe', callback: `safe_toggle_${state.safeMode ? 'off' : 'on'}`, color: state.safeMode ? 'success' : 'warning' },
            ],
        }));
    });

    bot.action(/^safe_toggle_(on|off)$/, async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        state.safeMode = ctx.match[1] === 'on';
        await ctx.answerCbQuery(state.safeMode ? '🛡️ SAFE ON' : '🟢 SAFE OFF');
        try { await ctx.deleteMessage(); } catch (e) {}
        await replyRich(ctx, premiumMessage({
            heading: `Safe Mode: ${state.safeMode ? 'ON' : 'OFF'}`,
            headingEmoji: state.safeMode ? '🛡️' : '🟢',
            body: state.safeMode ? 'Hanya /start & /help.' : 'Semua fitur aktif.',
            accent: state.safeMode ? '🛡️' : '✅',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /bansistem — Blacklist user dari bot
    // ═══════════════════════════════════════════════════════════
    bot.command('bansistem', async (ctx) => {
        if (!isOwner(ctx)) return;

        const targetArg = ctx.message.text.split(' ').slice(1)[0];
        if (!targetArg) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply user, atau beri ID/username.',
                pre: '/bansistem <id|@user>',
                accent: '🚫',
            }));
        }

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) {
            return replyRich(ctx, premiumMessage({
                heading: 'User Tidak Ditemukan', headingEmoji: '❌',
                accent: '⚠️',
            }));
        }

        if (targetUser.id === config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tidak Bisa', headingEmoji: '🚫',
                body: 'Tidak bisa ban Owner.',
                accent: '⛔',
            }));
        }

        const alreadyBanned = systemBlacklist.has(targetUser.id);
        systemBlacklist.add(targetUser.id);

        await replyRich(ctx, premiumMessage({
            heading: alreadyBanned ? 'Sudah Diblokir' : 'User Diblokir',
            headingEmoji: '🚫',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a> ${alreadyBanned ? 'sudah ada di blacklist.' : 'tidak bisa pakai bot lagi.'}`,
            listItems: [
                `🆔 ID: <code>${targetUser.id}</code>`,
                `📊 Total blacklist: <b>${systemBlacklist.size}</b>`,
            ],
            footer: 'Gunakan /unbansistem untuk membuka blokir.',
            accent: alreadyBanned ? 'ℹ️' : '🔒',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /unbansistem — Buka blokir user
    // ═══════════════════════════════════════════════════════════
    bot.command('unbansistem', async (ctx) => {
        if (!isOwner(ctx)) return;

        const targetArg = ctx.message.text.split(' ').slice(1)[0];
        if (!targetArg) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply user, atau beri ID/username.',
                pre: '/unbansistem <id|@user>',
                accent: '🔓',
            }));
        }

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) {
            return replyRich(ctx, premiumMessage({
                heading: 'User Tidak Ditemukan', headingEmoji: '❌',
                accent: '⚠️',
            }));
        }

        const wasBanned = systemBlacklist.delete(targetUser.id);

        await replyRich(ctx, premiumMessage({
            heading: wasBanned ? 'Blokir Dibuka' : 'Tidak Diblokir',
            headingEmoji: wasBanned ? '✅' : 'ℹ️',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a> ${wasBanned ? 'bisa pakai bot lagi.' : 'tidak ada di blacklist.'}`,
            listItems: [
                `🆔 ID: <code>${targetUser.id}</code>`,
                `📊 Total blacklist: <b>${systemBlacklist.size}</b>`,
            ],
            accent: wasBanned ? '🔓' : 'ℹ️',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /listbansistem — Daftar blacklist
    // ═══════════════════════════════════════════════════════════
    bot.command('listbansistem', async (ctx) => {
        if (!isOwner(ctx)) return;

        const list = [...systemBlacklist];

        if (list.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Blacklist Kosong', headingEmoji: '📭',
                body: 'Belum ada user di-blacklist.',
                accent: '✅',
                buttons: [
                    { text: '🚫 Ban User', callback: 'emergency_ban_help', color: 'danger' },
                ],
            }));
        }

        let html = `<h1>🚫 Daftar Blacklist</h1>`;
        html += `<p>Total: <b>${list.length}</b> user</p>`;
        html += `<table bordered striped><tr><th>#</th><th>User ID</th><th>Status</th></tr>`;
        list.slice(0, 30).forEach((id, i) => {
            html += `<tr><td>${i + 1}</td><td><code>${id}</code></td><td>🔴 Banned</td></tr>`;
        });
        html += `</table>`;

        if (list.length > 30) {
            html += `<footer>... dan ${list.length - 30} user lainnya</footer>`;
        }

        html += `<blockquote>💡 Unban: <code>/unbansistem &lt;id&gt;</code></blockquote>`;

        await replyRich(ctx, html);
    });

    bot.action('emergency_ban_help', async (ctx) => {
        await ctx.answerCbQuery();
        await replyRich(ctx, premiumMessage({
            heading: 'Cara Ban User', headingEmoji: '🚫',
            body: 'Reply user atau ketik ID-nya:',
            pre: '/bansistem <id|@user>',
            blockquote: 'Untuk unban:\n<code>/unbansistem &lt;id&gt;</code>',
            accent: '🛡️',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /emergency — Menu darurat (dashboard)
    // ═══════════════════════════════════════════════════════════
    bot.command(['emergency', 'darurat'], async (ctx) => {
        if (!isOwner(ctx)) return;

        const html = `
<h1>🚨 Emergency Panel</h1>
<p>Status sistem saat ini:</p>
<table bordered striped>
  <tr><td><b>Panic Mode</b></td><td>: ${state.panicMode ? '🔴 ON' : '🟢 OFF'}</td></tr>
  <tr><td><b>Safe Mode</b></td><td>: ${state.safeMode ? '🟡 ON' : '🟢 OFF'}</td></tr>
  <tr><td><b>GC Only</b></td><td>: ${state.gcOnlyGlobal ? '🔒 ON' : '🔓 OFF'}</td></tr>
  <tr><td><b>Blacklist</b></td><td>: 🚫 ${systemBlacklist.size}</td></tr>
</table>

<h2>⚙️ Kontrol Cepat</h2>
<tg-button-row>
  <tg-button type="callback_data" style="${state.panicMode ? 'success' : 'danger'}" data="panic_toggle_${state.panicMode ? 'off' : 'on'}">
    ${state.panicMode ? '🟢 OFF Panic' : '🚨 ON Panic'}
  </tg-button>
  <tg-button type="callback_data" style="${state.safeMode ? 'success' : 'warning'}" data="safe_toggle_${state.safeMode ? 'off' : 'on'}">
    ${state.safeMode ? '🟢 OFF Safe' : '🛡️ ON Safe'}
  </tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="${state.gcOnlyGlobal ? 'success' : 'primary'}" data="gconly_${state.gcOnlyGlobal ? 'off' : 'on'}">
    ${state.gcOnlyGlobal ? '🔓 OFF GC Only' : '🔒 ON GC Only'}
  </tg-button>
</tg-button-row>

<h2>📋 Command</h2>
<pre>/panic on|off
/safemode on|off
/gconly on|off
/bansistem &lt;id&gt;
/unbansistem &lt;id&gt;
/listbansistem</pre>

<footer>⚠️ Gunakan dengan hati-hati!</footer>
`;

        await replyRich(ctx, html);
    });
}

module.exports = { registerOwnerEmergencyHandler };