const { replyHtml, editHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');
const db = require('../services/database');

// Tempat menyimpan status user yang sedang mengatur grup
const pendingSettings = new Map();

// ── 1. Fungsi Ambil Daftar Grup (Simulasi dari DB) ──
// Kamu harus menyesuaikan ini dengan struktur database-mu.
// Asumsi: db.getTargets('group') mengembalikan array ID grup.
async function getUserAdminGroups(ctx) {
    const groups = [];
    try {
        const allGroups = db.getTargets('group') || []; // Ambil semua ID grup dari DB

        for (const groupId of allGroups) {
            try {
                // Cek apakah user adalah admin di grup ini
                const member = await ctx.telegram.getChatMember(groupId, ctx.from.id);
                if (['administrator', 'creator'].includes(member.status)) {
                    // Cek apakah bot juga admin di grup tersebut
                    const botMember = await ctx.telegram.getChatMember(groupId, ctx.botInfo.id);
                    if (['administrator', 'creator'].includes(botMember.status)) {
                        const chatInfo = await ctx.telegram.getChat(groupId);
                        groups.push({ id: groupId, title: chatInfo.title || 'Tanpa Nama' });
                    }
                }
            } catch (e) {
                // Abaikan jika bot sudah dikeluarkan dari grup atau error
            }
        }
    } catch (e) {
        console.error('Error getUserAdminGroups:', e);
    }
    return groups;
}

// ── 2. Tampilan Panel Pengaturan Grup ──
function renderSettingsPanel(groupId, title) {
    const html = `<b>⚙️ Pengaturan Grup</b>
Grup: <b>${escapeHtml(title)}</b>
ID: <code>${groupId}</code>

Pilih pengaturan yang ingin diubah:`;

    const keyboard = [
        [{ text: '🛡️ Anti-Link', callback_data: `set_antilink_${groupId}`, style: 'primary' }],
        [{ text: '🤬 Anti-Toxic', callback_data: `set_antitoxic_${groupId}`, style: 'primary' }],
        [{ text: '👋 Pesan Welcome', callback_data: `set_welcome_${groupId}`, style: 'success' }],
        [{ text: '👋 Pesan Goodbye', callback_data: `set_goodbye_${groupId}`, style: 'danger' }],
        [{ text: '❌ Tutup', callback_data: `set_close`, style: 'danger' }]
    ];

    return { html, keyboard };
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR HANDLER
// ═══════════════════════════════════════════════════════════════
function registerSettingsHandler(bot) {
    // 1. Command /settings (Hanya di PV)
    bot.command(['settings', 'setgrup'], async (ctx) => {
        if (ctx.chat.type !== 'private') {
            return ctx.reply('❌ Fitur ini hanya bisa digunakan di Private Chat (PV).');
        }

        const waitMsg = await ctx.reply('🔍 Mencari grup yang kamu kelola...');
        
        // Ambil daftar grup
        const groups = await getUserAdminGroups(ctx);

        if (groups.length === 0) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}
            return ctx.reply('❌ Kamu tidak terdaftar sebagai Admin di grup mana pun yang menggunakan bot ini, atau bot belum menjadi Admin di grup tersebut.');
        }

        try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}

        // Jika cuma 1 grup, langsung buka panelnya
        if (groups.length === 1) {
            pendingSettings.set(ctx.from.id, { id: groups[0].id, title: groups[0].title });
            const { html, keyboard } = renderSettingsPanel(groups[0].id, groups[0].title);
            return replyHtml(ctx, html, keyboard);
        }

        // Jika lebih dari 1 grup, tampilkan tombol pilihan
        const keyboard = groups.map(g => [
            { text: `📢 ${g.title}`, callback_data: `set_select_${g.id}`, style: 'primary' }
        ]);

        const html = `<b>⚙️ Pilih Grup</b>
Kamu adalah admin di beberapa grup. Silakan pilih grup yang ingin diatur:`;
        
        await replyHtml(ctx, html, keyboard);
    });

    // 2. Callback Pilih Grup
    bot.action(/^set_select_(-?\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const groupId = parseInt(ctx.match[1]);
        
        try {
            const chatInfo = await ctx.telegram.getChat(groupId);
            const title = chatInfo.title || 'Tanpa Nama';
            
            pendingSettings.set(ctx.from.id, { id: groupId, title });
            
            const { html, keyboard } = renderSettingsPanel(groupId, title);
            await editHtml(ctx, html, keyboard);
        } catch (e) {
            await ctx.answerCbQuery('❌ Gagal memuat data grup.', { show_alert: true });
        }
    });

    // 3. Callback Tutup Panel
    bot.action('set_close', async (ctx) => {
        await ctx.answerCbQuery('Panel ditutup');
        pendingSettings.delete(ctx.from.id);
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    // (Opsional) Contoh Callback jika admin mengklik salah satu pengaturan
    bot.action(/^set_antilink_(-?\d+)$/, async (ctx) => {
        const groupId = ctx.match[1];
        await ctx.answerCbQuery('Fitur Anti-Link (belum diimplementasikan)', { show_alert: true });
        // Di sini kamu bisa tambahkan logika untuk mengubah setting di database
    });
}

module.exports = { registerSettingsHandler };