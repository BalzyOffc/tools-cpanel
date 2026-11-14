// ═══════════════════════════════════════════════════════════════
// 📄 handlers/utility-extra.js
// /lirik /lyrics — Cari lirik lagu (lrclib-api)
// /quote /quotes — Random quote (quotable.io)
// /anime — Info anime (Jikan/MAL API)
// /stalk — Stalk akun (tiktok, github, telegram, dll)
// ═══════════════════════════════════════════════════════════════
const axios = require('axios');
const config = require('../config');
const { replyRich, premiumMessage, replyRichPhoto } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');

const TOOLS_THUMB = config.thumbnailUrl || 'https://i.ibb.co/3sXqY2Z/telegram-bot.jpg';

const SOCIABUZZ_URL = 'https://sociabuzz.com/balzyoffc/donate';
// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerUtilityExtraHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /lirik /lyrics — Cari lirik lagu
    // ═══════════════════════════════════════════════════════════
    bot.command(['lirik', 'lyrics'], async (ctx) => {
        const { Client } = require('lrclib-api');
        const lyricsClient = new Client();

        const query = ctx.message.text.split(' ').slice(1).join(' ');
        if (!query) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan judul lagu (dan artis jika perlu).',
                pre: '/lirik Perfect - Ed Sheeran',
                listItems: [
                    '📌 Format: <code>/lirik Judul - Artis</code>',
                    '📌 Atau: <code>/lirik Judul Lagu</code>',
                ],
                accent: '🎵',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Mencari Lirik...', headingEmoji: '🔍',
            body: `Mencari: <b>${escapeHtml(query)}</b>`,
            accent: '🎧',
        }));

        try {
            let track = query;
            let artist = '';

            // Pisahkan judul & artis kalau ada tanda '-'
            if (query.includes(' - ')) {
                [track, artist] = query.split(' - ');
                track = track.trim();
                artist = artist.trim();
            }

            let result = null;

            if (!artist) {
                // Search bebas
                const matches = await lyricsClient.searchLyrics({ query: track });
                if (matches && matches.length > 0) {
                    result = matches.find(m => m.plainLyrics) || matches[0];
                }
            } else {
                // Find by track + artist (lebih akurat)
                result = await lyricsClient.findLyrics({
                    track_name: track,
                    artist_name: artist,
                });
            }

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            if (!result || !result.plainLyrics) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Lirik Tidak Ditemukan', headingEmoji: '😔',
                    body: `Lirik untuk <b>${escapeHtml(query)}</b> tidak ditemukan.`,
                    footer: 'Coba format: <b>Judul Lagu - Nama Artis</b>',
                    accent: '⚠️',
                }));
            }

            // Potong lirik kalau terlalu panjang
            const lyricsText = result.plainLyrics.length > 3500
                ? result.plainLyrics.substring(0, 3500) + '...'
                : result.plainLyrics;

            await replyRich(ctx, premiumMessage({
                heading: result.trackName || track, headingEmoji: '🎵',
                body: `Artis: <b>${escapeHtml(result.artistName || artist || 'Unknown')}</b>`,
                pre: escapeHtml(lyricsText),
                accent: '📜',
            }));

        } catch (err) {
            console.error('Lyrics Error:', err.message);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Mencari Lirik', headingEmoji: '❌',
                body: `Terjadi kesalahan pada API lirik.\n\n<code>${escapeHtml(err.message)}</code>`,
                footer: 'Coba dengan format: <b>Judul Lagu - Nama Artis</b>',
                accent: '⚠️',
            }));
        }
    });
    
    // ═══════════════════════════════════════════════════════════
    // /donate /sawer — Dukungan via Sociabuzz
    // ═══════════════════════════════════════════════════════════
    bot.command(['donate', 'sawer', 'donasi'], async (ctx) => {
        const text = `
<h1>☕ Dukung Kami!</h1>
<p>Halo <b>${escapeHtml(ctx.from.first_name)}</b>!</p>
<p>Jika kamu merasa bot ini bermanfaat, kamu bisa memberikan dukungan (donasi/sawer) agar bot ini terus aktif dan berkembang.</p>

<h2>🎁 Keuntungan Donasi:</h2>
<ul>
  <li>Akses konten eksklusif (30 hari)</li>
  <li>Prioritas bantuan / support</li>
  <li>Membantu biaya server & API</li>
</ul>

<blockquote>Setiap dukungan, sekecil apapun, sangat berarti bagi kami. Terima kasih! 🙏</blockquote>
`;
        
        await replyRich(ctx, text + `
<tg-button-row>
  <tg-button type="url" style="success" url="${SOCIABUZZ_URL}">💖 Donasi via Sociabuzz</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="danger" data="back_menu">🔙 Kembali ke Menu</tg-button>
</tg-button-row>
`);
    });
    
    // ═══════════════════════════════════════════════════════════
    // /quote /quotes — Random quote
    // ═══════════════════════════════════════════════════════════
    bot.command(['quote', 'quotes'], async (ctx) => {
        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Mengambil Quote...', headingEmoji: '⏳',
            accent: '📜',
        }));

        try {
            const { data } = await axios.get('https://api.quotable.io/random', { timeout: 10000 });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            await replyRich(ctx, premiumMessage({
                heading: 'Quote of the Day', headingEmoji: '✨',
                body: `"<i>${escapeHtml(data.content)}</i>"`,
                blockquote: `— ${escapeHtml(data.author)}`,
                accent: '📜',
                buttons: [
                    { text: '🔄 Quote Baru', callback: 'quote_new', color: 'primary' },
                ],
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal', headingEmoji: '❌',
                body: `Error: <code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    bot.action('quote_new', async (ctx) => {
        await ctx.answerCbQuery('Mengambil quote baru...');
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.message.text = '/quote';
        return bot.command('quote', ctx);
    });

    // ═══════════════════════════════════════════════════════════
    // /anime — Info anime (Jikan/MAL)
    // ═══════════════════════════════════════════════════════════
    bot.command('anime', async (ctx) => {
        const query = ctx.message.text.split(' ').slice(1).join(' ');
        if (!query) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan judul anime.',
                pre: '/anime Naruto',
                accent: '📺',
            }));
        }

        const waitMsg = await replyRich(ctx, `<h1>🔍 Mencari Anime...</h1><p>Judul: <b>${escapeHtml(query)}</b></p>`);

        try {
            const { data } = await axios.get(
                `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`,
                { timeout: 15000 }
            );

            if (!data.data || data.data.length === 0) {
                throw new Error('Anime tidak ditemukan.');
            }

            const anime = data.data[0];

            const html = `
<h1>📺 ${escapeHtml(anime.title)}</h1>
<table bordered>
  <tr><td><b>Skor</b></td><td>: ⭐ ${anime.score || '-'}</td></tr>
  <tr><td><b>Episode</b></td><td>: ${anime.episodes || '-'}</td></tr>
  <tr><td><b>Status</b></td><td>: ${anime.status || '-'}</td></tr>
  <tr><td><b>Genre</b></td><td>: ${anime.genres.map(g => g.name).join(', ') || '-'}</td></tr>
  <tr><td><b>Studio</b></td><td>: ${anime.studios?.[0]?.name || '-'}</td></tr>
  <tr><td><b>Tayang</b></td><td>: ${anime.aired?.string || '-'}</td></tr>
</table>
<h2>📝 Sinopsis</h2>
<blockquote expandable>${escapeHtml(anime.synopsis || 'Tidak ada sinopsis.').substring(0, 1000)}${(anime.synopsis || '').length > 1000 ? '...' : ''}</blockquote>
<tg-button-row>
  <tg-button type="url" style="primary" url="${anime.url}">🔗 Buka di MyAnimeList</tg-button>
</tg-button-row>
`;

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            // Kirim poster + caption
            const posterUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
            if (posterUrl) {
                await replyRichPhoto(ctx, { url: posterUrl }, html);
            } else {
                await replyRich(ctx, html);
            }

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, `<h1>❌ Gagal</h1><p>${escapeHtml(err.message)}</p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /stalk — Stalk akun medsos
    // ═══════════════════════════════════════════════════════════
    bot.command('stalk', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const platform = args[0]?.toLowerCase();
        const username = args[1]?.replace('@', '');

        const supportedPlatforms = ['tiktok', 'github', 'telegram', 'steam', 'gitlab', 'hackernews', 'hn', 'facebook', 'fb', 'npm'];

        if (!platform || !username) {
            const html = `
<h1>🕵️ Stalker Akun</h1>
<h2>ℹ️ Format Penggunaan</h2>
<table bordered>
  <tr><th>Platform</th><th>Contoh</th></tr>
  <tr><td>TikTok</td><td><code>/stalk tiktok @username</code></td></tr>
  <tr><td>GitHub</td><td><code>/stalk github @username</code></td></tr>
  <tr><td>Telegram</td><td><code>/stalk telegram @username</code></td></tr>
  <tr><td>Steam</td><td><code>/stalk steam @username</code></td></tr>
  <tr><td>GitLab</td><td><code>/stalk gitlab @username</code></td></tr>
  <tr><td>HackerNews</td><td><code>/stalk hackernews @username</code></td></tr>
  <tr><td>Facebook</td><td><code>/stalk facebook @username</code></td></tr>
  <tr><td>NPM</td><td><code>/stalk npm @username</code></td></tr>
</table>
<footer>✨ Mendukung: ${supportedPlatforms.join(', ')}</footer>
`;
            return replyRich(ctx, html);
        }

        if (!supportedPlatforms.includes(platform)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Platform Tidak Didukung', headingEmoji: '❌',
                body: `<code>${escapeHtml(platform)}</code> belum didukung.`,
                pre: `Pilih: ${supportedPlatforms.join(', ')}`,
                accent: '⚠️',
            }));
        }

        const waitMsg = await replyRich(ctx, `
<h1>🔍 Melacak Akun...</h1>
<p>Mencari <b>${escapeHtml(username)}</b> di <b>${platform.toUpperCase()}</b>...</p>
<p><i>Mohon tunggu sebentar...</i></p>
`);

        try {
            const { Scraper } = require('@xazepysk/scrapers');
            const scraper = new Scraper();

            let result;
            let platformName = platform.toUpperCase();

            if (platform === 'tiktok') result = await scraper.Stalks.tiktok(username);
            else if (platform === 'github') result = await scraper.Stalks.github(username);
            else if (platform === 'telegram') result = await scraper.Stalks.telegram(username);
            else if (platform === 'steam') result = await scraper.Stalks.steam(username);
            else if (platform === 'gitlab') result = await scraper.Stalks.gitlab(username);
            else if (platform === 'hackernews' || platform === 'hn') {
                result = await scraper.Stalks.hackernews(username);
                platformName = 'HACKERNEWS';
            }
            else if (platform === 'facebook' || platform === 'fb') {
                result = await scraper.Stalks.facebook(username);
                platformName = 'FACEBOOK';
            }
            else if (platform === 'npm') result = await scraper.Stalks.npm(username);

            if (!result) throw new Error('Akun tidak ditemukan.');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            // Susun tabel dari hasil scraping
            let tableRows = '';
            for (const [key, value] of Object.entries(result)) {
                if (value && typeof value !== 'object') {
                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    tableRows += `<tr><td><b>${escapeHtml(label)}</b></td><td>: ${escapeHtml(String(value))}</td></tr>\n`;
                }
            }

            const html = `
<h1>🕵️ Hasil Stalk ${escapeHtml(platformName)}</h1>
<table bordered>
  <tr><td><b>Target</b></td><td>: <code>${escapeHtml(username)}</code></td></tr>
  <tr><td><b>Platform</b></td><td>: ${escapeHtml(platformName)}</td></tr>
</table>
<h2>📊 Informasi Detail</h2>
<table bordered>
${tableRows || '<tr><td colspan="2"><i>Tidak ada data detail.</i></td></tr>'}
</table>
<footer>✨ Data dari @xazepysk/scrapers</footer>
`;

            await replyRich(ctx, html);

        } catch (err) {
            console.error('Stalk Error:', err.message);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRich(ctx, `
<h1>❌ Gagal Melacak</h1>
<table bordered>
  <tr><td><b>Status</b></td><td>: <span style="color: red;">Error</span></td></tr>
  <tr><td><b>Pesan</b></td><td>: <code>${escapeHtml(err.message)}</code></td></tr>
</table>
<footer>⚠️ Pastikan username valid dan platform didukung.</footer>
`);
        }
    });
}

module.exports = { registerUtilityExtraHandler };