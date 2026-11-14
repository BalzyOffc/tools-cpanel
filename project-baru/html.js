// helpers/html.js
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Membersihkan HTML dari tag yang tidak didukung Telegram.
 * Mencegah error: "Bad Request: can't parse entities: Unsupported start tag"
 */
function sanitizeTelegramHtml(html) {
    return String(html)
        // Ganti <br> jadi newline
        .replace(/<br\s*\/?>/gi, '\n')
        // Hapus tag web yang tidak didukung Telegram
        .replace(/<\/?(p|div|span|table|tr|td|th|ul|ol|li|h[1-6]|hr|img|video|audio|iframe)[^>]*>/gi, '')
        // Rapikan newline berlebih
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function cleanHtmlForFallback(html) {
    if (!html) return '';
    return html
        .replace(/<tg-button-row>[\s\S]*?<\/tg-button-row>/g, '')
        .replace(/<blockquote expandable>([\s\S]*?)<\/blockquote>/g, '<tg-spoiler>$1</tg-spoiler>')
        .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, '<i>$1</i>')
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gs, '<b>$1</b>\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gs, '$1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gs, '• $1\n')
        .replace(/<tr[^>]*>(.*?)<\/tr>/gs, '• $1\n')
        .replace(/<td[^>]*>(.*?)<\/td>/gs, '$1 | ')
        .replace(/<hr[^>]*>/g, '\n-------------------\n')
        .replace(/<table[^>]*>/g, '').replace(/<\/table>/g, '\n')
        .replace(/<\/?(mark|footer|details|summary|span|div)[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n').trim();
}

function formatInline(text) {
    let out = escapeHtml(text);
    out = out.replace(/\[\[(.+?)\|\|(.+?)\]\]/g, '<details><summary><b>$1</b></summary>$2</details>');
    out = out.replace(/\|\|(.+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
    out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<b>$1</b>');
    out = out.replace(/__(.+?)__/g, '<i>$1</i>');
    out = out.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<i>$1</i>');
    out = out.replace(/==(.+?)==/g, '<mark>$1</mark>');
    out = out.replace(/`(.+?)`/g, '<code>$1</code>');
    return out;
}

module.exports = { escapeHtml, cleanHtmlForFallback, formatInline, sanitizeTelegramHtml, escapeHtml };