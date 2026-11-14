const config = require('../config');
const db = require('../services/database');
const invDb = require('../services/economy-db');
const { replyHtml } = require('../helpers/edit-html');
const { escapeHtml } = require('../helpers/html');

// ── MASTER ITEM ──
const ALL_ITEMS = {
    // Toko
    bait_biasa: { name: 'Umpan Biasa', price: 100, desc: 'Peluang dapat ikan biasa.', type: 'shop' },
    bait_premium: { name: 'Umpan Premium', price: 500, desc: 'Peluang dapat ikan langka lebih besar.', type: 'shop' },
    bait_legendaris: { name: 'Umpan Legendaris', price: 2500, desc: 'Peluang dapat ikan mitos.', type: 'shop' },
    pancing_kayu: { name: 'Pancing Kayu', price: 1000, desc: 'Pancing standar pemula.', type: 'shop', max_durability: 20 },
    pancing_besi: { name: 'Pancing Besi', price: 5000, desc: 'Meningkatkan peluang dapat ikan.', type: 'shop', max_durability: 50 },
    pancing_emas: { name: 'Pancing Emas', price: 20000, desc: 'Pancing dewa, jarang gagal.', type: 'shop', max_durability: 100 },

    // Ikan
    ikan_teri: { name: 'Ikan Teri', price: 50, type: 'loot' },
    ikan_lele: { name: 'Ikan Lele', price: 120, type: 'loot' },
    ikan_nila: { name: 'Ikan Nila', price: 180, type: 'loot' },
    ikan_mas: { name: 'Ikan Mas', price: 250, type: 'loot' },
    ikan_hias: { name: 'Ikan Hias', price: 150, type: 'loot' },
    ikan_buntal: { name: 'Ikan Buntal', price: 300, type: 'loot' },
    ikan_tongkol: { name: 'Ikan Tongkol', price: 350, type: 'loot' },
    ikan_kembung: { name: 'Ikan Kembung', price: 400, type: 'loot' },
    ikan_kakap: { name: 'Ikan Kakap', price: 500, type: 'loot' },
    ikan_tuna: { name: 'Ikan Tuna', price: 750, type: 'loot' },
    ikan_salmon: { name: 'Ikan Salmon', price: 900, type: 'loot' },
    udang: { name: 'Udang', price: 200, type: 'loot' },
    cumi: { name: 'Cumi-cumi', price: 300, type: 'loot' },
    kepiting: { name: 'Kepiting', price: 450, type: 'loot' },
    lobster: { name: 'Lobster', price: 1500, type: 'loot' },
    gurita: { name: 'Gurita', price: 600, type: 'loot' },
    hiu_kecil: { name: 'Hiu Kecil', price: 800, type: 'loot' },
    ikan_emas: { name: 'Ikan Emas', price: 2500, type: 'loot' },
    paus_biru: { name: 'Paus Biru', price: 5000, type: 'loot' },
    
    // Sampah
    sampah_plastik: { name: 'Kantong Plastik', price: 5, type: 'loot' },
    sampah_botol: { name: 'Botol Bekas', price: 10, type: 'loot' },
    sampah_kaleng: { name: 'Kaleng Bekas', price: 15, type: 'loot' },
    kayu: { name: 'Kayu Apung', price: 20, type: 'loot' },
    sepatu_bekas: { name: 'Sepatu Bekas', price: 50, type: 'loot' },
    ban_bekas: { name: 'Ban Bekas', price: 100, type: 'loot' },
    besi_bekas: { name: 'Besi Bekas', price: 150, type: 'loot' },
};

const FISH_POOL = [
    { id: 'sampah_plastik', chance: 12 }, { id: 'sampah_botol', chance: 10 }, { id: 'sampah_kaleng', chance: 10 },
    { id: 'kayu', chance: 8 }, { id: 'sepatu_bekas', chance: 5 }, { id: 'ban_bekas', chance: 3 }, { id: 'besi_bekas', chance: 2 },
    { id: 'ikan_teri', chance: 10 }, { id: 'ikan_lele', chance: 8 }, { id: 'ikan_nila', chance: 7 }, { id: 'ikan_mas', chance: 6 },
    { id: 'udang', chance: 5 }, { id: 'ikan_hias', chance: 4 }, { id: 'cumi', chance: 3 }, { id: 'ikan_buntal', chance: 2 },
    { id: 'ikan_tongkol', chance: 2 }, { id: 'kepiting', chance: 1.5 }, { id: 'ikan_kembung', chance: 1.5 }, { id: 'gurita', chance: 1 },
    { id: 'ikan_kakap', chance: 1 }, { id: 'ikan_tuna', chance: 0.5 }, { id: 'hiu_kecil', chance: 0.3 }, { id: 'ikan_salmon', chance: 0.2 },
    { id: 'lobster', chance: 0.1 }, { id: 'ikan_emas', chance: 0.05 }, { id: 'paus_biru', chance: 0.01 },
];

