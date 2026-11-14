const yt = require('@denzy-official/youtube_scraper');
const config = require('../config');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');

// Simpan sesi pencarian sementara (User ID -> Array Hasil)
const searchCache = new Map();

async function downloadAndSendAudio(ctx, videoUrl, title, artist, messageIdToEdit) {
    try {
        // Edit pesan menjadi loading
        await ctx.telegram.editMessageText(
            ctx.chat.id, 
            messageIdToEdit, 
            null, 
            `⏳ <b>Mengunduh audio...</b>\n🎵 ${escapeHtml(title)}\n👤 ${escapeHtml(artist)}\n\n<i>Mohon tunggu...</i>`, 
            { parse_mode: 'HTML' }
        );

        // Download menggunakan library denzy
        const result = await yt.ytmp3(videoUrl); 
        
        // Cek validitas hasil download
        if (!result || !result.download || !result.download.url) {
            throw new Error('Gagal mendapatkan link download audio.');
        }

        const audioUrl = result.download.url;
        const finalTitle = result.metadata?.title || title;

        // Hapus pesan loading
        try { await ctx.telegram.deleteMessage(ctx.chat.id, messageIdToEdit); } catch (e) {}

        // Kirim file audio
        await ctx.replyWithAudio(
            { url: audioUrl },
            {
                title: finalTitle,
                performer: artist, // Nama artis yang sudah diperbaiki
                caption: `🎵 <b>${escapeHtml(finalTitle)}</b>\n👤 ${escapeHtml(artist)}`,
                parse_mode: 'HTML'
            }
        );

    } catch (err) {
        console.error('Play Music Error:', err.message);
        try { await ctx.telegram.deleteMessage(ctx.chat.id, messageIdToEdit); } catch (e) {}
        
        await replyRich(ctx, premiumMessage({
            heading: 'Gagal Mengunduh',
            headingEmoji: '❌',
            body: `<code>${escapeHtml(err.message)}</code>`,
            accent: '⚠️'
        }));
    }
}

function registerPlayHandler(bot) {
    bot.command(['play', 'music'], async (ctx) => {
        const query = ctx.message.text.split(' ').slice(1).join(' ');

        if (!query) {
            return replyRich(ctx, `
<h1>🎵 Music Player</h1>
<h2>ℹ️ Format Penggunaan</h2>
<table bordered>
  <tr><td><b>Command</b></td><td>: <code>/play &lt;judul lagu&gt;</code></td></tr>
  <tr><td><b>Contoh</b></td><td>: <code>/play Neffex Destiny</code></td></tr>
</table>
<footer>✨ Bot akan mencari dan memutar lagu dari YouTube.</footer>
`);
        }

        const waitMsg = await replyRich(ctx, `
<h1>🔍 Mencari Lagu...</h1>
<p>Mencari: <b>${escapeHtml(query)}</b></p>
<p><i>Mohon tunggu...</i></p>
`);

        try {
            // 1. SEARCH LAGU
            // Library denzy mengembalikan objek { results: [...] }
            const searchData = await yt.search(query); 
            const results = searchData.results || [];

            if (results.length === 0) {
                throw new Error('Lagu tidak ditemukan.');
            }

            // Jika hasil hanya 1, langsung unduh
            if (results.length === 1) {
                const video = results[0];
                // 🔥 PERBAIKAN: Ambil nama artis dari metadata.author.name
                const artist = video.author?.name || video.author || 'YouTube';
                
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}
                return await downloadAndSendAudio(ctx, video.url, video.title, artist, waitMsg.message_id);
            }

            // 2. JIKA HASIL BANYAK, TAMPILKAN PILIHAN (Maksimal 5)
            const topResults = results.slice(0, 5); // Batasi 5 hasil
            const sessionId = Date.now().toString();
            
            searchCache.set(sessionId, {
                userId: ctx.from.id,
                results: topResults
            });

            // Buat tombol pilihan
            const keyboard = topResults.map((video, index) => {
                return [{
                    text: `🎵 ${video.title.substring(0, 35)}...`,
                    callback_data: `play_select_${sessionId}_${index}`
                }];
            });
            keyboard.push([{ text: '❌ Batal', callback_data: 'play_cancel', style: 'danger' }]);

            const html = `
<h1>🔍 Hasil Pencarian</h1>
<p>Ditemukan beberapa lagu untuk: <b>${escapeHtml(query)}</b></p>
<p>Silakan pilih lagu yang ingin diputar:</p>
`;

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await ctx.reply(html, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (err) {
            console.error('Search Error:', err.message);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            
            await replyRich(ctx, `
<h1>❌ Gagal Mencari Lagu</h1>
<table bordered>
  <tr><td><b>Status</b></td><td>: <span style="color: red;">Error</span></td></tr>
  <tr><td><b>Pesan</b></td><td>: <code>${escapeHtml(err.message)}</code></td></tr>
</table>
<footer>⚠️ Coba dengan judul yang lebih spesifik.</footer>
`);
        }
    });

    // ── HANDLER TOMBOL PILIHAN ──
    bot.action(/^play_select_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const sessionId = ctx.match[1];
        const index = parseInt(ctx.match[2]);
        
        const session = searchCache.get(sessionId);
        if (!session || session.userId !== ctx.from.id) {
            return ctx.answerCbQuery('❌ Sesi pencarian sudah kadaluarsa atau bukan milikmu.', { show_alert: true });
        }

        const video = session.results[index];
        if (!video) return ctx.answerCbQuery('❌ Lagu tidak ditemukan dalam daftar.', { show_alert: true });

        // 🔥 PERBAIKAN: Ambil nama artis dari metadata.author.name
        const artist = video.author?.name || video.author || 'YouTube';

        await ctx.editMessageText(`⏳ <b>Mengunduh audio...</b>\n🎵 ${escapeHtml(video.title)}\n👤 ${escapeHtml(artist)}\n\n<i>Mohon tunggu...</i>`, { parse_mode: 'HTML' });
        
        await downloadAndSendAudio(ctx, video.url, video.title, artist, ctx.callbackQuery.message.message_id);
        
        searchCache.delete(sessionId);
    });

    // ── HANDLER TOMBOL BATAL ──
    bot.action('play_cancel', async (ctx) => {
        await ctx.answerCbQuery('Dibatalkan');
        try { await ctx.deleteMessage(); } catch (e) {}
    });
}

module.exports = { registerPlayHandler };