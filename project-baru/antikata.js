// antikata.js
// Sistem deteksi kata terlarang yang tahan terhadap obfuscation

// === 1. PEMETAAN FONT UNICODE → LATIN ===
// Mengonversi karakter "gaya" (bold, italic, fullwidth, dll.) ke huruf latin biasa
const FONT_MAP = (() => {
    const map = {};

    // Helper: mapping range Unicode ke huruf latin a-z / A-Z / 0-9
    const mapRange = (start, end, baseChar) => {
        for (let i = 0; i < (end - start + 1); i++) {
            const baseCode = baseChar.charCodeAt(0) + i;
            map[String.fromCodePoint(start + i)] = String.fromCharCode(baseCode);
        }
    };

    // --- Huruf Kecil (a-z) berbagai gaya ---
    // Mathematical Bold
    mapRange(0x1D41A, 0x1D433, 'a');
    // Mathematical Italic
    mapRange(0x1D44E, 0x1D467, 'a');
    // Mathematical Bold Italic
    mapRange(0x1D482, 0x1D49B, 'a');
    // Mathematical Script
    mapRange(0x1D4B6, 0x1D4CF, 'a');
    // Mathematical Bold Script
    mapRange(0x1D4EA, 0x1D503, 'a');
    // Mathematical Fraktur
    mapRange(0x1D51E, 0x1D537, 'a');
    // Mathematical Double-Struck
    mapRange(0x1D552, 0x1D56B, 'a');
    // Mathematical Sans-Serif
    mapRange(0x1D5BA, 0x1D5D3, 'a');
    // Mathematical Sans-Serif Bold
    mapRange(0x1D5EE, 0x1D607, 'a');
    // Mathematical Sans-Serif Italic
    mapRange(0x1D622, 0x1D63B, 'a');
    // Mathematical Monospace
    mapRange(0x1D68A, 0x1D6A3, 'a');

    // --- Huruf Besar (A-Z) ---
    mapRange(0x1D400, 0x1D419, 'A'); // Bold
    mapRange(0x1D434, 0x1D44D, 'A'); // Italic
    mapRange(0x1D468, 0x1D481, 'A'); // Bold Italic
    mapRange(0x1D49C, 0x1D4B5, 'A'); // Script
    mapRange(0x1D4D0, 0x1D4E9, 'A'); // Bold Script
    mapRange(0x1D504, 0x1D51D, 'A'); // Fraktur
    mapRange(0x1D538, 0x1D551, 'A'); // Double-Struck
    mapRange(0x1D5A0, 0x1D5B9, 'A'); // Sans-Serif
    mapRange(0x1D5D4, 0x1D5ED, 'A'); // Sans-Serif Bold
    mapRange(0x1D608, 0x1D621, 'A'); // Sans-Serif Italic
    mapRange(0x1D670, 0x1D689, 'A'); // Monospace

    // --- Fullwidth (Ａ-Ｚ, ａ-ｚ, ０-９) ---
    mapRange(0xFF21, 0xFF3A, 'A');
    mapRange(0xFF41, 0xFF5A, 'a');
    mapRange(0xFF10, 0xFF19, '0');

    // --- Circled (ⓐ-ⓩ, Ⓐ-Ⓩ) ---
    mapRange(0x24D0, 0x24E9, 'a');
    mapRange(0x24B6, 0x24CF, 'A');

    // --- Squared / Negative circled (partial) ---
    map['🅰'] = 'a'; map['🅱'] = 'b'; map['🅾'] = 'o'; map['🅿'] = 'p';
    map['🆒'] = 'cool'; map['🆓'] = 'free'; map['🆔'] = 'id'; map['🆕'] = 'new';

    // --- Small caps ---
    const smallCaps = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ';
    for (let i = 0; i < smallCaps.length; i++) {
        map[smallCaps[i]] = 'abcdefghijklmnopqrstuvwxyz'[i];
    }

    // --- Superscript & Subscript angka ---
    const supers = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    for (let i = 0; i < 10; i++) {
        map[supers[i]] = String(i);
        map[subs[i]] = String(i);
    }

    return map;
})();

