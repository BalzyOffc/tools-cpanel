const config = require('../config');
const db = require('../services/database');
const { replyHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');

// ── FUNGSI LOADING RAMPOK ──
async function LoadingRampok(ctx, isSuccess) {
    const endingFrame = isSuccess 
        ? "💰 *Berhasil membawa kabur uang!* 🤑" 
        : "🚨 *Aduh! Polisi berhasil mengepung kita!* 🚔";

    const frames = [
        "🕵️ *Mengendap-endap di kegelapan...*",
        "🔦 *Memeriksa pagar dan jendela target...*",
        "🔓 *Mencoba membuka kunci dengan hati-hati...*",
        "🏃‍♂️ *Berlari menuju brankas...*",
        "💰 *Mengambil uang sebanyak mungkin...*",
        endingFrame
    ];

    const msg = await ctx.reply(`<i>${frames[0]}</i>`, { parse_mode: 'HTML' });

    for (let i = 1; i < frames.length; i++) {
        const delay = (i === frames.length - 1) ? 1500 : 600; // Delay lebih lama di akhir
        await new Promise(res => setTimeout(res, delay));
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `<i>${frames[i]}</i>`, { parse_mode: 'HTML' }).catch(() => {});
    }
    await ctx.deleteMessage(msg.message_id).catch(() => {});
}

