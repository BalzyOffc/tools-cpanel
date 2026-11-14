const { replyRich, sendRichMessage, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html'); // Pastikan helper ini ada

// ── FUNGSI FORMAT TEKS ──
function formatInline(text) {
    let out = escapeHtml(text);
    
    // Teks Lipat (Details)
    out = out.replace(/\[\[(.+?)\|\|(.+?)\]\]/g, '<details><summary><b>$1</b></summary>$2</details>');
    
    // Spoiler
    out = out.replace(/\|\|(.+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
    
    // Bold / Italic / Mark / Code
    out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<b>$1</b>');
    out = out.replace(/__(.+?)__/g, '<i>$1</i>');
    out = out.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<i>$1</i>');
    out = out.replace(/==(.+?)==/g, '<mark>$1</mark>');
    out = out.replace(/`(.+?)`/g, '<code>$1</code>');
    
    return out;
}

// ── FUNGSI TABEL ──
function isSimpleTableRow(line) {
    return /^\[\s*[^\]]+\s*\]\s*(\[\s*[^\]]+\s*\]\s*)+$/.test(line.trim());
}

function parseSimpleTableRow(line) {
    const cells = [];
    const regex = /\[\s*([^\]]+?)\s*\]/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
        cells.push(match[1].trim());
    }
    return cells;
}

function renderSimpleTable(rows) {
    if (rows.length === 0) return '';
    const parsed = rows.map(parseSimpleTableRow);
    const header = parsed[0];
    const dataRows = parsed.slice(1);

    let html = '<table bordered striped><tr>';
    header.forEach(c => html += `<th>${formatInline(c)}</th>`);
    html += '</tr>';
    for (const row of dataRows) {
        html += '<tr>';
        row.forEach(c => html += `<td>${formatInline(c)}</td>`);
        html += '</tr>';
    }
    html += '</table>';
    return html;
}

