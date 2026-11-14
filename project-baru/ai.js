// ═══════════════════════════════════════════════════════════════
// 📄 handlers/ai.js
// /ai /gpt — Tanya AI (Gemini)
// /aigambar /imagine — Generate gambar AI
// /cekcode — Cek sintaks JavaScript
// /fixcode — Perbaiki kode via AI
// ═══════════════════════════════════════════════════════════════
const vm = require('vm');
const axios = require('axios');
const config = require('../config');
const { replyRich, premiumMessage, editRichMessage, replyRichPhoto } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');

const TOOLS_THUMB = config.thumbnailUrl || 'https://i.ibb.co/3sXqY2Z/telegram-bot.jpg';
const MAX_CODE_LEN = 5000;
const MAX_AI_LEN = 3500;

// ═══════════════════════════════════════════════════════════════
// HELPER: ambil kode dari context (reply file / reply text / args)
// ═══════════════════════════════════════════════════════════════
async function getCodeFromContext(ctx) {
    const replied = ctx.message.reply_to_message;
    const args = ctx.message.text.split(' ').slice(1).join(' ');

    // 1. Reply file .js / .txt
    if (replied && replied.document) {
        const fname = replied.document.file_name || '';
        if (!fname.endsWith('.js') && !fname.endsWith('.txt')) {
            throw new Error('File harus .js atau .txt');
        }

        const fileLink = await ctx.telegram.getFileLink(replied.document.file_id);
        const response = await fetch(fileLink.href);
        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer.toString('utf8');
    }

    // 2. Reply teks pesan
    if (replied && replied.text) {
        return replied.text;
    }

    // 3. Teks diketik langsung
    if (args) {
        return args;
    }

    throw new Error('Reply file .js/.txt, reply teks kode, atau ketik kode setelah command.');
}

// ═══════════════════════════════════════════════════════════════
// HELPER: bersihkan format markdown AI
// ═══════════════════════════════════════════════════════════════
function cleanAiMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`{3}[\s\S]*?`{3}/g, (match) => {
            return match.replace(/`{3}(javascript|js|json|html)?/g, '').replace(/`{3}/g, '');
        })
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/#{1,6}\s/g, '')
        .replace(/\n{3,}/g, '\n\n');
}

