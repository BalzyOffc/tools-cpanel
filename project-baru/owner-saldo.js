// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-saldo.js
// /addsaldo /setsaldo /resetsaldo /topbalance /topplayers
// /gencode /listcodes /delcode
// ⚠️ /claim sudah ada di handlers/games.js — tidak diduplikasi
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { bot } = require('../core/bot-instance');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { getTargetUser, resolveUser } = require('../helpers/user');

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════
function isOwner(ctx) {
    return ctx.from?.id === config.OWNER_ID;
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerSaldoHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /addsaldo — Tambah saldo user
    // ═══════════════════════════════════════════════════════════
    bot.command('addsaldo', async (ctx) => {
        if (!isOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const targetArg = args[0];
        const amount = parseInt(args[1]);

        if (!targetArg || isNaN(amount)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/addsaldo <id|@user> <jumlah>',
                listItems: [
                    '📌 Contoh: <code>/addsaldo 123456789 50000</code>',
                    '📌 Atau reply user: <code>/addsaldo 50000</code>',
                ],
                accent: '💰',
            }));
        }

        // Support reply mode: /addsaldo 50000 (target dari reply)
        let targetUser;
        if (ctx.message.reply_to_message?.from && !isNaN(parseInt(targetArg))) {
            const replied = ctx.message.reply_to_message.from;
            // Cek apakah targetArg adalah nominal (reply mode) atau ID
            // Kalau reply + angka tunggal → angka itu nominal
            if (args.length === 1 || (args.length >= 1 && !args[1])) {
                targetUser = { id: replied.id, first_name: replied.first_name, username: replied.username };
                const nominal = parseInt(targetArg);
                if (!isNaN(nominal)) {
                    const newSaldo = db.addSaldo(targetUser.id, nominal);
                    return sendSuccessAddSaldo(ctx, targetUser, nominal, newSaldo);
                }
            }
        }

        // Mode normal: /addsaldo <id|@user> <jumlah>
        targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) {
            return replyRich(ctx, premiumMessage({
                heading: 'User Tidak Ditemukan', headingEmoji: '❌',
                body: 'Pastikan user pernah start bot atau ID valid.',
                accent: '⚠️',
            }));
        }

        const newSaldo = db.addSaldo(targetUser.id, amount);
        return sendSuccessAddSaldo(ctx, targetUser, amount, newSaldo);
    });

    async function sendSuccessAddSaldo(ctx, targetUser, amount, newSaldo) {
        try {
            await bot.telegram.sendMessage(targetUser.id,
                `💰 <b>Saldo Bertambah!</b>\n\nOwner memberi kamu <b>+${amount}</b> saldo.\n\nSaldo sekarang: <b>${newSaldo}</b>`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}

        await replyRich(ctx, premiumMessage({
            heading: 'Saldo Ditambah', headingEmoji: '✅',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a>`,
            listItems: [
                `Ditambah: <b>+${amount}</b>`,
                `Saldo sekarang: <b>${newSaldo}</b>`,
            ],
            accent: '💰',
        }));
    }

    // ═══════════════════════════════════════════════════════════
    // /setsaldo — Set nilai saldo
    // ═══════════════════════════════════════════════════════════
    bot.command('setsaldo', async (ctx) => {
        if (!isOwner(ctx)) return;

        const args = ctx.message.text.split(' ').slice(1);
        const targetArg = args[0];
        const amount = parseInt(args[1]);

        if (!targetArg || isNaN(amount)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/setsaldo <id|@user> <jumlah>',
                accent: '💰',
            }));
        }

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) {
            return replyRich(ctx, premiumMessage({ heading: 'User Tidak Ditemukan', headingEmoji: '❌' }));
        }

        const current = db.getSaldo(targetUser.id);
        const diff = amount - current;
        db.addSaldo(targetUser.id, diff);

        await replyRich(ctx, premiumMessage({
            heading: 'Saldo Di-Set', headingEmoji: '✅',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a>`,
            listItems: [
                `Dari: <b>${current}</b>`,
                `Menjadi: <b>${amount}</b>`,
                `Selisih: <b>${diff >= 0 ? '+' : ''}${diff}</b>`,
            ],
            accent: '💰',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /resetsaldo — Reset saldo ke 0
    // ═══════════════════════════════════════════════════════════
    bot.command('resetsaldo', async (ctx) => {
        if (!isOwner(ctx)) return;

        const targetArg = ctx.message.text.split(' ').slice(1)[0];
        if (!targetArg) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/resetsaldo <id|@user>',
                accent: '💰',
            }));
        }

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) {
            return replyRich(ctx, premiumMessage({ heading: 'User Tidak Ditemukan', headingEmoji: '❌' }));
        }

        const current = db.getSaldo(targetUser.id);
        db.addSaldo(targetUser.id, -current);

        await replyRich(ctx, premiumMessage({
            heading: 'Saldo Direset', headingEmoji: '✅',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a>`,
            blockquote: `Dari <b>${current}</b> → <b>0</b>`,
            accent: '💰',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /topbalance — Top 10 saldo tertinggi
    // ═══════════════════════════════════════════════════════════
    bot.command('topbalance', async (ctx) => {
        const users = db.getTargets('user');
        if (!users || users.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Belum Ada User', headingEmoji: '📭',
                accent: '💰',
            }));
        }

        const ranked = users
            .map(id => ({ id, saldo: db.getSaldo(id) }))
            .filter(u => u.saldo > 0)
            .sort((a, b) => b.saldo - a.saldo)
            .slice(0, 10);

        if (ranked.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Belum Ada Saldo', headingEmoji: '📭',
                body: 'Semua user punya saldo 0.',
                accent: '💰',
            }));
        }

        let html = `<h1>🏆 Top 10 Saldo</h1>`;
        html += `<table bordered striped><tr><th>#</th><th>User ID</th><th>Saldo</th></tr>`;
        ranked.forEach((u, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            html += `<tr><td>${medal}</td><td><code>${u.id}</code></td><td>💰 ${u.saldo.toLocaleString('id-ID')}</td></tr>`;
        });
        html += `</table>`;

        await replyRich(ctx, html);
    });

    // ═══════════════════════════════════════════════════════════
    // /topplayers — Top 10 winrate game
    // ═══════════════════════════════════════════════════════════
    bot.command('topplayers', async (ctx) => {
        const users = db.getTargets('user');
        if (!users || users.length === 0) {
            return replyRich(ctx, premiumMessage({ heading: 'Belum Ada User', headingEmoji: '📭', accent: '🎮' }));
        }

        const ranked = users
            .map(id => {
                const s = db.getScore(id) || { wins: 0, losses: 0 };
                const total = s.wins + s.losses;
                return {
                    id,
                    wins: s.wins,
                    losses: s.losses,
                    total,
                    winrate: total > 0 ? (s.wins / total) * 100 : 0,
                };
            })
            .filter(u => u.total >= 3)
            .sort((a, b) => b.winrate - a.winrate)
            .slice(0, 10);

        if (ranked.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Belum Ada Player', headingEmoji: '📭',
                body: 'Belum ada user dengan minimal 3 game.',
                accent: '🎮',
            }));
        }

        let html = `<h1>🏆 Top 10 Players</h1>`;
        html += `<p>Minimal 3 game dimainkan</p>`;
        html += `<table bordered striped><tr><th>#</th><th>User ID</th><th>Winrate</th><th>W/L</th></tr>`;
        ranked.forEach((u, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            html += `<tr><td>${medal}</td><td><code>${u.id}</code></td><td>${u.winrate.toFixed(1)}%</td><td>${u.wins}/${u.losses}</td></tr>`;
        });
        html += `</table>`;

        await replyRich(ctx, html);
    });

    // ═══════════════════════════════════════════════════════════
    // /gencode — Generate kode redeem + broadcast ke semua user
    // ═══════════════════════════════════════════════════════════
    bot.command('gencode', async (ctx) => {
        if (!isOwner(ctx)) return;

        const args = ctx.message.text.split(' ');
        const saldo = parseInt(args[1]);
        const maxUses = parseInt(args[2]) || 1;

        if (isNaN(saldo) || saldo <= 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Gunakan:',
                pre: '/gencode <saldo> [max_uses]',
                listItems: [
                    '📌 Contoh: <code>/gencode 10000 5</code>',
                    '📌 Artinya: kode dengan 10.000 saldo, bisa dipakai 5x',
                ],
                accent: '🔐',
            }));
        }

        // Generate kode
        const code = 'ROSE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        db.createCode(code, saldo, maxUses, ctx.from.id);

        // 1. Balas ke owner
        await replyRich(ctx, premiumMessage({
            heading: 'Kode Dibuat!', headingEmoji: '🎁',
            body: 'Kode redeem berhasil dibuat.',
            blockquote: `<code>${code}</code>`,
            listItems: [
                `💰 Saldo per claim: <b>${saldo.toLocaleString('id-ID')}</b>`,
                `🔢 Max uses: <b>${maxUses}</b>`,
                `📅 Dibuat: ${new Date().toLocaleString('id-ID')}`,
            ],
            footer: 'User claim via /claim <kode>',
            accent: '🔐',
        }));

        // 2. Broadcast ke semua user
        const allUsers = db.getTargets('user');
        if (!allUsers || allUsers.length === 0) {
            return;
        }

        const broadcastMsg = `
🎉 <b>KODE REDEEM BARU!</b> 🎉

Owner baru saja membagikan kode redeem!
Klaim sekarang untuk mendapatkan saldo gratis.

💰 Saldo: <b>${saldo.toLocaleString('id-ID')}</b>
🔑 Kode: <code>${code}</code>

<blockquote>📌 <b>Cara klaim:</b>\nKetik: <code>/claim ${code}</code></blockquote>
`;

        const progressMsg = await ctx.reply(`⏳ Mengirim notifikasi ke ${allUsers.length} user...`);

        let success = 0;
        let failed = 0;

        for (const userId of allUsers) {
            try {
                await bot.telegram.sendMessage(userId, broadcastMsg, { parse_mode: 'HTML' });
                success++;
            } catch (e) {
                failed++;
            }
            await new Promise(r => setTimeout(r, 50));
        }

        try {
            await ctx.telegram.editMessageText(ctx.chat.id, progressMsg.message_id, null,
                `✅ <b>Broadcast Kode Selesai!</b>\n\n` +
                `🟢 Berhasil: <b>${success}</b>\n` +
                `🔴 Gagal (diblokir): <b>${failed}</b>\n` +
                `📊 Total target: <b>${allUsers.length}</b>`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    });

    // ═══════════════════════════════════════════════════════════
    // /listcodes — Daftar kode aktif
    // ═══════════════════════════════════════════════════════════
    bot.command('listcodes', async (ctx) => {
        if (!isOwner(ctx)) return;

        const codes = db.listCodes();

        if (codes.length === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Belum Ada Kode', headingEmoji: '📭',
                body: 'Belum ada kode redeem aktif.',
                accent: '🔐',
                buttons: [
                    { text: '🎁 Buat Kode', callback: 'code_help_gen', color: 'success' },
                ],
            }));
        }

        let html = `<h1>📋 Daftar Kode Aktif</h1>`;
        html += `<p>Total: <b>${codes.length}</b> kode</p>`;
        html += `<table bordered striped><tr><th>Kode</th><th>Saldo</th><th>Uses</th><th>Status</th></tr>`;
        codes.forEach(c => {
            const isFull = c.uses >= c.max_uses;
            const status = isFull ? '🔴 Habis' : '🟢 Aktif';
            html += `<tr><td><code>${c.code}</code></td><td>💰 ${c.saldo.toLocaleString('id-ID')}</td><td>${c.uses}/${c.max_uses}</td><td>${status}</td></tr>`;
        });
        html += `</table>`;
        html += `<blockquote>💡 Hapus kode: <code>/delcode &lt;kode&gt;</code></blockquote>`;

        await replyRich(ctx, html);
    });

    bot.action('code_help_gen', async (ctx) => {
        await ctx.answerCbQuery();
        await replyRich(ctx, premiumMessage({
            heading: 'Cara Buat Kode', headingEmoji: '🎁',
            body: 'Gunakan format:',
            pre: '/gencode <saldo> [max_uses]',
            listItems: [
                '📌 <code>/gencode 10000</code> — 10.000 saldo, 1x pakai',
                '📌 <code>/gencode 5000 10</code> — 5.000 saldo, 10x pakai',
            ],
            accent: '🔐',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /delcode — Hapus kode
    // ═══════════════════════════════════════════════════════════
    bot.command('delcode', async (ctx) => {
        if (!isOwner(ctx)) return;

        const code = ctx.message.text.split(' ')[1];
        if (!code) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/delcode <kode>',
                accent: '🗑️',
            }));
        }

        db.delCode(code);

        await replyRich(ctx, premiumMessage({
            heading: 'Kode Dihapus', headingEmoji: '🗑️',
            body: `Kode <code>${escapeHtml(code)}</code> telah dihapus.`,
            footer: 'Kode tidak bisa dipakai lagi.',
            accent: '✅',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /claiminfo — Info code usage (bonus)
    // ═══════════════════════════════════════════════════════════
    bot.command('claiminfo', async (ctx) => {
        if (!isOwner(ctx)) return;

        const code = ctx.message.text.split(' ')[1];
        if (!code) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/claiminfo <kode>',
                accent: '📊',
            }));
        }

        const data = db.getCode(code);
        if (!data) {
            return replyRich(ctx, premiumMessage({
                heading: 'Kode Tidak Ditemukan', headingEmoji: '❌',
                body: `Kode <code>${escapeHtml(code)}</code> tidak ada.`,
                accent: '⚠️',
            }));
        }

        const remaining = data.max_uses - data.uses;
        const status = remaining > 0 ? '🟢 Aktif' : '🔴 Habis';

        await replyRich(ctx, premiumMessage({
            heading: 'Info Kode', headingEmoji: '📊',
            blockquote: `<code>${escapeHtml(code)}</code>`,
            pre:
`Saldo per claim : ${data.saldo.toLocaleString('id-ID')}
Digunakan       : ${data.uses}/${data.max_uses}
Sisa            : ${remaining}
Status          : ${status}`,
            accent: '🔐',
        }));
    });
}

module.exports = { registerOwnerSaldoHandler };