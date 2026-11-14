// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner.js — Panel Owner, Backup, Restore, Update,
//                         Clone, dan semua sub-panel op_*
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const config = require('../config');
const db = require('../services/database');
const backup = require('../services/backup');
const { bot } = require('../core/bot-instance');
const { editHtml, replyHtml, sendHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');
const { getUserRole, listUsersByRole } = require('../helpers/role');
const { registerTokenToDB, deleteTokenFromDB, ensureMongo, WhitelistToken } = require('../core/mongodb');
const {
    activeClones,
    pendingUpdate,
    systemBlacklist,
    globalFilters,
    userActivity,
    state,
} = require('../state/maps');

const CLONE_DB_FILE = path.join(__dirname, '..', 'clones.json');

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function saveCloneDB() {
    try {
        const data = {};
        for (const [token, info] of activeClones.entries()) data[token] = info;
        fs.writeFileSync(CLONE_DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('saveCloneDB:', e.message); }
}

function gracefulRestart() {
    console.log('🔄 [RESTART] Bot restarting...');
    try { bot.stop('RESTART'); } catch (e) {}

    if (process.env.pm_id) {
        console.log('🔄 PM2 detected, exiting...');
        setTimeout(() => process.exit(0), 1000);
        return;
    }

    const child = spawn(process.execPath, process.argv.slice(1), {
        cwd: process.cwd(),
        detached: true,
        stdio: 'inherit',
        env: process.env,
    });
    child.unref();
    setTimeout(() => process.exit(0), 1500);
}

// ═══════════════════════════════════════════════════════════════
// RENDER PANEL OWNER UTAMA
// ═══════════════════════════════════════════════════════════════
async function renderOwnerPanel(ctx) {
    const uptime = Math.floor(process.uptime());
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const totalUsers = db.getTargets('user').length;
    const totalGroups = db.getTargets('group').length;
    const totalRoles = (await listUsersByRole('vip')).length +
                       (await listUsersByRole('reseller')).length +
                       (await listUsersByRole('pt')).length;

    const html = `<b>👑 Panel Owner</b>
Selamat datang kembali, <b>${escapeHtml(ctx.from.first_name)}</b>.

<b>📊 Ringkasan Server</b>
<b>Uptime</b>          : ${d}d ${h}h ${m}m
<b>Total User</b>      : 👥 ${totalUsers}
<b>Total Grup</b>      : 📢 ${totalGroups}
<b>Total Role VIP+</b> : 🎭 ${totalRoles}
<b>Status Sistem</b>   : ${state.panicMode ? '🔴 PANIC' : state.safeMode ? '🟡 SAFE' : '🟢 NORMAL'}
<b>Blacklist</b>       : 🚫 ${systemBlacklist.size}

<b>⚙️ Menu Manajemen</b>`;

    const keyboard = [
        [{ text: '👥 User & Statistik', callback_data: 'op_users' }],
        [{ text: '💰 Saldo & Ekonomi', callback_data: 'op_saldo' }],
        [{ text: '🎭 Role & Akses', callback_data: 'op_role' }],
        [{ text: '🚫 Blacklist', callback_data: 'op_blacklist' }],
        [{ text: '🧬 Bot Clone', callback_data: 'op_clone' }],
        [{ text: '📢 Broadcast', callback_data: 'op_broadcast' }],
        [{ text: '🔧 Global Filter', callback_data: 'op_gfilter' }],
        [{ text: '🔑 Token Bot', callback_data: 'op_token' }],
        [{ text: '🌐 Server', callback_data: 'op_server' }],
        [{ text: '🚨 Emergency', callback_data: 'op_emergency' }],
        [{ text: '💾 Backup & Restore', callback_data: 'op_backup' }],
        [{ text: '❌ Tutup Panel', callback_data: 'op_close' }],
    ];

    if (ctx.callbackQuery) {
        await editHtml(ctx, html, keyboard);
    } else {
        await replyHtml(ctx, html, keyboard);
    }
}

const BACK_ROW = [[{ text: '🔙 Kembali ke Panel', callback_data: 'op_back' }]];

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /owner /panel
    // ═══════════════════════════════════════════════════════════
    bot.command(['owner', 'panel'], async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyHtml(ctx, `<b>🚫 Akses Ditolak</b>\n\nKhusus Owner.\n\n🔒`);
        }
        await renderOwnerPanel(ctx);
    });

    // ─── Callback navigasi ───
    bot.action('op_back', async (ctx) => {
        await ctx.answerCbQuery();
        await renderOwnerPanel(ctx);
    });

    bot.action('op_close', async (ctx) => {
        await ctx.answerCbQuery('Panel ditutup');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: USER
    // ═══════════════════════════════════════════════════════════
    bot.action('op_users', async (ctx) => {
        await ctx.answerCbQuery();
        const users = db.getTargets('user');
        const activeToday = [...userActivity.values()].filter(t => Date.now() - t < 86400000).length;

        await editHtml(ctx, `<b>👥 Panel User</b>

<b>Total User</b> : ${users.length}
<b>Aktif 24h</b>  : ${activeToday}
<b>Blacklist</b>  : ${systemBlacklist.size}

<b>📋 Command</b>
<pre>/statsuser &lt;id&gt;
/activelist
/clearcache
/cleartemp</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: SALDO
    // ═══════════════════════════════════════════════════════════
    bot.action('op_saldo', async (ctx) => {
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>💰 Panel Saldo</b>

<code>/addsaldo</code> — + saldo user
<code>/setsaldo</code> — set nilai saldo
<code>/resetsaldo</code> — reset saldo ke 0
<code>/topbalance</code> — top 10 saldo
<code>/topplayers</code> — top 10 winrate

<pre>/addsaldo @user 50000
/setsaldo 123456789 100000
/resetsaldo @user</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: ROLE
    // ═══════════════════════════════════════════════════════════
    bot.action('op_role', async (ctx) => {
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>🎭 Panel Role</b>

<code>/setrole</code> — Set role user
<code>/delrole</code> — Hapus role
<code>/extends</code> — Perpanjang role
<code>/listrole</code> — Daftar user per role

<pre>/setrole @user vip 30d
/extends @user 30d
/listrole vip</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: BLACKLIST
    // ═══════════════════════════════════════════════════════════
    bot.action('op_blacklist', async (ctx) => {
        await ctx.answerCbQuery();
        const list = [...systemBlacklist];
        const listHtml = list.length === 0
            ? '<i>Belum ada user di-blacklist.</i>'
            : `<pre>${list.map((id, i) => `${i + 1}. ${id}`).join('\n')}</pre>`;

        await editHtml(ctx, `<b>🚫 Panel Blacklist</b>
Total: <b>${list.length}</b> user

${listHtml}

<b>📋 Command</b>
<pre>/bansistem &lt;id&gt;
/unbansistem &lt;id&gt;
/listbansistem</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: CLONE
    // ═══════════════════════════════════════════════════════════
    bot.action('op_clone', async (ctx) => {
        await ctx.answerCbQuery();
        const running = [...activeClones.values()].filter(c => c.status === 'running').length;
        const total = activeClones.size;

        await editHtml(ctx, `<b>🧬 Panel Clone</b>

<b>Total</b>   : ${total}
<b>Running</b> : 🟢 ${running}
<b>Stopped</b> : 🔴 ${total - running}

<b>📋 Command</b>
<pre>/clone TOKEN | Nama | Versi | Dev | Channel
/listclone
/clonecheck
/clonelog &lt;prefix&gt;
/clonerestart &lt;token&gt;
/cloneedit &lt;token&gt; nama &lt;new&gt;
/stopclone &lt;token&gt;</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: BROADCAST
    // ═══════════════════════════════════════════════════════════
    bot.action('op_broadcast', async (ctx) => {
        await ctx.answerCbQuery();
        const counts = db.getTargetCounts();
        await editHtml(ctx, `<b>📢 Panel Broadcast</b>

<b>Total User</b> : ${counts.users}
<b>Total Grup</b> : ${counts.groups}

<b>📋 Command</b>
<pre>/cfd &lt;pesan&gt;
/cfdonline &lt;pesan&gt;
/cfdrole &lt;role&gt; &lt;pesan&gt;</pre>
<blockquote>Reply pesan apapun untuk kirim media (foto/video).</blockquote>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: GLOBAL FILTER
    // ═══════════════════════════════════════════════════════════
    bot.action('op_gfilter', async (ctx) => {
        await ctx.answerCbQuery();
        const total = globalFilters.size;
        const list = total === 0
            ? '<i>Belum ada filter global.</i>'
            : `<pre>${[...globalFilters.keys()].map((k, i) => `${i + 1}. "${k}"`).join('\n')}</pre>`;

        await editHtml(ctx, `<b>🔧 Global Filter</b>
Total: <b>${total}</b>

${list}

<b>📋 Command</b>
<pre>/gfilter &lt;trigger&gt; &lt;respon&gt;
/gfilterlist
/gfilterdel &lt;trigger&gt;</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: TOKEN
    // ═══════════════════════════════════════════════════════════
    bot.action('op_token', async (ctx) => {
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>🔑 Panel Token</b>
Kelola token bot clone di database.

<b>📋 Command</b>
<pre>/addtoken &lt;token&gt; [hari]
/deltoken &lt;token&gt;
/checktoken &lt;token&gt;
/tokenlist</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: SERVER
    // ═══════════════════════════════════════════════════════════
    bot.action('op_server', async (ctx) => {
        await ctx.answerCbQuery();
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const ramPct = ((usedMem / totalMem) * 100).toFixed(1);

        await editHtml(ctx, `<b>🌐 Panel Server</b>

<b>Platform</b> : ${os.platform()} (${os.arch()})
<b>Hostname</b> : ${os.hostname()}
<b>RAM</b>      : ${usedMem}GB / ${totalMem}GB (${ramPct}%)
<b>Node.js</b>  : ${process.version}

<b>📋 Command</b>
<pre>/sysinfo
/clearcache
/cleartemp
/restart</pre>`, BACK_ROW);
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: EMERGENCY
    // ═══════════════════════════════════════════════════════════
    bot.action('op_emergency', async (ctx) => {
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>🚨 Panel Emergency</b>

<b>Panic Mode</b> : ${state.panicMode ? '🔴 ON' : '🟢 OFF'}
<b>Safe Mode</b>  : ${state.safeMode ? '🟡 ON' : '🟢 OFF'}

<b>⚠️ Peringatan</b>
<blockquote>• <b>Panic</b> → blokir SEMUA user (kecuali owner)
• <b>Safe</b> → hanya /start & /help</blockquote>`, [
            [
                { text: state.panicMode ? '🟢 Matikan Panic' : '🚨 Aktifkan Panic',
                  callback_data: `op_panic_${state.panicMode ? 'off' : 'on'}` },
                { text: state.safeMode ? '🟢 Matikan Safe' : '🛡️ Aktifkan Safe',
                  callback_data: `op_safe_${state.safeMode ? 'off' : 'on'}` },
            ],
            [{ text: '🔙 Kembali ke Panel', callback_data: 'op_back' }],
        ]);
    });

    bot.action(/^op_panic_(on|off)$/, async (ctx) => {
        state.panicMode = ctx.match[1] === 'on';
        await ctx.answerCbQuery(state.panicMode ? '🚨 PANIC ON' : '🟢 PANIC OFF');
        ctx.callbackQuery.data = 'op_emergency';
        return bot.handleUpdate({ callback_query: ctx.callbackQuery });
    });

    bot.action(/^op_safe_(on|off)$/, async (ctx) => {
        state.safeMode = ctx.match[1] === 'on';
        await ctx.answerCbQuery(state.safeMode ? '🛡️ SAFE ON' : '🟢 SAFE OFF');
        ctx.callbackQuery.data = 'op_emergency';
        return bot.handleUpdate({ callback_query: ctx.callbackQuery });
    });

    // ═══════════════════════════════════════════════════════════
    // SUB-PANEL: BACKUP
    // ═══════════════════════════════════════════════════════════
    bot.action('op_backup', async (ctx) => {
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>💾 Panel Backup & Restore</b>

<code>/backup</code> — Buat ZIP backup & kirim ke DM
<code>/listbackup</code> — Daftar file backup
<code>/restore</code> — Restore DB dari ZIP (reply file)
<code>/delbackup</code> — Hapus file backup
<code>/update</code> — Update file bot (reply .js/.zip)
<code>/restart</code> — Restart bot`, [
            [
                { text: '💾 Buat Backup', callback_data: 'backup_create' },
                { text: '📋 List Backup', callback_data: 'backup_list' },
            ],
            [{ text: '🔙 Kembali ke Panel', callback_data: 'op_back' }],
        ]);
    });

    // ═══════════════════════════════════════════════════════════
    // /backup — Menu backup lengkap
    // ═══════════════════════════════════════════════════════════
    bot.command('backup', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        const backupId = crypto.randomBytes(4).toString('hex');

        await replyHtml(ctx, `<b>💾 Menu Backup Bot</b>
Pilih jenis file yang ingin di-backup:

📦 <b>ZIP</b> — Backup semua script & database
📄 <b>File JS</b> — Ambil file script (.js) tertentu
⚙️ <b>JSON</b> — Ambil package.json & package-lock.json`, [
            [{ text: '📦 Backup ZIP', callback_data: `bck_menu_zip_${backupId}` }],
            [
                { text: '📄 File JS', callback_data: `bck_menu_js_${backupId}` },
                { text: '⚙️ JSON', callback_data: `bck_menu_json_${backupId}` },
            ],
        ]);
    });

    bot.action(/^bck_menu_zip_([a-f0-9]+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Owner only');

        await ctx.answerCbQuery('💾 Membuat ZIP backup...');
        try { await ctx.deleteMessage(); } catch (e) {}

        const waitMsg = await sendHtml(ctx.chat.id, `<b>⏳ Sedang Membuat Backup...</b>
Mengemas <b>semua file & folder</b>:

<blockquote>📄 File root: index.js, config.js, database.js, dll
📂 Folder: core/, middleware/, helpers/, services/, state/, handlers/
🗄️ Database: bot.db, clones.json</blockquote>

<i>Mohon tunggu...</i>`);

        try {
            const result = await backup.createBackupZip('manual');
            backup.cleanupOldBackups(10);
            await backup.sendBackupToOwner(bot, config.OWNER_ID, result, 'manual');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            const rootCount = result.files.filter(f => !f.includes('/') && !f.includes('\\')).length;
            const folderCount = result.files.length - rootCount;

            await sendHtml(ctx.chat.id, `<b>✅ Backup ZIP Berhasil!</b>
File <code>${result.filename}</code> sudah dikirim ke DM kamu.

<b>Total File</b>      : ${result.totalFiles}
<b>File Root</b>       : 📄 ${rootCount}
<b>File Folder</b>     : 📂 ${folderCount}
<b>Ukuran Original</b> : ${result.originalSizeMB} MB
<b>Ukuran ZIP</b>      : ${result.sizeMB} MB

<blockquote>📦 Backup mencakup: root files + semua folder modular (core, middleware, helpers, services, state, handlers)</blockquote>
✨ Backup terkirim ke DM owner.`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await sendHtml(ctx.chat.id, `<b>❌ Gagal Backup</b>\nError: <code>${escapeHtml(err.message)}</code>`);
        }
    });

    bot.action(/^bck_menu_json_([a-f0-9]+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Owner only');
        await ctx.answerCbQuery('⚙️ Mengirim file JSON...');
        try { await ctx.deleteMessage(); } catch (e) {}

        const targetFiles = ['package.json', 'package-lock.json'];
        let sentCount = 0;
        const notFound = [];

        for (const filename of targetFiles) {
            const fullPath = path.join(process.cwd(), filename);
            if (fs.existsSync(fullPath)) {
                try {
                    await ctx.replyWithDocument(
                        { source: fullPath, filename },
                        { caption: `⚙️ <b>File Config:</b> <code>${filename}</code>`, parse_mode: 'HTML' }
                    );
                    sentCount++;
                } catch (e) {
                    notFound.push(`${filename} (Gagal kirim)`);
                }
            } else {
                notFound.push(filename);
            }
        }

        if (sentCount === 0) {
            await sendHtml(ctx.chat.id, `<b>❌ File Tidak Ditemukan</b>\n<pre>${notFound.join('\n')}</pre>`);
        }
    });

    bot.action(/^bck_menu_js_([a-f0-9]+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Owner only');
        await ctx.answerCbQuery();

        const jsFiles = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.js'));

        if (jsFiles.length === 0) {
            try { await ctx.deleteMessage(); } catch (e) {}
            return sendHtml(ctx.chat.id, `<b>📄 Tidak Ada File</b>\nTidak ditemukan file .js.`);
        }

        const jsId = crypto.randomBytes(4).toString('hex');
        const rows = [];
        let row = [];
        jsFiles.forEach((file) => {
            row.push({ text: `📄 ${file}`, callback_data: `bck_js_${jsId}_${encodeURIComponent(file)}` });
            if (row.length === 2) { rows.push(row); row = []; }
        });
        if (row.length > 0) rows.push(row);
        rows.push([{ text: '🔙 Kembali', callback_data: 'bck_back' }]);

        try { await ctx.deleteMessage(); } catch (e) {}

        await sendHtml(ctx.chat.id, `<b>📄 Pilih File JS</b>
<blockquote>Total: <b>${jsFiles.length}</b> file script.</blockquote>`, rows);
    });

    bot.action(/^bck_js_([a-f0-9]+)_(.+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Owner only');
        const fileName = decodeURIComponent(ctx.match[2]);
        const fullPath = path.join(process.cwd(), fileName);

        if (!fs.existsSync(fullPath)) {
            return ctx.answerCbQuery(`❌ File ${fileName} tidak ada.`, { show_alert: true });
        }

        await ctx.answerCbQuery(`📄 Mengirim ${fileName}...`);
        try {
            await ctx.replyWithDocument(
                { source: fullPath, filename: fileName },
                { caption: `📄 <b>File Script:</b> <code>${fileName}</code>\nUkuran: ${(fs.statSync(fullPath).size / 1024).toFixed(2)} KB`, parse_mode: 'HTML' }
            );
        } catch (err) {
            await ctx.answerCbQuery(`❌ Gagal: ${err.message}`, { show_alert: true });
        }
    });

    bot.action('bck_back', async (ctx) => {
        await ctx.answerCbQuery('🔙 Kembali');
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.message = { text: '/backup', ...ctx.callbackQuery.message };
        return bot.command('backup', ctx);
    });

    // ═══════════════════════════════════════════════════════════
    // /listbackup
    // ═══════════════════════════════════════════════════════════
    bot.command('listbackup', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        const backups = backup.listBackups();

        if (backups.length === 0) {
            return replyHtml(ctx, `<b>📭 Belum Ada Backup</b>\n\n💾`, [
                [{ text: '💾 Buat Backup', callback_data: 'backup_create' }],
            ]);
        }

        const list = backups.slice(0, 10).map((b, i) =>
            `${i + 1}. ${b.type === 'zip' ? '📦' : '📄'} <code>${b.filename}</code>\n   ${b.sizeKB} KB · ${b.mtime.toLocaleString('id-ID')}`
        ).join('\n\n');

        await replyHtml(ctx, `<b>📋 Daftar Backup</b>
Total: ${backups.length}

<pre>${list}</pre>`, [
            [
                { text: '💾 Buat Baru', callback_data: 'backup_create' },
                { text: '📥 Download Terbaru', callback_data: 'backup_download' },
            ],
        ]);
    });

    // ═══════════════════════════════════════════════════════════
    // /delbackup
    // ═══════════════════════════════════════════════════════════
    bot.command('delbackup', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        const filename = ctx.message.text.split(' ')[1];
        if (!filename) return;
        const ok = backup.deleteBackup(filename);
        await replyHtml(ctx, ok
            ? `<b>🗑️ Dihapus</b>\nFile <code>${escapeHtml(filename)}</code> dihapus.\n\n✅`
            : `<b>❌ Gagal</b>\nFile tidak ditemukan.\n\n⚠️`);
    });

    // ═══════════════════════════════════════════════════════════
    // /restore — Restore dari ZIP
    // ═══════════════════════════════════════════════════════════
    bot.command('restore', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        const replied = ctx.message.reply_to_message;
        if (!replied || !replied.document) {
            return replyHtml(ctx, `<b>📥 Format Restore</b>
Cara restore:
1. Kirim file <code>.zip</code> backup ke bot
2. Reply file tersebut
3. Ketik <code>/restore</code>

<blockquote>⚠️ Restore akan <b>mengganti database</b>!</blockquote>`);
        }

        const doc = replied.document;
        if (!doc.file_name.endsWith('.zip') && !doc.file_name.endsWith('.json')) {
            return replyHtml(ctx, `<b>❌ File Salah</b>\nHarus <code>.zip</code> atau <code>.json</code>.\n\n⚠️`);
        }

        try {
            const fileLink = await ctx.telegram.getFileLink(doc.file_id);
            const response = await fetch(fileLink.href);
            const buffer = Buffer.from(await response.arrayBuffer());

            const { pendingRestore } = require('../state/maps');
            pendingRestore.set(doc.file_id, { buffer, filename: doc.file_name });

            await replyHtml(ctx, `<b>⚠️ Konfirmasi Restore</b>
File: <code>${escapeHtml(doc.file_name)}</code>

<blockquote>Ukuran: ${(buffer.length / 1024).toFixed(2)} KB</blockquote>

⚠️ Database <code>bot.db</code> akan diganti
📦 File script lain tidak otomatis diganti
🔒 Hanya database untuk keamanan

Data saat ini akan DIGANTI. Yakin?`, [
                [
                    { text: '✅ Ya, Restore!', callback_data: `restore_confirm_${doc.file_id}` },
                    { text: '❌ Batal', callback_data: 'restore_cancel' },
                ],
            ]);
        } catch (err) {
            await replyHtml(ctx, `<b>❌ Restore Gagal</b>\n<code>${escapeHtml(err.message)}</code>\n\n⚠️`);
        }
    });

    bot.action('restore_cancel', async (ctx) => {
        await ctx.answerCbQuery('❌ Restore dibatalkan');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    bot.action(/restore_confirm_(.+)/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Owner only');
        const fileId = ctx.match[1];
        const { pendingRestore } = require('../state/maps');
        const pending = pendingRestore.get(fileId);

        if (!pending) return ctx.answerCbQuery('❌ Sesi restore expired', { show_alert: true });

        await ctx.answerCbQuery('⏳ Merestore...');
        try {
            let result;
            if (pending.filename.endsWith('.zip')) {
                result = await backup.restoreFromZip(pending.buffer);
            } else {
                result = backup.restoreFromBuffer(pending.buffer);
            }

            pendingRestore.delete(fileId);
            try { await ctx.deleteMessage(); } catch (e) {}

            await sendHtml(ctx.chat.id, `<b>✅ Restore Berhasil!</b>
${result.message || 'Database telah diganti dari backup.'}

Restart bot untuk memastikan perubahan
🎉`);
        } catch (err) {
            await ctx.answerCbQuery('❌ Gagal: ' + err.message, { show_alert: true });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /update — Update file bot
    // ═══════════════════════════════════════════════════════════
    const ALLOWED_ROOT_FILES = [
        'index.js', 'config.js', 'database.js', 'antikata.js',
        'backup.js', 'clone-settings.js',
        'package.json', 'package-lock.json', 'README.md',
        'qris_profil.png', 'bot.db',
    ];

    const ALLOWED_FOLDERS = [
        'core', 'middleware', 'helpers',
        'services', 'state', 'handlers',
    ];

    const FORBIDDEN_PATTERNS = [
        /^node_modules\//,
        /^\.git\//,
        /^backups\//,
        /^clones_/,
        /\.log$/,
        /\.old$/,
        /\.bak$/,
        /\.env$/,
        /\.env\./,
        /^\.DS_Store$/,
        /^Thumbs\.db$/,
    ];

    function isPathAllowed(relPath) {
        const clean = relPath.replace(/^\.?\//, '').replace(/\\/g, '/');
        if (FORBIDDEN_PATTERNS.some(p => p.test(clean))) return false;
        if (!clean.includes('/')) {
            return ALLOWED_ROOT_FILES.includes(clean);
        }
        const folder = clean.split('/')[0];
        return ALLOWED_FOLDERS.includes(folder);
    }

    bot.command('update', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyHtml(ctx, `<b>🚫 Akses Ditolak</b>\nKhusus Owner.\n\n🔒`);
        }

        const replied = ctx.message.reply_to_message;
        if (!replied || !replied.document) {
            return replyHtml(ctx, `<b>📤 Format Update</b>
Cara update script bot:

<blockquote>1️⃣ Kirim file <b>.zip</b> berisi script baru
2️⃣ Reply file tersebut
3️⃣ Ketik <code>/update</code>
4️⃣ Konfirmasi → bot auto restart</blockquote>

<b>📁 File & Folder yang Diizinkan</b>
<blockquote>
<b>📄 Root Files:</b>
<code>${ALLOWED_ROOT_FILES.join(', ')}</code>

<b>📂 Folders:</b>
<code>${ALLOWED_FOLDERS.join('/, ')}/</code>
</blockquote>

<blockquote>⏭️ <b>Auto-skip:</b>
<code>node_modules/</code>, <code>.git/</code>, <code>backups/</code>, <code>clones_*/</code>,
<code>.env</code>, <code>*.log</code>, <code>*.bak</code></blockquote>

<blockquote>⚠️ File lama otomatis di-backup dengan suffix <code>.pre-update.bak</code></blockquote>`, [
                [{ text: '💾 Backup Dulu', callback_data: 'backup_create' }],
            ]);
        }

        const doc = replied.document;
        const fname = (doc.file_name || '').toLowerCase();

        if (!fname.endsWith('.zip')) {
            return replyHtml(ctx, `<b>❌ File Harus ZIP</b>
File <code>${escapeHtml(doc.file_name)}</code> bukan .zip

<blockquote>Untuk update multi-file, bungkus jadi satu file <b>.zip</b>.</blockquote>
⚠️`);
        }

        if (doc.file_size > 50 * 1024 * 1024) {
            return replyHtml(ctx, `<b>❌ File Terlalu Besar</b>\nMax 50 MB. Kamu: ${(doc.file_size / 1024 / 1024).toFixed(2)} MB\n\n⚠️`);
        }

        const waitMsg = await replyHtml(ctx, `<b>⏳ Mengunduh & Validasi ZIP...</b>\nFile: <code>${escapeHtml(fname)}</code>\n\n📥`);

        try {
            const fileLink = await ctx.telegram.getFileLink(doc.file_id);
            const response = await fetch(fileLink.href);
            const buffer = Buffer.from(await response.arrayBuffer());

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            const AdmZip = require('adm-zip');
            const zip = new AdmZip(buffer);
            const entries = zip.getEntries().filter(e => !e.isDirectory);

            if (entries.length === 0) {
                return replyHtml(ctx, `<b>❌ ZIP Kosong</b>\nFile ZIP tidak berisi file valid.\n\n⚠️`);
            }

            const validFiles = [];
            const skippedFiles = [];

            for (const entry of entries) {
                let relPath = entry.entryName.replace(/\\/g, '/');
                const parts = relPath.split('/');
                if (parts.length > 1 && !ALLOWED_FOLDERS.includes(parts[0])) {
                    const stripped = parts.slice(1).join('/');
                    if (isPathAllowed(stripped)) {
                        relPath = stripped;
                    }
                }

                if (isPathAllowed(relPath)) {
                    validFiles.push({
                        name: relPath,
                        entryName: entry.entryName,
                        size: entry.header.size,
                    });
                } else {
                    skippedFiles.push(relPath);
                }
            }

            if (validFiles.length === 0) {
                return replyHtml(ctx, `<b>❌ Tidak Ada File Valid</b>
Semua file di ZIP di-skip (tidak ada di whitelist).

<blockquote>Contoh file skip: ${skippedFiles.slice(0, 5).join(', ')}${skippedFiles.length > 5 ? '...' : ''}</blockquote>
⚠️`);
            }

            const shortId = crypto.randomBytes(4).toString('hex');
            pendingUpdate.set(shortId, {
                buffer,
                filename: fname,
                validFiles,
                skippedFiles,
                createdAt: Date.now(),
                fromChatId: ctx.chat.id,
            });

            setTimeout(() => pendingUpdate.delete(shortId), 10 * 60 * 1000);

            const validRoot = validFiles.filter(f => !f.name.includes('/'));
            const validFolder = validFiles.filter(f => f.name.includes('/'));

            // ── PENCEGAHAN ERROR <br> : Gunakan \n ──
            let previewHtml = '';
            if (validRoot.length > 0) {
                previewHtml += `📄 <b>Root (${validRoot.length}):</b>\n`;
                previewHtml += validRoot.slice(0, 10).map(f => `• <code>${escapeHtml(f.name)}</code> (${(f.size / 1024).toFixed(1)} KB)`).join('\n');
                if (validRoot.length > 10) previewHtml += `\n... +${validRoot.length - 10} lainnya`;
            }
            if (validFolder.length > 0) {
                if (previewHtml) previewHtml += '\n\n';
                previewHtml += `📂 <b>Folder (${validFolder.length}):</b>\n`;
                previewHtml += validFolder.slice(0, 15).map(f => `• <code>${escapeHtml(f.name)}</code>`).join('\n');
                if (validFolder.length > 15) previewHtml += `\n... +${validFolder.length - 15} lainnya`;
            }

            let skipHtml = '';
            if (skippedFiles.length > 0) {
                skipHtml = `\n\n⏭️ <b>Skip (${skippedFiles.length}):</b>\n${skippedFiles.slice(0, 5).map(f => `• <code>${escapeHtml(f)}</code>`).join('\n')}${skippedFiles.length > 5 ? `\n... +${skippedFiles.length - 5}` : ''}`;
            }

            await replyHtml(ctx, `<b>⚠️ Konfirmasi Update</b>
File: <code>${escapeHtml(fname)}</code>

<b>Total Files</b> : ${entries.length}
<b>Valid</b>       : ✅ ${validFiles.length}
<b>Skip</b>        : ⏭️ ${skippedFiles.length}

<blockquote>${previewHtml}${skipHtml}</blockquote>
<blockquote>⚠️ File di atas akan <b>MENIMPA</b> file lama.
File lama otomatis di-backup dengan suffix <code>.pre-update.bak</code>.

Bot akan <b>AUTO RESTART</b> setelah update.

Pastikan sudah <code>/backup</code>!</blockquote>

🚨 Yakin mau update?`, [
                [{ text: '✅ Ya, Update & Restart', callback_data: `upd_ok_${shortId}` }],
                [{ text: '❌ Batal', callback_data: `upd_no_${shortId}` }],
            ]);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            console.error('Update parse error:', err);
            await replyHtml(ctx, `<b>❌ Gagal Parse ZIP</b>\n<code>${escapeHtml(err.message)}</code>\n\n⚠️`);
        }
    });

    bot.action(/^upd_ok_([a-f0-9]+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }

        const shortId = ctx.match[1];
        const pending = pendingUpdate.get(shortId);

        if (!pending) {
            return ctx.answerCbQuery('❌ Sesi update expired / tidak ditemukan.', { show_alert: true });
        }

        await ctx.answerCbQuery('⏳ Menjalankan update...');
        try { await ctx.deleteMessage(); } catch (e) {}

        const statusMsg = await sendHtml(ctx.chat.id, `<b>🚀 Update Sedang Berjalan...</b>
1️⃣ Backup otomatis...

⏳ Tunggu sebentar...`);

        try {
            console.log('🔄 [UPDATE] Creating pre-update backup...');
            await backup.createBackupZip('pre-update').catch(e => console.log('Pre-backup skip:', e.message));

            const workDir = process.cwd();
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(pending.buffer);

            const applied = [];
            const errors = [];

            for (const f of pending.validFiles) {
                try {
                    const entry = zip.getEntry(f.entryName);
                    if (!entry) throw new Error('Entry tidak ditemukan di ZIP');

                    const content = entry.getData();
                    const targetPath = path.join(workDir, f.name);

                    const targetDir = path.dirname(targetPath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }

                    if (fs.existsSync(targetPath)) {
                        try {
                            fs.copyFileSync(targetPath, targetPath + '.pre-update.bak');
                        } catch (bakErr) {
                            console.warn(`⚠️ Gagal backup ${f.name}: ${bakErr.message}`);
                        }
                    }

                    fs.writeFileSync(targetPath, content);
                    applied.push(f.name);
                    console.log(`✅ Updated: ${f.name}`);

                } catch (e) {
                    errors.push(`${f.name}: ${e.message}`);
                    console.error(`❌ Failed: ${f.name}`, e.message);
                }
            }

            pendingUpdate.delete(shortId);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch (e) {}

            const appliedRoot = applied.filter(f => !f.includes('/'));
            const appliedFolder = applied.filter(f => f.includes('/'));

            // ── PENCEGAHAN ERROR <br> : Gunakan \n ──
            let resultHtml = '';
            if (appliedRoot.length > 0) {
                resultHtml += `📄 <b>Root (${appliedRoot.length}):</b>\n`;
                resultHtml += appliedRoot.slice(0, 10).map(a => `• <code>${escapeHtml(a)}</code>`).join('\n');
                if (appliedRoot.length > 10) resultHtml += `\n... +${appliedRoot.length - 10}`;
            }
            if (appliedFolder.length > 0) {
                if (resultHtml) resultHtml += '\n\n';
                resultHtml += `📂 <b>Folder (${appliedFolder.length}):</b>\n`;
                resultHtml += appliedFolder.slice(0, 15).map(a => `• <code>${escapeHtml(a)}</code>`).join('\n');
                if (appliedFolder.length > 15) resultHtml += `\n... +${appliedFolder.length - 15}`;
            }

            const errHtml = errors.length > 0
                ? `\n\n❌ <b>Error (${errors.length}):</b>\n${errors.map(e => `• ${escapeHtml(e)}`).join('\n')}`
                : '';

            await sendHtml(ctx.chat.id, `<b>✅ Update Berhasil!</b>

<b>Total Applied</b> : ${applied.length}
<b>Errors</b>        : ${errors.length}
<b>Skipped</b>       : ${pending.skippedFiles.length}

<blockquote>${resultHtml}${errHtml}</blockquote>
<blockquote>🔄 Bot restart dalam <b>3 detik</b>...
Setelah restart, bot aktif dengan script baru.

Jika ada masalah, restore backup dari folder <code>backups/</code>
atau file <code>.pre-update.bak</code> yang tersisa.</blockquote>

🚀 Backup pre-update tersimpan di backups/`);

            console.log('🔄 [UPDATE] Restarting bot in 3s...');
            setTimeout(() => gracefulRestart(), 3000);

        } catch (err) {
            pendingUpdate.delete(shortId);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch (e) {}
            console.error('Update Error:', err);

            await sendHtml(ctx.chat.id, `<b>❌ Update Gagal</b>\nError: <code>${escapeHtml(err.message)}</code>\n\n⚠️ Bot tidak di-restart. Cek error & coba lagi.`);
        }
    });

    bot.action(/^upd_no_([a-f0-9]+)$/, async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }

        const shortId = ctx.match[1];
        pendingUpdate.delete(shortId);

        await ctx.answerCbQuery('❌ Update dibatalkan');
        try { await ctx.deleteMessage(); } catch (e) {}

        await sendHtml(ctx.chat.id, `<b>✅ Update Dibatalkan</b>\nTidak ada file yang diubah.\n\n🎯 Kamu bisa kirim file baru kapan saja dengan /update`);
    });

    // ═══════════════════════════════════════════════════════════
    // /restart
    // ═══════════════════════════════════════════════════════════
    bot.command('restart', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        await replyHtml(ctx, `<b>🔄 Restart Bot...</b>\nBot restart dalam 2 detik.\n\n⏳`);
        setTimeout(() => gracefulRestart(), 2000);
    });

    // ═══════════════════════════════════════════════════════════
    // /clone — Buat bot clone
    // ═══════════════════════════════════════════════════════════
    bot.command('clone', async (ctx) => {
        const roleLevel = ctx.state.roleLevel || 0;
        const ROLE_LEVELS = require('../core/constants').ROLE_LEVELS;

        if (roleLevel < ROLE_LEVELS.reseller && ctx.from.id !== config.OWNER_ID) {
            return replyHtml(ctx, `<b>🚫 Role Tidak Cukup</b>\nFitur /clone hanya untuk Reseller, PT, & Owner.\n\n🔒`);
        }

        if (ctx.from.id !== config.OWNER_ID) {
            const userClones = [...activeClones.values()].filter(c => c.createdBy === ctx.from.id && c.status === 'running');
            if (userClones.length >= (config.CLONE_MAX_PER_USER || 1)) {
                return replyHtml(ctx, `<b>⚠️ Limit Tercapai</b>
Kamu sudah punya <b>${userClones.length}</b> clone.

<blockquote>Stop dulu: <code>/stopclone &lt;token&gt;</code></blockquote>
🚫`);
            }
        }

        const rawText = ctx.message.text.split(' ').slice(1).join(' ');
        const args = rawText.split('|').map(s => s.trim());

        if (args.length < 5) {
            return replyHtml(ctx, `<b>❌ Format Salah</b>\n<pre>/clone TOKEN | Nama | Versi | Dev | Link Channel</pre>\n\n🧬`);
        }

        const [newToken, newName, newVersion, newDev, newChannel] = args;

        if (!newToken.includes(':')) {
            return replyHtml(ctx, `<b>❌ Token Tidak Valid</b>\n\n⚠️`);
        }

        if (activeClones.has(newToken)) {
            const ex = activeClones.get(newToken);
            let isRunning = false;
            if (ex.pid) {
                try { process.kill(ex.pid, 0); isRunning = true; } catch (e) {}
            }
            if (isRunning) {
                return replyHtml(ctx, `<b>⚠️ Token Sedang Aktif</b>
<b>${escapeHtml(ex.name)}</b> masih berjalan.

<blockquote>Matikan dulu:
<code>/stopclone ${newToken}</code></blockquote>
🔍`);
            } else {
                activeClones.delete(newToken);
                saveCloneDB();
            }
        }

        const waitMsg = await ctx.reply('🔍 Memvalidasi token bot...');
        let botInfo;

        try {
            const testRes = await axios.get(`https://api.telegram.org/bot${newToken}/getMe`, { timeout: 10000 });
            if (!testRes.data.ok) throw new Error('Token tidak valid');
            botInfo = testRes.data.result;

            try {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null,
                    `✅ Token valid: @${botInfo.username}\n⏳ Mendaftarkan ke database...`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            return replyHtml(ctx, `<b>❌ Token Tidak Valid</b>\n<code>${escapeHtml(err.message)}</code>\n\n⚠️`);
        }

        const regResult = await registerTokenToDB(newToken, ctx.from.id, 30);
        if (!regResult.success) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            return replyHtml(ctx, `<b>❌ Gagal Daftarkan Token</b>\n<pre>Error: ${regResult.error}</pre>\n\n⚠️`);
        }

        try {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null,
                `✅ Token valid: @${botInfo.username}\n✅ DB Terdaftar\n⏳ Menyiapkan bot clone...`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}

        try {
            const tempDir = path.join(os.tmpdir(), `clone_${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            const filesToClone = ['index.js', 'config.js', 'database.js', 'antikata.js', 'backup.js', 'clone-settings.js', 'package.json'];
            for (const f of filesToClone) {
                const src = path.join(process.cwd(), f);
                if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, f));
            }

            const configPath = path.join(tempDir, 'config.js');
            if (fs.existsSync(configPath)) {
                let c = fs.readFileSync(configPath, 'utf8');
                const replaceConfig = (key, val) => {
                    const re = new RegExp(`(${key}\\s*:\\s*['"])(.*?)(['"])`, 'g');
                    if (re.test(c)) c = c.replace(re, `$1${val}$3`);
                    else c = c.replace(/(module\.exports\s*=\s*\{)/, `$1\n    ${key}: "${val}",`);
                };

                replaceConfig('BOT_TOKEN', newToken);
                replaceConfig('botName', newName);
                replaceConfig('version', newVersion);
                replaceConfig('developer', newDev);
                replaceConfig('channelLink', newChannel);
                replaceConfig('REQUIRED_CHANNEL_LINK', newChannel);

                const cloneMeta = {
                    isClone: true,
                    parentOwnerId: ctx.from.id,
                    clonedAt: Date.now(),
                    originalTokenPrefix: newToken.split(':')[0],
                };
                c = c.replace(/(module\.exports\s*=\s*\{)/, `$1\n    IS_CLONE: true,\n    CLONE_META: ${JSON.stringify(cloneMeta)},\n`);
                fs.writeFileSync(configPath, c, 'utf8');
            }

            const cloneRunDir = path.join(process.cwd(), `clones_${newToken.split(':')[0]}_${Date.now()}`);
            fs.mkdirSync(cloneRunDir, { recursive: true });
            for (const f of filesToClone) {
                const src = path.join(tempDir, f);
                if (fs.existsSync(src)) fs.copyFileSync(src, path.join(cloneRunDir, f));
            }
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

            const mainNodeModules = path.join(process.cwd(), 'node_modules');
            const cloneNodeModules = path.join(cloneRunDir, 'node_modules');
            if (fs.existsSync(mainNodeModules)) {
                try { fs.symlinkSync(mainNodeModules, cloneNodeModules, 'dir'); }
                catch (err) {
                    try { fs.cpSync(mainNodeModules, cloneNodeModules, { recursive: true }); }
                    catch (cpErr) { throw new Error('node_modules tidak tersedia'); }
                }
            } else {
                throw new Error('Folder node_modules tidak ditemukan');
            }

            const cloneLogFile = path.join(cloneRunDir, 'clone.log');
            const logStream = fs.openSync(cloneLogFile, 'a');

            const child = spawn(process.execPath, ['index.js'], {
                cwd: cloneRunDir,
                detached: true,
                stdio: ['ignore', logStream, logStream],
                env: { ...process.env, CLONE_PARENT: ctx.from.id.toString(), CLONE_RUN_DIR: cloneRunDir },
            });
            child.unref();
            const clonePid = child.pid;

            setTimeout(() => { try { fs.closeSync(logStream); } catch (e) {} }, 2000);

            activeClones.set(newToken, {
                name: newName,
                version: newVersion,
                developer: newDev,
                channel: newChannel,
                pid: clonePid,
                dir: cloneRunDir,
                status: 'running',
                createdAt: Date.now(),
                createdBy: ctx.from.id,
                createdByUsername: ctx.from.username || ctx.from.first_name,
            });
            saveCloneDB();

            await new Promise(r => setTimeout(r, 3000));
            let isAlive = false;
            try { process.kill(clonePid, 0); isAlive = true; } catch (e) {}

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (isAlive) {
                await replyHtml(ctx, `<b>🚀 Bot Clone Aktif!</b>
Bot <b>@${botInfo.username}</b> berhasil dijalankan!

📛 Nama: <b>${escapeHtml(newName)}</b>
🤖 Username: @${escapeHtml(botInfo.username)}
⚙️ PID: ${clonePid}
🗄️ DB: ✅ Terdaftar

🎉`, [
                    [{ text: `💬 Buka @${botInfo.username}`, url: `https://t.me/${botInfo.username}` }],
                    [{ text: '🛑 Stop Bot', callback_data: `clone_stop_${newToken.split(':')[0]}` }],
                ]);
            } else {
                await deleteTokenFromDB(newToken);
                await replyHtml(ctx, `<b>❌ Clone Gagal Start</b>
Proses spawn berhasil tapi bot clone langsung mati.

Cek log: <code>/clonelog ${newToken.split(':')[0]}</code>
⚠️`);
            }

        } catch (err) {
            console.error('Clone Error:', err);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await deleteTokenFromDB(newToken).catch(() => {});
            await replyHtml(ctx, `<b>❌ Gagal Clone</b>\n<code>${escapeHtml(err.message)}</code>\n\n⚠️`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /stopclone
    // ═══════════════════════════════════════════════════════════
    bot.command('stopclone', async (ctx) => {
        const userId = ctx.from.id;
        const isOwner = userId === config.OWNER_ID;
        const token = ctx.message.text.split(' ').slice(1).join(' ').trim();

        if (!token) {
            const userClones = [];
            for (const [t, info] of activeClones.entries()) {
                if (isOwner || info.createdBy === userId) userClones.push({ token: t, info });
            }

            if (userClones.length === 0) {
                return replyHtml(ctx, `<b>📭 Tidak Ada Clone</b>\n\n🛑`);
            }

            const list = userClones.map((c, i) => {
                const t = c.token.split(':')[0];
                const st = c.info.status === 'running' ? '🟢' : '🔴';
                return `${i + 1}. ${st} <b>${escapeHtml(c.info.name)}</b>\n   Token: <code>${t}:***</code>\n   PID: ${c.info.pid || '-'}`;
            }).join('\n\n');

            return replyHtml(ctx, `<b>🧬 Bot Clone Kamu</b>
<pre>${list}</pre>

<blockquote>Stop: <code>/stopclone &lt;token_lengkap&gt;</code></blockquote>
🛑`);
        }

        if (!token.includes(':')) {
            return replyHtml(ctx, `<b>❌ Token Tidak Valid</b>\n\n⚠️`);
        }

        const info = activeClones.get(token);
        if (!info) return replyHtml(ctx, `<b>🔍 Clone Tidak Ditemukan</b>\n\n❌`);
        if (!isOwner && info.createdBy !== userId) return replyHtml(ctx, `<b>🚫 Bukan Clone Kamu</b>\n\n🔒`);

        const waitMsg = await replyHtml(ctx, `<b>🧹 Membersihkan Bot Clone...</b>
Target: <b>${escapeHtml(info.name)}</b>
PID: <code>${info.pid || 'N/A'}</code>

🛑`);

        try {
            let resultMsg = '';

            if (info.pid) {
                try {
                    process.kill(info.pid, 'SIGTERM');
                    resultMsg += `✅ SIGTERM ke PID <b>${info.pid}</b>.\n`;
                    await new Promise(r => setTimeout(r, 2000));
                    try {
                        process.kill(info.pid, 0);
                        process.kill(info.pid, 'SIGKILL');
                        resultMsg += `🔨 Force SIGKILL.\n`;
                    } catch (e) {
                        resultMsg += `✅ Proses berhenti total.\n`;
                    }
                } catch (err) {
                    if (err.code === 'ESRCH') resultMsg += `ℹ️ PID sudah mati.\n`;
                    else resultMsg += `⚠️ Gagal kill: ${err.message}\n`;
                }
            }

            activeClones.delete(token);
            saveCloneDB();
            resultMsg += `🗄️ Dihapus dari memory & clones.json.\n`;

            const delResult = await deleteTokenFromDB(token);
            if (delResult.success) resultMsg += `🗄️ Token dihapus dari DB.\n`;
            else resultMsg += `⚠️ Gagal hapus DB: ${delResult.error}\n`;

            if (info.dir && fs.existsSync(info.dir)) {
                try {
                    fs.rmSync(info.dir, { recursive: true, force: true });
                    resultMsg += `🗑️ Folder <code>${path.basename(info.dir)}</code> dihapus.\n`;
                } catch (e) {
                    resultMsg += `⚠️ Gagal hapus folder: ${e.message}\n`;
                }
            }

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyHtml(ctx, `<b>✅ Cleanup Selesai</b>
<b>${escapeHtml(info.name)}</b> telah dihapus total.

<blockquote>${resultMsg}</blockquote>
🎉`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyHtml(ctx, `<b>❌ Gagal</b>\n<code>${escapeHtml(err.message)}</code>`);
        }
    });

    bot.action(/^clone_stop_([a-f0-9]+)$/, async (ctx) => {
        const tokenPrefix = ctx.match[1];
        let foundToken = null;
        for (const t of activeClones.keys()) {
            if (t.split(':')[0] === tokenPrefix) { foundToken = t; break; }
        }
        if (!foundToken) return ctx.answerCbQuery('❌ Clone tidak ditemukan', { show_alert: true });

        const info = activeClones.get(foundToken);
        const isOwner = ctx.from.id === config.OWNER_ID;
        if (!isOwner && info.createdBy !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan clone kamu', { show_alert: true });

        await ctx.answerCbQuery('🛑 Menghentikan...');
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.message = { text: `/stopclone ${foundToken}`, ...ctx.callbackQuery.message };
        return bot.command('stopclone', ctx);
    });

    // ═══════════════════════════════════════════════════════════
    // /listclone /clonecheck /clonelog — Owner only
    // ═══════════════════════════════════════════════════════════
    bot.command('listclone', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        if (activeClones.size === 0) {
            return replyHtml(ctx, `<b>📭 Tidak Ada Clone</b>\n\n🧬`);
        }

        const running = [];
        const stopped = [];
        let i = 1;

        for (const [token, info] of activeClones.entries()) {
            const prefix = token.split(':')[0];
            const line = `${i}. <b>${escapeHtml(info.name)}</b>\n   Token: <code>${prefix}:***</code>\n   PID: ${info.pid || '-'}\n   Dibuat: ${new Date(info.createdAt).toLocaleString('id-ID')}`;

            if (info.status === 'running' && info.pid) running.push(line);
            else stopped.push(line);
            i++;
        }

        let preText = '';
        if (running.length > 0) preText += `━━━ 🟢 RUNNING (${running.length}) ━━━\n\n${running.join('\n\n')}`;
        if (stopped.length > 0) {
            if (preText) preText += '\n\n';
            preText += `━━━ 🔴 STOPPED (${stopped.length}) ━━━\n\n${stopped.join('\n\n')}`;
        }
        if (preText.length > 3500) preText = preText.substring(0, 3400) + '\n\n<i>... (dipotong)</i>';

        await replyHtml(ctx, `<b>🧬 Daftar Bot Clone</b>
Total: <b>${activeClones.size}</b>
🟢 ${running.length} · 🔴 ${stopped.length}

<pre>${preText}</pre>`);
    });

    bot.command('clonecheck', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        if (activeClones.size === 0) {
            return replyHtml(ctx, `<b>📭 Tidak Ada Clone</b>\n\n🔍`);
        }

        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);

        const rows = [];
        let runningCount = 0;
        let deadCount = 0;
        let stoppedCount = 0;

        for (const [token, info] of activeClones.entries()) {
            const prefix = token.split(':')[0];

            if (!info.pid) {
                stoppedCount++;
                rows.push(`🔴 <b>${escapeHtml(info.name)}</b>\n   Token: <code>${prefix}:***</code>\n   Status: STOPPED`);
                continue;
            }

            try {
                const { stdout } = await execFileAsync('ps', ['-p', info.pid.toString(), '-o', 'pid,etime,rss,comm']);
                const lines = stdout.trim().split('\n');

                if (lines.length < 2) {
                    deadCount++;
                    rows.push(`🔴 <b>${escapeHtml(info.name)}</b>\n   PID: ${info.pid} — DEAD`);
                } else {
                    const parts = lines[1].trim().split(/\s+/);
                    const etime = parts[1];
                    const rssMB = (parseInt(parts[2]) / 1024).toFixed(1);
                    runningCount++;
                    rows.push(`🟢 <b>${escapeHtml(info.name)}</b>\n   PID: ${info.pid} | Uptime: ${etime} | RAM: ${rssMB} MB`);
                }
            } catch (e) {
                deadCount++;
                rows.push(`🔴 <b>${escapeHtml(info.name)}</b>\n   PID: ${info.pid} — NOT FOUND`);
            }
        }

        let preText = rows.join('\n\n');
        if (preText.length > 3500) preText = preText.substring(0, 3400) + '\n\n<i>... (dipotong)</i>';

        await replyHtml(ctx, `<b>📊 Health Check Clone</b>
Total: <b>${activeClones.size}</b>
🟢 ${runningCount} · 🔴 ${deadCount} · ⚫ ${stoppedCount}

<pre>${preText}</pre>`);
    });

    bot.command('clonelog', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        const tokenPrefix = ctx.message.text.split(' ')[1]?.trim();

        if (!tokenPrefix) {
            const prefixes = [...activeClones.entries()].map(([t, info]) => `<code>${t.split(':')[0]}</code> — ${escapeHtml(info.name)}`);
            return replyHtml(ctx, `<b>📄 Pilih Clone</b>
<pre>/clonelog 1234567890</pre>

<blockquote>${prefixes.length > 0 ? `Clone tersedia:\n${prefixes.join('\n')}` : 'Belum ada clone.'}</blockquote>
📋`);
        }

        let found = null;
        for (const [token, info] of activeClones.entries()) {
            if (token.split(':')[0] === tokenPrefix) { found = { token, info }; break; }
        }

        if (!found || !found.info.dir) {
            return replyHtml(ctx, `<b>❌ Clone Tidak Ditemukan</b>\n\n🔍`);
        }

        const logPath = path.join(found.info.dir, 'clone.log');
        if (!fs.existsSync(logPath)) {
            return replyHtml(ctx, `<b>📭 Log Tidak Ada</b>\n<pre>${logPath}</pre>\n\n📄`);
        }

        const stat = fs.statSync(logPath);
        const sizeKB = (stat.size / 1024).toFixed(2);
        const content = fs.readFileSync(logPath, 'utf8');
        const allLines = content.trim().split('\n');
        const tail = allLines.slice(-50).join('\n');
        const totalLines = allLines.length;

        if (sizeKB > 20 || tail.length > 3500) {
            await ctx.replyWithDocument(
                {
                    source: Buffer.from(
                        `=== LOG: ${found.info.name} ===\n` +
                        `Total baris: ${totalLines}\n` +
                        `Ukuran: ${sizeKB} KB\n` +
                        `=====================================\n\n` + tail,
                        'utf8'
                    ),
                    filename: `clone_log_${tokenPrefix}.txt`,
                },
                {
                    caption: `📄 <b>Log: ${escapeHtml(found.info.name)}</b>\nUkuran: ${sizeKB} KB`,
                    parse_mode: 'HTML',
                }
            );
        } else {
            await replyHtml(ctx, `<b>📄 Log ${found.info.name}</b>
Total: ${totalLines} · Ukuran: ${sizeKB} KB

<pre>${tail || '(kosong)'}</pre>`);
        }
    });

    bot.command('clonerestart', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        const token = ctx.message.text.split(' ').slice(1).join(' ');
        const info = activeClones.get(token);
        if (!info) return replyHtml(ctx, `<b>❌ Tidak Ditemukan</b>`);

        try {
            if (info.pid) {
                try { process.kill(info.pid, 'SIGTERM'); } catch (e) {}
                await new Promise(r => setTimeout(r, 2000));
            }

            const logStream = fs.openSync(path.join(info.dir, 'clone.log'), 'a');
            const child = spawn(process.execPath, ['index.js'], {
                cwd: info.dir,
                detached: true,
                stdio: ['ignore', logStream, logStream],
                env: process.env,
            });
            child.unref();

            info.pid = child.pid;
            info.status = 'running';
            activeClones.set(token, info);
            saveCloneDB();

            await replyHtml(ctx, `<b>🔄 Clone Di-restart</b>
PID baru: ${child.pid}

✅`);
        } catch (err) {
            await replyHtml(ctx, `<b>❌ Gagal</b>\n${err.message}`);
        }
    });

    bot.command('cloneedit', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        const args = ctx.message.text.split(' ').slice(1);
        const tokenPrefix = args[0];
        const field = args[1];
        const value = args.slice(2).join(' ');

        if (!tokenPrefix || !field || !value) return;

        let foundToken = null;
        for (const t of activeClones.keys()) {
            if (t.split(':')[0] === tokenPrefix) { foundToken = t; break; }
        }
        if (!foundToken) return replyHtml(ctx, `<b>❌ Tidak Ditemukan</b>`);

        const info = activeClones.get(foundToken);
        const allowed = ['name', 'developer', 'channel', 'version'];
        if (!allowed.includes(field)) return;

        info[field] = value;
        activeClones.set(foundToken, info);
        saveCloneDB();

        await replyHtml(ctx, `<b>✅ Clone Diedit</b>
${field} → ${value}

🔧`);
    });
}

module.exports = { registerOwnerHandler, renderOwnerPanel };