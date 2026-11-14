const axios = require('axios');
const { replyHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');

// ── Cooldown per user (10 detik)
const cooldown = new Map();
const COOLDOWN_MS = 10 * 1000;

// ── Pisah kode & penjelasan (punyamu)
function pisahCodeDanPenjelasan(raw) {
    const lines = raw.split('\n');
    const codeLines = [];
    const penjelasanLines = [];
    let foundCode = false;
    let codeEnded = false;
    let braceDepth = 0;
    let startIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (
            /^(async\s+)?function\s+\w+\s*\(/.test(t) ||
            /^(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/.test(t) ||
            /^class\s+\w+/.test(t)
        ) {
            startIndex = i;
            foundCode = true;
            break;
        }
    }

    if (!foundCode) {
        return { code: '', penjelasan: raw.trim() };
    }

    for (let i = 0; i < startIndex; i++) {
        const t = lines[i].trim();
        if (t) penjelasanLines.push(t);
    }

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!codeEnded) {
            codeLines.push(line);
            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }
            if (braceDepth === 0 && trimmed === '}' && codeLines.length > 1) {
                codeEnded = true;
            }
            continue;
        }

        if (trimmed) penjelasanLines.push(trimmed);
    }

    return {
        code: codeLines.join('\n').trim(),
        penjelasan: penjelasanLines.join('\n').trim(),
    };
}

function registerSalintoscamHandler(bot) {
    bot.hears(/^\/salintoscam(?:\s+(.+))?/, async (ctx) => {
        const chatId = ctx.chat.id;
        const fromId = ctx.from.id;

        // ── Cooldown
        const last = cooldown.get(fromId) || 0;
        const now = Date.now();
        if (now - last < COOLDOWN_MS) {
            const sisa = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
            return ctx.reply(`⏳ Tunggu ${sisa} detik lagi.`).catch(() => {});
        }
        cooldown.set(fromId, now);

        if (!ctx.message.reply_to_message) {
            return replyHtml(ctx,
`<b>📌 Format:</b>
• Reply pesan yang mau disalin
• Ketik <code>/salintoscam</code>`);
        }

        const replied = ctx.message.reply_to_message;

        try {
            let raw = '';

            if (replied.text) {
                raw = replied.text;
            } else if (replied.document) {
                const fileName = replied.document.file_name || '';
                if (!fileName.match(/\.(js|txt|json)$/i)) {
                    return replyHtml(ctx, "❌ File harus <code>.js</code>, <code>.txt</code>, atau <code>.json</code>");
                }
                const fileLink = await ctx.telegram.getFileLink(replied.document.file_id);
                const res = await axios.get(fileLink.href, { responseType: 'text' });
                raw = res.data;
            } else if (replied.photo) {
                raw = replied.caption || '';
            } else {
                return replyHtml(ctx, "❌ Cuma support text / file <code>.js</code> / <code>.txt</code> / caption photo");
            }

            if (!raw || !raw.trim()) {
                return replyHtml(ctx, "❌ Pesan kosong.");
            }

            const { code, penjelasan } = pisahCodeDanPenjelasan(raw);
            let output = '';

            if (code) {
                output += `<pre>${escapeHtml(code)}</pre>`;
            }

            if (penjelasan) {
                output += `\n<blockquote>${escapeHtml(penjelasan)}</blockquote>`;
            }

            const MAX_LEN = 4000;

            if (output.length > MAX_LEN) {
                const buf = Buffer.from(output, 'utf-8');
                await ctx.replyWithDocument(
                    { source: buf, filename: `salin_${Date.now()}.txt` },
                    { caption: `✅ Disalin (${output.length} char)` }
                );
                return;
            }

            await ctx.reply(output, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            });

            console.log(`📋 [SALIN] user ${fromId} → ${output.length} char`);

        } catch (e) {
            console.error('❌ [SALIN] Error:', e.message);
            await replyHtml(ctx, `❌ Gagal salin: ${escapeHtml(e.message)}`);
        }
    });
}

module.exports = { registerSalintoscamHandler };