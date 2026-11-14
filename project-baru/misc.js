// ═══════════════════════════════════════════════════════════════
// 📄 handlers/misc.js — Update AFK
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const db = require('../services/database');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { formatDuration } = require('../helpers/cooldown');

function registerMiscHandler(bot) {
    // ─── /id ───
    bot.command(['id', 'myid'], async (ctx) => {
        const target = ctx.message.reply_to_message?.from || ctx.from;
        await replyRich(ctx, premiumMessage({
            heading: 'ID Info', headingEmoji: '🆔',
            body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a>`,
            pre: `User ID  : ${target.id}\nChat ID  : ${ctx.chat.id}\nChat Type: ${ctx.chat.type}`,
            accent: '🆔',
        }));
    });

    // ─── /ping ───
    bot.command('ping', async (ctx) => {
        const start = Date.now();
        const msg = await ctx.reply('🏓 Pong...');
        const latency = Date.now() - start;
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
                `🏓 <b>Pong!</b>\n\nLatency: <b>${latency}ms</b>`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    });

    // ─── /afk ───
    bot.command('afk', async (ctx) => {
        const reason = ctx.message.text.split(' ').slice(1).join(' ') || 'Tanpa alasan';
        db.setAfk(ctx.from.id, reason);
        
        await replyRich(ctx, premiumMessage({
            heading: 'AFK Diaktifkan', headingEmoji: '💤',
            body: `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> sekarang AFK.`,
            blockquote: `📝 Alasan: <i>${escapeHtml(reason)}</i>\n\n<i>Status AFK akan hilang otomatis jika kamu chat, atau ketik /unafk.</i>`,
            accent: '🌙',
            buttons: [
                { text: '🔙 Un-AFK', callback: 'unafk_btn', color: 'success' }
            ]
        }));
    });

    // ─── /unafk ───
    bot.command(['unafk', 'stopafk'], async (ctx) => {
        const afkData = db.getAfk(ctx.from.id);
        if (!afkData) {
            return ctx.reply('ℹ️ Kamu sedang tidak AFK.');
        }

        db.delAfk(ctx.from.id);
        
        await replyRich(ctx, premiumMessage({
            heading: 'AFK Dimatikan', headingEmoji: '👋',
            body: `Selamat datang kembali, <a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a>!`,
            footer: 'Status AFK kamu sudah dihapus.',
            accent: '✅'
        }));
    });

    bot.action('unafk_btn', async (ctx) => {
        if (ctx.from.id !== ctx.from.id) {} // validasi internal
        const afkData = db.getAfk(ctx.from.id);
        if (!afkData) {
            return ctx.answerCbQuery('ℹ️ Kamu sudah tidak AFK.', { show_alert: true });
        }
        db.delAfk(ctx.from.id);
        await ctx.answerCbQuery('✅ AFK dimatikan');
        try { await ctx.editMessageText(`<b>✅ Status AFK kamu sudah dimatikan.</b>`, { parse_mode: 'HTML' }); } catch (e) {}
    });

    // ─── /help ───
    bot.command('help', async (ctx) => {
        const cmd = ctx.message.text.split(' ')[1]?.toLowerCase();
        if (!cmd) {
            return replyRich(ctx, premiumMessage({
                heading: 'Bantuan', headingEmoji: '📖',
                body: 'Ketik <code>/help &lt;command&gt;</code> untuk detail.',
                listItems: [
                    '📌 <code>/listfitur</code> — daftar semua fitur',
                    '📌 <code>/start</code> — menu utama',
                ],
                accent: '📖',
            }));
        }
        await replyRich(ctx, premiumMessage({
            heading: `Bantuan: /${escapeHtml(cmd)}`, headingEmoji: '📖',
            body: `Info detail untuk <code>/${escapeHtml(cmd)}</code> belum tersedia.`,
            footer: 'Gunakan /listfitur untuk daftar lengkap.',
            accent: '📖',
        }));
    });

    // ─── /listfitur ───
    // /listfitur — copy HTML listfitur panjang dari index.js lama
    bot.command(['listfitur', 'fitur', 'commands'], async (ctx) => {
        // Copy semua HTML dari handler listfitur di index.js lama ke sini
        const html = `
<h1>📚 Daftar Fitur Bot</h1>
<p>Klik kategori untuk detail:</p>
<details>
<summary><b>🛡️ Moderasi & Keamanan</b></summary>
<blockquote>
• <code>/kick</code> <code>/ban</code> <code>/unban</code><br>
• <code>/mute</code> <code>/tmute</code> <code>/tban</code><br>
• <code>/warn</code> <code>/resetwarn</code> <code>/warns</code><br>
• <code>/antilink</code> <code>/antiforward</code> <code>/antispam</code> <code>/antitoxic</code><br>
• <code>/globalban</code> <code>/globalunban</code> <code>/globallist</code> <i>(Owner)</i>
</blockquote>
</details>
<details>
<summary><b>🎮 Game & Ekonomi</b></summary>
<blockquote>
• <code>/suit</code> <code>/slot</code> <code>/saldo</code> <code>/claim</code><br>
• <code>/trivia</code> <code>/tebakangka</code> <code>/math</code> <code>/tebakkata</code><br>
• <code>/koin</code> <code>/dadu</code> <code>/bom</code> <code>/tembak</code> <code>/8ball</code><br>
• <code>/rate</code> <code>/pilih</code> <code>/hitung</code>
</blockquote>
</details>
<details>
<summary><b>📥 Downloader</b></summary>
<blockquote>
• <code>/tiktok</code> <code>/ig</code> <code>/fb</code> <code>/tw</code><br>
• <code>/play</code> <code>/tourl</code> <code>/stiker</code> <code>/pin</code> <code>/ucbrowser</code>
</blockquote>
</details>
<details>
<summary><b>🛠️ Utility</b></summary>
<blockquote>
• <code>/ip</code> <code>/dns</code> <code>/cek</code> <code>/ss</code> <code>/gethtml</code><br>
• <code>/qr</code> <code>/readqr</code> <code>/sha</code> <code>/md5</code> <code>/base64</code> <code>/hex</code><br>
• <code>/password</code> <code>/tts</code> <code>/cuaca</code> <code>/sholat</code><br>
• <code>/lirik</code> <code>/quote</code> <code>/anime</code> <code>/stalk</code><br>
• <code>/nulis</code> <code>/fakechat</code> <code>/fakeid</code> <code>/bypass</code>
</blockquote>
</details>
<details>
<summary><b>🤖 AI</b></summary>
<blockquote>
• <code>/ai</code> <code>/gpt</code> <code>/aigambar</code> <code>/imagine</code><br>
• <code>/cekcode</code> <code>/fixcode</code>
</blockquote>
</details>
<details>
<summary><b>📧 Email (PV)</b></summary>
<blockquote>
• <code>/tempemail</code> <code>/inbox</code>
</blockquote>
</details>
<details>
<summary><b>💳 QRIS</b></summary>
<blockquote>
• <code>/qris</code> <code>/qris2</code> <code>/donasi</code>
</blockquote>
</details>
<details>
<summary><b>🚀 Deploy</b></summary>
<blockquote>
• <code>/deployweb</code> <code>/createbase</code>
</blockquote>
</details>
<details>
<summary><b>🎭 Role</b></summary>
<blockquote>
• <code>/myrole</code> <code>/setrole</code> <code>/delrole</code> <code>/listrole</code> <code>/extends</code>
</blockquote>
</details>
<details>
<summary><b>👑 Owner Tools</b></summary>
<blockquote>
• <code>/owner</code> <code>/panel</code> <code>/backup</code> <code>/restore</code><br>
• <code>/update</code> <code>/restart</code> <code>/clone</code> <code>/stopclone</code><br>
• <code>/cfd</code> <code>/gencode</code> <code>/listcodes</code> <code>/delcode</code><br>
• <code>/addsaldo</code> <code>/setsaldo</code> <code>/resetsaldo</code><br>
• <code>/bansistem</code> <code>/unbansistem</code> <code>/listbansistem</code><br>
• <code>/botstats</code> <code>/activelist</code> <code>/statsuser</code><br>
• <code>/gconly</code> <code>/panic</code> <code>/safemode</code><br>
• <code>/addtoken</code> <code>/deltoken</code> <code>/checktoken</code> <code>/tokenlist</code><br>
• <code>/gfilter</code> <code>/gfilterlist</code> <code>/gfilterdel</code><br>
• <code>/clearcache</code> <code>/cleartemp</code> <code>/sysinfo</code>
</blockquote>
</details>
<footer>✨ Gunakan <code>/help &lt;command&gt;</code> untuk info detail.</footer>
<tg-button-row>
  <tg-button type="callback_data" style="primary" data="back_menu">🔙 Menu Utama</tg-button>
</tg-button-row>
`;
        await replyRich(ctx, html);
    });
}

module.exports = { registerMiscHandler };