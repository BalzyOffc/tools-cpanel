const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('../config');
const db = require('../services/database');
const backup = require('../services/backup');
const { bot } = require('../core/bot-instance');
const { replyHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');
const { state } = require('../state/maps');

// Penyimpanan sementara (bisa dipindah ke database)
const errorLogs = [];       // Menyimpan error terakhir
const disabledCmds = new Set(); // Command yang di-disable
const whitelist = new Set();    // User yang di-whitelist (saat maintenance)

// ═══════════════════════════════════════════════════════════════
// 1. AUTO BACKUP HARIAN
// ═══════════════════════════════════════════════════════════════
function startAutoBackup() {
    cron.schedule('0 3 * * *', async () => {
        console.log('⏰ [AUTO-BACKUP] Memulai backup harian...');
        try {
            const result = await backup.createBackupZip('auto-daily');
            backup.cleanupOldBackups(5);
            if (config.OWNER_ID) {
                await backup.sendBackupToOwner(bot, config.OWNER_ID, result, 'auto-daily');
                console.log('✅ [AUTO-BACKUP] Berhasil dikirim ke DM Owner.');
            }
        } catch (err) {
            console.error('❌ [AUTO-BACKUP] Gagal:', err.message);
            if (config.OWNER_ID) {
                bot.telegram.sendMessage(config.OWNER_ID, `<b>❌ Auto Backup Gagal</b>\n\nError: <code>${err.message}</code>`, { parse_mode: 'HTML' }).catch(() => {});
            }
        }
    });
    console.log('⏰ Auto Backup Harian diaktifkan (Setiap jam 03:00).');
}

// ═══════════════════════════════════════════════════════════════
// 2. ERROR LOGGER (Middleware)
// ═══════════════════════════════════════════════════════════════
function logError(ctx, error) {
    const logEntry = {
        time: new Date().toISOString(),
        user: ctx.from ? `${ctx.from.first_name} (${ctx.from.id})` : 'Unknown',
        cmd: ctx.message ? ctx.message.text : 'Callback',
        error: error.message || String(error)
    };
    errorLogs.unshift(logEntry);
    if (errorLogs.length > 50) errorLogs.pop(); // Simpan 50 terakhir
    console.error('🔥 [ERROR]', logEntry);
}

// ═══════════════════════════════════════════════════════════════
// 3. COMMAND REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerTools(bot) {
    // ── 1. STATS DASHBOARD
    bot.command('stats', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        
        const totalUsers = db.getTargets('user').length;
        const totalGroups = db.getTargets('group').length;
        const uptime = process.uptime();
        
        await replyHtml(ctx, `<b>📊 Stats Dashboard</b>
<b>Uptime</b>        : ${Math.floor(uptime / 3600)}j ${Math.floor((uptime % 3600) / 60)}m
<b>Total User</b>    : ${totalUsers}
<b>Total Grup</b>    : ${totalGroups}
<b>Command Disable</b>: ${disabledCmds.size}
<b>Whitelist</b>     : ${whitelist.size}
<b>Memory (RSS)</b>  : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`);
    });

    // ── 2. ERROR LOG
    bot.command('errors', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        if (errorLogs.length === 0) return replyHtml(ctx, "✅ Tidak ada error yang tercatat.");

        const list = errorLogs.map((e, i) => 
            `${i + 1}. [${new Date(e.time).toLocaleTimeString('id-ID')}] ${e.user}\n   ${e.cmd}\n   <i>${escapeHtml(e.error)}</i>`
        ).join('\n\n');
        
        await replyHtml(ctx, `<b>🔥 10 Error Terakhir:</b>\n\n<pre>${escapeHtml(list)}</pre>`);
    });

    // ── 3. MAINTENANCE MODE
    bot.command('maintenance', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        
        state.maintenance = !state.maintenance;
        const status = state.maintenance ? '🔴 AKTIF' : '🟢 MATI';
        await replyHtml(ctx, `<b>🛠️ Maintenance Mode: ${status}</b>\n\nSaat aktif, hanya owner & whitelist yang bisa memakai bot.`);
    });

    bot.command('whitelist', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        
        const args = ctx.message.text.split(' ');
        const targetId = parseInt(args[1]);
        
        if (isNaN(targetId)) {
            return replyHtml(ctx, "Format: <code>/whitelist &lt;user_id&gt;</code>");
        }

        if (whitelist.has(targetId)) {
            whitelist.delete(targetId);
            return replyHtml(ctx, `✅ User <code>${targetId}</code> dihapus dari whitelist.`);
        } else {
            whitelist.add(targetId);
            return replyHtml(ctx, `✅ User <code>${targetId}</code> ditambahkan ke whitelist.`);
        }
    });

    // ── 4. DISABLE COMMAND
    bot.command('disable', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return;
        
        const cmd = ctx.message.text.split(' ')[1];
        if (!cmd) return replyHtml(ctx, "Format: <code>/disable &lt;command&gt;</code> (tanpa garis miring)");

        if (disabledCmds.has(cmd)) {
            disabledCmds.delete(cmd);
            return replyHtml(ctx, `✅ Command <code>/${cmd}</code> di-<b>aktifkan</b> kembali.`);
        } else {
            disabledCmds.add(cmd);
            return replyHtml(ctx, `🚫 Command <code>/${cmd}</code> telah di-<b>nonaktifkan</b>.`);
        }
    });
}

module.exports = { 
    registerOwnerTools, 
    startAutoBackup, 
    errorLogs, 
    disabledCmds, 
    whitelist,
    logError 
}