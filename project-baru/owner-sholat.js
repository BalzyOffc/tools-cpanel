// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-sholat.js
// Menu kontrol sholat otomatis (SEMUA KOTA)
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const sholatAuto = require('../services/sholat-auto');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');

function isOwner(ctx) {
    return ctx.from?.id === config.OWNER_ID;
}

function registerOwnerSholatHandler(bot) {
    bot.command(['sholatauto', 'autosholat', 'adzan'], async (ctx) => {
        if (!isOwner(ctx)) return replyRich(ctx, premiumMessage({ heading: 'Akses Ditolak', headingEmoji: '🚫', accent: '🔒' }));

        const args = ctx.message.text.split(' ').slice(1);
        const sub = args[0]?.toLowerCase();

        // 1. Toggle ON/OFF
        if (sub === 'on' || sub === 'off') {
            const enabled = sub === 'on';
            sholatAuto.setConfig({ enabled });
            return replyRich(ctx, premiumMessage({
                heading: `Auto Sholat ${enabled ? 'ON 🟢' : 'OFF 🔴'}`,
                headingEmoji: '🕌',
                body: enabled ? 'Broadcast adzan otomatis (SEMUA KOTA) aktif.' : 'Broadcast adzan otomatis dimatikan.',
                accent: enabled ? '✅' : '⚠️',
            }));
        }

        // 2. Set Warning
        if (sub === 'warning') {
            const n = parseInt(args[1]);
            if (isNaN(n) || n < 0 || n > 60) return replyRich(ctx, premiumMessage({ heading: 'Format Salah', headingEmoji: '❌', pre: '/sholatauto warning 5', accent: '⚠️' }));
            sholatAuto.setConfig({ preWarningMinutes: n });
            return replyRich(ctx, premiumMessage({ heading: 'Warning Diatur', headingEmoji: '⏰', body: n === 0 ? 'Warning dimatikan.' : `Peringatan ${n} menit sebelum adzan aktif.`, accent: '✅' }));
        }

        // 3. Test Adzan
        if (sub === 'test') {
            const waitMsg = await ctx.reply('🕌 Mengirim test adzan ke semua user...');
            try {
                const result = await sholatAuto.testAdzan('Test');
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
                await replyRich(ctx, premiumMessage({
                    heading: 'Test Adzan Selesai', headingEmoji: '✅',
                    listItems: [`✅ Sukses: <b>${result.success}</b>`, `❌ Gagal: <b>${result.failed}</b>`],
                    accent: '🕌',
                }));
            } catch (err) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
                await replyRich(ctx, premiumMessage({ heading: 'Gagal Test', headingEmoji: '❌', body: `<code>${escapeHtml(err.message)}</code>`, accent: '⚠️' }));
            }
            return;
        }

        // 4. Reload Cache Manual
        if (sub === 'reload') {
            const waitMsg = await ctx.reply('🔄 Reload jadwal semua kota...');
            try {
                await sholatAuto.loadAllCities();
                await sholatAuto.loadDailyJadwalAllCities(true);
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
                await replyRich(ctx, premiumMessage({ heading: 'Reload Sukses', headingEmoji: '✅', body: 'Cache jadwal semua kota diperbarui.', accent: '🕌' }));
            } catch (err) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
                await replyRich(ctx, premiumMessage({ heading: 'Gagal Reload', headingEmoji: '❌', body: `<code>${escapeHtml(err.message)}</code>`, accent: '⚠️' }));
            }
            return;
        }

        // 5. Menu Utama (tanpa argumen)
        const stats = sholatAuto.getStats();
        const jadwal = await sholatAuto.getJadwalToday?.().catch(() => null) || null;
        
        let jadwalStr = '(Belum di-load / gagal)';
        if (jadwal) {
            jadwalStr = sholatAuto.WAKTU_SHOLAT.map(w => `${w.emoji} ${w.label.padEnd(8)} : ${jadwal[w.key] || '-'}`).join('\n');
        }

        await replyRich(ctx, premiumMessage({
            heading: 'Jadwal Sholat Otomatis', headingEmoji: '🕌',
            body: `Status: <b>${stats.enabled ? '🟢 ON' : '🔴 OFF'}</b> (Semua Kota Indonesia)`,
            pre:
`⏰ Warning  : ${stats.preWarningMinutes} menit sebelum
🎵 Audio    : ${stats.adzanUrl.substring(0, 40)}...
🏙️ Total Kota: ${stats.totalCities}
📥 Cached   : ${stats.cachedCities} kota
📊 Sent Hari Ini: ${stats.sentToday} adzan + ${stats.warningToday} warning

📅 Contoh Jadwal (hari ini):
${jadwalStr}`,
            listItems: [
                '📌 <code>/sholatauto on</code> — aktifkan',
                '📌 <code>/sholatauto off</code> — matikan',
                '📌 <code>/sholatauto warning &lt;menit&gt;</code> — warning sebelum adzan',
                '📌 <code>/sholatauto test</code> — test adzan',
                '📌 <code>/sholatauto reload</code> — reload cache',
            ],
            footer: 'Broadcast otomatis ke semua user PV.',
            accent: '🕌',
            buttons: [
                { text: stats.enabled ? '🔴 Matikan' : '🟢 Aktifkan', callback: stats.enabled ? 'sholat_off' : 'sholat_on', color: stats.enabled ? 'danger' : 'success' },
                { text: '🔔 Test Adzan', callback: 'sholat_test', color: 'primary' },
            ],
        }));
    });

    bot.action('sholat_on', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        sholatAuto.setConfig({ enabled: true });
        await ctx.answerCbQuery('🟢 Auto sholat ON');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    bot.action('sholat_off', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        sholatAuto.setConfig({ enabled: false });
        await ctx.answerCbQuery('🔴 Auto sholat OFF');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    bot.action('sholat_test', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        await ctx.answerCbQuery('🕌 Mengirim test adzan...');
        try {
            const result = await sholatAuto.testAdzan('Test');
            await replyRich(ctx, premiumMessage({
                heading: 'Test Adzan Selesai', headingEmoji: '✅',
                listItems: [`✅ Sukses: <b>${result.success}</b>`, `❌ Gagal: <b>${result.failed}</b>`],
                accent: '🕌',
            }));
        } catch (err) {
            await ctx.reply(`❌ Gagal: ${err.message}`);
        }
    });
}

module.exports = { registerOwnerSholatHandler };