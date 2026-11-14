// ═══════════════════════════════════════════════════════════════
// 📄 handlers/start.js — /start, menu utama, semua callback menu
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { bot } = require('../core/bot-instance');
const { escapeHtml } = require('../helpers/html');
const { ROLE_META } = require('../core/constants');
const { getUserRole } = require('../helpers/role');
const { state } = require('../state/maps');

const SOCIABUZZ_URL = 'https://sociabuzz.com/balzyoffc/donate';

const rgbTimers = new Map();

const RGB_STYLES = ['primary', 'success', 'danger']; // Urutan warna
const DEFAULT_THUMB = 'https://raw.githubusercontent.com/BalzyOffc/bot-uploads/main/uploads/upload_1794562665102_1794562665107_g0zuch.mp4';

// ═══════════════════════════════════════════════════════════════
// FUNGSI ANIMASI WARNA TOMBOL
// ═══════════════════════════════════════════════════════════════
function startButtonAnimation(ctx, baseHtml, originalKeyboard) {
    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery?.message?.message_id || ctx.message?.message_id;

    if (!messageId) return;
    
    stopButtonAnimation(chatId);

    let step = 0;

    const interval = setInterval(async () => {
        try {
            step++;
            if (step >= RGB_STYLES.length) step = 0;

            const newKeyboard = JSON.parse(JSON.stringify(originalKeyboard));

            let count = 0;
            for (let row = 0; row < newKeyboard.length; row++) {
                for (let col = 0; col < newKeyboard[row].length; col++) {
                    const btn = newKeyboard[row][col];
                    
                    if (!btn.url) {
                        if (/kembali|back/i.test(btn.text)) {
                            btn.style = 'danger';
                        } else {
                            const styleIndex = (count + step) % RGB_STYLES.length;
                            btn.style = RGB_STYLES[styleIndex];
                            count++;
                        }
                    }
                }
            }

            // 🔥 BAGIAN YANG DIGANTI: Deteksi Teks vs Caption Video
            try {
                await ctx.telegram.editMessageText(chatId, messageId, null, baseHtml, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: newKeyboard }
                });
            } catch (err) {
                if (/there is no text in the message to edit/i.test(err.description || '')) {
                    await ctx.telegram.editMessageCaption(chatId, messageId, null, baseHtml, {
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: newKeyboard }
                    });
                } else if (!/message is not modified/i.test(err.description || '')) {
                    throw err;
                }
            }

        } catch (e) {
            if (!/message is not modified/i.test(e.description || '')) {
                if (/message to edit not found/i.test(e.description || '')) {
                    stopButtonAnimation(chatId);
                }
            }
        }
    }, 2000);

    rgbTimers.set(chatId, interval);
}

