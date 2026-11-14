// =============================================================
// === server-panel.js =========================================
// === Modul Notif User Baru + Server Panel ====================
// =============================================================
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const axios = require('axios');

// State internal
const knownUsers = new Set();
const notifQueue = [];
const MAX_NOTIF_PER_MIN = 10;

// Helper: format bytes
function formatBytes(bytes) {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
    if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

// Helper: format durasi
function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

// Helper: escape HTML
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper: cek rate limit notif
function canSendNotif() {
    const now = Date.now();
    const recent = notifQueue.filter(t => now - t < 60000);
    if (recent.length >= MAX_NOTIF_PER_MIN) return false;
    notifQueue.push(now);
    // Bersihkan queue lama
    while (notifQueue.length > 100) notifQueue.shift();
    return true;
}

// =============================================================
// === REGISTER MODULE KE BOT ==================================
// =============================================================
function registerServerPanel(bot, config, helpers) {
    const { replyRich, premiumMessage, editRichMessage, sendRichMessage } = helpers;
    const OWNER_ID = config.OWNER_ID;

    // =========================================================
    // === LOAD KNOWN USERS DARI DB ============================
    // =========================================================
    try {
        const db = require('./database');
        const users = db.getTargets ? db.getTargets('user') : [];
        users.forEach(id => knownUsers.add(Number(id)));
        console.log(`👥 [ServerPanel] Loaded ${knownUsers.size} known users`);
    } catch (e) {
        console.error('❌ [ServerPanel] Gagal load users:', e.message);
    }

    // =========================================================
    // === FUNGSI: KIRIM NOTIF USER BARU =======================
    // =========================================================
    async function notifyNewUser(ctx) {
        const userId = ctx.from?.id;
        if (!userId) return;
        if (userId === OWNER_ID) return;
        if (knownUsers.has(userId)) return;

        knownUsers.add(userId);

        // Rate limit
        if (!canSendNotif()) {
            console.log(`⚠️ [Notif] Rate limit, skip user ${userId}`);
            return;
        }

        try {
            const user = ctx.from;
            const chat = ctx.chat;
            const isGroup = chat.type === 'group' || chat.type === 'supergroup';

            const html = `
<h1>🔔 User Baru Terdeteksi!</h1>
<blockquote>${isGroup ? '👥 Via Grup' : '💬 Via Private Chat'}</blockquote>

<h2>👤 Info User</h2>
<table bordered>
  <tr><td><b>Nama</b></td><td>: ${escapeHtml(user.first_name || '-')} ${user.last_name ? escapeHtml(user.last_name) : ''}</td></tr>
  <tr><td><b>Username</b></td><td>: ${user.username ? '@' + escapeHtml(user.username) : '<i>Tidak ada</i>'}</td></tr>
  <tr><td><b>User ID</b></td><td>: <code>${user.id}</code></td></tr>
  <tr><td><b>Bahasa</b></td><td>: ${user.language_code || '-'}</td></tr>
  <tr><td><b>Premium</b></td><td>: ${user.is_premium ? '⭐ Ya' : '❌ Bukan'}</td></tr>
  <tr><td><b>Tipe</b></td><td>: ${user.is_bot ? '🤖 Bot' : '👤 Manusia'}</td></tr>
</table>

<h2>📍 Konteks Chat</h2>
<table bordered>
  <tr><td><b>Chat Type</b></td><td>: ${chat.type}</td></tr>
  <tr><td><b>Chat ID</b></td><td>: <code>${chat.id}</code></td></tr>
  ${isGroup ? `<tr><td><b>Nama Grup</b></td><td>: ${escapeHtml(chat.title || '-')}</td></tr>` : ''}
  ${ctx.message?.text ? `<tr><td><b>Pesan</b></td><td>: <code>${escapeHtml(ctx.message.text.substring(0, 50))}</code></td></tr>` : ''}
</table>

<h2>📊 Statistik Global</h2>
<table bordered>
  <tr><td><b>Total User Unik</b></td><td>: <b>${knownUsers.size}</b></td></tr>
  <tr><td><b>Waktu</b></td><td>: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</td></tr>
</table>

<footer>✨ Notif otomatis dari sistem</footer>
<tg-button-row>
  <tg-button type="url" style="primary" url="tg://user?id=${user.id}">💬 Chat User</tg-button>
  <tg-button type="callback_data" style="success" data="notif_user_ok">✅ Oke</tg-button>
</tg-button-row>
`;

            await sendRichMessage(OWNER_ID, html);
            console.log(`🔔 [Notif] User baru: ${user.id} (${user.first_name})`);
        } catch (err) {
            console.error('❌ [Notif] Gagal kirim:', err.message);
        }
    }

    // =========================================================
    // === MIDDLEWARE: DETEKSI USER BARU =======================
    // =========================================================
    bot.use(async (ctx, next) => {
        if (ctx.from && !ctx.from.is_bot) {
            if (!knownUsers.has(ctx.from.id) && ctx.from.id !== OWNER_ID) {
                // Delay 500ms biar gak ganggu flow utama
                setTimeout(() => notifyNewUser(ctx).catch(() => {}), 500);
            }
        }
        return next();
    });

    // =========================================================
    // === HANDLER TOMBOL OKE ==================================
    // =========================================================
    bot.action('notif_user_ok', async (ctx) => {
        if (ctx.from.id !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }
        await ctx.answerCbQuery('✅ Notif dibaca');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    // =========================================================
    // === FUNGSI: TAMPILKAN SERVER PANEL ======================
    // =========================================================
    async function showServerPanel(ctx) {
        // 1. Memory
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const ramPercent = ((usedMem / totalMem) * 100).toFixed(1);

        // 2. CPU
        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;
        const cpuLoad = ((loadAvg[0] / cpuCount) * 100).toFixed(1);
        const cpuModel = os.cpus()[0]?.model || 'Unknown';

        // 3. Disk
        let diskInfo = '-';
        let diskPercent = 0;
        try {
            const { stdout } = await execFileAsync('df', ['-h', '/']);
            const parts = stdout.trim().split('\n')[1].split(/\s+/);
            diskInfo = `${parts[2]} / ${parts[1]} (${parts[4]})`;
            diskPercent = parseInt(parts[4]) || 0;
        } catch (e) {}

        // 4. Uptime OS
        const osUptime = os.uptime();

        // 5. Uptime Bot
        const botUptime = process.uptime();

        // 6. Memory Bot
        const mem = process.memoryUsage();

        // 7. Statistik DB
        let totalUsers = 0, totalGroups = 0;
        try {
            const db = require('./database');
            const counts = db.getTargetCounts ? db.getTargetCounts() : { users: 0, groups: 0 };
            totalUsers = counts.users || 0;
            totalGroups = counts.groups || 0;
        } catch (e) {}

        // 8. Ping Google
        let ping = '-';
        let pingStatus = '🟢';
        try {
            const start = Date.now();
            await axios.get('https://www.google.com', { timeout: 3000 });
            ping = `${Date.now() - start}ms`;
            if (Date.now() - start > 1000) pingStatus = '🟠';
            if (Date.now() - start > 3000) pingStatus = '🔴';
        } catch (e) {
            ping = 'Timeout';
            pingStatus = '🔴';
        }

        // 9. Status indicator
        const ramStatus = ramPercent > 90 ? '🔴' : ramPercent > 75 ? '🟠' : '🟢';
        const cpuStatus = cpuLoad > 80 ? '🔴' : cpuLoad > 50 ? '🟠' : '🟢';
        const diskStatus = diskPercent > 90 ? '🔴' : diskPercent > 75 ? '🟠' : '🟢';

        const html = `
<h1>🖥️ Server Panel</h1>
<blockquote>🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</blockquote>

<h2>📊 System Resource</h2>
<table bordered>
  <tr><td><b>${ramStatus} RAM</b></td><td>: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${ramPercent}%)</td></tr>
  <tr><td><b>${cpuStatus} CPU Load</b></td><td>: ${cpuLoad}% (${cpuCount} cores)</td></tr>
  <tr><td><b>${diskStatus} Disk</b></td><td>: ${diskInfo}</td></tr>
  <tr><td><b>${pingStatus} Ping</b></td><td>: ${ping}</td></tr>
</table>

<h2>🖥️ Host Info</h2>
<table bordered>
  <tr><td><b>Hostname</b></td><td>: ${os.hostname()}</td></tr>
  <tr><td><b>OS</b></td><td>: ${os.platform()} ${os.arch()}</td></tr>
  <tr><td><b>OS Uptime</b></td><td>: ${formatUptime(osUptime)}</td></tr>
  <tr><td><b>CPU Model</b></td><td>: ${escapeHtml(cpuModel.substring(0, 40))}</td></tr>
</table>

<h2>🤖 Bot Info</h2>
<table bordered>
  <tr><td><b>Uptime</b></td><td>: ${formatUptime(botUptime)}</td></tr>
  <tr><td><b>Memory</b></td><td>: ${formatBytes(mem.rss)}</td></tr>
  <tr><td><b>Heap Used</b></td><td>: ${formatBytes(mem.heapUsed)}</td></tr>
  <tr><td><b>Node</b></td><td>: ${process.version}</td></tr>
  <tr><td><b>PID</b></td><td>: <code>${process.pid}</code></td></tr>
</table>

<h2>📈 Statistik Bot</h2>
<table bordered>
  <tr><td><b>👥 Total User (DB)</b></td><td>: ${totalUsers}</td></tr>
  <tr><td><b>📢 Total Grup (DB)</b></td><td>: ${totalGroups}</td></tr>
  <tr><td><b>🆕 Known Users (Cache)</b></td><td>: ${knownUsers.size}</td></tr>
</table>

<footer>✨ Klik tombol untuk detail lebih lanjut</footer>
<tg-button-row>
  <tg-button type="callback_data" style="primary" data="sp_refresh">🔄 Refresh</tg-button>
  <tg-button type="callback_data" style="success" data="sp_processes">🔥 Proses</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="warning" data="sp_botinfo">🤖 Detail Bot</tg-button>
  <tg-button type="callback_data" style="danger" data="sp_back">🔙 Kembali</tg-button>
</tg-button-row>
`;

        await editRichMessage(ctx, html);
    }

    // =========================================================
    // === COMMAND /serverpanel ================================
    // =========================================================
    bot.command(['serverpanel', 'sp'], async (ctx) => {
        if (ctx.from.id !== OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Fitur ini hanya untuk Owner.',
                accent: '🔒'
            }));
        }
        await showServerPanel(ctx);
    });

    // =========================================================
    // === CALLBACK: REFRESH ===================================
    // =========================================================
    bot.action('sp_refresh', async (ctx) => {
        if (ctx.from.id !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }
        await ctx.answerCbQuery('🔄 Refresh...');
        await showServerPanel(ctx);
    });

    bot.action('server_panel_refresh', async (ctx) => {
        if (ctx.from.id !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }
        await ctx.answerCbQuery('🔄 Refresh...');
        await showServerPanel(ctx);
    });

    // =========================================================
    // === CALLBACK: TOP PROSES ================================
    // =========================================================
    bot.action('sp_processes', async (ctx) => {
        if (ctx.from.id !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }
        await ctx.answerCbQuery('🔥 Mengambil proses...');

        try {
            let processes = [];

            // Coba pakai `ps` (Linux/Mac)
            try {
                const { stdout } = await execFileAsync('ps', ['aux', '--sort=-%cpu']);
                const lines = stdout.split('\n').slice(1, 11);

                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 11) {
                        processes.push({
                            user: parts[0],
                            cpu: parts[2],
                            mem: parts[3],
                            cmd: parts.slice(10).join(' ').substring(0, 40)
                        });
                    }
                });
            } catch (e) {
                // Fallback: Windows pakai wmic
                try {
                    const { stdout } = await execFileAsync('wmic', ['process', 'get', 'Name,ProcessId,WorkingSetSize', '/format:csv']);
                    // Parse CSV sederhana
                    const lines = stdout.trim().split('\n').slice(1, 11);
                    lines.forEach(line => {
                        const parts = line.trim().split(',');
                        if (parts.length >= 3) {
                            processes.push({
                                user: '-',
                                cpu: '-',
                                mem: formatBytes(parseInt(parts[2]) || 0),
                                cmd: parts[1] || parts[0]
                            });
                        }
                    });
                } catch (e2) {
                    processes.push({ user: '-', cpu: '-', mem: '-', cmd: 'Gagal ambil proses' });
                }
            }

            let tableHtml = '<h1>🔥 Top 10 Proses</h1><table bordered><tr><th>User</th><th>CPU</th><th>MEM</th><th>Command</th></tr>';
            processes.forEach(p => {
                tableHtml += `<tr><td>${escapeHtml(p.user)}</td><td>${escapeHtml(p.cpu)}%</td><td>${escapeHtml(p.mem)}%</td><td><code>${escapeHtml(p.cmd)}</code></td></tr>`;
            });
            tableHtml += '</table>';
            tableHtml += '<tg-button-row>';
            tableHtml += '<tg-button type="callback_data" style="primary" data="sp_refresh">🔙 Panel</tg-button>';
            tableHtml += '<tg-button type="callback_data" style="success" data="sp_processes">🔄 Refresh</tg-button>';
            tableHtml += '</tg-button-row>';

            await editRichMessage(ctx, tableHtml);
        } catch (err) {
            await ctx.answerCbQuery('❌ ' + err.message, { show_alert: true });
        }
    });

    // =========================================================
    // === CALLBACK: DETAIL BOT ================================
    // =========================================================
    bot.action('sp_botinfo', async (ctx) => {
        if (ctx.from.id !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        }
        await ctx.answerCbQuery('🤖 Mengambil detail bot...');

        const mem = process.memoryUsage();
        const uptime = process.uptime();

        // Handle dari parent bot (jika ada)
        let activeClones = 0, pendingQris = 0, pendingConfess = 0;
        try {
            // Coba akses global (jika bot utama)
            if (global.activeClones) activeClones = global.activeClones.size;
            if (global.pendingQris) pendingQris = global.pendingQris.size;
            if (global.pendingConfess) pendingConfess = global.pendingConfess.size;
        } catch (e) {}

        // Env info
        const envInfo = [
            `CLONE: ${config.IS_CLONE ? '✅ Yes' : '❌ No'}`,
            `PM2: ${process.env.pm_id ? '✅ (ID: ' + process.env.pm_id + ')' : '❌ No'}`,
            `NODE_ENV: ${process.env.NODE_ENV || 'development'}`
        ].join('<br>');

        const html = `
<h1>🤖 Detail Bot Process</h1>

<h2>⚙️ Process Info</h2>
<table bordered>
  <tr><td><b>PID</b></td><td>: <code>${process.pid}</code></td></tr>
  <tr><td><b>Parent PID</b></td><td>: <code>${process.ppid || '-'}</code></td></tr>
  <tr><td><b>Uptime</b></td><td>: ${formatUptime(uptime)}</td></tr>
  <tr><td><b>Node Version</b></td><td>: ${process.version}</td></tr>
  <tr><td><b>Platform</b></td><td>: ${process.platform} ${process.arch}</td></tr>
  <tr><td><b>CWD</b></td><td>: <code>${escapeHtml(process.cwd())}</code></td></tr>
</table>

<h2>💾 Memory Usage</h2>
<table bordered>
  <tr><td><b>RSS</b></td><td>: ${formatBytes(mem.rss)}</td></tr>
  <tr><td><b>Heap Total</b></td><td>: ${formatBytes(mem.heapTotal)}</td></tr>
  <tr><td><b>Heap Used</b></td><td>: ${formatBytes(mem.heapUsed)}</td></tr>
  <tr><td><b>External</b></td><td>: ${formatBytes(mem.external)}</td></tr>
  <tr><td><b>Array Buffers</b></td><td>: ${formatBytes(mem.arrayBuffers || 0)}</td></tr>
</table>

<h2>📊 Active Sessions</h2>
<table bordered>
  <tr><td><b>Known Users</b></td><td>: ${knownUsers.size}</td></tr>
  <tr><td><b>Active Clones</b></td><td>: ${activeClones}</td></tr>
  <tr><td><b>QRIS Sessions</b></td><td>: ${pendingQris}</td></tr>
  <tr><td><b>Confess Sessions</b></td><td>: ${pendingConfess}</td></tr>
</table>

<h2>🌐 Environment</h2>
<blockquote>${envInfo}</blockquote>

<tg-button-row>
  <tg-button type="callback_data" style="primary" data="sp_refresh">🔙 Panel</tg-button>
  <tg-button type="callback_data" style="warning" data="sp_botinfo">🔄 Refresh</tg-button>
</tg-button-row>
`;

        await editRichMessage(ctx, html);
    });

    // =========================================================
    // === CALLBACK: KEMBALI ===================================
    // =========================================================
    bot.action('sp_back', async (ctx) => {
        await ctx.answerCbQuery('🔙 Kembali');
        try { await ctx.deleteMessage(); } catch (e) {}

        // Trigger menu owner
        ctx.message = { text: '/start', ...ctx.callbackQuery.message };
        return bot.command('start', ctx);
    });

    // =========================================================
    // === EXPORT FUNGSI =======================================
    // =========================================================
    return {
        notifyNewUser,
        showServerPanel,
        getKnownUsers: () => knownUsers,
        getKnownUsersCount: () => knownUsers.size
    };

    console.log('✅ [ServerPanel] Module registered');
}

module.exports = { registerServerPanel };