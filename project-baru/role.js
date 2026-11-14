// handlers/role.js
const config = require('../config');
const db = require('../services/database');
const { ROLE_LEVELS, ROLE_META } = require('../core/constants');
const { getUserRole, setUserRole, removeUserRole, listUsersByRole, formatRoleDuration } = require('../helpers/role');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { resolveUser } = require('../helpers/user');

function registerRoleHandler(bot) {
    // /setrole
    bot.command('setrole', async (ctx) => {
        const adminRole = ctx.state.userRole || 'user';
        const adminLevel = ctx.state.roleLevel || 0;
        if (adminLevel < ROLE_LEVELS.pt) {
            return replyRich(ctx, premiumMessage({ heading: 'Akses Ditolak', headingEmoji: '🚫', body: 'Hanya Owner & PT.', accent: '🔒' }));
        }

        const args = ctx.message.text.split(' ').slice(1);
        const targetArg = args[0];
        const roleArg = args[1]?.toLowerCase();
        const durationArg = args[2];
        const reasonArg = args.slice(3).join(' ') || null;

        if (!targetArg || !roleArg) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Set Role', headingEmoji: '🎭',
                body: 'Format: /setrole <user> <role> [durasi] [alasan]',
                listItems: [
                    '🎭 Role: owner, pt, reseller, vip, user',
                    '⏱️ Durasi: 7d, 30d, 1h (kosong = permanent)',
                ],
                blockquote: `Contoh:\n<code>/setrole @user vip 30d Pembelian</code>`,
                accent: '🎭',
            }));
        }

        if (!['owner', 'pt', 'reseller', 'vip', 'user'].includes(roleArg)) {
            return replyRich(ctx, premiumMessage({ heading: 'Role Tidak Valid', headingEmoji: '❌', body: `Role <code>${escapeHtml(roleArg)}</code> tidak dikenal.` }));
        }

        if ((roleArg === 'owner' || roleArg === 'pt') && adminRole !== 'owner') {
            return replyRich(ctx, premiumMessage({ heading: 'Akses Ditolak', headingEmoji: '🚫', body: `Hanya Owner yang bisa set role <b>${roleArg}</b>.` }));
        }

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) return;

        let durationDays = null;
        if (durationArg) {
            const m = durationArg.match(/^(\d+)([dhm])$/i);
            if (m) {
                const n = parseInt(m[1]);
                const unit = m[2].toLowerCase();
                if (unit === 'd') durationDays = n;
                else if (unit === 'h') durationDays = n / 24;
                else if (unit === 'm') durationDays = n / (24 * 60);
            }
        }

        const result = await setUserRole(targetUser.id, roleArg, {
            username: targetUser.username,
            firstName: targetUser.first_name,
            durationDays,
            addedBy: ctx.from.id,
            reason: reasonArg,
        });

        if (!result.success) {
            return replyRich(ctx, premiumMessage({ heading: 'Gagal Set Role', headingEmoji: '❌', body: `<code>${escapeHtml(result.error)}</code>` }));
        }

        const meta = ROLE_META[roleArg];
        const durationText = result.doc.expiredAt
            ? `⏱️ Durasi: <b>${formatRoleDuration(result.doc.expiredAt)}</b>`
            : '♾️ Permanent';

        try {
            await require('../core/bot-instance').bot.telegram.sendMessage(targetUser.id,
                `${meta.emoji} <b>Role Kamu Berubah!</b>\n\nRole baru: <b>${meta.label}</b>\n${durationText}`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}

        await replyRich(ctx, premiumMessage({
            heading: 'Role Berhasil Diatur', headingEmoji: '✅',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a> sekarang:`,
            blockquote: `${meta.emoji} <b>${meta.label}</b>\n\n${durationText}`,
            accent: '🎭',
        }));
    });

    // /myrole
    bot.command(['myrole', 'role', 'myrank'], async (ctx) => {
        const targetUser = ctx.message.reply_to_message?.from || ctx.from;
        const roleData = await getUserRole(targetUser.id);
        const meta = ROLE_META[roleData.role];
        const durationText = roleData.expiredAt
            ? `⏱️ <b>${formatRoleDuration(roleData.expiredAt)}</b>`
            : '♾️ Permanent';

        await replyRich(ctx, premiumMessage({
            heading: 'Informasi Role', headingEmoji: meta.emoji,
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a>`,
            pre: `Role     : ${meta.emoji} ${meta.label}\nLevel    : ${ROLE_LEVELS[roleData.role]}/100\nDurasi   : ${durationText}`,
            accent: meta.emoji,
            buttons: [{ text: '📋 Daftar Role', callback: 'role_list', color: 'primary' }],
        }));
    });

    // /listrole
    bot.command('listrole', async (ctx) => {
        if ((ctx.state.roleLevel || 0) < ROLE_LEVELS.pt) return;
        const roleFilter = ctx.message.text.split(' ')[1]?.toLowerCase();
        const rolesToShow = roleFilter && ROLE_META[roleFilter]
            ? [roleFilter]
            : ['owner', 'pt', 'reseller', 'vip'];

        let html = `<h1>🎭 Daftar Role User</h1>`;
        let totalCount = 0;
        for (const role of rolesToShow) {
            const users = await listUsersByRole(role);
            if (users.length === 0) continue;
            totalCount += users.length;
            const meta = ROLE_META[role];
            html += `<h2>${meta.emoji} ${meta.label} (${users.length})</h2>`;
            html += `<table bordered striped><tr><th>No</th><th>Nama</th><th>User ID</th><th>Durasi</th></tr>`;
            users.slice(0, 20).forEach((u, i) => {
                html += `<tr><td>${i + 1}</td><td>${escapeHtml(u.firstName || u.username || 'User')}</td><td><code>${u.userId}</code></td><td>${formatRoleDuration(u.expiredAt)}</td></tr>`;
            });
            html += `</table>`;
        }
        if (totalCount === 0) {
            return replyRich(ctx, premiumMessage({ heading: 'Belum Ada Data', headingEmoji: '📭' }));
        }
        html += `<footer>Total: <b>${totalCount}</b></footer>`;
        await replyRich(ctx, html);
    });

    // /delrole
    bot.command(['delrole', 'removerole'], async (ctx) => {
        const adminRole = ctx.state.userRole || 'user';
        const adminLevel = ctx.state.roleLevel || 0;
        if (adminLevel < ROLE_LEVELS.pt) return;

        const targetArg = ctx.message.text.split(' ').slice(1)[0];
        if (!targetArg) return;

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) return;

        const targetRole = await getUserRole(targetUser.id);
        if (ROLE_LEVELS[targetRole.role] >= adminLevel && adminRole !== 'owner') {
            return replyRich(ctx, premiumMessage({ heading: 'Tidak Bisa', headingEmoji: '🚫' }));
        }

        const result = await removeUserRole(targetUser.id);
        if (!result.success) {
            return replyRich(ctx, premiumMessage({ heading: 'Gagal', headingEmoji: '❌', body: result.error }));
        }
        try {
            await require('../core/bot-instance').bot.telegram.sendMessage(targetUser.id,
                `👤 <b>Role Kamu Dihapus</b>\n\nRole sekarang: <b>User</b>`, { parse_mode: 'HTML' }
            );
        } catch (e) {}

        await replyRich(ctx, premiumMessage({
            heading: 'Role Dihapus', headingEmoji: '🗑️',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a> sekarang User.`,
        }));
    });

    // /extends
    bot.command('extends', async (ctx) => {
        if ((ctx.state.roleLevel || 0) < ROLE_LEVELS.pt) return;
        const args = ctx.message.text.split(' ').slice(1);
        const targetArg = args[0];
        const durationArg = args[1];
        if (!targetArg || !durationArg) return;

        const m = durationArg.match(/^(\d+)([dhm])$/i);
        if (!m) return;

        const n = parseInt(m[1]);
        const unit = m[2].toLowerCase();
        const ms = n * (unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000);

        const targetUser = await resolveUser(ctx, targetArg);
        if (!targetUser) return;

        const roleData = await getUserRole(targetUser.id, true);
        const currentExpiry = roleData.expiredAt ? new Date(roleData.expiredAt) : new Date();
        const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()) + ms);

        const result = await setUserRole(targetUser.id, roleData.role, {
            expiredAt: newExpiry,
            firstName: targetUser.first_name,
        });
        if (!result.success) return;

        await replyRich(ctx, premiumMessage({
            heading: 'Role Diperpanjang', headingEmoji: '⏱️',
            body: `<a href="tg://user?id=${targetUser.id}">${escapeHtml(targetUser.first_name)}</a>`,
            listItems: [
                `Role: ${ROLE_META[roleData.role].emoji} ${ROLE_META[roleData.role].label}`,
                `Ditambah: <b>+${durationArg}</b>`,
                `Expired: <b>${newExpiry.toLocaleString('id-ID')}</b>`,
            ],
            accent: '✅',
        }));
    });

    // Callback role_list
    bot.action('role_list', async (ctx) => {
        await ctx.answerCbQuery();
        await replyRich(ctx, `
<h1>🎭 Daftar Role Bot</h1>
<table bordered striped>
  <tr><th>Level</th><th>Role</th><th>Akses</th></tr>
  <tr><td>100</td><td>👑 Owner</td><td>Full akses</td></tr>
  <tr><td>80</td><td>💎 PT</td><td>Set role, backup, fitur premium</td></tr>
  <tr><td>60</td><td>🏪 Reseller</td><td>Clone bot, fitur premium</td></tr>
  <tr><td>40</td><td>⭐ VIP</td><td>Fitur premium tanpa limit</td></tr>
  <tr><td>10</td><td>👤 User</td><td>Akses standar</td></tr>
</table>
`);
    });
}

module.exports = { registerRoleHandler };