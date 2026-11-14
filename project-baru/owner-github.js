// ═══════════════════════════════════════════════════════════════
// 📄 handlers/owner-github.js
// /github — Test & cek konfigurasi GitHub upload
// ═══════════════════════════════════════════════════════════════
const config = require('../config');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { testGithubConfig, UPLOAD_APIS } = require('../services/uploader');

function isOwner(ctx) {
    return ctx.from?.id === config.OWNER_ID;
}

function registerOwnerGithubHandler(bot) {

    // ═══════════════════════════════════════════════════════════
    // /github — Cek & test konfigurasi GitHub
    // ═══════════════════════════════════════════════════════════
    bot.command(['github', 'ghtest'], async (ctx) => {
        if (!isOwner(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Khusus Owner.',
                accent: '🔒',
            }));
        }

        const waitMsg = await ctx.reply('🐙 Menguji koneksi GitHub...');

        try {
            const result = await testGithubConfig();

            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

            if (!result.ok) {
                return replyRich(ctx, premiumMessage({
                    heading: 'GitHub Test Gagal', headingEmoji: '❌',
                    body: `Error: <code>${escapeHtml(result.error)}</code>`,
                    listItems: [
                        '📌 Cek <code>GITHUB_TOKEN</code> di config.js',
                        '📌 Pastikan token punya scope <code>repo</code>',
                        '📌 Cek <code>GITHUB_OWNER</code> & <code>GITHUB_REPO</code>',
                    ],
                    blockquote: `Status Code: <code>${result.status || '-'}</code>`,
                    accent: '⚠️',
                }));
            }

            const cfg = UPLOAD_APIS.github.config;

            await replyRich(ctx, premiumMessage({
                heading: 'GitHub Siap!', headingEmoji: '✅',
                body: 'Konfigurasi GitHub valid.',
                pre:
`👤 User         : ${result.user}
📦 Repo         : ${result.repo}
🔒 Private      : ${result.private ? 'Yes' : 'No'}
🔑 Permissions  : ${JSON.stringify(result.permissions || {})}
🌿 Branch       : ${cfg.branch}
📁 Folder       : ${cfg.folder}`,
                blockquote: 'Semua upload via ToURL akan otomatis upload ke GitHub sebagai API utama.',
                accent: '🐙',
                buttons: [
                    { text: '🌐 Buka Repo', url: `https://github.com/${cfg.owner}/${cfg.repo}`, color: 'primary' },
                ],
            }));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
            await replyRich(ctx, premiumMessage({
                heading: 'Gagal Test', headingEmoji: '❌',
                body: `<code>${escapeHtml(err.message)}</code>`,
                accent: '⚠️',
            }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // /githubsetup — Panduan setup
    // ═══════════════════════════════════════════════════════════
    bot.command(['githubsetup', 'ghsetup'], async (ctx) => {
        if (!isOwner(ctx)) return;

        await replyRich(ctx, `
<h1>🐙 Setup GitHub Upload</h1>
<p>Ikuti langkah berikut:</p>

<h2>1️⃣ Buat Personal Access Token</h2>
<blockquote>• Buka <a href="https://github.com/settings/tokens/new">github.com/settings/tokens/new</a>
• Note: <code>Bot Uploader</code>
• Expiration: <code>No expiration</code> (atau 90 hari)
• Scope: centang <code>repo</code> (full control)
• Klik <b>Generate token</b>
• Copy token (format: <code>ghp_xxxxxxxxxxxx</code>)</blockquote>

<h2>2️⃣ Buat Repository</h2>
<blockquote>• Buka <a href="https://github.com/new">github.com/new</a>
• Nama repo: <code>bot-uploads</code>
• Visibility: <b>Public</b> (wajib untuk raw URL)
• Centang <b>Add a README file</b>
• Klik <b>Create repository</b></blockquote>

<h2>3️⃣ Isi config.js</h2>
<pre>GITHUB_TOKEN: 'ghp_xxxxx',
GITHUB_OWNER: 'username-github-kamu',
GITHUB_REPO: 'bot-uploads',
GITHUB_BRANCH: 'main',
GITHUB_FOLDER: 'uploads',</pre>

<h2>4️⃣ Test</h2>
<blockquote>Ketik <code>/github</code> untuk test koneksi.
Kalau OK, coba <code>/tourl</code> → pilih GitHub.</blockquote>

<blockquote>⚠️ <b>Penting:</b>
• Repo harus <b>Public</b> agar raw URL bisa diakses
• Kalau <b>Private</b>, raw URL butuh auth (tidak bisa dipakai publik)
• Token jangan di-share ke siapapun</blockquote>

<footer>✨ Setelah setup, GitHub jadi API upload utama bot.</footer>
<tg-button-row>
  <tg-button type="url" style="success" url="https://github.com/settings/tokens/new">🔑 Buat Token</tg-button>
  <tg-button type="url" style="primary" url="https://github.com/new">📦 Buat Repo</tg-button>
</tg-button-row>
`);
    });
}

module.exports = { registerOwnerGithubHandler };