// ═══════════════════════════════════════════════════════════════
// HELPER: kirim hasil gambar dari API
// ═══════════════════════════════════════════════════════════════
async function sendApiImage(ctx, endpoint, queryParams, title) {
    try { await ctx.deleteMessage(); } catch (e) {}

    const loadingMsg = await replyRich(ctx, `<h1>⏳ Memproses Gambar...</h1><p>Membuat <b>${escapeHtml(title)}</b>...</p>`);

    try {
        const queryString = new URLSearchParams(queryParams).toString();
        const apiUrl = `https://api.ikyyxd.my.id/${endpoint}?${queryString}`;

        const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 60000 });

        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error('API tidak mengembalikan gambar. Cek parameter input.');
        }

        const imageBuffer = Buffer.from(response.data, 'binary');

        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}

        await replyRichPhoto(ctx, { source: imageBuffer }, `
<h1>✅ ${escapeHtml(title)} Berhasil</h1>
<p>Gambar telah berhasil dibuat oleh AI.</p>
`);
    } catch (err) {
        await editRichMessage(ctx, `<h1>❌ Gagal</h1><p>Error: <code>${escapeHtml(err.message)}</code></p>`);
    }
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerAiHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /ai /gpt — Tanya AI (Gemini)
    // ═══════════════════════════════════════════════════════════
    bot.command(['ai', 'gpt'], async (ctx) => {
        const prompt = ctx.message.text.split(' ').slice(1).join(' ');
        if (!prompt) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan pertanyaan.',
                pre: '/ai Halo bot',
                listItems: [
                    '📌 <code>/ai Apa itu JavaScript?</code>',
                    '📌 <code>/gpt Buatkan puisi tentang hujan</code>',
                ],
                accent: '🤖',
            }));
        }

        const loadingMsg = await replyRich(ctx, `
<h1>🤖 AI Sedang Berpikir...</h1>
<p>Memproses: <i>${escapeHtml(prompt.substring(0, 100))}${prompt.length > 100 ? '...' : ''}</i></p>
`);

        try {
            const { data } = await axios.get(
                `https://api.ikyyxd.my.id/ai/gemini?text=${encodeURIComponent(prompt)}`,
                { timeout: 45000 }
            );

            let resultText = data.result || data.message || data.text || JSON.stringify(data);
            resultText = cleanAiMarkdown(resultText);

            if (resultText.length > MAX_AI_LEN) {
                resultText = resultText.substring(0, MAX_AI_LEN) + '\n\n<i>... (dipotong)</i>';
            }

            await editRichMessage(ctx, `
<h1>🤖 AI Response</h1>
<blockquote expandable>${resultText}</blockquote>
<footer>✨ Ditenagai Gemini API</footer>
`);

        } catch (err) {
            console.error('AI Error:', err.message);
            await editRichMessage(ctx, `
<h1>❌ Gagal</h1>
<p>Error: <code>${escapeHtml(err.message)}</code></p>
<footer>⚠️ AI mungkin sedang down. Coba lagi nanti.</footer>
`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /aigambar /imagine — Generate gambar dari teks
    // ═══════════════════════════════════════════════════════════
    bot.command(['aigambar', 'imagine'], async (ctx) => {
        const prompt = ctx.message.text.split(' ').slice(1).join(' ');
        if (!prompt) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan deskripsi gambar.',
                pre: '/aigambar kucing lucu sedang tidur',
                listItems: [
                    '📌 Bahasa Indonesia atau Inggris sama-sama bisa',
                    '📌 Semakin detail = semakin bagus',
                ],
                accent: '🎨',
            }));
        }

        const loadingMsg = await replyRich(ctx, `
<h1>🎨 AI Menggambar...</h1>
<p>Prompt: <i>${escapeHtml(prompt.substring(0, 100))}</i></p>
<footer>⏳ Mohon tunggu, ini bisa memakan waktu 10-30 detik...</footer>
`);

        try {
            const { data } = await axios.post('https://www.kavel.ai/api/generate', {
                prompt: prompt,
                model: 'kavel-image-v1',
            }, { timeout: 60000 });

            const imageUrl = data.url || (data.data && data.data.url);
            if (!imageUrl) throw new Error('Gagal mendapatkan URL gambar dari AI.');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}

            await replyRichPhoto(ctx, { url: imageUrl }, `
<h1>✅ Gambar Berhasil Dibuat</h1>
<table bordered>
  <tr><td><b>Prompt</b></td><td>: ${escapeHtml(prompt.substring(0, 50))}</td></tr>
  <tr><td><b>Model</b></td><td>: Kavel Image v1</td></tr>
</table>
<tg-button-row>
  <tg-button type="url" style="primary" url="${imageUrl}">🌐 Buka Gambar</tg-button>
</tg-button-row>
`);

        } catch (err) {
            console.error('AI Image Error:', err.message);
            await editRichMessage(ctx, `
<h1>❌ Gagal Generate Gambar</h1>
<p>Error: <code>${escapeHtml(err.message)}</code></p>
<footer>⚠️ Coba lagi dengan prompt yang lebih sederhana.</footer>
`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /cekcode — Cek sintaks JavaScript
    // ═══════════════════════════════════════════════════════════
    bot.command('cekcode', async (ctx) => {
        const waitMsg = await ctx.reply('🔍 Sedang mengecek sintaks kode...');

        try {
            const code = await getCodeFromContext(ctx);

            // Coba compile via vm.Script
            try {
                new vm.Script(code);

                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

                await replyRich(ctx, premiumMessage({
                    heading: 'Kode Valid!', headingEmoji: '✅',
                    body: 'Sintaks JavaScript berhasil diverifikasi tanpa error.',
                    listItems: [
                        `📏 Panjang: <b>${code.length}</b> karakter`,
                        `📄 Baris: <b>${code.split('\n').length}</b>`,
                    ],
                    blockquote: 'Kode siap dijalankan. Gunakan /fixcode jika ingin saran dari AI.',
                    accent: '🛡️',
                }));

            } catch (syntaxErr) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

                await replyRich(ctx, premiumMessage({
                    heading: 'Syntax Error Ditemukan', headingEmoji: '❌',
                    body: `Error: <code>${escapeHtml(syntaxErr.name)}</code>`,
                    blockquote: `<i>${escapeHtml(syntaxErr.message)}</i>`,
                    footer: 'Periksa baris kode yang ditunjuk pesan error.',
                    accent: '⚠️',
                }));
            }

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await ctx.reply(`❌ Gagal: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /fixcode — Perbaiki kode via AI
    // ═══════════════════════════════════════════════════════════
    bot.command('fixcode', async (ctx) => {
        const waitMsg = await ctx.reply('🤖 AI sedang menganalisis kode...\n(Mohon tunggu, 10-30 detik)');

        try {
            const code = await getCodeFromContext(ctx);

            if (code.length > MAX_CODE_LEN) {
                throw new Error(`Kode terlalu panjang (max ${MAX_CODE_LEN} karakter).`);
            }

            const prompt = `Kamu adalah seorang Senior JavaScript Developer. Tolong analisis kode berikut.
Berikan jawaban SINGKAT dan PADAT dalam format:
1. RINGKASAN: Apa fungsi kode ini?
2. BUG/ERROR: Apakah ada kesalahan logika atau sintaks? (Jika tidak ada, tulis "Tidak ada bug terdeteksi").
3. SARAN PERBAIKAN: Berikan potongan kode yang sudah diperbaiki (jika perlu).

Kode yang dianalisis:
\`\`\`javascript
${code}
\`\`\``;

            const { data } = await axios.get(
                `https://api.ikyyxd.my.id/ai/gemini?text=${encodeURIComponent(prompt)}`,
                { timeout: 45000 }
            );

            let resultText = data.result || data.message || data.text || 'AI tidak memberikan respon.';
            resultText = cleanAiMarkdown(resultText);

            if (resultText.length > MAX_AI_LEN) {
                resultText = resultText.substring(0, MAX_AI_LEN) + '\n\n<i>... (dipotong)</i>';
            }

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRich(ctx, `
<h1>🛠️ Hasil Analisis AI</h1>
<p>Berikut adalah analisis untuk kode kamu:</p>
<blockquote expandable>${resultText}</blockquote>
<footer>✨ Dianalisis oleh AI. Selalu cek ulang sebelum dijalankan.</footer>
`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await ctx.reply(`❌ Gagal memproses kode:\n${err.message}`);
        }
    });
}

module.exports = { registerAiHandler };