// ── FUNGSI PARSER UTAMA ──
function autoRichParse(text) {
    if (!text) return '';

    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let inQuote = false;
    let tableBuffer = [];
    const allButtons = [];

    const flushTable = () => {
        if (tableBuffer.length === 0) return;
        html += renderSimpleTable(tableBuffer);
        tableBuffer = [];
    };
    
    const closeBlocks = () => {
        if (inList) { html += '</ul>'; inList = false; }
        if (inQuote) { html += '</blockquote>'; inQuote = false; }
    };

    // 🔥 PARSER TOMBOL BARU (Mendukung "Buy? pv me @habalzy")
    const processLine = (line) => {
        let buttons = [];
        let result = line;
        
        // Regex: [Teks] ? [pv/biasa] [@username/url] (:[warna])?
        const btnRegex = /([A-Za-z0-9 _\-\.]+?)\?\s*(pv\s+[^\s]+|[^\s]+)(?:\s*:([A-Za-z]+))?/gi;

        result = result.replace(btnRegex, (match, label, target, colorName) => {
            const btnText = label.trim();
            let rawTarget = target.trim();
            
            // Cek apakah target pakai "pv" (Private)
            let isPv = false;
            if (rawTarget.toLowerCase().startsWith('pv ')) {
                isPv = true;
                rawTarget = rawTarget.substring(3).trim(); 
            }

            let btnData = '';
            let btnUrl = '';

            // Tentukan aksi tombol
            if (rawTarget.startsWith('@')) {
                const username = rawTarget.replace('@', '');
                btnData = isPv ? `pv_${username}` : `ch_${username}`;
            } else if (rawTarget.startsWith('http')) {
                btnUrl = rawTarget;
            } else {
                btnData = rawTarget; // Callback custom
            }

            // Tentukan Warna (Default: primary)
            let color = 'primary';
            if (colorName) {
                const c = colorName.toLowerCase();
                if (['hijau', 'green', 'success'].includes(c)) color = 'success';
                else if (['merah', 'red', 'danger'].includes(c)) color = 'danger';
            }

            // Simpan tombol
            if (btnUrl) {
                buttons.push({ text: btnText, url: btnUrl, color });
            } else {
                buttons.push({ text: btnText, callback: btnData, color });
            }
            
            return ''; // Hapus teks dari body pesan
        });

        return { text: result.trim(), buttons };
    };

    for (const raw of lines) {
        const line = raw.trim();

        // Tabel
        if (isSimpleTableRow(line)) {
            closeBlocks();
            tableBuffer.push(line);
            continue;
        } else if (tableBuffer.length > 0) {
            flushTable();
        }

        if (line === '') { closeBlocks(); continue; }

        // Proses Baris (Cek Tombol)
        const { text: cleanLine, buttons } = processLine(line);
        if (buttons.length > 0) allButtons.push(...buttons);
        if (cleanLine === '') continue; // Jika baris hanya berisi tombol

        // Heading
        if (/^###\s+/.test(cleanLine)) { closeBlocks(); html += `<h3>${formatInline(cleanLine.replace(/^###\s+/, ''))}</h3>`; continue; }
        if (/^##\s+/.test(cleanLine)) { closeBlocks(); html += `<h2>${formatInline(cleanLine.replace(/^##\s+/, ''))}</h2>`; continue; }
        if (/^#\s+/.test(cleanLine)) { closeBlocks(); html += `<h1>${formatInline(cleanLine.replace(/^#\s+/, ''))}</h1>`; continue; }

        // Footer
        if (/^---/.test(cleanLine)) {
            closeBlocks();
            const footer = cleanLine.replace(/^---\s*/, '');
            if (footer) html += `<footer>✨ ${formatInline(footer)}</footer>`;
            continue;
        }

        // Blockquote
        if (cleanLine.startsWith('> ')) {
            if (inList) { html += '</ul>'; inList = false; }
            if (!inQuote) { html += '<blockquote expandable>'; inQuote = true; }
            html += formatInline(cleanLine.slice(2)) + '<br>';
            continue;
        } else if (inQuote) {
            html += '</blockquote>';
            inQuote = false;
        }

        // List Item
        if (/^[-*•]\s+/.test(cleanLine)) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${formatInline(cleanLine.replace(/^[-*•]\s+/, ''))}</li>`;
            continue;
        } else if (inList) {
            html += '</ul>';
            inList = false;
        }

        // Paragraf Biasa
        html += `<p>${formatInline(cleanLine)}</p>`;
    }

    flushTable();
    closeBlocks();

    // Render Tombol ke dalam HTML Rich Message
    if (allButtons.length > 0) {
        for (let i = 0; i < allButtons.length; i += 2) {
            html += '<tg-button-row>';
            html += `<tg-button type="callback_data" data="${allButtons[i].callback}" style="${allButtons[i].color}">${allButtons[i].text}</tg-button>`;
            if (allButtons[i + 1]) {
                html += `<tg-button type="callback_data" data="${allButtons[i + 1].callback}" style="${allButtons[i + 1].color}">${allButtons[i + 1].text}</tg-button>`;
            }
            html += '</tg-button-row>';
        }
    }

    return html;
}

// ── REGISTRAR HANDLER ──
function registerRichHandler(bot) {
    bot.command('rich', async (ctx) => {
        const replied = ctx.message.reply_to_message;
        if (!replied) {
            return replyRich(ctx, premiumMessage({
                heading: 'Cara Pakai', headingEmoji: '✨',
                body: 'Reply pesan teks yang mau dijadikan Rich Message, lalu ketik:',
                pre: '/rich',
                blockquote: 'Format yang didukung:\n• # Heading, ## Sub, ### Sub-sub\n• > Kutipan\n• - List item\n• **bold** _italic_ ==mark== `code`\n• ||spoiler||\n• [[Ringkasan || Isi lipat]]\n• [ Kolom ] [ Kolom ] → tabel simple\n• --- footer\n• **Buy? pv me @username** → Tombol otomatis',
                accent: '✨'
            }));
        }

        const rawText = replied.text || replied.caption;
        if (!rawText) {
            return replyRich(ctx, premiumMessage({ heading: 'Pesan Kosong', headingEmoji: '❌', body: 'Pesan tidak punya teks.', accent: '⚠️' }));
        }

        const htmlContent = autoRichParse(rawText);

        try { await ctx.deleteMessage(); } catch (e) {}
        try { await ctx.telegram.deleteMessage(ctx.chat.id, replied.message_id); } catch (e) {}

        try {
            await sendRichMessage(ctx.chat.id, htmlContent);
        } catch (err) {
            await replyRich(ctx, premiumMessage({ heading: 'Gagal', headingEmoji: '❌', body: `Error: <code>${escapeHtml(err.message)}</code>`, accent: '⚠️' }));
        }
    });
}

module.exports = { registerRichHandler };