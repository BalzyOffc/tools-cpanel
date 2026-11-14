// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-gfilter.js
// /gfilter /gfilterlist /gfilterdel — Global auto-reply filter
// Berbeda dari /filter (per-grup): global filter berlaku di SEMUA chat
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { globalFilters } = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════
function isOwner(ctx) {
    return ctx.from?.id === config.OWNER_ID;
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerOwnerGfilterHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /gfilter — Tambah / edit global filter
    // ═══════════════════════════════════════════════════════════
    bot.command('gfilter', async (ctx) => {
        if (!isOwner(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Khusus Owner.',
                accent: '🔒',
            }));
        }

        const args = ctx.message.text.split(' ').slice(1);
        const trigger = args[0]?.toLowerCase();
        const response = args.slice(1).join(' ');

        if (!trigger) {
            return replyRich(ctx, premiumMessage({
                heading: 'Global Filter', headingEmoji: '🔧',
                body: 'Atur auto-reply yang berlaku di SEMUA chat.',
                pre: '/gfilter <trigger> <respon>',
                listItems: [
                    '📌 Contoh: <code>/gfilter promo Promo bulan ini: diskon 50%!</code>',
                    '📌 Trigger tidak case-sensitive (huruf besar/kecil sama)',
                    '📌 Bisa pakai HTML: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;code&gt;</code>, dll',
                    '📌 Pakai <code>/gfilterlist</code> untuk lihat semua',
                    '📌 Pakai <code>/gfilterdel &lt;trigger&gt;</code> untuk hapus',
                ],
                blockquote: '⚠️ Global filter aktif di PV & semua grup.\nHindari trigger yang terlalu umum (misal "halo", "apa").',
                accent: '🌐',
            }));
        }

        if (!response) {
            return replyRich(ctx, premiumMessage({
                heading: 'Respon Kosong', headingEmoji: '❌',
                body: `Trigger: <code>${escapeHtml(trigger)}</code>`,
                pre: '/gfilter <trigger> <respon>',
                footer: 'Respon tidak boleh kosong.',
                accent: '⚠️',
            }));
        }

        // Cek apakah trigger sudah ada (update vs new)
        const isUpdate = globalFilters.has(trigger);
        globalFilters.set(trigger, response);

        await replyRich(ctx, premiumMessage({
            heading: isUpdate ? 'Global Filter Diperbarui' : 'Global Filter Ditambah',
            headingEmoji: isUpdate ? '✏️' : '✅',
            body: `Trigger: <code>${escapeHtml(trigger)}</code>`,
            pre: `Respon:\n${escapeHtml(response.substring(0, 200))}${response.length > 200 ? '...' : ''}`,
            listItems: [
                `📊 Total filter global: <b>${globalFilters.size}</b>`,
            ],
            footer: isUpdate
                ? 'Filter lama diganti dengan yang baru.'
                : 'Filter baru aktif di semua chat.',
            accent: isUpdate ? '✏️' : '🌐',
            buttons: [
                { text: '📋 Lihat Semua', callback: 'gfilter_list_btn', color: 'primary' },
                { text: '🗑️ Hapus Ini', callback: `gfilter_del_${trigger}`, color: 'danger' },
            ],
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /gfilterlist — Daftar semua global filter
    // ═══════════════════════════════════════════════════════════
    bot.command('gfilterlist', async (ctx) => {
        if (!isOwner(ctx)) return;

        if (globalFilters.size === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Belum Ada Global Filter', headingEmoji: '📭',
                body: 'Belum ada filter global yang aktif.',
                blockquote: 'Filter grup (/filter) berbeda dengan global filter.\nGlobal filter berlaku di SEMUA chat.',
                accent: '🔧',
                buttons: [
                    { text: '➕ Tambah Filter', callback: 'gfilter_help_add', color: 'success' },
                ],
            }));
        }

        let html = `<h1>🌐 Global Filter</h1>`;
        html += `<p>Total: <b>${globalFilters.size}</b> filter aktif</p>`;
        html += `<table bordered striped>
<tr>
  <th>#</th>
  <th>Trigger</th>
  <th>Respon</th>
</tr>`;

        let i = 1;
        for (const [trigger, response] of globalFilters.entries()) {
            const preview = response.length > 40 ? response.substring(0, 40) + '...' : response;
            html += `<tr>
  <td>${i}</td>
  <td><code>${escapeHtml(trigger)}</code></td>
  <td>${escapeHtml(preview)}</td>
</tr>`;
            i++;
        }
        html += `</table>`;

        html += `<blockquote>📌 Hapus: <code>/gfilterdel &lt;trigger&gt;</code></blockquote>`;

        await replyRich(ctx, html);
    });

    // ═══════════════════════════════════════════════════════════
    // /gfilterdel — Hapus global filter
    // ═══════════════════════════════════════════════════════════
    bot.command(['gfilterdel', 'gfilterdelete'], async (ctx) => {
        if (!isOwner(ctx)) return;

        const trigger = ctx.message.text.split(' ')[1]?.toLowerCase();

        if (!trigger) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/gfilterdel <trigger>',
                listItems: [
                    '📌 Contoh: <code>/gfilterdel promo</code>',
                    '📌 Pakai <code>/gfilterlist</code> untuk lihat semua trigger',
                ],
                accent: '🗑️',
            }));
        }

        if (!globalFilters.has(trigger)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Filter Tidak Ditemukan', headingEmoji: '❌',
                body: `Trigger <code>${escapeHtml(trigger)}</code> tidak ada di global filter.`,
                footer: 'Cek daftar dengan /gfilterlist.',
                accent: '⚠️',
            }));
        }

        globalFilters.delete(trigger);

        await replyRich(ctx, premiumMessage({
            heading: 'Filter Dihapus', headingEmoji: '🗑️',
            body: `Trigger <code>${escapeHtml(trigger)}</code> dihapus dari global filter.`,
            listItems: [
                `📊 Sisa filter aktif: <b>${globalFilters.size}</b>`,
            ],
            accent: '✅',
            buttons: [
                { text: '📋 Lihat Semua', callback: 'gfilter_list_btn', color: 'primary' },
            ],
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /gfilterclear — Hapus SEMUA global filter
    // ═══════════════════════════════════════════════════════════
    bot.command(['gfilterclear', 'gfilterclearall'], async (ctx) => {
        if (!isOwner(ctx)) return;

        if (globalFilters.size === 0) {
            return replyRich(ctx, premiumMessage({
                heading: 'Sudah Kosong', headingEmoji: '📭',
                body: 'Tidak ada filter untuk dihapus.',
                accent: 'ℹ️',
            }));
        }

        const count = globalFilters.size;

        await replyRich(ctx, premiumMessage({
            heading: 'Konfirmasi Hapus Semua', headingEmoji: '⚠️',
            body: `Kamu akan menghapus <b>${count}</b> filter global.`,
            blockquote: 'Ini tidak bisa dibatalkan!\nFilter grup (/filter) TIDAK terpengaruh.',
            footer: 'Yakin?',
            accent: '🚨',
            buttons: [
                { text: '✅ Ya, Hapus Semua', callback: 'gfilter_clear_confirm', color: 'danger' },
                { text: '❌ Batal', callback: 'gfilter_clear_cancel', color: 'success' },
            ],
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK HANDLERS
    // ═══════════════════════════════════════════════════════════

    bot.action('gfilter_list_btn', async (ctx) => {
        await ctx.answerCbQuery();
        if (globalFilters.size === 0) {
            return ctx.reply('📭 Belum ada global filter. Tambah dengan /gfilter.');
        }
        const list = [...globalFilters.keys()].map((k, i) => `${i + 1}. "${k}"`).join('\n');
        await ctx.reply(`🌐 <b>Global Filter (${globalFilters.size})</b>\n\n<pre>${escapeHtml(list)}</pre>`, { parse_mode: 'HTML' });
    });

    bot.action(/^gfilter_del_(.+)$/, async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');
        const trigger = ctx.match[1].toLowerCase();

        if (!globalFilters.has(trigger)) {
            return ctx.answerCbQuery('❌ Filter sudah tidak ada.', { show_alert: true });
        }

        globalFilters.delete(trigger);
        await ctx.answerCbQuery(`🗑️ Filter "${trigger}" dihapus`);
        try { await ctx.deleteMessage(); } catch (e) {}

        await replyRich(ctx, premiumMessage({
            heading: 'Filter Dihapus', headingEmoji: '🗑️',
            body: `Trigger <code>${escapeHtml(trigger)}</code> dihapus.`,
            listItems: [`📊 Sisa: <b>${globalFilters.size}</b>`],
            accent: '✅',
        }));
    });

    bot.action('gfilter_clear_confirm', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only');

        const count = globalFilters.size;
        globalFilters.clear();

        await ctx.answerCbQuery(`🗑️ ${count} filter dihapus`);
        try { await ctx.deleteMessage(); } catch (e) {}

        await replyRich(ctx, premiumMessage({
            heading: 'Semua Filter Dihapus', headingEmoji: '🧹',
            body: `<b>${count}</b> filter global telah dihapus.`,
            listItems: [
                `📊 Filter aktif sekarang: <b>0</b>`,
                `ℹ️ Filter grup (/filter) tidak terpengaruh.`,
            ],
            accent: '✅',
        }));
    });

    bot.action('gfilter_clear_cancel', async (ctx) => {
        await ctx.answerCbQuery('❌ Dibatalkan');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    bot.action('gfilter_help_add', async (ctx) => {
        await ctx.answerCbQuery();
        await replyRich(ctx, premiumMessage({
            heading: 'Cara Tambah Global Filter', headingEmoji: '🔧',
            body: 'Gunakan format:',
            pre: '/gfilter <trigger> <respon>',
            listItems: [
                '📌 <code>/gfilter promo Promo bulan ini diskon 50%!</code>',
                '📌 <code>/gfilter harga Daftar harga: 10rb / 25rb / 50rb</code>',
                '📌 <code>/gfilter admin Hubungi @admin untuk bantuan</code>',
            ],
            blockquote: '💡 Trigger tidak case-sensitive.\nUser mengetik "PROMO" atau "promo" sama-sama trigger.',
            accent: '🌐',
        }));
    });

    // ═══════════════════════════════════════════════════════════
    // /gfilterinfo — Detail satu filter
    // ═══════════════════════════════════════════════════════════
    bot.command(['gfilterinfo', 'gfilterview'], async (ctx) => {
        if (!isOwner(ctx)) return;

        const trigger = ctx.message.text.split(' ')[1]?.toLowerCase();
        if (!trigger) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/gfilterinfo <trigger>',
                accent: '🔍',
            }));
        }

        const response = globalFilters.get(trigger);
        if (!response) {
            return replyRich(ctx, premiumMessage({
                heading: 'Filter Tidak Ada', headingEmoji: '❌',
                body: `Trigger <code>${escapeHtml(trigger)}</code> tidak ditemukan.`,
                accent: '⚠️',
            }));
        }

        await replyRich(ctx, premiumMessage({
            heading: 'Detail Global Filter', headingEmoji: '🔍',
            body: `Trigger: <code>${escapeHtml(trigger)}</code>`,
            pre: escapeHtml(response),
            blockquote: 'Respon dikirim apa adanya (bisa pakai HTML tag).',
            accent: '🌐',
            buttons: [
                { text: '🗑️ Hapus Filter', callback: `gfilter_del_${trigger}`, color: 'danger' },
            ],
        }));
    });
}

module.exports = { registerOwnerGfilterHandler };