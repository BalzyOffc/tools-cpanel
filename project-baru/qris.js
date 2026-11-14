// ═══════════════════════════════════════════════════════════════
// 📄 helpers/qris.js
// Helper untuk generate & kirim QRIS
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const { premiumMessage, sendRichMessage } = require('./rich-message');
const { escapeHtml } = require('./html');
const { pendingQris, pendingQrisSessions } = require('../state/maps');

// Path gambar QRIS profil (statis)
const PATH_QRIS_PROFIL = path.join(__dirname, '..', 'qris_profil.png');

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI BUATQRIS (edit di config.js)
// ═══════════════════════════════════════════════════════════════
const BUATQRIS_CONFIG = {
    account_id: config.BUATQRIS_ACCOUNT_ID || 'ACCOUNT_ID_LU',
    secret_token: config.BUATQRIS_SECRET || 'SCRET_TOKEN',
    baseUrl: 'https://api.buatqris.site',
};

// ═══════════════════════════════════════════════════════════════
// KIRIM QRIS KE USER + TOMBOL
// ═══════════════════════════════════════════════════════════════
async function sendQrisToUser(ctx, qrisResult, nominal, description, qrisString) {
    const sessionId = crypto.randomBytes(4).toString('hex');

    pendingQris.set(sessionId, {
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        nominal,
        description,
        qrisString,
        createdAt: Date.now(),
    });

    // Auto-cleanup 10 menit
    setTimeout(() => {
        if (pendingQris.has(sessionId)) pendingQris.delete(sessionId);
    }, 10 * 60 * 1000);

    const base64Data = qrisResult.code.replace(/^data:image\/\w+;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    const caption = `
💳 <b>QRIS Pembayaran</b>
━━━━━━━━━━━━━━━━━━
<b>Nominal</b> : Rp ${nominal.toLocaleString('id-ID')}
<b>Pesan</b>   : ${escapeHtml(description)}
━━━━━━━━━━━━━━━━━━
Silakan scan QR di bawah. Nominal sudah otomatis terisi.
`;

    await ctx.replyWithPhoto(
        { source: qrBuffer, filename: 'qris.png' },
        {
            caption,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Ganti Nominal', callback_data: `qris_change_${sessionId}` },
                        { text: '❌ Batalkan', callback_data: `qris_cancel_${sessionId}` },
                    ],
                    [
                        { text: '📤 Kirim Bukti Transfer', callback_data: `qris_bukti_${sessionId}` },
                    ],
                ],
            },
        }
    );
}

// ═══════════════════════════════════════════════════════════════
// GENERATE QRIS DARI GAMBAR PROFIL (qris_profil.png)
// ═══════════════════════════════════════════════════════════════
async function generateFromProfileImage(ctx, nominal, description) {
    const fs = require('fs');
    if (!fs.existsSync(PATH_QRIS_PROFIL)) {
        throw new Error('File qris_profil.png tidak ditemukan di folder bot.');
    }

    const { GenerateQris, ScannerQR } = require('@fhylabs/qris-dynamic');

    const qrisString = await ScannerQR.scan(PATH_QRIS_PROFIL);
    const result = await GenerateQris({
        qris: qrisString,
        amount: nominal,
        type: 'base64',
    });

    await sendQrisToUser(ctx, result, nominal, description, qrisString);
}

// ═══════════════════════════════════════════════════════════════
// GENERATE QRIS VIA API BUATQRIS (fallback)
// ═══════════════════════════════════════════════════════════════
async function generateViaBuatQris(ctx, nominal, textPesan) {
    const hiddenDescription = `TG_${ctx.from.id} | ${textPesan}`;

    const form = new FormData();
    form.append('action', 'api_create_qris');
    form.append('account_id', BUATQRIS_CONFIG.account_id);
    form.append('secret_token', BUATQRIS_CONFIG.secret_token);
    form.append('amount', nominal.toString());
    form.append('description', hiddenDescription);
    form.append('fee_by', 'user');

    const res = await axios.post(BUATQRIS_CONFIG.baseUrl, form, {
        headers: form.getHeaders(),
        timeout: 15000,
    });

    const data = res.data;
    if (!data.success || !data.data) {
        throw new Error(data.message || 'Gagal membuat QRIS.');
    }

    const trx = data.data;
    const sessionId = crypto.randomBytes(4).toString('hex');

    pendingQrisSessions.set(sessionId, {
        userId: ctx.from.id,
        nominal,
        textPesan,
        trxId: trx.transaction_id,
    });

    setTimeout(() => { pendingQrisSessions.delete(sessionId); }, 15 * 60 * 1000);

    const caption = `
💳 <b>QRIS Pembayaran</b>
━━━━━━━━━━━━━━━━━━
<b>ID Transaksi</b> : <code>${trx.transaction_id}</code>
<b>Nominal Asli</b> : Rp ${trx.amount.toLocaleString('id-ID')}
<b>Kode Unik</b>    : Rp ${trx.amount_uniq.toLocaleString('id-ID')}
<b>Total Bayar</b>  : <b>Rp ${trx.total_amount.toLocaleString('id-ID')}</b>
━━━━━━━━━━━━━━━━━━
Pembayaran akan <b>otomatis terverifikasi</b> oleh sistem.
`;

    await ctx.replyWithPhoto(
        { url: trx.qr_url },
        {
            caption,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔗 Buka Halaman Bayar', url: trx.payment_url }],
                    [
                        { text: '🔄 Ganti Nominal', callback_data: `qris_change_${sessionId}` },
                        { text: '❌ Batalkan', callback_data: `qris_cancel_${sessionId}` },
                    ],
                ],
            },
        }
    );
}

module.exports = {
    PATH_QRIS_PROFIL,
    BUATQRIS_CONFIG,
    sendQrisToUser,
    generateFromProfileImage,
    generateViaBuatQris,
};