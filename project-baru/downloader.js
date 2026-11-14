// ═══════════════════════════════════════════════════════════════
// 📄 handlers/downloader.js
// /tiktok /tt /ig /instagram /fb /facebook /tw /twitter
// /play /music /tourl /url /stiker /sticker /s /pin /pinterest
// /ucbrowser /uc /ucshare
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const axios = require('axios');
const config = require('../config');
const { replyRich, premiumMessage, sendRichMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { pendingDownloads, pendingTourl, pinterestCache } = require('../state/maps');
const { UPLOAD_APIS, uploadWithFallback, formatSize } = require('../services/uploader');

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerDownloaderHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /tiktok /ig /fb /tw — Multi-platform downloader
    // ═══════════════════════════════════════════════════════════
    bot.command(
        ['tiktok', 'tt', 'ig', 'instagram', 'fb', 'facebook', 'tw', 'twitter'],
        async (ctx) => {
            const { Scraper } = require('@xazepysk/scrapers');
            const scraper = new Scraper();

            const args = ctx.message.text.split(' ').slice(1);
            const url = args[0];
            const cmd = ctx.message.text.split(' ')[0].replace('/', '').split('@')[0].toLowerCase();

            if (!url || !url.startsWith('http')) {
                const html = `
<h1>📥 Menu Downloader</h1>
<h2>✨ Pilih Platform</h2>
<table bordered>
<tr><th>Platform</th><th>Command</th></tr>
<tr><td>🎵 TikTok (Video/Slide)</td><td><code>/tiktok link</code></td></tr>
<tr><td>📸 Instagram (Video/Slide)</td><td><code>/ig link</code></td></tr>
<tr><td>📘 Facebook</td><td><code>/fb link</code></td></tr>
<tr><td>🐦 Twitter/X</td><td><code>/tw link</code></td></tr>
</table>
<footer>✨ Bot otomatis mendeteksi Video (MP4+MP3) atau Foto Slide.</footer>
`;
                return replyRich(ctx, html);
            }

            const waitMsg = await replyRich(ctx, `
<h1>⏳ Memproses Link...</h1>
<p>Sedang mengambil informasi media. Mohon tunggu...</p>
`);

            try {
                let videoUrl = '';
                let audioUrl = '';
                let mediaList = [];
                let title = '';
                let author = '-';
                let platformName = cmd.toUpperCase();
                let isImage = false;
                let isSlide = false;

                if (cmd === 'tiktok' || cmd === 'tt') {
                    const res = await scraper.Download.tiktok(url);

                    if (res.images && res.images.length > 0) {
                        isSlide = true;
                        mediaList = res.images.map(imgUrl => ({ type: 'image', url: imgUrl }));
                    } else if (res.slides && res.slides.length > 0) {
                        isSlide = true;
                        mediaList = res.slides.map(item => ({
                            type: item.type || 'image',
                            url: item.url || item,
                        }));
                    } else {
                        videoUrl = res.video?.url || res.videoUrl || res.video || res.play;
                        audioUrl = res.audio?.url || res.music?.url || res.audio || res.music_info?.url || '';
                    }

                    title = res.title || 'Media TikTok';
                    author = res.author?.nickname || res.author?.name || res.author || '-';
                    platformName = 'TIKTOK';
                }
                else if (cmd === 'ig' || cmd === 'instagram') {
                    const res = await scraper.Download.instagram(url);

                    if (res.items?.length > 0) {
                        if (res.items.length > 1) {
                            isSlide = true;
                            mediaList = res.items.map(item => ({
                                type: item.type || (item.url.includes('.mp4') ? 'video' : 'image'),
                                url: item.url,
                            }));
                        } else {
                            const media = res.items[0];
                            videoUrl = media.url;
                            isImage = media.type === 'image';
                        }
                        title = res.title || 'Media Instagram';
                        author = res.author || '-';
                        platformName = 'INSTAGRAM';
                    } else {
                        throw new Error('Media Instagram tidak ditemukan.');
                    }
                }
                else if (cmd === 'fb' || cmd === 'facebook') {
                    const res = await scraper.Download.facebook(url);
                    videoUrl = res.hd || res.sd || res.url;
                    title = res.title || 'Video Facebook';
                    platformName = 'FACEBOOK';
                }
                else if (cmd === 'tw' || cmd === 'twitter') {
                    const res = await scraper.Download.twitter(url);
                    videoUrl = res.media?.[0]?.url || res.video;
                    title = res.text || 'Video Twitter';
                    platformName = 'TWITTER/X';
                }

                if (!videoUrl && !isImage && mediaList.length === 0) {
                    throw new Error('Media tidak ditemukan atau link tidak valid.');
                }

                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

                // ─── Slide (foto/video banyak) ───
                if (isSlide && mediaList.length > 0) {
                    const chunkSize = 10;
                    for (let i = 0; i < mediaList.length; i += chunkSize) {
                        const chunk = mediaList.slice(i, i + chunkSize);
                        const mediaGroup = chunk.map(item => {
                            if (item.type === 'image') return { type: 'photo', media: { url: item.url } };
                            return { type: 'video', media: { url: item.url }, supports_streaming: true };
                        });
                        await ctx.replyWithMediaGroup(mediaGroup);
                    }

                    await replyRich(ctx, `
<h1>✅ Slide Berhasil Dikirim</h1>
<p>Total: <b>${mediaList.length}</b> media.</p>
<tg-button-row>
  <tg-button type="url" style="secondary" url="${escapeHtml(url)}">🔗 Link Asli</tg-button>
</tg-button-row>
<footer>✨ Downloader</footer>
`);
                    return;
                }

                // ─── TikTok video biasa: MP4 + MP3 ───
                if ((cmd === 'tiktok' || cmd === 'tt') && videoUrl) {
                    const statusMsg = await ctx.reply('⏳ Mengirim Video & Audio...');

                    try {
                        await ctx.replyWithVideo({ url: videoUrl }, {
                            caption: `🎬 <b>${platformName} Video</b>\n📝 ${escapeHtml(String(title).substring(0, 50))}`,
                            parse_mode: 'HTML',
                            supports_streaming: true,
                        });
                    } catch (e) { console.error('Gagal kirim video:', e.message); }

                    if (audioUrl) {
                        try {
                            await ctx.replyWithAudio({ url: audioUrl }, {
                                title: String(title).substring(0, 64),
                                performer: author,
                                caption: `🎵 <b>${platformName} Audio</b>`,
                            });
                        } catch (e) { console.error('Gagal kirim audio direct:', e.message); }
                    } else {
                        // Konversi MP4 → MP3 on-the-fly
                        try {
                            const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dl-'));
                            const inputPath = path.join(tempDir, 'input.mp4');
                            const outputPath = path.join(tempDir, 'output.mp3');

                            const response = await fetch(videoUrl);
                            await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(inputPath));
                            await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outputPath]);

                            await ctx.replyWithAudio({ source: fs.createReadStream(outputPath) }, {
                                title: String(title).substring(0, 64),
                                performer: author,
                                caption: `🎵 <b>${platformName} Audio</b>`,
                            });
                            await fs.promises.rm(tempDir, { recursive: true, force: true });
                        } catch (err) {
                            console.log('Gagal convert MP3:', err.message);
                        }
                    }

                    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch (e) {}
                    return;
                }

                // ─── IG/FB/TW: tampilkan tombol pilihan ───
                const id = crypto.randomBytes(8).toString('hex');
                pendingDownloads.set(id, {
                    videoUrl, title, author, platformName, isImage, url,
                    userId: ctx.from.id,
                    chatId: ctx.chat.id,
                });

                // Auto-cleanup
                setTimeout(() => pendingDownloads.delete(id), 10 * 60 * 1000);

                await replyRich(ctx, `
<h1>✅ Media Berhasil Ditemukan</h1>
<h2>ℹ️ Informasi Media</h2>
<table bordered>
<tr><td><b>Platform</b></td><td>${platformName}</td></tr>
<tr><td><b>Judul</b></td><td>${escapeHtml(String(title).substring(0, 50))}</td></tr>
<tr><td><b>Author</b></td><td>${escapeHtml(String(author))}</td></tr>
</table>

<h2>📥 Pilih Format Download</h2>
<tg-button-row>
  <tg-button type="callback_data" style="success" data="download_mp4:${id}">🎬 Download MP4</tg-button>
  <tg-button type="callback_data" style="primary" data="download_mp3:${id}">🎵 Download MP3</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="url" style="secondary" url="${escapeHtml(url)}">🔗 Link Asli</tg-button>
</tg-button-row>
<footer>✨ Downloader</footer>
`);

            } catch (err) {
                console.error('Downloader Error:', err);
                try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
                await replyRich(ctx, `
<h1>❌ Download Gagal</h1>
<table bordered><tr><td><b>Pesan</b></td><td>${escapeHtml(err.message)}</td></tr></table>
<footer>⚠️ Periksa link dan coba kembali.</footer>
`);
            }
        }
    );

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: download_mp4
    // ═══════════════════════════════════════════════════════════
    bot.action(/^download_mp4:([a-f0-9]+)$/, async (ctx) => {
        await ctx.answerCbQuery('⏳ Menyiapkan MP4...');
        const id = ctx.match[1];
        const data = pendingDownloads.get(id);

        if (!data || data.userId !== ctx.from.id || data.chatId !== ctx.chat.id) {
            return ctx.reply('❌ Sesi download tidak ditemukan atau sudah digunakan.');
        }

        pendingDownloads.delete(id);

        try {
            if (data.isImage) {
                await ctx.replyWithPhoto({ url: data.videoUrl }, { caption: '📸 Media Image' });
            } else {
                await ctx.replyWithVideo({ url: data.videoUrl }, {
                    caption: `🎬 ${data.platformName} MP4`,
                    supports_streaming: true,
                });
            }
        } catch (err) {
            console.error('MP4 Error:', err);
            await ctx.reply('❌ Gagal mengirim MP4: ' + err.message);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CALLBACK: download_mp3 (dengan ffmpeg)
    // ═══════════════════════════════════════════════════════════
    bot.action(/^download_mp3:([a-f0-9]+)$/, async (ctx) => {
        await ctx.answerCbQuery('🎵 Memproses MP3...');
        const id = ctx.match[1];
        const data = pendingDownloads.get(id);

        if (!data || data.userId !== ctx.from.id || data.chatId !== ctx.chat.id) {
            return ctx.reply('❌ Sesi download tidak ditemukan atau sudah digunakan.');
        }
        if (data.isImage) {
            return ctx.reply('⚠️ Media berupa foto, tidak bisa dikonversi ke MP3.');
        }

        pendingDownloads.delete(id);
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dl-'));
        const inputPath = path.join(tempDir, 'input.mp4');
        const outputPath = path.join(tempDir, 'output.mp3');

        try {
            const statusMsg = await ctx.reply('🎵 Mengonversi video ke MP3...\nMohon tunggu.');
            const response = await fetch(data.videoUrl);
            if (!response.ok || !response.body) throw new Error('Gagal mengambil video.');

            await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(inputPath));
            await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outputPath]);

            await ctx.replyWithAudio(
                { source: fs.createReadStream(outputPath) },
                {
                    title: String(data.title).substring(0, 64),
                    performer: data.author || 'BALZY',
                    caption: `🎵 ${data.platformName} MP3`,
                }
            );
            try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch (e) {}
        } catch (err) {
            console.error('MP3 Error:', err);
            await ctx.reply('❌ Gagal membuat MP3: ' + err.message);
        } finally {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    bot.action('download_retry', async (ctx) => {
        await ctx.answerCbQuery('Silakan kirim ulang linknya.');
        try { await ctx.deleteMessage(); } catch (e) {}
    });

    // ═══════════════════════════════════════════════════════════
    // /tourl — Upload media ke URL publik
    // ═══════════════════════════════════════════════════════════
    bot.command(['tourl', 'url'], async (ctx) => {
        const { UPLOAD_APIS, uploadWithFallback, formatSize } = require('../services/uploader');

        const replied = ctx.message.reply_to_message;
        if (!replied || (!replied.photo && !replied.video && !replied.document && !replied.audio && !replied.animation && !replied.voice)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply sebuah media (foto/video/dokumen/audio/voice), lalu:',
                pre: '/tourl',
                accent: '🔗',
            }));
        }

        let fileId, fileExt = 'bin', mediaType = 'document';

        if (replied.photo) {
            fileId = replied.photo[replied.photo.length - 1].file_id;
            fileExt = 'jpg';
            mediaType = 'photo';
        } else if (replied.video) {
            fileId = replied.video.file_id;
            fileExt = 'mp4';
            mediaType = 'video';
        } else if (replied.animation) {
            fileId = replied.animation.file_id;
            fileExt = 'gif';
            mediaType = 'animation';
        } else if (replied.audio) {
            fileId = replied.audio.file_id;
            fileExt = 'mp3';
            mediaType = 'audio';
        } else if (replied.voice) {
            fileId = replied.voice.file_id;
            fileExt = 'ogg';
            mediaType = 'voice';
        } else if (replied.document) {
            fileId = replied.document.file_id;
            fileExt = replied.document.file_name?.split('.').pop() || 'bin';
            mediaType = 'document';
        }

        const sessionId = crypto.randomBytes(4).toString('hex');
        pendingTourl.set(sessionId, {
            fileId, fileExt, mediaType,
            userId: ctx.from.id,
            chatId: ctx.chat.id,
            createdAt: Date.now(),
        });

        setTimeout(() => pendingTourl.delete(sessionId), 5 * 60 * 1000);

        // Di handlers/downloader.js, ganti bagian tampilan menu tourl:
const apiEntries = Object.entries(UPLOAD_APIS).sort((a, b) => a[1].priority - b[1].priority);

let buttonsHtml = '';
for (let i = 0; i < apiEntries.length; i += 2) {
    buttonsHtml += '<tg-button-row>';
    const [k1, a1] = apiEntries[i];
    buttonsHtml += `<tg-button type="callback_data" style="${a1.recommended ? 'success' : 'primary'}" data="tourl_api_${sessionId}_${k1}">${a1.recommended ? '⭐ ' : ''}${a1.name}</tg-button>`;
    if (apiEntries[i + 1]) {
        const [k2, a2] = apiEntries[i + 1];
        buttonsHtml += `<tg-button type="callback_data" style="${a2.recommended ? 'success' : 'primary'}" data="tourl_api_${sessionId}_${k2}">${a2.recommended ? '⭐ ' : ''}${a2.name}</tg-button>`;
    }
    buttonsHtml += '</tg-button-row>';
}
buttonsHtml += `<tg-button-row><tg-button type="callback_data" style="danger" data="tourl_cancel_${sessionId}">❌ Batal</tg-button></tg-button-row>`;

// Info GitHub kalau token diset
const githubReady = UPLOAD_APIS.github?.config?.token;
const githubInfo = githubReady
    ? `✅ GitHub siap upload ke <code>${UPLOAD_APIS.github.config.owner}/${UPLOAD_APIS.github.config.repo}</code>`
    : `⚠️ GitHub belum diset (isi GITHUB_TOKEN di config.js)`;

await replyRich(ctx, `
<h1>📤 Pilih Server Upload</h1>
<table bordered>
  <tr><td><b>Tipe Media</b></td><td>: ${mediaType}</td></tr>
  <tr><td><b>Ekstensi</b></td><td>: .${fileExt}</td></tr>
</table>
<blockquote>${githubInfo}
Jika API error, bot akan <b>otomatis retry</b> & <b>fallback</b> ke API lain.</blockquote>
<footer>⭐ = Recommended</footer>
${buttonsHtml}
`);
    });

    // ─── Callback: upload via API tertentu ───
    bot.action(/^tourl_api_([a-f0-9]+)_(\w+)$/, async (ctx) => {
        const { UPLOAD_APIS, uploadWithFallback, formatSize } = require('../services/uploader');
        const sessionId = ctx.match[1];
        const apiKey = ctx.match[2];
        const pending = pendingTourl.get(sessionId);

        if (!pending) return ctx.answerCbQuery('⏱️ Sesi habis.', { show_alert: true });
        if (pending.userId !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan sesi kamu.', { show_alert: true });

        await ctx.answerCbQuery(`⏳ Upload via ${UPLOAD_APIS[apiKey]?.name || apiKey}...`);
        try { await ctx.deleteMessage(); } catch (e) {}

        const waitMsg = await sendRichMessage(ctx.chat.id, `
<h1>⏳ Upload Sedang Berjalan...</h1>
<p>Target API: <b>${UPLOAD_APIS[apiKey]?.name || apiKey}</b></p>
<blockquote>Bot akan retry + fallback otomatis jika gagal.</blockquote>
`);

        try {
            const fileLink = await ctx.telegram.getFileLink(pending.fileId);
            const res = await axios.get(fileLink.href, {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 200 * 1024 * 1024,
            });
            const buffer = Buffer.from(res.data);
            const filename = `upload_${Date.now()}.${pending.fileExt}`;

            const result = await uploadWithFallback(buffer, filename, apiKey, console);
            pendingTourl.delete(sessionId);

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            const fallbackNote = result.fallback
                ? `⚠️ <b>Fallback!</b> ${UPLOAD_APIS[apiKey]?.name || apiKey} gagal, menggunakan <b>${result.apiUsed}</b>.`
                : `✅ API: <b>${result.apiUsed}</b>`;

            await sendRichMessage(ctx.chat.id, `
<h1>✅ Upload Berhasil!</h1>
<h2>🔗 URL Publik</h2>
<pre>${escapeHtml(result.url)}</pre>
<h2>📊 Detail</h2>
<table bordered>
  <tr><td><b>API</b></td><td>: ${escapeHtml(result.apiUsed)}</td></tr>
  <tr><td><b>Ukuran</b></td><td>: ${formatSize(buffer.length)}</td></tr>
  <tr><td><b>Durasi</b></td><td>: ${(result.durationMs / 1000).toFixed(2)}s</td></tr>
</table>
<blockquote>${fallbackNote}</blockquote>
<tg-button-row>
  <tg-button type="url" style="primary" url="${result.url}">🌐 Buka URL</tg-button>
</tg-button-row>
`);

        } catch (err) {
            console.error('ToURL Error:', err.message);
            pendingTourl.delete(sessionId);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await sendRichMessage(ctx.chat.id, `
<h1>❌ Upload Gagal</h1>
<p>Semua API upload gagal.</p>
<blockquote>${escapeHtml(err.message.substring(0, 500))}</blockquote>
<footer>💡 Coba lagi atau pakai media lebih kecil.</footer>
`);
        }
    });

    bot.action(/^tourl_cancel_([a-f0-9]+)$/, async (ctx) => {
        pendingTourl.delete(ctx.match[1]);
        await ctx.answerCbQuery('❌ Dibatalkan');
        try { await ctx.deleteMessage(); } catch (e) {}
        await ctx.reply('✅ Upload dibatalkan.');
    });

    // ═══════════════════════════════════════════════════════════
    // /stiker — Convert foto/video jadi stiker
    // ═══════════════════════════════════════════════════════════
    bot.command(['stiker', 'sticker', 's'], async (ctx) => {
        const replied = ctx.message.reply_to_message;
        if (!replied) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply sebuah foto atau video pendek (maks 3 detik), lalu ketik <code>/stiker</code>.',
                accent: '🎨',
            }));
        }

        let fileId = null;
        let isVideo = false;
        let isPhoto = false;

        if (replied.photo) {
            fileId = replied.photo[replied.photo.length - 1].file_id;
            isPhoto = true;
        } else if (replied.video) {
            fileId = replied.video.file_id;
            isVideo = true;
        } else if (replied.animation) {
            fileId = replied.animation.file_id;
            isVideo = true;
        } else {
            return replyRich(ctx, premiumMessage({
                heading: 'Media Tidak Didukung', headingEmoji: '❌',
                body: 'Hanya foto/video bisa dijadikan stiker.',
                accent: '🎨',
            }));
        }

        const waitMsg = await ctx.reply('⏳ Sedang membuat stiker...');

        try {
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink.href);
            const buffer = Buffer.from(await response.arrayBuffer());

            await ctx.replyWithSticker({ source: buffer });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await ctx.reply('❌ Gagal membuat stiker. Pastikan format didukung.');
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /pin — Cari gambar Pinterest
    // ═══════════════════════════════════════════════════════════
    bot.command(['pin', 'pinterest'], async (ctx) => {
        const query = ctx.message.text.split(' ').slice(1).join(' ');
        if (!query) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan kata kunci.',
                pre: '/pin kucing lucu',
                accent: '📌',
            }));
        }

        const waitMsg = await ctx.reply(`🔍 Mencari "${query}" di Pinterest...`);

        try {
            // Coba pakai pinterest-dl
            let results = [];
            try {
                const PinterestDL = require('pinterest-dl');
                const search = await PinterestDL.search(query, { limit: 10 });
                results = search.map(r => r.image || r.url || r);
            } catch (e) {
                // Fallback API
                const { data } = await axios.get(`https://api.ikyyxd.my.id/search/pinterest?q=${encodeURIComponent(query)}&apikey=kyzz`);
                if (data.status && data.result) {
                    results = data.result.map(r => typeof r === 'string' ? r : r.image || r.url);
                }
            }

            if (!results || results.length === 0) throw new Error('Tidak ada hasil ditemukan.');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            const sessionId = crypto.randomBytes(4).toString('hex');
            pinterestCache.set(sessionId, {
                query, media: results,
                userId: ctx.from.id,
                chatId: ctx.chat.id,
                currentIndex: 0,
            });
            setTimeout(() => pinterestCache.delete(sessionId), 10 * 60 * 1000);

            await sendPinterestMedia(ctx, sessionId);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Mencari', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    async function sendPinterestMedia(ctx, sessionId) {
        const session = pinterestCache.get(sessionId);
        if (!session) return ctx.reply('⏱️ Sesi expired. Cari ulang dengan /pin.');

        const item = session.media[session.currentIndex];
        let mediaUrl = typeof item === 'string' ? item : (item.image || item.url || item.src);

        if (!mediaUrl) {
            if (session.currentIndex < session.media.length - 1) {
                session.currentIndex++;
                return sendPinterestMedia(ctx, sessionId);
            }
            return ctx.reply('❌ Gagal menampilkan media.');
        }

        const total = session.media.length;
        const current = session.currentIndex + 1;
        const buttons = [];
        if (total > 1) {
            if (session.currentIndex > 0) buttons.push({ text: '⬅️ Sebelumnya', callback_data: `pin_nav_${sessionId}_prev` });
            if (session.currentIndex < total - 1) buttons.push({ text: 'Selanjutnya ➡️', callback_data: `pin_nav_${sessionId}_next` });
        }

        const replyMarkup = buttons.length > 0 ? { inline_keyboard: [buttons] } : null;

        try {
            await ctx.replyWithPhoto({ url: mediaUrl }, {
                caption: `📌 <b>Pinterest: ${escapeHtml(session.query)}</b>\n\nMedia <b>${current}</b> dari <b>${total}</b>`,
                parse_mode: 'HTML',
                reply_markup: replyMarkup,
            });
        } catch (err) {
            if (session.currentIndex < total - 1) {
                session.currentIndex++;
                return sendPinterestMedia(ctx, sessionId);
            }
            await ctx.reply('❌ Gagal menampilkan sisa media.');
        }
    }

    bot.action(/^pin_nav_([a-f0-9]+)_(next|prev)$/, async (ctx) => {
        const sessionId = ctx.match[1];
        const action = ctx.match[2];
        const session = pinterestCache.get(sessionId);

        if (!session) return ctx.answerCbQuery('⏱️ Sesi expired.', { show_alert: true });
        if (session.userId !== ctx.from.id) return ctx.answerCbQuery('❌ Bukan pencarian kamu.', { show_alert: true });

        if (action === 'next' && session.currentIndex < session.media.length - 1) session.currentIndex++;
        else if (action === 'prev' && session.currentIndex > 0) session.currentIndex--;

        await ctx.answerCbQuery(`📌 Media ${session.currentIndex + 1}`);
        try { await ctx.deleteMessage(); } catch (e) {}
        await sendPinterestMedia(ctx, sessionId);
    });

    // ═══════════════════════════════════════════════════════════
    // /ucbrowser — Download UC Share
    // ═══════════════════════════════════════════════════════════
    bot.command(['ucbrowser', 'uc', 'ucshare'], async (ctx) => {
        const url = ctx.message.text.split(' ').slice(1)[0];
        if (!url || !url.includes('uc-share.com')) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan link UC Share yang valid.',
                pre: '/ucbrowser https://uc-share.com/s/xxx',
                accent: '🎬',
            }));
        }

        const waitMsg = await ctx.reply('⏳ Sedang membongkar isi folder UC Share...\n<i>Bot sedang menelusuri sub-folder.</i>', { parse_mode: 'HTML' });

        try {
            const apiUrl = `https://api.ikyyxd.my.id/download/ucbrowser?url=${encodeURIComponent(url)}`;
            const { data } = await axios.get(apiUrl, { timeout: 60000 });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (!data.status || !data.result) {
                throw new Error(data.message || 'Gagal mengekstrak folder. Pastikan link aktif.');
            }

            const result = data.result;
            let videoList = [];
            if (Array.isArray(result)) videoList = result;
            else if (result.videos && Array.isArray(result.videos)) videoList = result.videos;
            else if (result.data && Array.isArray(result.data)) videoList = result.data;
            else videoList.push(result);

            videoList = videoList.filter(v => v.url || v.video || v.download);

            if (videoList.length === 0) throw new Error('Tidak ada video ditemukan.');

            await replyRich(ctx, `
<h1>📂 UC Share Ditemukan</h1>
<table bordered>
  <tr><td><b>Total Video</b></td><td>: ${videoList.length}</td></tr>
</table>
<footer>✨ Mengirim video satu per satu...</footer>
`);

            let sentCount = 0;
            for (let i = 0; i < videoList.length; i++) {
                const item = videoList[i];
                const videoUrl = item.url || item.video || item.download;
                const title = item.title || item.name || `Video ${i + 1}`;

                try {
                    await ctx.replyWithVideo(
                        { url: videoUrl },
                        {
                            caption: `🎬 <b>${escapeHtml(String(title).substring(0, 60))}</b> (${i + 1}/${videoList.length})`,
                            parse_mode: 'HTML',
                            supports_streaming: true,
                        }
                    );
                    sentCount++;
                } catch (err) {
                    try {
                        await ctx.replyWithDocument({ url: videoUrl }, {
                            caption: `📁 <b>${escapeHtml(String(title).substring(0, 60))}</b> (${i + 1}/${videoList.length})`,
                            parse_mode: 'HTML',
                        });
                        sentCount++;
                    } catch (docErr) {}
                }
                await new Promise(r => setTimeout(r, 2000));
            }

            if (sentCount === 0) {
                await ctx.reply('⚠️ Gagal mengirim file. Server video mungkin memblokir bot.');
            }

        } catch (err) {
            console.error('UC Share Error:', err.message);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Mengekstrak', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });
}

module.exports = { registerDownloaderHandler };