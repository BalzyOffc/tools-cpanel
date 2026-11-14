// ═══════════════════════════════════════════════════════════════
// 📄 handlers/utility.js
// Utility & tools: /ip /dns /cek /gethtml /ss /qr /readqr /sha /md5
//                  /base64 /binary /hex /password /tts /bypass
//                  /shortlink /cuaca /sholat /nulis /fakechat /fakeid
// ═══════════════════════════════════════════════════════════════
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const { replyRich, premiumMessage, replyRichPhoto } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { isPV, isAdmin } = require('../helpers/auth');

const TOOLS_THUMB = config.thumbnailUrl || 'https://i.ibb.co/3sXqY2Z/telegram-bot.jpg';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

// DNS Lookup via Google Public DNS (DoH)
async function dnsLookup(domain, type = 'A') {
    const res = await axios.get(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
        { timeout: config.DNS_TIMEOUT || 10000 }
    );
    return res.data;
}

// Cek Website
async function cekWebsite(url) {
    const start = Date.now();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.CEK_TIMEOUT || 15000);

    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)' },
        });
        clearTimeout(timer);
        const latency = Date.now() - start;
        const server = res.headers.get('server') || '-';
        const contentType = res.headers.get('content-type') || '-';
        const contentLength = res.headers.get('content-length');

        return {
            ok: true,
            status: res.status,
            statusText: res.statusText,
            latency,
            server,
            contentType,
            contentLength: contentLength ? `${(contentLength / 1024).toFixed(2)} KB` : '-',
            finalUrl: res.url,
            redirected: res.url !== url,
        };
    } catch (err) {
        clearTimeout(timer);
        return {
            ok: false,
            error: err.name === 'AbortError' ? 'Timeout' : err.message,
            latency: Date.now() - start,
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerUtilityHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /ip — OSINT IP
    // ═══════════════════════════════════════════════════════════
    bot.command(['ip', 'trackip'], async (ctx) => {
        const ip = ctx.message.text.split(' ').slice(1)[0];
        if (!ip) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Gunakan: <code>/ip 8.8.8.8</code>',
                accent: '🌐',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Mencari Informasi IP...', headingEmoji: '⏳',
            body: `Memproses IP: <code>${escapeHtml(ip)}</code>`,
            accent: '📡',
        }));

        try {
            const apiUrl = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
            const { data } = await axios.get(apiUrl, { timeout: 15000 });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            if (data.status === 'fail') {
                return replyRich(ctx, premiumMessage({
                    heading: 'Gagal', headingEmoji: '❌',
                    body: `IP tidak valid.\n\n<code>${escapeHtml(data.message || 'Unknown')}</code>`,
                    accent: '⚠️',
                }));
            }

            const resultText =
`IP: ${data.query || ip}
Kota: ${data.city || '-'}
Region: ${data.regionName || '-'} (${data.region || '-'})
Negara: ${data.country || '-'} (${data.countryCode || '-'})
Kode Pos: ${data.zip || '-'}
Koordinat: ${data.lat || '-'}, ${data.lon || '-'}
Timezone: ${data.timezone || '-'}
ISP: ${data.isp || '-'}
Organisasi: ${data.org || '-'}
AS: ${data.as || '-'}`;

            const hasCoords = data.lat && data.lon;
            const mapsUrl = hasCoords ? `https://www.google.com/maps?q=${data.lat},${data.lon}` : null;
            const buttons = [];
            if (mapsUrl) buttons.push({ text: '📍 Buka Google Maps', url: mapsUrl, color: 'success' });

            await replyRich(ctx, premiumMessage({
                heading: 'Hasil OSINT IP', headingEmoji: '🌐',
                body: `Informasi IP: <code>${escapeHtml(ip)}</code>`,
                pre: escapeHtml(resultText),
                footer: 'Data dari IP-API.com',
                accent: '📄',
                buttons,
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Memproses IP', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /dns — DNS Lookup
    // ═══════════════════════════════════════════════════════════
    bot.command(['dns', 'lookupdns'], async (ctx) => {
        if (!isPV(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Khusus PV', headingEmoji: '🔒',
                body: 'Fitur /dns hanya di Private Chat.',
                accent: '🌐',
            }));
        }

        const args = ctx.message.text.split(' ').slice(1);
        const domain = args[0]?.trim();
        const type = (args[1] || 'A').toUpperCase();
        const validTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA'];

        if (!domain) {
            return replyRich(ctx, premiumMessage({
                heading: 'DNS Lookup', headingEmoji: '🌐',
                body: 'Format:',
                pre: '/dns <domain> [tipe]',
                listItems: [`📌 Contoh: <code>/dns google.com MX</code>`, `📋 Tipe: <code>${validTypes.join(', ')}</code>`],
                accent: '🔍',
            }));
        }

        if (!validTypes.includes(type)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Tipe DNS Salah', headingEmoji: '❌',
                body: `Tipe <code>${escapeHtml(type)}</code> tidak didukung.`,
                pre: `Pilih: ${validTypes.join(', ')}`,
                accent: '⚠️',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'DNS Lookup...', headingEmoji: '⏳',
            body: `Domain: <code>${escapeHtml(domain)}</code>\nTipe: <b>${type}</b>`,
            accent: '🌐',
        }));

        try {
            const data = await dnsLookup(domain, type);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (!data.Answer || data.Answer.length === 0) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Tidak Ada Record', headingEmoji: '📭',
                    body: `<code>${escapeHtml(domain)}</code> tidak punya record <b>${type}</b>.`,
                    blockquote: `Status DNS: ${data.Status === 0 ? 'OK' : 'Error ' + data.Status}`,
                    accent: '🌐',
                }));
            }

            const records = data.Answer.map((a, i) => {
                const ttl = a.TTL ? ` (TTL: ${a.TTL}s)` : '';
                return `${i + 1}. <code>${escapeHtml(a.data)}</code>${ttl}`;
            }).join('\n');

            await replyRich(ctx, premiumMessage({
                heading: `DNS ${type} Record`, headingEmoji: '🌐',
                body: `Domain: <code>${escapeHtml(domain)}</code>`,
                pre: records,
                listItems: [`📊 Total: <b>${data.Answer.length}</b>`],
                footer: `Query via Google Public DNS (${type})`,
                accent: '🔍',
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'DNS Lookup Gagal', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /cek — Cek Website Up/Down
    // ═══════════════════════════════════════════════════════════
    bot.command(['cek', 'check', 'updown'], async (ctx) => {
        if (!isPV(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Khusus PV', headingEmoji: '🔒',
                accent: '🌐',
            }));
        }

        const url = ctx.message.text.split(' ').slice(1)[0]?.trim();
        if (!url) {
            return replyRich(ctx, premiumMessage({
                heading: 'Cek Website', headingEmoji: '🌐',
                body: 'Format:',
                pre: '/cek <url>',
                listItems: ['📌 Contoh: <code>/cek google.com</code>'],
                accent: '🔍',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Mengecek Website...', headingEmoji: '⏳',
            body: `URL: <code>${escapeHtml(url)}</code>`,
            accent: '🌐',
        }));

        try {
            const result = await cekWebsite(url);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (result.ok) {
                const isUp = result.status >= 200 && result.status < 400;
                const isRedirect = result.status >= 300 && result.status < 400;
                const isClientErr = result.status >= 400 && result.status < 500;
                const statusEmoji = isUp ? '✅' : isRedirect ? '↪️' : isClientErr ? '⚠️' : '❌';
                const statusText = isUp ? 'UP' : isRedirect ? 'REDIRECT' : isClientErr ? 'CLIENT ERROR' : 'SERVER ERROR';
                const latencyStr = result.latency < 1000 ? `${result.latency}ms` : `${(result.latency / 1000).toFixed(2)}s`;

                await replyRich(ctx, premiumMessage({
                    heading: `Website ${statusText}`, headingEmoji: statusEmoji,
                    body: `URL: <code>${escapeHtml(result.finalUrl)}</code>`,
                    pre:
`Status Code : ${result.status} ${result.statusText || ''}
Latency     : ${latencyStr}
Server      : ${result.server}
Content-Type: ${result.contentType}
Ukuran      : ${result.contentLength}`,
                    blockquote: isUp
                        ? '✅ Website aktif dan merespon normal.'
                        : isRedirect
                            ? '↪️ Website redirect ke URL lain.'
                            : isClientErr
                                ? '⚠️ Website return error client.'
                                : '❌ Website return server error.',
                    footer: `Dicek: ${new Date().toLocaleString('id-ID')}`,
                    accent: '🌐',
                    buttons: [{ text: '🔗 Buka Website', url: result.finalUrl, color: 'primary' }],
                }));
            } else {
                await replyRich(ctx, premiumMessage({
                    heading: 'Website DOWN', headingEmoji: '❌',
                    body: `URL: <code>${escapeHtml(url)}</code>`,
                    pre: `Status  : Tidak dapat diakses\nError   : ${result.error}\nLatency : ${result.latency}ms`,
                    blockquote: `❌ Tidak merespon dalam ${(config.CEK_TIMEOUT || 15000) / 1000} detik.`,
                    accent: '⚠️',
                }));
            }

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Cek', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /gethtml — Ambil source HTML
    // ═══════════════════════════════════════════════════════════
    bot.command('gethtml', async (ctx) => {
        const url = ctx.message.text.split(' ').slice(1)[0];
        if (!url || !url.startsWith('http')) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/gethtml https://example.com',
                accent: '🌐',
            }));
        }

        if (!await isAdmin(ctx) && ctx.from.id !== config.OWNER_ID) {
            return replyRich(ctx, premiumMessage({ heading: 'Akses Ditolak', headingEmoji: '🚫', accent: '🔒' }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Mengambil HTML...', headingEmoji: '⏳',
            body: `<code>${escapeHtml(url)}</code>`,
            accent: '🌐',
        }));

        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            const rawHtml = await response.text();

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            if (rawHtml.length > 3500) {
                const buffer = Buffer.from(rawHtml, 'utf8');
                const sizeKB = (buffer.length / 1024).toFixed(2);
                await ctx.replyWithDocument(
                    { source: buffer, filename: 'source_code.html' },
                    {
                        caption: `🌐 <b>HTML Source</b>\nURL: <code>${escapeHtml(url)}</code>\nUkuran: <b>${sizeKB} KB</b>`,
                        parse_mode: 'HTML',
                    }
                );
            } else {
                await replyRich(ctx, `
<h1>🌐 HTML Source Code</h1>
<table bordered>
  <tr><td><b>URL</b></td><td>: <code>${escapeHtml(url)}</code></td></tr>
  <tr><td><b>Ukuran</b></td><td>: <b>${(rawHtml.length / 1024).toFixed(2)} KB</b></td></tr>
</table>
<pre>${escapeHtml(rawHtml)}</pre>
`);
            }

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Ambil HTML', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /ss — Screenshot Website
    // ═══════════════════════════════════════════════════════════
    bot.command('ss', async (ctx) => {
        const url = ctx.message.text.split(' ').slice(1)[0];
        if (!url || !url.startsWith('http')) {
            return replyRich(ctx, `
<h1>📸 Screenshot Website</h1>
<table bordered>
  <tr><td><b>Command</b></td><td>: <code>/ss &lt;url&gt;</code></td></tr>
  <tr><td><b>Contoh</b></td><td>: <code>/ss https://example.com</code></td></tr>
</table>
`);
        }

        const waitMsg = await replyRich(ctx, `
<h1>⏳ Mengambil Screenshot...</h1>
<p>Memproses: <code>${escapeHtml(url)}</code></p>
`);

        try {
            const screenshotUrl = `https://image.thum.io/get/width/800/${url}`;
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            await replyRichPhoto(ctx, { url: screenshotUrl }, `
<h1>📸 Screenshot Berhasil</h1>
<table bordered>
  <tr><td><b>Website</b></td><td>: <code>${escapeHtml(url)}</code></td></tr>
  <tr><td><b>Status</b></td><td>: <span style="color: green;">Berhasil ✅</span></td></tr>
</table>
<tg-button-row>
  <tg-button type="url" style="primary" url="${escapeHtml(url)}">🌐 Buka Website</tg-button>
</tg-button-row>
`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Screenshot', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /qr — Generate QR
    // ═══════════════════════════════════════════════════════════
    bot.command('qr', async (ctx) => {
        const QRCode = require('qrcode');
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan teks/link.',
                pre: '/qr https://example.com',
                accent: '📱',
            }));
        }

        try {
            const qrBuffer = await QRCode.toBuffer(text, {
                width: 512,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' },
            });

            await ctx.replyWithPhoto(
                { source: qrBuffer, filename: 'qrcode.png' },
                {
                    caption: `✅ <b>QR Code Berhasil</b>\n\nIsi: <code>${escapeHtml(text)}</code>`,
                    parse_mode: 'HTML',
                }
            );
        } catch (err) {
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /readqr — Baca QR dari foto
    // ═══════════════════════════════════════════════════════════
    bot.command('readqr', async (ctx) => {
        const replied = ctx.message.reply_to_message;
        if (!replied || !replied.photo) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Reply gambar QR Code, lalu:',
                pre: '/readqr',
                accent: '📷',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Membaca QR Code...', headingEmoji: '🔍',
            accent: '📸',
        }));

        try {
            const { decode: decodeQR } = require('@qrstuff/qured');
            const fileId = replied.photo[replied.photo.length - 1].file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink.href);
            const buffer = Buffer.from(await response.arrayBuffer());

            const result = await decodeQR(buffer, { worker: false });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            if (!result || !result.text) {
                return replyRich(ctx, premiumMessage({
                    heading: 'QR Tidak Terbaca', headingEmoji: '😔',
                    body: 'Tidak ada QR Code terdeteksi.',
                    accent: '⚠️',
                }));
            }

            await replyRich(ctx, premiumMessage({
                heading: 'Hasil Baca QR', headingEmoji: '✅',
                body: 'Isi QR Code:',
                pre: escapeHtml(result.text),
                accent: '📄',
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Membaca', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /sha — Hash SHA
    // ═══════════════════════════════════════════════════════════
    bot.command('sha', async (ctx) => {
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) return replyRich(ctx, premiumMessage({ heading: 'Format Salah', headingEmoji: '❌', pre: '/sha rahasia123' }));

        const sha256 = crypto.createHash('sha256').update(text).digest('hex');
        const sha1 = crypto.createHash('sha1').update(text).digest('hex');
        const sha512 = crypto.createHash('sha512').update(text).digest('hex');

        await replyRich(ctx, `
<h1>🔐 Hash Generator</h1>
<hr>
<p>Teks: <code>${escapeHtml(text)}</code></p>
<table bordered>
  <tr><th>Algoritma</th><th>Hasil</th></tr>
  <tr><td><b>SHA-256</b></td><td><code>${sha256}</code></td></tr>
  <tr><td><b>SHA-1</b></td><td><code>${sha1}</code></td></tr>
  <tr><td><b>SHA-512</b></td><td><code>${sha512}</code></td></tr>
</table>
`);
    });

    // ═══════════════════════════════════════════════════════════
    // /md5 — Hash MD5
    // ═══════════════════════════════════════════════════════════
    bot.command('md5', async (ctx) => {
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) return replyRich(ctx, premiumMessage({ heading: 'Format Salah', headingEmoji: '❌' }));

        const md5 = crypto.createHash('md5').update(text).digest('hex');
        await replyRich(ctx, `
<h1>🔐 MD5 Hash</h1>
<hr>
<p>Teks: <code>${escapeHtml(text)}</code></p>
<table bordered>
  <tr><td><b>MD5</b></td><td><code>${md5}</code></td></tr>
</table>
`);
    });

    // ═══════════════════════════════════════════════════════════
    // /base64
    // ═══════════════════════════════════════════════════════════
    bot.command('base64', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const mode = args[0]?.toLowerCase();
        const text = args.slice(1).join(' ');

        if (!mode || !text || !['encode', 'decode'].includes(mode)) {
            return replyRich(ctx, `<h1>📝 Base64</h1><pre>/base64 encode Halo</pre>`);
        }

        try {
            const result = mode === 'encode'
                ? Buffer.from(text, 'utf8').toString('base64')
                : Buffer.from(text, 'base64').toString('utf8');

            if (mode === 'decode' && (!result || result.includes('\uFFFD'))) {
                throw new Error('Base64 tidak valid.');
            }

            await replyRich(ctx, `
<h1>📝 Base64 ${mode.toUpperCase()}</h1>
<hr>
<p>Input: <code>${escapeHtml(text)}</code></p>
<h2>✅ Hasil</h2>
<pre>${escapeHtml(result)}</pre>
`);
        } catch (err) {
            await replyRich(ctx, `<h1>❌ Gagal</h1><p><code>${escapeHtml(err.message)}</code></p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /binary
    // ═══════════════════════════════════════════════════════════
    bot.command('binary', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const mode = args[0]?.toLowerCase();
        const text = args.slice(1).join(' ');

        if (!mode || !text || !['encode', 'decode'].includes(mode)) {
            return replyRich(ctx, `<h1>💻 Binary</h1><pre>/binary encode Halo</pre>`);
        }

        try {
            const result = mode === 'encode'
                ? text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ')
                : text.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');

            await replyRich(ctx, `
<h1>💻 Binary ${mode.toUpperCase()}</h1>
<hr>
<p>Input: <code>${escapeHtml(text)}</code></p>
<h2>✅ Hasil</h2>
<pre>${escapeHtml(result)}</pre>
`);
        } catch (err) {
            await replyRich(ctx, `<h1>❌ Gagal</h1><p><code>${escapeHtml(err.message)}</code></p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /hex
    // ═══════════════════════════════════════════════════════════
    bot.command('hex', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const mode = args[0]?.toLowerCase();
        const text = args.slice(1).join(' ');

        if (!mode || !text || !['encode', 'decode'].includes(mode)) {
            return replyRich(ctx, `<h1>🔢 Hex</h1><pre>/hex encode Halo</pre>`);
        }

        try {
            const result = mode === 'encode'
                ? text.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
                : text.split(' ').map(h => String.fromCharCode(parseInt(h, 16))).join('');

            await replyRich(ctx, `
<h1>🔢 Hex ${mode.toUpperCase()}</h1>
<hr>
<p>Input: <code>${escapeHtml(text)}</code></p>
<h2>✅ Hasil</h2>
<pre>${escapeHtml(result)}</pre>
`);
        } catch (err) {
            await replyRich(ctx, `<h1>❌ Gagal</h1><p><code>${escapeHtml(err.message)}</code></p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /password — Generator password
    // ═══════════════════════════════════════════════════════════
    bot.command(['password', 'passgen'], async (ctx) => {
        let length = parseInt(ctx.message.text.split(' ').slice(1)[0]) || 16;
        if (length < 8 || length > 64) length = 16;

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        await replyRich(ctx, `
<h1>🔐 Password Generator</h1>
<hr>
<p>Password acak panjang <b>${length}</b>:</p>
<pre>${escapeHtml(password)}</pre>
<footer>✨ Simpan di tempat aman!</footer>
`);
    });

    // ═══════════════════════════════════════════════════════════
    // /tts — Text to Speech
    // ═══════════════════════════════════════════════════════════
    bot.command('tts', async (ctx) => {
        const googleTTS = require('@sefinek/google-tts-api');
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/tts Halo semua!',
                accent: '🗣️',
            }));
        }

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Membuat Suara...', headingEmoji: '⏳',
            accent: '🎙️',
        }));

        try {
            const shortText = text.length > 200 ? text.substring(0, 200) : text;
            const base64Audio = await googleTTS.getAudioBase64(shortText, {
                lang: 'id',
                slow: false,
                timeout: 10000,
            });
            const audioBuffer = Buffer.from(base64Audio, 'base64');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            await ctx.replyWithVoice(
                { source: audioBuffer, filename: 'tts.ogg' },
                {
                    caption: `🗣️ <b>TTS</b>\n\n<i>${escapeHtml(text.length > 200 ? text.substring(0, 200) + '...' : text)}</i>`,
                    parse_mode: 'HTML',
                }
            );
        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                footer: 'Teks maksimal 200 karakter.',
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /bypass — Bypass shortlink
    // ═══════════════════════════════════════════════════════════
    bot.command(['bypass', 'unshort'], async (ctx) => {
        const url = ctx.message.text.split(' ').slice(1)[0];
        if (!url || !url.startsWith('http')) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/bypass https://bit.ly/xxx',
                accent: '🔗',
            }));
        }

        const waitMsg = await ctx.reply('🔍 Melacak link asli...');

        try {
            const res = await axios.get(url, {
                maxRedirects: 10,
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                validateStatus: () => true,
            });

            const finalUrl = res.request?.res?.responseUrl || url;
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (finalUrl === url) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Tidak Ada Redirect', headingEmoji: 'ℹ️',
                    body: 'Link tersebut tidak redirect, atau aslinya memang itu.',
                    blockquote: `URL: <code>${escapeHtml(url)}</code>`,
                    accent: '🔗',
                }));
            }

            await replyRich(ctx, premiumMessage({
                heading: 'Link Asli Ditemukan!', headingEmoji: '✅',
                body: 'Bot berhasil melewati shortlink.',
                listItems: [
                    `📌 Asli: <code>${escapeHtml(url)}</code>`,
                    `🎯 Tujuan: <code>${escapeHtml(finalUrl)}</code>`,
                ],
                footer: 'Hati-hati saat buka link asing.',
                accent: '🛡️',
                buttons: [{ text: '🌐 Buka Link Asli', url: finalUrl, color: 'success' }],
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Bypass Gagal', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /shortlink — Perpendek URL
    // ═══════════════════════════════════════════════════════════
    bot.command(['shortlink', 'short'], async (ctx) => {
        const url = ctx.message.text.split(' ').slice(1)[0];
        if (!url || !url.startsWith('http')) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/shortlink https://example.com/artikel-panjang',
                accent: '🔗',
            }));
        }

        const waitMsg = await ctx.reply('⏳ Memperpendek URL...');

        try {
            const { data } = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
            if (!data || !data.startsWith('http')) throw new Error('Gagal membuat shortlink.');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRich(ctx, `
<h1>🔗 URL Shortener</h1>
<hr>
<p>URL Asli:</p>
<blockquote>${escapeHtml(url)}</blockquote>
<h2>✅ Hasil</h2>
<pre>${escapeHtml(data)}</pre>
<tg-button-row>
  <tg-button type="url" style="success" url="${data}">🌐 Buka Shortlink</tg-button>
</tg-button-row>
`);
        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, `<h1>❌ Gagal</h1><p><code>${escapeHtml(err.message)}</code></p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /cuaca — Info Cuaca
    // ═══════════════════════════════════════════════════════════
    bot.command(['cuaca', 'weather'], async (ctx) => {
        const city = ctx.message.text.split(' ').slice(1).join(' ');
        if (!city) return replyRich(ctx, `<h1>❌ Format Salah</h1><pre>/cuaca Jakarta</pre>`);

        const waitMsg = await replyRich(ctx, `<h1>⏳ Mencari Cuaca...</h1><p>Memeriksa: <b>${escapeHtml(city)}</b></p>`);

        try {
            const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`);
            if (!geoRes.data.results || geoRes.data.results.length === 0) throw new Error('Kota tidak ditemukan.');

            const loc = geoRes.data.results[0];
            const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`);
            const w = weatherRes.data.current_weather;

            const weatherCodes = {
                0: 'Cerah ☀️', 1: 'Cerah Berawan 🌤️', 2: 'Berawan ⛅', 3: 'Mendung ☁️',
                45: 'Berkabut 🌫️', 48: 'Kabut Beku 🌫️', 51: 'Gerimis Ringan 🌦️',
                61: 'Hujan Ringan 🌧️', 63: 'Hujan Sedang 🌧️', 65: 'Hujan Lebat 🌧️',
                80: 'Hujan Lokal 🌦️', 95: 'Badai Petir ⛈️',
            };

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRichPhoto(ctx, TOOLS_THUMB, `
<h1>🌤️ Info Cuaca</h1>
<hr>
<h2>📍 ${escapeHtml(loc.name)}, ${escapeHtml(loc.country)}</h2>
<table bordered>
  <tr><td><b>Cuaca</b></td><td>${weatherCodes[w.weathercode] || 'Tidak diketahui'}</td></tr>
  <tr><td><b>Suhu</b></td><td>${w.temperature} °C</td></tr>
  <tr><td><b>Angin</b></td><td>${w.windspeed} km/j</td></tr>
  <tr><td><b>Koordinat</b></td><td>${w.latitude}, ${w.longitude}</td></tr>
</table>
<footer>✨ Data dari Open-Meteo.com</footer>
`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, `<h1>❌ Gagal</h1><p><code>${escapeHtml(err.message)}</code></p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /sholat — Jadwal Sholat
    // ═══════════════════════════════════════════════════════════
    bot.command(['sholat', 'salat'], async (ctx) => {
        const cityQuery = ctx.message.text.split(' ').slice(1).join(' ');
        if (!cityQuery) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/sholat Jakarta',
                accent: '🕌',
            }));
        }

        const waitMsg = await ctx.reply(`🔍 Mencari jadwal sholat *${cityQuery}*...`, { parse_mode: 'Markdown' });

        try {
            const searchRes = await axios.get(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(cityQuery)}`);
            if (!searchRes.data.status || !searchRes.data.data?.length) throw new Error(`Kota "${cityQuery}" tidak ditemukan.`);

            const cityData = searchRes.data.data[0];
            const cityId = cityData.id;
            const cityName = cityData.lokasi;

            const today = new Date().toISOString().split('T')[0];
            const jadwalRes = await axios.get(`https://api.myquran.com/v2/sholat/jadwal/${cityId}/${today}`);
            if (!jadwalRes.data.status || !jadwalRes.data.data) throw new Error('Gagal mengambil jadwal.');

            const jadwal = jadwalRes.data.data.jadwal;
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            await replyRich(ctx, `
<h1>🕌 Jadwal Sholat</h1>
<h2>📍 ${escapeHtml(cityName)}</h2>
<p>Tanggal: <b>${jadwal.tanggal}</b></p>
<table bordered>
  <tr><th>Waktu</th><th>Jam</th></tr>
  <tr><td>🌅 Imsak</td><td>${jadwal.imsak}</td></tr>
  <tr><td>🌄 Subuh</td><td>${jadwal.subuh}</td></tr>
  <tr><td>☀️ Terbit</td><td>${jadwal.terbit}</td></tr>
  <tr><td>🌤️ Dzuhur</td><td>${jadwal.dzuhur}</td></tr>
  <tr><td>🌇 Ashar</td><td>${jadwal.ashar}</td></tr>
  <tr><td>🌆 Maghrib</td><td>${jadwal.maghrib}</td></tr>
  <tr><td>🌃 Isya</td><td>${jadwal.isya}</td></tr>
</table>
<footer>✨ Sumber: myquran.com (Kemenag)</footer>
`);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, `<h1>❌ Gagal</h1><p>${escapeHtml(err.message)}</p>`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /nulis — Canvas tulisan tangan
    // ═══════════════════════════════════════════════════════════
    bot.command(['nulis', 'tulisan'], async (ctx) => {
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/nulis Halo semua!',
                accent: '✍️',
            }));
        }
        if (text.length > 300) {
            return replyRich(ctx, premiumMessage({
                heading: 'Teks Terlalu Panjang', headingEmoji: '❌',
                body: `Max 300 karakter. Kamu: <b>${text.length}</b>.`,
                accent: '⚠️',
            }));
        }

        const waitMsg = await ctx.reply('✍️ Sedang menulis...');

        try {
            const apiUrl = `https://api.ikyyxd.my.id/canvas/nulis?apikey=kyzz&text=${encodeURIComponent(text)}`;
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });

            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                const errorText = Buffer.from(response.data).toString('utf8');
                throw new Error(`API Error: ${errorText.substring(0, 100)}`);
            }

            const imageBuffer = Buffer.from(response.data);
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            await ctx.replyWithPhoto(
                { source: imageBuffer, filename: 'nulis.png' },
                {
                    caption: `✍️ <b>Canvas Nulis</b>\n\nTeks: <i>${escapeHtml(text.substring(0, 100))}${text.length > 100 ? '...' : ''}</i>`,
                    parse_mode: 'HTML',
                }
            );

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Menulis', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /fakechat — Quotes maker
    // ═══════════════════════════════════════════════════════════
    bot.command(['fakechat', 'quotes'], async (ctx) => {
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                pre: '/fakechat Halo, selamat pagi!',
                accent: '💬',
            }));
        }

        let targetName = ctx.from.first_name;
        let targetAvatar = '';

        const photoTarget = ctx.message.reply_to_message?.from || ctx.from;
        if (ctx.message.reply_to_message?.from) targetName = photoTarget.first_name;

        try {
            const photos = await ctx.telegram.getUserProfilePhotos(photoTarget.id, 0, 1);
            if (photos.total_count > 0) {
                const fileId = photos.photos[0][0].file_id;
                const link = await ctx.telegram.getFileLink(fileId);
                targetAvatar = link.href;
            }
        } catch (e) {}

        const waitMsg = await ctx.reply('⏳ Membuat Fake Chat...');

        try {
            let apiUrl = `https://api.popcat.xyz/quote?text=${encodeURIComponent(text)}&name=${encodeURIComponent(targetName)}`;
            if (targetAvatar) apiUrl += `&avatar=${encodeURIComponent(targetAvatar)}`;

            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            await ctx.replyWithPhoto(
                { source: imageBuffer, filename: 'quotes.png' },
                { caption: `💬 Fake Chat: <b>${escapeHtml(targetName)}</b>`, parse_mode: 'HTML' }
            );

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await ctx.reply('❌ Gagal membuat Fake Chat.');
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /fakeid — Sertifikat lucu
    // ═══════════════════════════════════════════════════════════
    bot.command(['fakeid', 'sertifikat'], async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const name = args.join(' ') || ctx.from.first_name;
        const profession = 'Sultan Ganteng';

        const waitMsg = await replyRich(ctx, premiumMessage({
            heading: 'Membuat Sertifikat...', headingEmoji: '⏳',
            body: `Atas nama: <b>${escapeHtml(name)}</b>`,
            accent: '🏆',
        }));

        try {
            const imageUrl = `https://api.popcat.xyz/certificate?name=${encodeURIComponent(name)}&title=${encodeURIComponent(profession)}`;
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
            const imageBuffer = Buffer.from(response.data, 'binary');

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            try { await ctx.deleteMessage(); } catch (e) {}

            await ctx.replyWithPhoto(
                { source: imageBuffer, filename: 'sertifikat.png' },
                {
                    caption: `🏆 <b>Sertifikat Prestasi</b>\n\nKepada: <b>${escapeHtml(name)}</b>\n\n<i>Sebagai: ${profession}</i>`,
                    parse_mode: 'HTML',
                }
            );

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, `<h1>❌ Gagal</h1><p><code>${escapeHtml(err.message)}</code></p>`);
        }
    });
}

module.exports = { registerUtilityHandler };