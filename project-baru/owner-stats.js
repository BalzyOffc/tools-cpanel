// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-stats.js
// /botstats /activelist /statsuser /sysinfo /clearcache /cleartemp
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { getUserRole } = require('../helpers/role');
const { resolveUser } = require('../helpers/user');
const { ROLE_META } = require('../core/constants');
const {
    activeClones,
    systemBlacklist,
    globalFilters,
    userActivity,
    roleCache,
    antispamCache,
    pinterestCache,
    tempEmailSessions,
    state,
} = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerStatsHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /botstats — Ringkasan statistik bot
    // ═══════════════════════════════════════════════════════════
    bot.command('botstats', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Khusus Owner.',
                accent: '🔒',
            }));
        }

        const users = db.getTargets('user').length;
        const groups = db.getTargets('group').length;
        const active24h = [...userActivity.values()].filter(t => Date.now() - t < 86400000).length;
        const uptime = Math.floor(process.uptime());
        const d = Math.floor(uptime / 86400);
        const h = Math.floor((uptime % 86400) / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = uptime % 60;

        const cloneRunning = [...activeClones.values()].filter(c => c.status === 'running').length;
        const cloneTotal = activeClones.size;

        await replyRich(ctx, `
<h1>📊 Bot Stats</h1>
<table bordered striped>
  <tr><td><b>Uptime</b></td><td>: ${d}d ${h}h ${m}m ${s}s</td></tr>
  <tr><td><b>Total User</b></td><td>: ${users}</td></tr>
  <tr><td><b>Total Grup</b></td><td>: ${groups}</td></tr>
  <tr><td><b>Aktif 24h</b></td><td>: ${active24h}</td></tr>
  <tr><td><b>Clone Running</b></td><td>: 🟢 ${cloneRunning} / ${cloneTotal}</td></tr>
  <tr><td><b>Global Filter</b></td><td>: ${globalFilters.size}</td></tr>
  <tr><td><b>Blacklist</b></td><td>: ${systemBlacklist.size}</td></tr>
  <tr><td><b>Panic Mode</b></td><td>: ${state.panicMode ? '🔴 ON' : '🟢 OFF'}</td></tr>
  <tr><td><b>Safe Mode</b></td><td>: ${state.safeMode ? '🟡 ON' : '🟢 OFF'}</td></tr>
</table>
`);
    });

    // ═══════════════════════════════════════════════════════════
    // /activelist — Top 20 user aktif 24 jam
    // ═══════════════════════════════════════════════════════════
    bot.command('activelist', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        const active = [...userActivity.entries()]
            .filter(([, t]) => Date.now() - t < 86400000)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);

        if (active.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tidak Ada User Aktif', headingEmoji: '📭',
                body: 'Belum ada user aktif dalam 24 jam terakhir.',
                accent: '🟢',
            }));
        }

        let html = `<h1>🟢 User Aktif (24h)</h1>`;
        html += `<p>Menampilkan <b>${active.length}</b> user teratas</p>`;
        html += `<table bordered striped><tr><th>#</th><th>User ID</th><th>Terakhir</th></tr>`;
        active.forEach(([id, t], i) => {
            const ago = Math.floor((Date.now() - t) / 60000);
            const agoStr = ago < 60 ? `${ago}m lalu` : `${Math.floor(ago / 60)}h lalu`;
            html += `<tr><td>${i + 1}</td><td><code>${id}</code></td><td>${agoStr}</td></tr>`;
        });
        html += `</table>`;

        await replyRich(ctx, html);
    });

    // ═══════════════════════════════════════════════════════════
    // /statsuser — Detail statistik user tertentu
    // ═══════════════════════════════════════════════════════════
    bot.command('statsuser', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        const targetArg = ctx.message.text.split(' ').slice(1)[0];
        if (!targetArg) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Gunakan: <code>/statsuser &lt;id|@user&gt;</code>',
                listItems: [
                    '📌 Contoh: <code>/statsuser 123456789</code>',
                    '📌 Atau reply pesan user lalu ketik <code>/statsuser</code>',
                ],
                accent: '📊',
            }));
        }

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) {
            return replyRich(ctx, premiumMessage({
                heading: 'User Tidak Ditemukan', headingEmoji: '❌',
                body: 'Pastikan user pernah start bot.',
                accent: '⚠️',
            }));
        }

        const roleData = await getUserRole(targetUser.id, true);
        const roleMeta = ROLE_META[roleData.role] || ROLE_META.user;
        const saldo = db.getSaldo(targetUser.id);
        const score = db.getScore(targetUser.id) || { wins: 0, losses: 0 };
        const lastSeen = userActivity.get(targetUser.id);
        const lastSeenStr = lastSeen
            ? new Date(lastSeen).toLocaleString('id-ID')
            : 'Tidak ada data';

        const isBlacklisted = systemBlacklist.has(targetUser.id);

        await replyRich(ctx, premiumMessage({
            heading: 'Statistik User', headingEmoji: '📊',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a>`,
            pre:
`ID        : ${targetUser.id}
Username  : @${targetUser.username || '-'}
Role      : ${roleMeta.emoji} ${roleMeta.label}
Saldo     : 💰 ${saldo}
Win/Loss  : 🏆 ${score.wins} / 😢 ${score.losses}
Winrate   : ${score.wins + score.losses > 0 ? ((score.wins / (score.wins + score.losses)) * 100).toFixed(1) : 0}%
Last Seen : ${lastSeenStr}
Blacklist : ${isBlacklisted ? '🚫 YA' : '✅ TIDAK'}`,
            accent: '📊',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /sysinfo — Info server & sistem
    // ═══════════════════════════════════════════════════════════
    bot.command(['sysinfo', 'server'], async (ctx) => {
        // Opsional: hanya owner
        if (ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Khusus Owner.',
                accent: '🔒',
            }));
        }

        const loadingMsg = await ctx.reply('⏳ Mengambil informasi server...');

        try {
            // Uptime bot
            const uptime = process.uptime();
            const d = Math.floor(uptime / 86400);
            const h = Math.floor((uptime % 86400) / 3600);
            const m = Math.floor((uptime % 3600) / 60);
            const s = Math.floor(uptime % 60);
            const uptimeStr = `${d} hari, ${h} jam, ${m} menit, ${s} detik`;

            // RAM
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const ramUsage = ((usedMem / totalMem) * 100).toFixed(2);
            const formatBytes = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';

            // CPU
            const cpus = os.cpus();
            const cpuModel = cpus[0].model;
            const cpuSpeed = cpus[0].speed;
            const cpuCores = cpus.length;

            let totalIdle = 0, totalTick = 0;
            cpus.forEach(cpu => {
                for (const type in cpu.times) totalTick += cpu.times[type];
                totalIdle += cpu.times.idle;
            });
            const idle = totalIdle / cpus.length;
            const total = totalTick / cpus.length;
            const cpuUsage = (100 - ~~(100 * idle / total)).toFixed(2);

            // OS
            const platform = os.platform();
            const arch = os.arch();
            const hostname = os.hostname();
            const nodeVersion = process.version;
            const processMem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
            const heapUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

            try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}

            await replyRich(ctx, `
<h1>🖥️ System Information</h1>
<h2>⚙️ Bot Status</h2>
<table bordered>
  <tr><td><b>Uptime</b></td><td>: ${uptimeStr}</td></tr>
  <tr><td><b>Node.js</b></td><td>: ${nodeVersion}</td></tr>
  <tr><td><b>Process RAM</b></td><td>: ${processMem} MB</td></tr>
  <tr><td><b>Heap Used</b></td><td>: ${heapUsed} MB</td></tr>
</table>

<h2>📊 Resource Server</h2>
<table bordered>
  <tr><td><b>CPU Usage</b></td><td>: ${cpuUsage}%</td></tr>
  <tr><td><b>RAM Usage</b></td><td>: ${ramUsage}% (${formatBytes(usedMem)} / ${formatBytes(totalMem)})</td></tr>
  <tr><td><b>CPU Model</b></td><td>: ${escapeHtml(cpuModel.substring(0, 40))}...</td></tr>
  <tr><td><b>Cores</b></td><td>: ${cpuCores} Cores @ ${cpuSpeed} MHz</td></tr>
</table>

<h2>🌐 Host Info</h2>
<table bordered>
  <tr><td><b>Hostname</b></td><td>: ${escapeHtml(hostname)}</td></tr>
  <tr><td><b>Platform</b></td><td>: ${platform} (${arch})</td></tr>
</table>

<footer>✨ Monitoring system</footer>
`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
            await replyRich(ctx, `
<h1>❌ Gagal</h1>
<p>Error: <code>${escapeHtml(err.message)}</code></p>
`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /clearcache — Bersihkan cache in-memory
    // ═══════════════════════════════════════════════════════════
    bot.command('clearcache', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        const before = {
            roleCache: roleCache.size,
            tempMail: tempEmailSessions ? tempEmailSessions.size : 0,
            pinterest: pinterestCache.size,
            antispam: antispamCache.size,
        };

        roleCache.clear();
        if (tempEmailSessions) tempEmailSessions.clear();
        pinterestCache.clear();
        antispamCache.clear();

        await replyRich(ctx, premiumMessage({
            heading: 'Cache Dibersihkan', headingEmoji: '🧹',
            pre:
`Role Cache  : ${before.roleCache} → 0
Temp Email  : ${before.tempMail} → 0
Pinterest   : ${before.pinterest} → 0
Anti-Spam   : ${before.antispam} → 0`,
            blockquote: 'Cache in-memory dibersihkan. Data persistent (DB) tetap aman.',
            accent: '✅',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /cleartemp — Bersihkan folder temp
    // ═══════════════════════════════════════════════════════════
    bot.command('cleartemp', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;

        const tempDir = os.tmpdir();
        let deleted = 0;
        let sizeMB = 0;
        const deletedFiles = [];

        try {
            const files = fs.readdirSync(tempDir);
            for (const f of files) {
                if (
                    f.startsWith('dl-') ||
                    f.startsWith('balzy-') ||
                    f.startsWith('build_') ||
                    f.startsWith('clone_')
                ) {
                    const p = path.join(tempDir, f);
                    try {
                        const stat = fs.statSync(p);
                        sizeMB += stat.size / 1024 / 1024;
                        fs.rmSync(p, { recursive: true, force: true });
                        deleted++;
                        deletedFiles.push(f);
                    } catch (e) {}
                }
            }
        } catch (e) {}

        let preText = '';
        if (deletedFiles.length > 0) {
            preText = deletedFiles.slice(0, 20).map((f, i) => `${i + 1}. ${f}`).join('\n');
            if (deletedFiles.length > 20) preText += `\n... (${deletedFiles.length - 20} lainnya)`;
        } else {
            preText = '(tidak ada file temp)';
        }

        await replyRich(ctx, premiumMessage({
            heading: 'Temp Dibersihkan', headingEmoji: '🧹',
            body: `Total: ${deleted} file dihapus`,
            pre: preText,
            listItems: [
                `📦 Ukuran dibebaskan: ~${sizeMB.toFixed(2)} MB`,
            ],
            accent: '✅',
        }));
    });
}

module.exports = { registerOwnerStatsHandler };