function registerRampokHandler(bot) {
    bot.command(['rampok', 'rob'], async (ctx) => {
        const perampokId = String(ctx.from.id);
        const perampokName = ctx.from.first_name;

        let targetId = null;
        let targetName = '';

        // 1. Tentukan Target
        if (ctx.message.reply_to_message) {
            const repliedMsg = ctx.message.reply_to_message;
            if (repliedMsg.from && repliedMsg.from.is_bot) {
                return replyHtml(ctx, `❌ <b>Salah Target!</b>\nKamu me-reply pesan Bot. Silakan reply pesan <b>User</b>.`);
            }
            if (repliedMsg.from) {
                targetId = String(repliedMsg.from.id);
                targetName = repliedMsg.from.first_name;
            }
        } else {
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length > 0 && args[0].startsWith('@')) {
                const username = args[0];
                try {
                    const chatInfo = await ctx.telegram.getChat(username);
                    if (chatInfo.type === 'private') {
                        targetId = String(chatInfo.id);
                        targetName = chatInfo.first_name || username;
                        db.saveUserInfo(targetId, chatInfo.username, targetName);
                    } else {
                        return replyHtml(ctx, `❌ <b>Target Tidak Valid</b>\n<code>${username}</code> bukan user.`);
                    }
                } catch (e) {
                    const targetUser = db.findUserByUsername(username);
                    if (targetUser) {
                        targetId = String(targetUser.id);
                        targetName = targetUser.first_name;
                    } else {
                        return replyHtml(ctx, `❌ <b>User Tidak Ditemukan</b>\nPastikan <code>${username}</code> valid.`);
                    }
                }
            }
        }

        if (!targetId) return replyHtml(ctx, `<b>📌 Format Rampok</b>\n\nReply pesan target, atau ketik:\n<code>/rampok @username</code>`);
        if (targetId === perampokId) return replyHtml(ctx, `❌ Masa kamu mau merampok diri sendiri?`);
        if (targetId === String(ctx.botInfo.id)) return replyHtml(ctx, `❌ Kamu tidak bisa merampok bot!`);

        // 2. Cek Saldo Target
        const rawSaldoTarget = db.getSaldo(targetId);
        const saldoTarget = rawSaldoTarget ? Number(rawSaldoTarget) : 0;

        if (isNaN(saldoTarget) || saldoTarget <= 0) {
            return replyHtml(ctx, `❌ <b>Target Tidak Valid!</b>\n<b>${escapeHtml(targetName)}</b> belum terdaftar di sistem ekonomi bot (Saldo: 0).`);
        }
        if (saldoTarget < 500) {
            return replyHtml(ctx, `❌ <b>Target Terlalu Miskin!</b>\n<b>${escapeHtml(targetName)}</b> hanya punya 💰 ${saldoTarget}. Cari target lain!`);
        }

        // 3. Tentukan Hasil & Jalankan Loading
        const isSuccess = Math.random() < 0.5; 
        await LoadingRampok(ctx, isSuccess);

        // 4. Tampilkan Hasil
        if (isSuccess) {
            const percentage = (Math.random() * 15 + 5) / 100;
            const stolenAmount = Math.floor(saldoTarget * percentage);

            db.addSaldo(targetId, -stolenAmount);
            db.addSaldo(perampokId, stolenAmount);

            await replyHtml(ctx, `<b>💰 PERAMPOKAN SUKSES!</b>

Perampok : <b>${escapeHtml(perampokName)}</b>
Target   : <b>${escapeHtml(targetName)}</b>

Kamu berhasil menggasak <b>${(percentage * 100).toFixed(1)}%</b> dari saldo target.
💸 Hasil curian: <b>💰 ${stolenAmount}</b>

<i>Jangan tertangkap polisi ya! 🏃‍♂️💨</i>`);

        } else {
            const denda = 500; 
            await replyHtml(ctx, `<b>🚨 PERAMPOKAN GAGAL!</b>

Perampok : <b>${escapeHtml(perampokName)}</b>
Target   : <b>${escapeHtml(targetName)}</b>

Aksi kamu berakhir tragis! Kamu hampir tertangkap polisi.
Kamu harus membayar denda <b>💰 ${denda}</b> atau mencoba <b>kabur</b>!

<i>Yah nt bos ketangkep kita 😭🚓</i>`, [
                [
                    { text: '🏃‍♂️ Kabur!', callback_data: `kabur_${perampokId}_${denda}`, style: 'primary' },
                    { text: '💸 Bayar Denda', callback_data: `bayar_${perampokId}_${denda}`, style: 'danger' }
                ]
            ]);
        }
    });

    // ── HANDLER TOMBOL KABUR ──
    bot.action(/^kabur_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const perampokId = ctx.match[1];
        const denda = parseInt(ctx.match[2]);
        
        if (String(ctx.from.id) !== perampokId) return ctx.answerCbQuery('❌ Ini bukan aksimu!', { show_alert: true });

        const isKaburSukses = Math.random() < 0.6; 

        if (isKaburSukses) {
            await ctx.editMessageText(`🏃‍♂️ <b>Kamu berhasil kabur!</b>\nPolisi kehilangan jejakmu. Bebas denda!`, { parse_mode: 'HTML' });
        } else {
            const saldo = Number(db.getSaldo(perampokId)) || 0;
            const dendaAkhir = Math.min(saldo, denda);
            db.addSaldo(perampokId, -dendaAkhir);
            await ctx.editMessageText(`🚓 <b>KABUR GAGAL!</b>\nPolisi berhasil meringkusmu. Kamu didenda <b>💰 ${dendaAkhir}</b>.`, { parse_mode: 'HTML' });
        }
    });

    // ── HANDLER TOMBOL BAYAR DENDA ──
    bot.action(/^bayar_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const perampokId = ctx.match[1];
        const denda = parseInt(ctx.match[2]);
        
        if (String(ctx.from.id) !== perampokId) return ctx.answerCbQuery('❌ Ini bukan aksimu!', { show_alert: true });

        const saldo = Number(db.getSaldo(perampokId)) || 0;
        const dendaAkhir = Math.min(saldo, denda);
        db.addSaldo(perampokId, -dendaAkhir);
        
        await ctx.editMessageText(`💸 <b>Denda Dibayar</b>\nKamu membayar denda sebesar <b>💰 ${dendaAkhir}</b> dengan lapang dada.`, { parse_mode: 'HTML' });
    });
}

module.exports = { registerRampokHandler };