// === 2. HOMOGLYPH (huruf mirip dari alfabet lain) ===
const HOMOGLYPH_MAP = {
    // Cyrillic → Latin
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
    'А': 'a', 'Е': 'e', 'О': 'o', 'Р': 'p', 'С': 'c', 'У': 'y', 'Х': 'x',
    'і': 'i', 'І': 'i', 'ј': 'j', 'Ј': 'j', 'ѕ': 's', 'Ѕ': 's',
    'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w',
    // Greek → Latin
    'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o',
    'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'γ': 'y',
    'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Ι': 'i', 'Κ': 'k', 'Ν': 'n', 'Ο': 'o',
    'Ρ': 'p', 'Τ': 't', 'Υ': 'y', 'Χ': 'x',
    // Armenian
    'օ': 'o', 'ս': 'u', 'ց': 'g', 'հ': 'h',
    // Lain-lain
    'ı': 'i', 'ȷ': 'j', 'ɑ': 'a', 'ɡ': 'g', 'ɩ': 'i', 'ʏ': 'y',
    'ʀ': 'r', 'ʙ': 'b', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n'
};

// === 3. LEET SPEAK (angka/simbol → huruf) ===
const LEET_MAP = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
    '@': 'a', '$': 's', '!': 'i', '|': 'l', '+': 't', '€': 'e', '£': 'l'
};
// Catatan: '1' juga sering jadi 'l', tapi 'i' lebih umum untuk "info".
// Untuk kasus "inf0" vs "1nfo", dua-duanya akan terdeteksi karena kita cek
// variasi hasil normalisasi, bukan cuma satu mapping.

// === 4. NORMALISASI TEKS ===
function normalizeText(text) {
    if (!text) return '';

    let result = '';

    for (const char of text) {
        // Zero-width & invisible characters → hapus
        if (/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/.test(char)) {
            continue;
        }

        // 1. Coba font map
        if (FONT_MAP[char]) {
            result += FONT_MAP[char];
            continue;
        }

        // 2. Coba homoglyph map
        if (HOMOGLYPH_MAP[char]) {
            result += HOMOGLYPH_MAP[char];
            continue;
        }

        // 3. Coba leet map
        if (LEET_MAP[char]) {
            result += LEET_MAP[char];
            continue;
        }

        // 4. Normalisasi Unicode (NFKD) lalu buang diacritic
        const normalized = char.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        result += normalized;
    }

    // Lowercase semua
    result = result.toLowerCase();

    // Ganti semua non-alphanumeric dengan spasi sementara (untuk deteksi terpisah)
    // Tapi simpan versi "squished" (tanpa spasi) juga
    return result;
}

// === 5. GENERATE VARIASI TEKS ===
// Karena satu normalisasi belum tentu cukup (misal "1" bisa "i" atau "l"),
// kita generate beberapa variasi dan cek semuanya
function generateVariants(text) {
    const base = normalizeText(text);
    const variants = new Set();

    // Variasi 1: base apa adanya
    variants.add(base);

    // Variasi 2: tanpa spasi & tanda baca (squished)
    variants.add(base.replace(/[^a-z0-9]/g, ''));

    // Variasi 3: '1' → 'l' (bukan 'i')
    variants.add(base.replace(/i/g, 'i').replace(/1/g, 'l'));

    // Variasi 4: hapus huruf berulang (innffoo → info)
    variants.add(base.replace(/(.)\1+/g, '$1'));

    // Variasi 5: squished + hapus duplikat
    const squished = base.replace(/[^a-z0-9]/g, '');
    variants.add(squished.replace(/(.)\1+/g, '$1'));

    // Variasi 6: coba '1' sebagai 'l' pada squished
    variants.add(squished.replace(/1/g, 'l'));

    return Array.from(variants).filter(v => v.length > 0);
}

// === 6. FUNGSI UTAMA: CEK KATA TERLARANG ===
// Mengembalikan kata terlarang yang terdeteksi, atau null
function checkBadWords(text, badWords) {
    if (!text || !badWords || badWords.length === 0) return null;

    // Pre-normalisasi daftar kata terlarang (biar konsisten)
    const normalizedBadWords = badWords.map(w => normalizeText(w).replace(/[^a-z0-9]/g, ''));

    const variants = generateVariants(text);

    for (const variant of variants) {
        for (let i = 0; i < normalizedBadWords.length; i++) {
            const bad = normalizedBadWords[i];
            if (!bad) continue;

            // Cek substring (karena kata bisa nempel di kalimat)
            if (variant.includes(bad)) {
                return badWords[i]; // kembalikan kata asli dari config
            }
        }
    }

    return null;
}

// === 7. FUNGSI BONUS: DETEKSI PROMO & LINK ===
// Bisa dipakai juga untuk promo/link, lebih robust dari regex biasa
function checkPattern(text, patterns) {
    if (!text) return null;
    const variants = generateVariants(text);
    for (const variant of variants) {
        for (const pattern of patterns) {
            if (variant.includes(pattern.toLowerCase())) return pattern;
        }
    }
    return null;
}

module.exports = {
    normalizeText,
    generateVariants,
    checkBadWords,
    checkPattern
};