function makeBar(current, max) {
    // Pastikan nilai tidak minus dan tidak melebihi max
    const safeCurrent = Math.max(0, Math.min(current, max));
    
    if (safeCurrent <= 0) return '❌ 0%';
    
    const percent = Math.floor((safeCurrent / max) * 100);
    const totalBlocks = 10;
    
    // Hitung blok, pastikan tidak minus dan tidak lebih dari 10
    const filledBlocks = Math.max(0, Math.min(10, Math.round((safeCurrent / max) * totalBlocks)));
    const emptyBlocks = Math.max(0, totalBlocks - filledBlocks);
    
    let colorEmoji = '🟩';
    if (percent <= 20) colorEmoji = '🟥';
    else if (percent <= 50) colorEmoji = '🟨';

    return `${colorEmoji.repeat(filledBlocks)}${'⬛'.repeat(emptyBlocks)} ${percent}%`;
}

// ── FUNGSI LOADING MANCING ──
async function LoadingMancing(ctx, isSuccess) {
    const endingFrame = isSuccess 
        ? "🎣 *Ikan berhasil ditarik!* 🐟" 
        : "💨 *Umpan dimakan ikan lain, kamu gagal menariknya...*";

    const frames = [
        "🎣 *Menyiapkan pancing dan umpan...*",
        "🌊 *Melempar umpan ke tengah laut...*",
        "⏳ *Menunggu ikan menggigit umpan...*",
        "〰️ *Umpan bergerak! Ada yang mendekat...*",
        endingFrame
    ];

    const msg = await ctx.reply(`<i>${frames[0]}</i>`, { parse_mode: 'HTML' });

    for (let i = 1; i < frames.length; i++) {
        const delay = (i === 2) ? 1500 : 800; // delay lebih lama saat nunggu
        await new Promise(res => setTimeout(res, delay));
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `<i>${frames[i]}</i>`, { parse_mode: 'HTML' }).catch(() => {});
    }
    await ctx.deleteMessage(msg.message_id).catch(() => {});
}