function stopButtonAnimation(chatId) {
    if (rgbTimers.has(chatId)) {
        clearInterval(rgbTimers.get(chatId));
        rgbTimers.delete(chatId);
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: edit pesan HTML (text / caption)
// ═══════════════════════════════════════════════════════════════
async function editHtml(ctx, html, keyboard) {
    const baseOpts = {
        parse_mode: 'HTML',
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    };
    const textOpts = { ...baseOpts, disable_web_page_preview: true };

    try {
        await ctx.editMessageText(html, textOpts);
        return;
    } catch (e) {
        const desc = e.description || '';
        if (/message is not modified/i.test(desc)) return;

        // Pesan lama adalah foto → edit caption
        if (/no text in the message/i.test(desc)) {
            try {
                await ctx.editMessageCaption(html, baseOpts);
                return;
            } catch (_) {}
        }

        // Fallback kirim baru (teks)
        try { await ctx.reply(html, textOpts); } catch (_) {}
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: render ulang menu start (edit caption kalau bisa)
// ═══════════════════════════════════════════════════════════════
async function reRenderStartMenu(ctx) {
    const isPv = ctx.chat.type === 'private';
    const { html, keyboard } = await renderStartMenu(ctx.from, isPv);
    const vid = DEFAULT_THUMB; 
    const captionSafe = html.length <= 1024;

    // 1) Coba edit caption (karena pesan lama berupa video)
    if (captionSafe) {
        try {
            await ctx.editMessageCaption(html, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
            });
            return;
        } catch (e) {
            const desc = e.description || '';
            if (/message is not modified/i.test(desc)) return;
        }
    }

    // 2) Hapus pesan lama + kirim video baru
    try { await ctx.deleteMessage(); } catch (_) {}

    if (captionSafe) {
        try {
            await bot.telegram.sendVideo(ctx.chat.id, vid, {
                caption: html,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
            });
            return;
        } catch (_) {}
    }

    // 3) Fallback teks (jika video gagal load)
    await ctx.reply(html, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
    });
}

// ═══════════════════════════════════════════════════════════════
// RENDER START MENU (return { html, keyboard })
// ═══════════════════════════════════════════════════════════════
async function renderStartMenu(user, isPv) {
    const botName = config.botName || 'BALZY MD';
    const uptime = Math.floor(process.uptime());
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeStr = `${d}d ${h}h ${m}m ${s}s`;

    const roleData = await getUserRole(user.id).catch(() => ({ role: 'user' }));
    const roleMeta = ROLE_META[roleData.role] || ROLE_META.user;

    const now = new Date();
    const vpsTime = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Asia/Jakarta',
    }).replace(/\./g, '-') + ' WIB';

    let totalUsers = 0, totalGroups = 0;
    try {
        const counts = db.getTargetCounts();
        totalUsers = counts.users || 0;
        totalGroups = counts.groups || 0;
    } catch (e) {}

    let userSaldo = 0, userWins = 0, userLosses = 0;
    try {
        userSaldo = db.getSaldo(user.id) || 0;
        const score = db.getScore(user.id) || { wins: 0, losses: 0 };
        userWins = score.wins || 0;
        userLosses = score.losses || 0;
    } catch (e) {}

    const userInfo = `
<b>👤 Informasi User</b>
<b>Nama</b>     : ${escapeHtml(user.first_name || '-')}
<b>Username</b> : @${escapeHtml(user.username || '-')}
<b>ID</b>       : <code>${user.id}</code>
<b>Role</b>     : ${roleMeta.emoji} <b>${roleMeta.label}</b>
<b>Saldo</b>    : 💰 <b>${userSaldo}</b>
<b>Statistik</b>: 🏆 ${userWins}W / 😢 ${userLosses}L
<b>GC Only</b>  : ${state.gcOnlyGlobal ? '🔒 ON' : '🔓 OFF'}`;

    const botInfo = `
<b>📊 Statistik Bot</b>
<b>Uptime</b>     : ${uptimeStr}
<b>VPS Time</b>   : ${vpsTime}
<b>Total User</b> : 👥 <b>${totalUsers}</b>
<b>Total Grup</b> : 📢 <b>${totalGroups}</b>
<b>Mode</b>       : ${state.gcOnlyGlobal ? '🔒 Group Only' : '🌐 Full Access'}`;

    const isOwner = user.id === config.OWNER_ID;
    const channelLink = config.REQUIRED_CHANNEL_LINK || 'https://t.me/telegram';

    if (isPv) {
        const html = `<b>🛡️ ${botName}</b>
Selamat datang di <b>Private Chat Panel</b>. Gunakan bot ini dengan bijak.

${userInfo}

${botInfo}
━━━━━━━━━━━━━━━━━━━━
Silakan pilih kategori menu di bawah:`;

            const keyboard = [
        [
            { text: '🛠️ Utility', callback_data: 'menu_utility', style: 'primary' },
            { text: '📥 Download', callback_data: 'menu_download', style: 'success' },
        ],
        [
            { text: '🎮 Game', callback_data: 'menu_game', style: 'danger' },
            { text: '🤖 AI', callback_data: 'menu_ai', style: 'primary' },
        ],
        [
            { text: 'ℹ️ Tentang', callback_data: 'menu_about', style: 'success' },
            { text: '💖 Donasi', callback_data: 'menu_donate', style: 'danger' },
        ],
        [{ text: '📢 Join Channel', url: channelLink, style: 'primary' }],
    ];
    if (isOwner) {
        keyboard.push([{ text: '👑 Menu Owner', callback_data: 'op_back', style: 'danger' }]);
    }
    return { html, keyboard };
}

    const html = `<b>👑 『 ${botName.toUpperCase()} 』</b>
👀 Welcome, <b>${escapeHtml(user.first_name)}</b>
⚠️ <i>All-in-one assistant: moderasi, tools, AI, media, game.</i>
🛡️ Dilengkapi sistem keamanan otomatis & fitur premium.
━━━━━━━━━━━━━━━━━━━━
${botInfo}

${userInfo}
━━━━━━━━━━━━━━━━━━━━
Pilih kategori menu:`;

        const keyboard = [
        [
            { text: '🛡️ Moderasi', callback_data: 'menu_moderasi', style: 'danger' },
            { text: '🛠️ Utility', callback_data: 'menu_utility', style: 'success' },
        ],
        [
            { text: '🎮 Game', callback_data: 'menu_game', style: 'primary' },
            { text: '📥 Download', callback_data: 'menu_download', style: 'success' },
        ],
        [
            { text: 'ℹ️ Tentang', callback_data: 'menu_about', style: 'primary' },
            { text: '💖 Donasi', callback_data: 'menu_donate', style: 'danger' },
        ],
        [{ text: '📢 Join Channel', url: channelLink, style: 'primary' }],
    ];
    if (isOwner) {
        keyboard.push([{ text: '👑 Menu Owner', callback_data: 'op_back', style: 'danger' }]);
    }
    return { html, keyboard };
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerStartHandler(bot) {

    // ─── /start ───
    bot.start(async (ctx) => {
        const user = ctx.from;
        const isPv = ctx.chat.type === 'private';

        try { db.saveUserInfo(user.id, user.username, user.first_name); } catch (e) {}

        const loadingFrames = [
            `⏳ <b>Menyiapkan Bot...</b>\n\n<i>Menghubungkan ke server...</i>`,
            `📊 <b>Mengambil Statistik...</b>\n\n<i>Menghitung total user & grup...</i>`,
            `🎨 <b>Menyusun Menu...</b>\n\n<i>Mempersiapkan tampilan...</i>`,
        ];

        const loadingMsg = await ctx.reply(loadingFrames[0], { parse_mode: 'HTML' });

        for (let i = 1; i < loadingFrames.length; i++) {
            await new Promise(r => setTimeout(r, 800));
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, loadingMsg.message_id, null,
                    loadingFrames[i], { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 800));
        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}

        const { html, keyboard } = await renderStartMenu(user, isPv);
        const vid = DEFAULT_THUMB; // Pakai video hardcode
        const captionSafe = html.length <= 1024;

                 // Kirim sebagai VIDEO + caption
             if (captionSafe) {
                 try {
                  await bot.telegram.sendVideo(ctx.chat.id, vid, {
                  caption: html,
                  parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: keyboard },
                      });
                      return;
               } catch (e) {
                console.error('❌ Gagal kirim video start:', e.message);
                 }
               }

        // Fallback teks
            // Di PV: kirim pesan biasa + inline keyboard
    await ctx.reply(html, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
    });

    // 🔥 MULAI ANIMASI WARNA TOMBOL
    startButtonAnimation(ctx, html, keyboard);
});

    // ═══════════════════════════════════════════════════════════
    // CALLBACK MENU KATEGORI
    // ═══════════════════════════════════════════════════════════

    // Menu AI
    bot.action('menu_ai', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const html = `<b>🤖 Menu AI</b>

<code>/ai</code> / <code>/gpt</code> — Tanya AI (Gemini)
<code>/aigambar</code> / <code>/imagine</code> — Generate gambar AI
<code>/cekcode</code> — Cek sintaks kode
<code>/fixcode</code> — Perbaiki kode via AI`;

        await editHtml(ctx, html, [
            [{ text: '🔙 Kembali', callback_data: 'back_menu', style: 'danger' }],
        ]);
    });

    // Menu Moderasi
    bot.action('menu_moderasi', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        if (ctx.chat.type === 'private') {
            return editHtml(ctx,
                `<b>🔒 Khusus Grup</b>\n\nMenu Moderasi hanya tersedia di grup.\n\n<blockquote>Fitur seperti <code>/kick</code>, <code>/ban</code>, <code>/mute</code>, <code>/warn</code> butuh konteks grup.</blockquote>\nTambahkan bot ke grup lalu /start`,
                [[{ text: '🔙 Kembali', callback_data: 'back_menu' }]]
            );
        }
        const html = `<b>🛡️ Menu Moderasi</b>

<code>/kick</code> <code>/ban</code> <code>/unban</code> — Tendang & blokir user
<code>/mute</code> <code>/tmute</code> <code>/tban</code> — Bisukan user
<code>/warn</code> <code>/resetwarn</code> <code>/warns</code> — Sistem peringatan
<code>/promote</code> <code>/demote</code> — Atur admin grup
<code>/antilink</code> <code>/antiforward</code> <code>/antispam</code> <code>/antitoxic</code> — Anti-features
<code>/filter</code> <code>/filters</code> <code>/stop</code> — Auto-reply
<code>/setwelcome</code> <code>/setgoodbye</code> — Atur sambutan`;

        await editHtml(ctx, html, [
            [{ text: '🔙 Kembali', callback_data: 'back_menu', style: 'danger' }],
        ]);
    });

    // Menu Utility
    bot.action('menu_utility', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const html = `<b>🛠️ Menu Utility</b>
Pilih sub-kategori utilitas:

<b>Kategori</b> :
🌐 Jaringan & Web — IP, DNS, Cek Web
🔐 Teks & Encoding — Hash, QR, Base64
✨ Info & Lainnya — Cuaca, Lirik, Quote`;

        await editHtml(ctx, html, [
            [
                { text: '🌐 Jaringan', callback_data: 'util_network', style: 'danger' },
                { text: '🔐 Teks', callback_data: 'util_encoding', style: 'primary' },
            ],
            [
                { text: '✨ Info', callback_data: 'util_info', style: 'success' },
                { text: '🔙 Kembali', callback_data: 'back_menu' }, // ke start
            ],
        ]);
    });

    // Sub-menu Utility: Jaringan
    bot.action('util_network', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>🌐 Jaringan & Web</b>

<code>/ip &lt;ip&gt;</code> — Lacak IP
<code>/dns &lt;domain&gt;</code> — DNS Lookup
<code>/cek &lt;url&gt;</code> — Cek Website Up/Down
<code>/gethtml &lt;url&gt;</code> — Ambil kode HTML`, [
            [{ text: '🔙 Kembali', callback_data: 'menu_utility' }], // ← edit ke utility
        ]);
    });

    // Sub-menu Utility: Teks & Encoding
    bot.action('util_encoding', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        await editHtml(ctx, `<b>🔐 Teks & Encoding</b>

<code>/sha &lt;teks&gt;</code> — Hash SHA
<code>/md5 &lt;teks&gt;</code> — Hash MD5
<code>/base64 &lt;mode&gt;</code> — Encode/Decode Base64
<code>/binary &lt;mode&gt;</code> — Encode/Decode Biner
<code>/hex &lt;mode&gt;</code> — Encode/Decode Hex
<code>/qr &lt;teks&gt;</code> — Buat QR Code
<code>/readqr</code> — Baca QR Code
<code>/password</code> — Generate Password
<code>/tts &lt;teks&gt;</code> — Text to Speech`, [
            [{ text: '🔙 Kembali', callback_data: 'menu_utility' }], // ← edit ke utility
        ]);
    });

    // Sub-menu Utility: Info
    bot.action('util_info', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const isPv = ctx.chat.type === 'private';
        const extra = isPv ? `\n<code>/tempemail</code> <code>/inbox</code> — Email sementara` : '';
        await editHtml(ctx, `<b>✨ Info & Lainnya</b>

<code>/cuaca &lt;kota&gt;</code> — Info Cuaca
<code>/sholat &lt;kota&gt;</code> — Jadwal Sholat
<code>/lirik &lt;lagu&gt;</code> — Cari Lirik
<code>/quote</code> — Random Quote
<code>/anime &lt;judul&gt;</code> — Info Anime
<code>/stalk &lt;platform&gt;</code> — Stalk Akun
<code>/short &lt;url&gt;</code> — Perpendek Link
<code>/rate</code> — Rate Profil${extra}`, [
            [{ text: '🔙 Kembali', callback_data: 'menu_utility' }], // ← edit ke utility
        ]);
    });

    // Menu Game
    bot.action('menu_game', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const isPv = ctx.chat.type === 'private';
        const modeInfo = isPv
            ? '💬 <b>PV Mode</b> — game PvP butuh lawan, disarankan main di grup.'
            : '📢 <b>Group Mode</b> — game PvP & matchmaking aktif.';

        const html = `<b>🎮 Menu Game & Ekonomi</b>
<blockquote>${modeInfo}</blockquote>

<code>/suit</code> — Batu Gunting Kertas
<code>/slot &lt;bet&gt;</code> — Slot Mahjong
<code>/saldo</code> — Cek saldo & statistik
<code>/claim &lt;kode&gt;</code> — Claim saldo dari kode
<code>/trivia</code> <code>/math</code> <code>/tebakangka</code> <code>/tebakkata</code> — Game tebak
<code>/koin</code> <code>/dadu</code> <code>/bom</code> <code>/tembak</code> <code>/8ball</code> — Game seru
<code>/rate</code> <code>/pilih</code> <code>/hitung</code> — Fun tools`;

        await editHtml(ctx, html, [
            [
                { text: '🎯 Suit', callback_data: 'play_suit', style: 'primary' },
                { text: '🎰 Slot', callback_data: 'main_slot', style: 'danger' },
            ],
            [{ text: '🔙 Kembali', callback_data: 'back_menu', style: 'danger' }],
        ]);
    });

    // Menu Download
    bot.action('menu_download', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const isPv = ctx.chat.type === 'private';
        const note = isPv
            ? '💬 <b>PV Mode</b> — cocok download lagu/video langsung.'
            : '⚠️ <b>Group Mode</b> — hindari spam link, pakai di PV lebih aman.';

        const html = `<b>📥 Menu Downloader</b>

TikTok — <code>/tiktok &lt;url&gt;</code>
Instagram — <code>/ig &lt;url&gt;</code>
Facebook — <code>/fb &lt;url&gt;</code>
Twitter/X — <code>/tw &lt;url&gt;</code>
YouTube Music — <code>/play &lt;judul&gt;</code>
Upload Media — <code>/tourl</code>
Sticker — <code>/stiker</code>
Pinterest — <code>/pin &lt;query&gt;</code>

<blockquote>${note}</blockquote>`;

        await editHtml(ctx, html, [
            [{ text: '🔙 Kembali', callback_data: 'back_menu', style: 'danger' }],
        ]);
    });

    // Menu About
    bot.action('menu_about', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const uptime = Math.floor(process.uptime());
        const uptimeStr = `${Math.floor(uptime / 3600)}j ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;

        const html = `<b>ℹ️ Tentang Bot</b>

<b>Nama</b>    : ${config.botName || 'Premium Guardian Bot'}
<b>Version</b> : v2.0
<b>Uptime</b>  : ${uptimeStr}
<b>Owner</b>   : ${config.OWNER_NAME || 'Anonymous'}
<b>Fitur</b>   : Moderation · Utility · Game · Downloader

<b>📖 Cara Pakai</b>
• Ketik <code>/start</code> untuk membuka menu utama.
• Klik kategori menu untuk daftar command.
• Ketik <code>/help &lt;command&gt;</code> untuk bantuan spesifik.
• Ketik <code>/listfitur</code> untuk daftar lengkap fitur.`;

        await editHtml(ctx, html, [
            [
                { text: '📢 Channel', url: config.REQUIRED_CHANNEL_LINK || 'https://t.me/telegram' },
                { text: '👤 Owner', url: `https://t.me/${config.OWNER_USERNAME || 'telegram'}` },
            ],
            [{ text: '🔙 Kembali', callback_data: 'back_menu', style: 'danger' }],
        ]);
    });

    // Menu Donasi
    bot.action('menu_donate', async (ctx) => {
    stopButtonAnimation(ctx.chat.id);
        await ctx.answerCbQuery();
        const html = `<b>☕ Dukung Kami!</b>
Halo <b>${escapeHtml(ctx.from.first_name)}</b>!

Jika kamu merasa bot ini bermanfaat, kamu bisa memberikan dukungan (donasi/sawer) agar bot ini terus aktif dan berkembang.

<b>🎁 Keuntungan Donasi:</b>
• Akses konten eksklusif (30 hari)
• Prioritas bantuan / support
• Membantu biaya server & API

<blockquote>Setiap dukungan, sekecil apapun, sangat berarti bagi kami. Terima kasih! 🙏</blockquote>`;

        await editHtml(ctx, html, [
            [{ text: '💖 Donasi via Sociabuzz', url: SOCIABUZZ_URL, style: 'success' }],
            [{ text: '🔙 Kembali', callback_data: 'back_menu', style: 'danger' }],
        ]);
    });

    // Kembali ke menu utama → edit caption kalau bisa, kalau tidak hapus + kirim foto
    // Kembali ke menu utama
// Kembali ke menu utama
bot.action('back_menu', async (ctx) => {
        await ctx.answerCbQuery();
        await reRenderStartMenu(ctx);
    });
}

module.exports = { registerStartHandler, renderStartMenu };