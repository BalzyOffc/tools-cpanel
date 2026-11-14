const axios = require('axios');
const path = require('path');
const AdmZip = require('adm-zip');
const config = require('../config');
const { replyHtml, editHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');

const GH_TOKEN = config.GITHUB_TOKEN;
const GH_OWNER = config.GITHUB_OWNER;
const GH_BRANCH = config.GITHUB_BRANCH || 'main';
const ITEMS_PER_PAGE = 5; // Jumlah repo per halaman

// Sesi Sementara (menyimpan file & path sebelum dipush)
const pendingSessions = new Map();

// ── FUNGSI PUSH KE GITHUB ──
async function pushToGithub(repoName, filePath, fileContent, commitMsg) {
    let sha = null;
    try {
        const getRes = await axios.get(
            `https://api.github.com/repos/${GH_OWNER}/${repoName}/contents/${filePath}?ref=${GH_BRANCH}`,
            { headers: { Authorization: `token ${GH_TOKEN}` } }
        );
        sha = getRes.data.sha;
    } catch (e) {
        if (e.response?.status !== 404) throw e;
    }

    // Bisa handle file text & buffer (untuk file binary seperti gambar)
    const contentBase64 = Buffer.isBuffer(fileContent) 
        ? fileContent.toString('base64') 
        : Buffer.from(fileContent).toString('base64');

    const payload = { message: commitMsg, content: contentBase64, branch: GH_BRANCH };
    if (sha) payload.sha = sha;

    const putRes = await axios.put(
        `https://api.github.com/repos/${GH_OWNER}/${repoName}/contents/${filePath}`,
        payload,
        { headers: { Authorization: `token ${GH_TOKEN}` } }
    );
    return putRes.data;
}

// ── FUNGSI AMBIL DAFTAR REPO ──
async function getRepos() {
    const res = await axios.get(`https://api.github.com/user/repos?per_page=100&sort=updated`, {
        headers: { Authorization: `token ${GH_TOKEN}` }
    });
    return res.data;
}

// ── FUNGSI RENDER TOMBOL REPO ──
function buildRepoKeyboard(repos, page = 0) {
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageRepos = repos.slice(start, end);
    const keyboard = [];
    
    for (const repo of pageRepos) {
        keyboard.push([{ text: `📦 ${repo.name}`, callback_data: `setrepo_${repo.name}`, style: 'primary' }]);
    }

    const navRow = [];
    if (page > 0) navRow.push({ text: '⬅️ Prev', callback_data: `repopage_${page - 1}`, style: 'success' });
    if (end < repos.length) navRow.push({ text: 'Next ➡️', callback_data: `repopage_${page + 1}`, style: 'success' });
    if (navRow.length > 0) keyboard.push(navRow);

    keyboard.push([{ text: '❌ Batal', callback_data: 'repo_cancel', style: 'danger' }]);
    return keyboard;
}

function registerGithubHandler(bot) {
    // ── 1. COMMAND /pushgh (Reply File Satuan) ──
    bot.command('pushgh', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return replyHtml(ctx, `🚫 Khusus Owner.`);
        if (!GH_TOKEN) return replyHtml(ctx, `❌ GITHUB_TOKEN belum diset.`);
        
        const replied = ctx.message.reply_to_message;
        if (!replied || !replied.document) {
            return replyHtml(ctx, `<b>📌 Format Push File</b>\n\nReply <b>File/Dokumen</b> apa saja (js, py, html, json, zip, dll), lalu ketik:\n<code>/pushgh</code>`);
        }

        const waitMsg = await replyHtml(ctx, `⏳ <b>Mengunduh File...</b>`);

        try {
            const fileLink = await ctx.telegram.getFileLink(replied.document.file_id);
            // Gunakan arraybuffer agar file binary (gambar/zip) tidak rusak
            const res = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
            
            pendingSessions.set(ctx.from.id, { 
                type: 'file', 
                buffer: Buffer.from(res.data), 
                fileName: replied.document.file_name 
            });

            const repos = await getRepos();
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}

            if (repos.length === 0) return replyHtml(ctx, `❌ Tidak ada repository di akun GitHub kamu.`);

            await replyHtml(ctx, `<b>📦 Pilih Repositori Tujuan</b>\n\nFile: <code>${escapeHtml(replied.document.file_name)}</code>\nPilih repo tujuan:`, buildRepoKeyboard(repos, 0));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}
            await replyHtml(ctx, `❌ Gagal: <code>${escapeHtml(err.message)}</code>`);
        }
    });

    // ── 2. COMMAND /pushzip (Reply ZIP Project) ──
    bot.command('pushzip', async (ctx) => {
        if (ctx.from.id !== config.OWNER_ID) return replyHtml(ctx, `🚫 Khusus Owner.`);
        if (!GH_TOKEN) return replyHtml(ctx, `❌ GITHUB_TOKEN belum diset.`);
        
        const replied = ctx.message.reply_to_message;
        if (!replied || !replied.document || !replied.document.file_name.endsWith('.zip')) {
            return replyHtml(ctx, `<b>📌 Format Push ZIP</b>\n\nReply file <code>.zip</code> (project apa saja), lalu ketik:\n<code>/pushzip</code>`);
        }

        const waitMsg = await replyHtml(ctx, `⏳ <b>Mengunduh ZIP...</b>`);

        try {
            const fileLink = await ctx.telegram.getFileLink(replied.document.file_id);
            const res = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
            
            pendingSessions.set(ctx.from.id, { 
                type: 'zip', 
                buffer: Buffer.from(res.data), 
                fileName: replied.document.file_name 
            });

            const repos = await getRepos();
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}

            if (repos.length === 0) return replyHtml(ctx, `❌ Tidak ada repository di akun GitHub kamu.`);

            await replyHtml(ctx, `<b>📦 Pilih Repositori Tujuan</b>\n\nZIP: <code>${escapeHtml(replied.document.file_name)}</code>\nPilih repo tujuan:`, buildRepoKeyboard(repos, 0));

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e){}
            await replyHtml(ctx, `❌ Gagal: <code>${escapeHtml(err.message)}</code>`);
        }
    });

    // ── 3. HANDLER PILIH REPO ──
    bot.action(/^setrepo_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const repoName = ctx.match[1];
        const session = pendingSessions.get(ctx.from.id);

        if (!session) return ctx.reply(`❌ Sesi expired. Silakan kirim ulang file-nya.`);

        // Simpan nama repo ke sesi
        session.repo = repoName;
        pendingSessions.set(ctx.from.id, session);

        // Minta user ketik folder tujuan (Bebas, tidak hardcode)
        await editHtml(ctx, `<b>📁 Tentukan Folder Tujuan</b>\n\nRepo: <b>${escapeHtml(repoName)}</b>\n\nSilakan ketik nama folder tujuan (bisa kosongkan jika ingin di root).\n\n<b>Contoh:</b>\n<code>src/components</code>\n<code>project-baru</code>\nAtau ketik <code>-</code> untuk taruh di root (luar folder).`);
    });

    // ── 4. PENANGKAP TEKS NAMA FOLDER (SETELAH PILIH REPO) ──
    bot.on('text', async (ctx, next) => {
        if (ctx.from.id !== config.OWNER_ID) return next();
        
        const session = pendingSessions.get(ctx.from.id);
        // Hanya jalan jika sesi ada isinya, sudah pilih repo, tapi belum ada 'folderName'
        if (!session || !session.repo || session.folderName !== undefined) return next();

        const text = ctx.message.text.trim();
        if (text.startsWith('/')) return next(); // Abaikan command

        // Jika user ketik '-', anggap root
        const folderTarget = (text === '-' || text === '') ? '' : text;
        session.folderName = folderTarget;
        pendingSessions.set(ctx.from.id, session);

        const progressMsg = await replyHtml(ctx, `⏳ <b>Mempush ke ${session.repo}/${folderTarget || 'root'}...</b>`);

        try {
            if (session.type === 'zip') {
                const zip = new AdmZip(session.buffer);
                const validFiles = zip.getEntries().filter(e => !e.isDirectory && !e.entryName.includes('__MACOSX') && !e.entryName.includes('.DS_Store'));

                let success = 0, fail = 0;

                for (const entry of validFiles) {
                    const originalName = path.basename(entry.entryName); 
                    
                    // Gabungkan folder tujuan + nama file (mempertahankan nama file asli)
                    let ghPath = folderTarget ? `${folderTarget}/${originalName}` : originalName;

                    try {
                        // Ambil buffer data, jangan getAsText() agar file binary (gambar) tidak rusak
                        const fileBuffer = entry.getData();
                        await pushToGithub(session.repo, ghPath, fileBuffer, `Auto push ${originalName}`);
                        success++;
                    } catch (e) {
                        console.error(`Gagal push ${ghPath}:`, e.response?.data || e.message);
                        fail++;
                    }
                }

                try { await ctx.telegram.deleteMessage(ctx.chat.id, progressMsg.message_id); } catch(e){}
                await replyHtml(ctx, `<b>✅ Push ZIP Selesai!</b>\n\n<b>Repo</b>   : <code>${escapeHtml(session.repo)}</code>\n<b>Folder</b> : <code>${folderTarget || 'root'}</code>\n<b>Sukses</b> : ${success} file\n<b>Gagal</b>  : ${fail} file`, [
                    [{ text: '🔗 Buka Repo', url: `https://github.com/${GH_OWNER}/${session.repo}`, style: 'primary' }]
                ]);

            } else if (session.type === 'file') {
                let ghPath = folderTarget ? `${folderTarget}/${session.fileName}` : session.fileName;
                
                await pushToGithub(session.repo, ghPath, session.buffer, `Auto push ${session.fileName}`);
                
                try { await ctx.telegram.deleteMessage(ctx.chat.id, progressMsg.message_id); } catch(e){}
                await replyHtml(ctx, `<b>✅ Push Berhasil!</b>\n\n<b>Repo</b>   : <code>${escapeHtml(session.repo)}</code>\n<b>Folder</b> : <code>${folderTarget || 'root'}</code>\n<b>File</b>   : <code>${escapeHtml(session.fileName)}</code>`, [
                    [{ text: '🔗 Buka Repo', url: `https://github.com/${GH_OWNER}/${session.repo}`, style: 'primary' }]
                ]);
            }

            pendingSessions.delete(ctx.from.id);

        } catch (err) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, progressMsg.message_id); } catch(e){}
            await replyHtml(ctx, `❌ Gagal Push: <code>${escapeHtml(err.message)}</code>`);
            pendingSessions.delete(ctx.from.id);
        }
    });

    // ── 5. HANDLER PAGINATION REPO ──
    bot.action(/^repopage_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const page = parseInt(ctx.match[1]);
        try {
            const repos = await getRepos();
            await ctx.editMessageText(`<b>📦 Pilih Repositori Tujuan</b>\n\nHalaman <b>${page + 1}</b>:`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buildRepoKeyboard(repos, page) } });
        } catch (e) {}
    });

    // ── 6. HANDLER BATAL ──
    bot.action('repo_cancel', async (ctx) => {
        await ctx.answerCbQuery('Dibatalkan');
        pendingSessions.delete(ctx.from.id);
        try { await ctx.deleteMessage(); } catch(e){}
    });
}

module.exports = { registerGithubHandler };