function registerEconomyHandler(bot) {
    // ── 1. COMMAND /shop ──
    bot.command('shop', async (ctx) => {
        let html = `<b>🛒 Toko Perlengkapan</b>\n\n`;
        for (const [key, item] of Object.entries(ALL_ITEMS)) {
            if (item.type === 'shop') {
                html += `<b>${item.name}</b> (ID: <code>${key}</code>)\nHarga: 💰 ${item.price}/pcs\n`;
                if (item.max_durability) html += `<i>Durability: ${item.max_durability} Kali Pakai</i>\n`;
                else html += `<i>${item.desc}</i>\n`;
                html += `\n`;
            }
        }
        html += `<b>📌 Cara Beli:</b>\nKetik: <code>/buy &lt;id_barang&gt; &lt;jumlah&gt;</code>\nContoh: <code>/buy bait_biasa 10</code>`;
        await replyHtml(ctx, html);
    });

    // ── 2. COMMAND /buy ──
    bot.command('buy', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 2) return replyHtml(ctx, `<b>📌 Format Salah</b>\nGunakan: <code>/buy &lt;id_barang&gt; &lt;jumlah&gt;</code>`);

        const itemKey = args[0].toLowerCase();
        const qty = parseInt(args[1]);
        const item = ALL_ITEMS[itemKey];
        const userId = ctx.from.id;

        if (!item || item.type !== 'shop') return replyHtml(ctx, `❌ <b>Barang Tidak Ditemukan!</b>\nCek di /shop`);
        if (isNaN(qty) || qty < 1) return replyHtml(ctx, `❌ Jumlah tidak valid.`);

        const totalHarga = item.price * qty;
        const saldo = Number(db.getSaldo(userId)) || 0;
        if (saldo < totalHarga) return replyHtml(ctx, `❌ <b>Saldo Tidak Cukup!</b>\nTotal: 💰 ${totalHarga}\nSaldo: 💰 ${saldo}`);

        db.addSaldo(userId, -totalHarga);
        if (item.max_durability) {
            invDb.addItem(userId, itemKey, qty);
            invDb.setDurability(userId, itemKey, item.max_durability * qty);
        } else {
            invDb.addItem(userId, itemKey, qty);
        }

        await replyHtml(ctx, `<b>✅ Pembelian Berhasil!</b>\n\nKamu membeli <b>${qty}x ${item.name}</b>\nHarga: 💰 ${totalHarga}\n\n<i>Sisa saldo: 💰 ${db.getSaldo(userId)}</i>`);
    });

    // ── 3. COMMAND /repair ──
    bot.command('repair', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 1) return replyHtml(ctx, `📌 Format: <code>/repair &lt;id_pancing&gt;</code>\nContoh: <code>/repair pancing_kayu</code>`);
        
        const itemKey = args[0].toLowerCase();
        const userId = ctx.from.id;
        const invItem = invDb.getItemWithDurability(userId, itemKey);

        if (!invItem || invItem.amount < 1) return replyHtml(ctx, `❌ Kamu tidak punya <code>${itemKey}</code> di tas.`);
        const item = ALL_ITEMS[itemKey];
        if (!item || !item.max_durability) return replyHtml(ctx, `❌ Barang ini bukan pancing.`);
        if (invItem.durability >= item.max_durability) return replyHtml(ctx, `✅ Pancing <b>${item.name}</b> masih 100%!`);

        const repairCost = Math.floor(item.price * 0.5);
        const saldo = Number(db.getSaldo(userId)) || 0;
        if (saldo < repairCost) return replyHtml(ctx, `❌ Saldo tidak cukup! Biaya: 💰 ${repairCost}\nSaldo: 💰 ${saldo}`);

        db.addSaldo(userId, -repairCost);
        invDb.setDurability(userId, itemKey, item.max_durability);

        await replyHtml(ctx, `🔧 <b>Repair Berhasil!</b>\n\nPancing <b>${item.name}</b> sudah kembali 100%.\nBiaya: 💰 ${repairCost}\n\n${makeBar(item.max_durability, item.max_durability)}`);
    });

    // ── 4. COMMAND /inv ──
    bot.command(['inv', 'inventory', 'tas'], async (ctx) => {
        const userId = ctx.from.id;
        const items = invDb.getInventory(userId);
        if (items.length === 0) return replyHtml(ctx, `🎒 <b>Tas Kamu Kosong</b>`);

        let html = `<b>🎒 Isi Tas Kamu</b>\n\n`;
        for (const item of items) {
            const detail = ALL_ITEMS[item.item_id];
            if (detail) {
                html += `• ${detail.name} (x${item.amount})\n`;
                if (detail.type === 'loot') html += `   <i>Harga jual: 💰 ${detail.price}</i>\n`;
                if (detail.max_durability) {
                    const dur = invDb.getItemWithDurability(userId, item.item_id)?.durability || 0;
                    html += `   <i>Durability: ${makeBar(dur, detail.max_durability)}</i>\n`;
                }
            }
        }
        await replyHtml(ctx, html);
    });

    // ── 5. COMMAND /mancing ──
    bot.command(['mancing', 'fish'], async (ctx) => {
        const userId = ctx.from.id;
        
        const baitLegendaris = invDb.getItem(userId, 'bait_legendaris');
        const baitPremium = invDb.getItem(userId, 'bait_premium');
        const baitBiasa = invDb.getItem(userId, 'bait_biasa');
        
        let usedBait = null;
        if (baitLegendaris && baitLegendaris.amount > 0) usedBait = 'bait_legendaris';
        else if (baitPremium && baitPremium.amount > 0) usedBait = 'bait_premium';
        else if (baitBiasa && baitBiasa.amount > 0) usedBait = 'bait_biasa';

        if (!usedBait) return replyHtml(ctx, `❌ <b>Umpan Habis!</b>\nBeli dulu di /shop`);

        let activePancing = null;
        let pancingBonus = 0;
        let pancingName = 'Tangan Kosong';
        
        const pancingList = ['pancing_emas', 'pancing_besi', 'pancing_kayu'];
        for (const p of pancingList) {
            const invP = invDb.getItemWithDurability(userId, p);
            if (invP && invP.amount > 0 && invP.durability > 0) {
                activePancing = p;
                pancingName = ALL_ITEMS[p].name;
                if (p === 'pancing_emas') pancingBonus = 30;
                else if (p === 'pancing_besi') pancingBonus = 15;
                else if (p === 'pancing_kayu') pancingBonus = 5;
                break;
            }
        }

        if (!activePancing) return replyHtml(ctx, `❌ <b>Pancing Rusak / Tidak Ada!</b>\nGunakan /repair atau beli baru di /shop.`);

        // 🔥 TENTUKAN HASIL DULU
        let bonusBait = 0;
        if (usedBait === 'bait_legendaris') bonusBait = 50;
        else if (usedBait === 'bait_premium') bonusBait = 20;

        const totalBonus = bonusBait + pancingBonus;
        const rand = Math.random() * 100;
        
        let cumulative = 0;
        let caughtId = null;
        for (const fish of FISH_POOL) {
            let chance = fish.chance;
            if (fish.chance < 2) chance += (fish.chance * totalBonus / 100);
            cumulative += chance; 
            if (rand <= cumulative) { caughtId = fish.id; break; }
        }

        const isSuccess = caughtId !== null;

        // 🔥 JALANKAN LOADING SESUAI HASIL
        await LoadingMancing(ctx, isSuccess);

        // 🔥 PROSES HASIL
        invDb.removeItem(userId, usedBait, 1);
        const currentDur = invDb.getItemWithDurability(userId, activePancing).durability;
        invDb.setDurability(userId, activePancing, currentDur - 1);

        const sisaUmpan = invDb.getItem(userId, usedBait)?.amount || 0;
        const maxDur = ALL_ITEMS[activePancing].max_durability;
        
        let durNotif = `\n\n<b>Durability Pancing:</b>\n${makeBar(currentDur - 1, maxDur)}`;
        if (currentDur - 1 <= 3) durNotif += `\n⚠️ <b>AWAS! Pancing kamu hampir rusak. Segera /repair!</b>`;

        if (!isSuccess) {
            return replyHtml(ctx, `🎣 <b>Mancing Gagal...</b>\n\n<i>Yah, umpannya habis tapi ikan belum sempat makan.</i>\n\n<b>Alat:</b> ${pancingName}\n<b>Sisa Umpan:</b> ${sisaUmpan}${durNotif}`);
        }

        const caughtItem = ALL_ITEMS[caughtId];
        invDb.addItem(userId, caughtId, 1);

        await replyHtml(ctx, `🎣 <b>Mancing Sukses!</b>\n\nKamu mendapatkan: <b>${caughtItem.name}</b>\n\n<b>Alat:</b> ${pancingName}\n<b>Sisa Umpan:</b> ${sisaUmpan}${durNotif}`);
    });

    // ── 6. COMMAND /jual ──
    bot.command(['jual', 'sell'], async (ctx) => {
        const userId = ctx.from.id;
        const args = ctx.message.text.split(' ').slice(1);
        const items = invDb.getInventory(userId).filter(i => ALL_ITEMS[i.item_id]?.type === 'loot');
        
        if (args.length === 0) {
            if (items.length === 0) return replyHtml(ctx, `❌ Tidak ada barang yang bisa dijual.\nCoba /mancing dulu!`);

            let html = `<b>💰 Daftar Barang Jualanmu</b>\n\n`;
            for (const item of items) {
                const d = ALL_ITEMS[item.item_id];
                html += `• <code>${item.item_id}</code> — ${d.name} (x${item.amount}) — 💰 ${d.price}/pcs\n`;
            }
            html += `\n<b>📌 Cara Jual:</b>\nKetik: <code>/jual &lt;id_barang&gt;</code>\nAtau jual semua: <code>/jual all</code>`;
            return replyHtml(ctx, html);
        }

        const target = args[0].toLowerCase();

        if (target === 'all') {
            let totalPrice = 0, totalItem = 0;
            for (const item of items) {
                const detail = ALL_ITEMS[item.item_id];
                totalPrice += (detail.price * item.amount);
                totalItem += item.amount;
                invDb.removeItem(userId, item.item_id, item.amount);
            }
            if (totalItem === 0) return replyHtml(ctx, `❌ Tidak ada barang untuk dijual.`);

            db.addSaldo(userId, totalPrice);
            return replyHtml(ctx, `✅ Kamu menjual <b>${totalItem} barang</b> seharga 💰 ${totalPrice}\n\n<i>Sisa saldo: 💰 ${db.getSaldo(userId)}</i>`);
        }

        const itemId = target;
        const item = invDb.getItem(userId, itemId);
        
        if (!item || item.amount < 1) return replyHtml(ctx, `❌ Barang <code>${itemId}</code> tidak ada di tas kamu.`);

        const detail = ALL_ITEMS[itemId];
        if (!detail || detail.type !== 'loot') return replyHtml(ctx, `❌ Barang ini tidak bisa dijual.`);

        const totalPrice = detail.price * item.amount;
        invDb.removeItem(userId, itemId, item.amount);
        db.addSaldo(userId, totalPrice);

        await replyHtml(ctx, `✅ Kamu menjual <b>${item.amount}x ${detail.name}</b> seharga 💰 ${totalPrice}\n\n<i>Sisa saldo: 💰 ${db.getSaldo(userId)}</i>`);
    });
}

module.exports = { registerEconomyHandler };