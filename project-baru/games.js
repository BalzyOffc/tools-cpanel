// ═══════════════════════════════════════════════════════════════
// 🎮 handlers/games.js — SEMUA GAME & EKONOMI
// ═══════════════════════════════════════════════════════════════
const db = require('../services/database');
const config = require('../config');
const { replyRich, premiumMessage, sendRichMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');
const { getTargetUser } = require('../helpers/user');
const { formatDuration } = require('../helpers/cooldown');
const { dailyCooldown } = require('../state/maps');
const {
    pendingTrivia,
    tebakAngkaSessions,
    activeMathGame,
    pendingDadu,
    pendingType,
    pendingGanjilGenap,
    pendingBom,
    pendingTembakLayar,
    pendingTebakKata,
    pendingSlotBet,
    pendingSuit,
} = require('../state/maps');

// ═══════════════════════════════════════════════════════════════
// HELPERS LOKAL
// ═══════════════════════════════════════════════════════════════
const SUIT_EMOJI = { batu: '🪨', gunting: '✂️', kertas: '📄' };
const SUIT_WIN = { batu: 'gunting', gunting: 'kertas', kertas: 'batu' };

const TRIVIA_BANK = [
    { q: 'Ibu kota Indonesia?', a: ['jakarta'], reward: 100 },
    { q: 'Planet terdekat dari matahari?', a: ['merkurius', 'mercury'], reward: 100 },
    { q: 'Berapa hasil dari 2 + 2 x 2?', a: ['6', 'enam'], reward: 150 },
    { q: 'Siapa presiden pertama Indonesia?', a: ['soekarno', 'sukarno'], reward: 150 },
    { q: 'Hewan tercepat di darat?', a: ['cheetah', 'citah'], reward: 150 },
    { q: 'Berapa jumlah pemain sepak bola 1 tim?', a: ['11', 'sebelas'], reward: 100 },
    { q: 'Ibukota Jepang?', a: ['tokyo', 'tokio'], reward: 100 },
    { q: 'Mata uang Jepang?', a: ['yen'], reward: 100 },
    { q: 'Siapa penemu lampu pijar?', a: ['balzy official', 'balzy'], reward: 200 },
    { q: 'Laut terluas di dunia?', a: ['pasifik', 'pacific'], reward: 200 },
];

const KATA_BANK = ['kucing', 'anjing', 'komputer', 'telegram', 'indonesia', 'pemrograman', 'javascript', 'kucing', 'sepeda', 'balzy', 'matahari'];

const TYPE_WORDS = ['kucing', 'naga', 'coding', 'python', 'server', 'internet', 'laptop', 'keyboard', 'monitor'];

const BALL_ANSWERS = [
    '✅ Ya, pasti!', '✅ Tentu saja.', '✅ Tanpa ragu.', '✅ Go for it!',
    '🤔 Mungkin.', '🤔 Bisa jadi.', '🤔 Coba lagi nanti.', '🤔 Belum pasti.',
    '❌ Tidak.', '❌ Jangan.', '❌ Sayangnya tidak.', '❌ Mending jangan.',
    '🔮 Nanti tahu sendiri.', '🔮 Percaya instingmu.',
];

// ═══════════════════════════════════════════════════════════════
// SALDO & CLAIM
// ═══════════════════════════════════════════════════════════════
async function showSaldo(ctx, target) {
    const saldo = db.getSaldo(target.id);
    const score = db.getScore(target.id) || { wins: 0, losses: 0 };
    return sendRichMessage(ctx.chat.id, premiumMessage({
        heading: 'Informasi Saldo', headingEmoji: '💰',
        body: `<a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a>`,
        listItems: [
            `💳 Saldo: <b>${saldo}</b>`,
            `🏆 Menang: ${score.wins}x`,
            `😢 Kalah: ${score.losses}x`,
        ],
        accent: '💎',
        buttons: [{ text: '🎰 Main Slot', callback: 'main_slot', color: 'success' }],
    }));
}

// ═══════════════════════════════════════════════════════════════
// SLOT MAHJONG
// ═══════════════════════════════════════════════════════════════
async function showSlotMenu(ctx) {
    const saldo = db.getSaldo(ctx.from.id);
    return sendRichMessage(ctx.chat.id, premiumMessage({
        heading: 'Slot Mahjong', headingEmoji: '🎰',
        body: `Saldo kamu: <b>${saldo}</b>\n\nPilih mode permainan:`,
        blockquote: `🎯 <b>Solo</b> — main vs rumah, payout x2-x10\n⚔️ <b>PvP</b> — tantang user lain\n💰 <b>Cek Saldo</b> — lihat saldo & statistik`,
        footer: `Bet: ${config.SLOT_MIN_BET} - ${config.SLOT_MAX_BET}`,
        accent: '🎯',
        buttons: [
            { text: '🎰 Main Solo', callback: 'slot_mode_solo', color: 'success' },
            { text: '⚔️ PvP (Reply)', callback: 'slot_mode_pvp', color: 'warning' },
            { text: '💰 Cek Saldo', callback: 'cek_saldo', color: 'primary' },
        ],
    }));
}

async function showSlotBetMenu(ctx) {
    const saldo = db.getSaldo(ctx.from.id);
    const bets = [100, 500, 1000, 5000].filter(b => b <= saldo);

    if (bets.length === 0) {
        return sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Saldo Kurang', headingEmoji: '💸',
            body: `Saldo kamu <b>${saldo}</b>, minimal bet <b>${config.SLOT_MIN_BET}</b>.`,
            blockquote: 'Claim kode dari owner dulu ya!\nKetik /claim <kode>',
            accent: '💳',
            buttons: [{ text: '🎁 Cara Claim', callback: 'slot_claim_help', color: 'primary' }],
        }));
    }

    const buttons = bets.map(b => ({
        text: `🎰 ${b}`,
        callback: `slot_spin_${b}`,
        color: b === 100 ? 'primary' : b === 500 ? 'success' : 'danger',
    }));

    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    rows.push([{ text: '✏️ Bet Custom', callback: 'slot_custom_bet', color: 'primary' }]);

    let html = `<h1>🎰 Pilih Bet</h1>`;
    html += `<p>Saldo: <b>${saldo}</b></p>`;
    html += `<blockquote>Klik nominal bet, atau pilih Custom untuk input manual.</blockquote>`;
    html += `<footer>💎 Payout hingga x10 dari bet!</footer>`;
    for (const row of rows) {
        html += '<tg-button-row>';
        row.forEach(b => {
            html += `<tg-button type="callback_data" data="${b.callback}" style="${b.color}">${b.text}</tg-button>`;
        });
        html += '</tg-button-row>';
    }
    return sendRichMessage(ctx.chat.id, html);
}

async function runSlot(ctx, bet) {
    const user = ctx.from;
    const chatId = ctx.chat.id;

    if (isNaN(bet) || bet < config.SLOT_MIN_BET || bet > config.SLOT_MAX_BET) {
        return sendRichMessage(chatId, premiumMessage({
            heading: 'Format Salah', headingEmoji: '❌',
            body: `Gunakan: <code>/slot &lt;bet&gt;</code>`,
            blockquote: `Min: ${config.SLOT_MIN_BET}\nMax: ${config.SLOT_MAX_BET}`,
            accent: '🎰',
            buttons: [{ text: '🎰 Menu Slot', callback: 'slot_menu', color: 'primary' }],
        }));
    }

    const saldo = db.getSaldo(user.id);
    if (saldo < bet) {
        return sendRichMessage(chatId, premiumMessage({
            heading: 'Saldo Kurang', headingEmoji: '💸',
            body: `Saldo kamu <b>${saldo}</b>, bet <b>${bet}</b>.`,
            footer: 'Claim kode dari owner dulu ya!',
            accent: '💳',
            buttons: [{ text: '🎁 Cara Claim', callback: 'slot_claim_help', color: 'success' }],
        }));
    }

    db.addSaldo(user.id, -bet);

    const reels = [];
    for (let i = 0; i < 3; i++) {
        reels.push(config.SLOT_SYMBOLS[Math.floor(Math.random() * config.SLOT_SYMBOLS.length)]);
    }
    const resultStr = reels.join('');
    const multiplier = config.SLOT_PAYOUT[resultStr] || 0;
    const payout = Math.floor(bet * multiplier);
    const newSaldo = db.addSaldo(user.id, payout);

    // Animasi
    let spinMsg;
    try {
        spinMsg = await require('../core/bot-instance').bot.telegram.sendMessage(chatId, '🎰 Mencari hoki...');
        const frames = ['🀄 🎴 🀫', '🎰 💰 💎', '🎴 🀫 🀄', reels.join(' ')];
        for (let i = 0; i < frames.length - 1; i++) {
            await new Promise(r => setTimeout(r, 400));
            try { await require('../core/bot-instance').bot.telegram.editMessageText(chatId, spinMsg.message_id, undefined, `🎰 ${frames[i]}\n\n⏳ Spinning...`); } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 400));
        try { await require('../core/bot-instance').bot.telegram.deleteMessage(chatId, spinMsg.message_id); } catch (e) {}
    } catch (e) {}

    const isWin = multiplier > 0;
    return sendRichMessage(chatId, premiumMessage({
        heading: isWin ? 'JACKPOT!' : 'Belum Hoki',
        headingEmoji: isWin ? '🎉' : '😴',
        body: `Hasil spin:`,
        pre: `  ${reels.join('  ')}  `,
        blockquote: isWin
            ? `Menang <b>${payout}</b> (x${multiplier} dari bet ${bet})!`
            : `Kalah bet <b>${bet}</b>. Coba lagi!`,
        listItems: [
            `Bet: ${bet}`,
            `Payout: <b>${payout}</b>`,
            `Saldo: <b>${newSaldo}</b>`,
        ],
        footer: isWin ? 'Hoki banget!' : 'Jangan nyerah, spin lagi~',
        accent: '🎰',
        buttons: [
            { text: `🔁 Spin Lagi (${bet})`, callback: `slot_spin_${bet}`, color: 'success' },
            { text: '🎰 Ganti Bet', callback: 'slot_mode_solo', color: 'warning' },
            { text: '💰 Cek Saldo', callback: 'cek_saldo', color: 'primary' },
        ],
    }));
}

// ═══════════════════════════════════════════════════════════════
// SUIT (BATU GUNTING KERTAS)
// ═══════════════════════════════════════════════════════════════
async function showSuitMenu(ctx) {
    return sendRichMessage(ctx.chat.id, premiumMessage({
        heading: 'Game Suit', headingEmoji: '🎮',
        body: 'Pilih mode permainan:',
        blockquote: `🆚 <b>vs Bot</b> — main sendiri, reward +${config.SUIT_REWARD}\n👥 <b>PvP</b> — tantang user tertentu\n🎲 <b>Random</b> — cari lawan acak dari antrian grup`,
        footer: 'Contoh: /suit @user atau /suit random',
        accent: '🎯',
        buttons: [
            { text: '🤖 vs Bot', callback: 'suit_mode_bot', color: 'primary' },
            { text: '🎲 Random Player', callback: 'suit_mode_random', color: 'success' },
            { text: '👥 Tantang via Reply', callback: 'suit_mode_pvp_help', color: 'warning' },
        ],
    }));
}

async function runSuitBot(ctx, userChoice = null) {
    const user = ctx.from;
    if (!userChoice) {
        return sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Suit vs Bot', headingEmoji: '🤖',
            body: 'Pilih senjata kamu!',
            blockquote: `Menang +${config.SUIT_REWARD} | Kalah -${config.SUIT_REWARD}`,
            accent: '🎯',
            buttons: [
                { text: '🪨 Batu', callback: 'suit_bot_batu', color: 'primary' },
                { text: '✂️ Gunting', callback: 'suit_bot_gunting', color: 'warning' },
                { text: '📄 Kertas', callback: 'suit_bot_kertas', color: 'success' },
            ],
        }));
    }

    const botChoice = Object.keys(SUIT_EMOJI)[Math.floor(Math.random() * 3)];
    const saldo = db.getSaldo(user.id);
    let result, delta = 0;

    if (userChoice === botChoice) result = 'SERI';
    else if (SUIT_WIN[userChoice] === botChoice) { result = 'MENANG'; delta = config.SUIT_REWARD; db.addWin(user.id); }
    else { result = 'KALAH'; delta = -config.SUIT_REWARD; db.addLoss(user.id); }

    if (saldo + delta < 0) delta = -saldo;
    const newSaldo = db.addSaldo(user.id, delta);

    return sendRichMessage(ctx.chat.id, premiumMessage({
        heading: result === 'MENANG' ? 'Kamu Menang!' : result === 'KALAH' ? 'Kamu Kalah' : 'Seri!',
        headingEmoji: result === 'MENANG' ? '🏆' : result === 'KALAH' ? '😢' : '🤝',
        body: `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a> vs 🤖 Bot`,
        blockquote: `Kamu: ${SUIT_EMOJI[userChoice]} ${userChoice}\nBot: ${SUIT_EMOJI[botChoice]} ${botChoice}`,
        listItems: [
            `Hasil: <b>${result}</b>`,
            `Saldo: <b>${newSaldo}</b> (${delta >= 0 ? '+' : ''}${delta})`,
        ],
        accent: '🎮',
        buttons: [{ text: '🔁 Main Lagi', callback: 'suit_mode_bot', color: 'success' }],
    }));
}

async function challengeSuit(ctx, target) {
    if (target.id === ctx.from.id) {
        return sendRichMessage(ctx.chat.id, premiumMessage({ heading: 'Error', headingEmoji: '❌', body: 'Tidak bisa menantang diri sendiri.', accent: '🎮' }));
    }
    if (target.is_bot) {
        return sendRichMessage(ctx.chat.id, premiumMessage({ heading: 'Error', headingEmoji: '❌', body: 'Tidak bisa menantang bot lain.', accent: '🎮' }));
    }

    const challengeId = `suit_${Date.now()}_${ctx.from.id}`;
    const bet = config.SUIT_REWARD;
    db.createChallenge(challengeId, ctx.chat.id, ctx.from.id, target.id, 'suit', bet);

    return sendRichMessage(ctx.chat.id, premiumMessage({
        heading: 'Tantangan Suit!', headingEmoji: '⚔️',
        body: `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> menantang <a href="tg://user?id=${target.id}">${escapeHtml(target.first_name)}</a>!`,
        blockquote: `Taruhan: <b>${bet}</b> saldo\nPemenang ambil semua!`,
        footer: `${escapeHtml(target.first_name)}, terima tantangan?`,
        accent: '🎯',
        buttons: [
            { text: '✅ Terima', callback: `suit_accept_${challengeId}`, color: 'success' },
            { text: '❌ Tolak', callback: `suit_reject_${challengeId}`, color: 'danger' },
        ],
    }));
}

async function randomSuitMatch(ctx) {
    const opponent = db.findOpponent(ctx.chat.id, ctx.from.id, 'suit');

    if (!opponent) {
        db.addQueue(ctx.chat.id, ctx.from.id, 'suit');
        return sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Mencari Lawan...', headingEmoji: '🔍',
            body: `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> masuk antrian matchmaking suit.`,
            blockquote: 'Menunggu lawan bergabung...',
            footer: 'Ketik /suit random lagi untuk batal',
            accent: '🎲',
        }));
    }

    db.removeQueue(ctx.chat.id, ctx.from.id, 'suit');
    db.removeQueue(ctx.chat.id, opponent, 'suit');

    const challengeId = `suit_${Date.now()}_${ctx.from.id}_${opponent}`;
    db.createChallenge(challengeId, ctx.chat.id, opponent, ctx.from.id, 'suit', config.SUIT_REWARD);

    return sendRichMessage(ctx.chat.id, premiumMessage({
        heading: 'Lawan Ditemukan!', headingEmoji: '🎯',
        body: `<a href="tg://user?id=${opponent}">Player 1</a> vs <a href="tg://user?id=${ctx.from.id}">Player 2</a>`,
        blockquote: `Pilih senjata kalian! Taruhan: ${config.SUIT_REWARD} saldo`,
        accent: '⚔️',
        buttons: [
            { text: '🪨 Batu', callback: `suit_pvp_${challengeId}_batu`, color: 'primary' },
            { text: '✂️ Gunting', callback: `suit_pvp_${challengeId}_gunting`, color: 'warning' },
            { text: '📄 Kertas', callback: `suit_pvp_${challengeId}_kertas`, color: 'success' },
        ],
    }));
}

async function pvpSuitChoice(ctx, challengeId, userId, choice) {
    const challenge = db.getChallenge(challengeId);
    if (!challenge || challenge.status !== 'accepted') {
        return ctx.answerCbQuery('❌ Challenge tidak valid', { show_alert: true });
    }

    if (userId !== parseInt(challenge.from_id) && userId !== parseInt(challenge.to_id)) {
        return ctx.answerCbQuery('❌ Bukan challenge kamu', { show_alert: true });
    }

    let pending = pendingSuit.get(challengeId) || {};
    pending[userId] = choice;
    pendingSuit.set(challengeId, pending);

    await ctx.answerCbQuery(`✅ Kamu pilih ${SUIT_EMOJI[choice]} ${choice}`);

    if (pending[challenge.from_id] && pending[challenge.to_id]) {
        pendingSuit.delete(challengeId);
        db.updateChallengeStatus(challengeId, 'done');

        const c1 = pending[challenge.from_id];
        const c2 = pending[challenge.to_id];
        const bet = challenge.bet;

        let result, winnerId, loserId;
        if (c1 === c2) result = 'SERI';
        else if (SUIT_WIN[c1] === c2) { result = 'PLAYER 1 MENANG'; winnerId = challenge.from_id; loserId = challenge.to_id; }
        else { result = 'PLAYER 2 MENANG'; winnerId = challenge.to_id; loserId = challenge.from_id; }

        if (result !== 'SERI') {
            const lSaldo = db.getSaldo(loserId);
            const transfer = Math.min(bet, lSaldo);
            db.addSaldo(winnerId, transfer);
            db.addSaldo(loserId, -transfer);
            db.addWin(winnerId);
            db.addLoss(loserId);
        }

        let p1Name = 'Player 1', p2Name = 'Player 2';
        try { p1Name = (await require('../core/bot-instance').bot.telegram.getChat(challenge.from_id)).first_name; } catch (e) {}
        try { p2Name = (await require('../core/bot-instance').bot.telegram.getChat(challenge.to_id)).first_name; } catch (e) {}

        await sendRichMessage(challenge.chat_id, premiumMessage({
            heading: 'Hasil Suit PvP', headingEmoji: '⚔️',
            body: `<b>${escapeHtml(p1Name)}</b> vs <b>${escapeHtml(p2Name)}</b>`,
            blockquote: `${SUIT_EMOJI[c1]} ${c1}  vs  ${SUIT_EMOJI[c2]} ${c2}`,
            listItems: [
                `Hasil: <b>${result}</b>`,
                result !== 'SERI' ? `Transfer: <b>${bet}</b> saldo` : 'Tidak ada transfer (seri)',
            ],
            accent: '🏆',
        }));
    } else {
        await sendRichMessage(challenge.chat_id, premiumMessage({
            heading: 'Menunggu Lawan...', headingEmoji: '⏳',
            body: `Pilihan kamu: ${SUIT_EMOJI[choice]} ${choice}`,
            footer: 'Menunggu lawan memilih...',
            accent: '🎯',
        }));
    }
}

// ═══════════════════════════════════════════════════════════════
// REGISTRAR
// ═══════════════════════════════════════════════════════════════
function registerGamesHandler(bot) {
    // ─── /saldo ───
    bot.command('saldo', async (ctx) => {
        const target = ctx.message.reply_to_message?.from || ctx.from;
        return showSaldo(ctx, target);
    });

    bot.action('cek_saldo', async (ctx) => {
        await ctx.answerCbQuery();
        return showSaldo(ctx, ctx.from);
    });

    // ─── /claim ───
    bot.command('claim', async (ctx) => {
        const code = ctx.message.text.split(' ')[1]?.toUpperCase();
        if (!code) return replyRich(ctx, premiumMessage({
            heading: 'Format Salah', headingEmoji: '❌',
            body: 'Gunakan: <code>/claim &lt;kode&gt;</code>',
            accent: '🎁',
        }));

        const data = db.getCode(code);
        if (!data) return replyRich(ctx, premiumMessage({
            heading: 'Kode Tidak Valid', headingEmoji: '❌',
            body: `Kode <code>${code}</code> tidak ditemukan.`,
            accent: '🚫',
        }));

        if (data.uses >= data.max_uses) return replyRich(ctx, premiumMessage({
            heading: 'Kode Habis', headingEmoji: '⚠️',
            body: `Kode <code>${code}</code> sudah mencapai batas.`,
            blockquote: `Digunakan: ${data.uses}/${data.max_uses}`,
            accent: '📊',
        }));

        db.useCode(code);
        const newSaldo = db.addSaldo(ctx.from.id, data.saldo);
        db.logClaim(ctx.from.id, code, data.saldo);

        await replyRich(ctx, premiumMessage({
            heading: 'Claim Berhasil!', headingEmoji: '🎉',
            body: `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> berhasil claim!`,
            listItems: [
                `Kode: <code>${code}</code>`,
                `Saldo masuk: <b>+${data.saldo}</b>`,
                `Saldo sekarang: <b>${newSaldo}</b>`,
            ],
            footer: 'Selamat bermain!',
            accent: '💰',
            buttons: [
                { text: '🎰 Main Slot', callback: 'main_slot', color: 'success' },
                { text: '🎮 Suit', callback: 'play_suit', color: 'primary' },
            ],
        }));
    });

    // ─── SLOT ───
    bot.command('slot', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) return showSlotMenu(ctx);
        return runSlot(ctx, parseInt(args[0]));
    });

    bot.action('main_slot', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return showSlotMenu(ctx);
    });

    bot.action('slot_menu', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return showSlotMenu(ctx);
    });

    bot.action('slot_mode_solo', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return showSlotBetMenu(ctx);
    });

    bot.action(/slot_spin_(\d+)/, async (ctx) => {
        const bet = parseInt(ctx.match[1]);
        await ctx.answerCbQuery(`🎰 Spin ${bet}!`);
        try { await ctx.deleteMessage(); } catch (e) {}
        return runSlot(ctx, bet);
    });

    bot.action('slot_custom_bet', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        pendingSlotBet.set(ctx.from.id, { chatId: ctx.chat.id });
        await sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Input Bet Custom', headingEmoji: '✏️',
            body: `Ketik nominal bet kamu.`,
            blockquote: `Min: ${config.SLOT_MIN_BET}\nMax: ${config.SLOT_MAX_BET}`,
            footer: 'Contoh: /slot 250',
            accent: '💰',
        }));
    });

    bot.action('slot_claim_help', async (ctx) => {
        await ctx.answerCbQuery();
        await sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Cara Claim Saldo', headingEmoji: '🎁',
            body: 'Minta kode claim ke owner, lalu:',
            pre: '/claim KODE-DARI-OWNER',
            blockquote: 'Saldo langsung masuk ke akunmu.',
            accent: '💳',
        }));
    });

    bot.action('slot_mode_pvp', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        await sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Slot PvP', headingEmoji: '⚔️',
            body: 'Cara main Slot PvP:',
            listItems: [
                '1️⃣ Reply pesan lawan',
                '2️⃣ Ketik <code>/slots &lt;bet&gt;</code>',
                '3️⃣ Lawan klik Terima',
                '4️⃣ Keduanya spin, skor tertinggi menang!',
            ],
            accent: '🎰',
        }));
    });

    // ─── SUIT ───
    bot.command('suit', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const reply = ctx.message.reply_to_message;

        if (args[0] === 'random') return randomSuitMatch(ctx);
        if (reply && reply.from.id !== ctx.from.id) return challengeSuit(ctx, reply.from);
        if (args[0] && args[0].startsWith('@')) {
            return sendRichMessage(ctx.chat.id, premiumMessage({
                heading: 'Gunakan Reply', headingEmoji: '💡',
                body: 'Reply pesan user tersebut lalu ketik /suit.',
                accent: '🎯',
            }));
        }
        return showSuitMenu(ctx);
    });

    bot.action('play_suit', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return showSuitMenu(ctx);
    });

    bot.action('suit_mode_bot', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return runSuitBot(ctx);
    });

    bot.action(/suit_bot_(batu|gunting|kertas)/, async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return runSuitBot(ctx, ctx.match[1]);
    });

    bot.action('suit_mode_random', async (ctx) => {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch (e) {}
        return randomSuitMatch(ctx);
    });

    bot.action('suit_mode_pvp_help', async (ctx) => {
        await ctx.answerCbQuery();
        await sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Cara Tantang PvP', headingEmoji: '💡',
            body: 'Reply pesan lawan, lalu ketik:',
            pre: '/suit',
            footer: 'Atau /suit random untuk matchmaking otomatis',
            accent: '🎯',
        }));
    });

    bot.action(/suit_accept_(.+)/, async (ctx) => {
        const challengeId = ctx.match[1];
        const challenge = db.getChallenge(challengeId);
        if (!challenge) return ctx.answerCbQuery('❌ Challenge tidak ditemukan', { show_alert: true });
        if (ctx.from.id !== parseInt(challenge.to_id)) return ctx.answerCbQuery('❌ Bukan untukmu', { show_alert: true });
        if (challenge.status !== 'pending') return ctx.answerCbQuery('❌ Sudah diproses', { show_alert: true });

        db.updateChallengeStatus(challengeId, 'accepted');
        await ctx.answerCbQuery('✅ Diterima!');
        try { await ctx.deleteMessage(); } catch (e) {}

        await sendRichMessage(challenge.chat_id, premiumMessage({
            heading: 'Challenge Diterima!', headingEmoji: '⚔️',
            body: 'Kedua player, pilih senjata sekarang:',
            blockquote: `Taruhan: ${challenge.bet} saldo`,
            accent: '🎯',
            buttons: [
                { text: '🪨 Batu', callback: `suit_pvp_${challengeId}_batu`, color: 'primary' },
                { text: '✂️ Gunting', callback: `suit_pvp_${challengeId}_gunting`, color: 'warning' },
                { text: '📄 Kertas', callback: `suit_pvp_${challengeId}_kertas`, color: 'success' },
            ],
        }));
    });

    bot.action(/suit_reject_(.+)/, async (ctx) => {
        const challengeId = ctx.match[1];
        const challenge = db.getChallenge(challengeId);
        if (!challenge) return ctx.answerCbQuery('❌ Tidak ditemukan');
        if (ctx.from.id !== parseInt(challenge.to_id)) return ctx.answerCbQuery('❌ Bukan untukmu');
        db.updateChallengeStatus(challengeId, 'rejected');
        await ctx.answerCbQuery('❌ Ditolak');
        try { await ctx.deleteMessage(); } catch (e) {}
        await sendRichMessage(challenge.chat_id, premiumMessage({
            heading: 'Challenge Ditolak', headingEmoji: '❌',
            body: 'Tantangan dibatalkan.',
            accent: '🎯',
        }));
    });

    bot.action(/suit_pvp_(.+)_(batu|gunting|kertas)/, async (ctx) => {
        const challengeId = ctx.match[1];
        const choice = ctx.match[2];
        return pvpSuitChoice(ctx, challengeId, ctx.from.id, choice);
    });

    bot.command('suitcancel', async (ctx) => {
        db.removeQueue(ctx.chat.id, ctx.from.id, 'suit');
        await sendRichMessage(ctx.chat.id, premiumMessage({
            heading: 'Dibatalkan', headingEmoji: '✅',
            body: 'Kamu keluar dari antrian suit.',
            accent: '🎲',
        }));
    });

    // ─── TRIVIA ───
    bot.command(['trivia', 'kuis'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (pendingTrivia.has(chatId)) {
            return ctx.reply('⏳ Masih ada trivia berjalan.');
        }

        const item = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
        const reward = item.reward || 100;
        const isPV = ctx.chat.type === 'private';
        const caraJawab = isPV ? 'Ketik jawabanmu langsung.' : 'Reply pesan ini, lalu ketik jawabanmu.';

        const msg = await ctx.reply(
            `🎯 <b>TRIVIA!</b>\n\n${escapeHtml(item.q)}\n\n` +
            `📝 <b>Cara jawab:</b> ${caraJawab}\n` +
            `🎁 Hadiah: <b>+${reward}</b> saldo\n` +
            `⏰ Waktu: 30 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingTrivia.has(chatId)) {
                const t = pendingTrivia.get(chatId);
                pendingTrivia.delete(chatId);
                try {
                    await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                        `⏰ <b>Waktu habis!</b>\n\nJawaban: <b>${escapeHtml(t.answer[0])}</b>`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            }
        }, 30000);

        pendingTrivia.set(chatId, {
            answer: item.a.map(x => x.toLowerCase()),
            reward, timer, msgId: msg.message_id, soalText: item.q,
        });
    });

    // ─── TEBAK ANGKA ───
    bot.command(['tebakangka', 'guess'], async (ctx) => {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const key = `${chatId}_${userId}`;

        if (tebakAngkaSessions.has(key)) return ctx.reply(`⏳ Kamu masih punya tebakan aktif.`);

        const secret = Math.floor(Math.random() * 100) + 1;
        const isPV = ctx.chat.type === 'private';
        const caraJawab = isPV ? 'Ketik angka tebakanmu langsung.' : 'Reply pesan ini, ketik angka tebakanmu.';

        const msg = await ctx.reply(
            `🎲 <b>Tebak Angka!</b>\n\nAku memilih angka rahasia <b>1-100</b>.\n\n` +
            `📝 <b>Cara jawab:</b> ${caraJawab}\n` +
            `⏰ 60 detik · 10 kesempatan\n` +
            `🎁 Hadiah: <b>+200 saldo</b>`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (tebakAngkaSessions.has(key)) {
                const s = tebakAngkaSessions.get(key);
                tebakAngkaSessions.delete(key);
                try {
                    await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                        `⏰ <b>Waktu habis!</b>\n\nAngka: <b>${s.secret}</b>`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            }
        }, 60000);

        tebakAngkaSessions.set(key, { secret, attempts: 0, timer, msgId: msg.message_id });
    });

    bot.command(['batalkantebak', 'canceltebak'], async (ctx) => {
        const key = `${ctx.chat.id}_${ctx.from.id}`;
        if (!tebakAngkaSessions.has(key)) return ctx.reply('ℹ️ Tidak ada sesi aktif.');
        const s = tebakAngkaSessions.get(key);
        clearTimeout(s.timer);
        tebakAngkaSessions.delete(key);
        await ctx.reply(`❌ Dibatalkan. Angka: <b>${s.secret}</b>`, { parse_mode: 'HTML' });
    });

    // ─── MATH ───
    bot.command(['math', 'mtk', 'hitungcepat'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (activeMathGame.has(chatId)) return ctx.reply('⏳ Masih ada soal math berjalan.');

        const ops = ['+', '-', '*'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let a, b, answer;
        if (op === '+') { a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; answer = a + b; }
        else if (op === '-') { a = Math.floor(Math.random() * 50) + 20; b = Math.floor(Math.random() * 20) + 1; answer = a - b; }
        else { a = Math.floor(Math.random() * 12) + 2; b = Math.floor(Math.random() * 12) + 2; answer = a * b; }

        const reward = 50;
        const isPV = ctx.chat.type === 'private';
        const caraJawab = isPV ? 'Ketik jawabanmu langsung.' : 'Reply pesan ini, ketik jawabanmu.';

        const msg = await ctx.reply(
            `🧮 <b>MATH CEPAT!</b>\n\nBerapa hasil dari:\n<code>${a} ${op} ${b} = ?</code>\n\n` +
            `📝 <b>Cara jawab:</b> ${caraJawab}\n` +
            `🎁 Hadiah: <b>+${reward}</b> saldo\n` +
            `⏰ 20 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (activeMathGame.has(chatId)) {
                const g = activeMathGame.get(chatId);
                activeMathGame.delete(chatId);
                try {
                    await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                        `⏰ <b>Waktu habis!</b>\n\nJawaban: <b>${g.answer}</b>`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            }
        }, 20000);

        activeMathGame.set(chatId, { answer, reward, timer, msgId: msg.message_id });
    });

    // ─── TEBAK KATA ───
    bot.command(['tebakkata', 'scramble'], async (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const key = `${chatId}_${userId}`;

        if (pendingTebakKata.has(key)) return ctx.reply('⏳ Kamu masih punya sesi aktif.');

        const kataAsli = KATA_BANK[Math.floor(Math.random() * KATA_BANK.length)];
        const kataAcak = kataAsli.split('').sort(() => 0.5 - Math.random()).join('');
        const reward = 150;
        const isPV = ctx.chat.type === 'private';
        const caraJawab = isPV ? 'Ketik jawabanmu langsung.' : 'Reply pesan ini, ketik jawabanmu.';

        const msg = await ctx.reply(
            `🔤 <b>TEBAK KATA!</b>\n\n` +
            `Susun huruf ini:\n\n` +
            `🔠 <b><code>${kataAcak.toUpperCase()}</code></b>\n\n` +
            `📝 <b>Cara jawab:</b> ${caraJawab}\n` +
            `🎁 Hadiah: <b>+${reward}</b> saldo\n` +
            `⏰ Waktu: 45 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingTebakKata.has(key)) {
                const t = pendingTebakKata.get(key);
                pendingTebakKata.delete(key);
                try {
                    await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                        `⏰ <b>Waktu habis!</b>\n\nJawaban: <b>${t.kataAsli.toUpperCase()}</b>`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            }
        }, 45000);

        pendingTebakKata.set(key, { kataAsli: kataAsli.toLowerCase(), reward, timer, msgId: msg.message_id });
    });

    // ─── LEMPAR KOIN ───
    bot.command(['coin', 'koin', 'flip'], async (ctx) => {
        const userChoice = ctx.message.text.split(' ')[1]?.toLowerCase();

        if (!userChoice) {
            const result = Math.random() < 0.5 ? '🪙 <b>Kepala</b>' : '🪙 <b>Ekor</b>';
            return replyRich(ctx, premiumMessage({
                heading: 'Lempar Koin', headingEmoji: '🪙',
                body: 'Pilih sisi koin:',
                blockquote: `${result} (Random)\n\nAtau tebak dengan: /koin kepala | /koin ekor`,
                footer: 'Hadiah +100 saldo jika benar',
                accent: '🎲',
            }));
        }

        if (!['kepala', 'ekor', 'head', 'tail'].includes(userChoice)) {
            return ctx.reply(`🪙 <b>Lempar Koin</b>\n\nPilih:\n<code>/koin kepala</code>\n<code>/koin ekor</code>`, { parse_mode: 'HTML' });
        }

        const result = Math.random() < 0.5 ? 'kepala' : 'ekor';
        const isCorrect = (userChoice === 'kepala' || userChoice === 'head') ? result === 'kepala' : result === 'ekor';
        const emoji = result === 'kepala' ? '👤' : '🦅';

        if (isCorrect) {
            const newSaldo = db.addSaldo(ctx.from.id, 100);
            await ctx.reply(
                `🪙 <b>Hasil:</b> ${emoji} ${result.toUpperCase()}\n\n🎉 <b>KAMU MENANG!</b>\nSaldo: <b>+100</b>\nTotal: <b>${newSaldo}</b>`,
                { parse_mode: 'HTML' }
            );
        } else {
            await ctx.reply(
                `🪙 <b>Hasil:</b> ${emoji} ${result.toUpperCase()}\n\n😢 <b>KAMU KALAH!</b>`,
                { parse_mode: 'HTML' }
            );
        }
    });

    // ─── DADU ───
    bot.command(['dadu', 'dice'], async (ctx) => {
        const num = Math.floor(Math.random() * 6) + 1;
        const emojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        await replyRich(ctx, `<h1>🎲 Lempar Dadu</h1><p>Kamu mendapat angka <b>${num}</b> ${emojis[num - 1]}</p>`);
    });

    // ─── DADU GAME ───
    bot.command(['dadugame', 'dadudice'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (pendingDadu.has(chatId)) return ctx.reply('⏳ Masih ada game dadu berjalan.');

        const secret = Math.floor(Math.random() * 6) + 1;
        const isPV = ctx.chat.type === 'private';
        const caraJawab = isPV ? 'Ketik angkamu langsung.' : 'Reply pesan ini, ketik angkamu.';

        const msg = await ctx.reply(
            `🎲 <b>TEBAK DADU!</b>\n\nAku lempar dadu. Tebak angka (1-6)!\n\n` +
            `📝 <b>Cara jawab:</b> ${caraJawab}\n` +
            `🎁 Hadiah: +100 saldo\n⏰ 15 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingDadu.has(chatId)) {
                const d = pendingDadu.get(chatId);
                pendingDadu.delete(chatId);
                const emojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                    `⏰ Waktu habis! Dadu: <b>${emojis[d.secret - 1]}</b> (${d.secret})`,
                    { parse_mode: 'HTML' }
                );
            }
        }, 15000);

        pendingDadu.set(chatId, { secret, timer, msgId: msg.message_id });
    });

    // ─── FAST TYPING ───
    bot.command(['type', 'ketik'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (pendingType.has(chatId)) return ctx.reply('⏳ Masih ada game ketik berjalan.');

        const word = TYPE_WORDS[Math.floor(Math.random() * TYPE_WORDS.length)];
        const msg = await ctx.reply(
            `⚡ <b>FAST TYPING!</b>\n\nKetik ulang secepat mungkin:\n\n` +
            `🔠 <b><code>${word}</code></b>\n\n` +
            `🎁 Hadiah: +150 saldo\n⏰ 15 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingType.has(chatId)) {
                pendingType.delete(chatId);
                await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                    `⏰ Waktu habis! Kata: <b>${word}</b>`,
                    { parse_mode: 'HTML' }
                );
            }
        }, 15000);

        pendingType.set(chatId, { word: word.toLowerCase(), timer, msgId: msg.message_id });
    });

    // ─── GANJIL GENAP ───
    bot.command(['ganjilgenap', 'gg'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (pendingGanjilGenap.has(chatId)) return ctx.reply('⏳ Masih ada game berjalan.');

        const secret = Math.floor(Math.random() * 100) + 1;
        const msg = await ctx.reply(
            `🧮 <b>GANJIL ATAU GENAP?</b>\n\nAku memilih angka 1-100.\n\n` +
            `Ketik: <b>ganjil</b> atau <b>genap</b>\n` +
            `🎁 Hadiah: +50 saldo\n⏰ 20 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingGanjilGenap.has(chatId)) {
                pendingGanjilGenap.delete(chatId);
                await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                    `⏰ Waktu habis! Angka: <b>${secret}</b> (${secret % 2 === 0 ? 'GENAP' : 'GANJIL'})`,
                    { parse_mode: 'HTML' }
                );
            }
        }, 20000);

        pendingGanjilGenap.set(chatId, { secret, timer, msgId: msg.message_id });
    });

    // ─── BOM ───
    bot.command(['bom', 'bomb'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (pendingBom.has(chatId)) return ctx.reply('⏳ Masih ada bom yang belum meledak!');

        const bom = Math.floor(Math.random() * 10) + 1;
        const msg = await ctx.reply(
            `💣 <b>BOM ANGKA!</b>\n\nAku sembunyikan 1 bom di angka 1-10.\nPilih angka aman!\n\n` +
            `Ketik angka (1-10)\n🎁 Hadiah: +100 saldo\n⏰ 15 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingBom.has(chatId)) {
                pendingBom.delete(chatId);
                await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                    `⏰ Waktu habis! Angka bom: <b>${bom}</b> 💥`,
                    { parse_mode: 'HTML' }
                );
            }
        }, 15000);

        pendingBom.set(chatId, { bom, timer, msgId: msg.message_id });
    });

    // ─── TEMBAK LAYAR ───
    bot.command(['tembaklayar', 'shot'], async (ctx) => {
        const chatId = ctx.chat.id;
        if (pendingTembakLayar.has(chatId)) return ctx.reply('⏳ Masih ada sesi tembak layar.');

        const x = Math.floor(Math.random() * 10) + 1;
        const y = Math.floor(Math.random() * 10) + 1;
        const msg = await ctx.reply(
            `🎯 <b>TEMBAK LAYAR</b>\n\nMusuh bersembunyi di (X, Y). X dan Y 1-10.\n\n` +
            `Format jawab: <code>X,Y</code> (contoh: <code>5,7</code>)\n` +
            `🎁 Hadiah: +200 saldo\n⏰ 20 detik`,
            { parse_mode: 'HTML' }
        );

        const timer = setTimeout(async () => {
            if (pendingTembakLayar.has(chatId)) {
                pendingTembakLayar.delete(chatId);
                await require('../core/bot-instance').bot.telegram.sendMessage(chatId,
                    `⏰ Waktu habis! Musuh di <b>${x},${y}</b>`,
                    { parse_mode: 'HTML' }
                );
            }
        }, 20000);

        pendingTembakLayar.set(chatId, { x, y, timer, msgId: msg.message_id });
    });

    // ─── TEMBAK (DUEL) ───
    bot.command(['tembak', 'duel'], async (ctx) => {
        const reply = ctx.message.reply_to_message;
        if (!reply) return ctx.reply('🎯 <b>Duel Tembak</b>\n\nReply pesan lawan lalu ketik:\n<code>/tembak</code>', { parse_mode: 'HTML' });
        if (reply.from.id === ctx.from.id) return ctx.reply('❌ Tidak bisa menembak diri sendiri!');
        if (reply.from.is_bot) return ctx.reply('❌ Bot tidak bisa ditembak.');

        const p1Acc = Math.floor(Math.random() * 100) + 1;
        const p2Acc = Math.floor(Math.random() * 100) + 1;

        let result = '';
        if (p1Acc > p2Acc) result = `🏆 <a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> MENANG!`;
        else if (p2Acc > p1Acc) result = `🏆 <a href="tg://user?id=${reply.from.id}">${escapeHtml(reply.from.first_name)}</a> MENANG!`;
        else result = `🤝 <b>SERI!</b>`;

        await ctx.reply(
            `🔫 <b>DUEL TEMBAK!</b>\n\n` +
            `👤 <b>${escapeHtml(ctx.from.first_name)}</b> (Akurasi: ${p1Acc}%)\n` +
            `🆚\n` +
            `👤 <b>${escapeHtml(reply.from.first_name)}</b> (Akurasi: ${p2Acc}%)\n\n` +
            `${result}`,
            { parse_mode: 'HTML' }
        );
    });

    // ═══════════════════════════════════════════════════════════
    // /daily — Klaim saldo harian (100 saldo)
    // ═══════════════════════════════════════════════════════════
    bot.command(['daily', 'harian'], async (ctx) => {
        const userId = ctx.from.id;
        const now = Date.now();
        const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 Jam
        const REWARD = 100;

        const lastClaim = dailyCooldown.get(userId) || 0;
        const timePassed = now - lastClaim;

        // Jika belum 24 jam
        if (timePassed < COOLDOWN_MS) {
            const timeLeft = COOLDOWN_MS - timePassed;
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

            return replyRich(ctx, premiumMessage({
                heading: 'Klaim Gagal', headingEmoji: '⏳',
                body: `Kamu sudah klaim saldo harian hari ini!`,
                blockquote: `Silakan kembali dalam:\n⏰ <b>${hours} Jam ${minutes} Menit ${seconds} Detik</b>`,
                accent: '🕒',
                buttons: [
                    { text: '🎰 Main Slot', callback: 'main_slot', color: 'success' },
                    { text: '🎮 Suit', callback: 'play_suit', color: 'primary' }
                ]
            }));
        }

        // Klaim berhasil
        dailyCooldown.set(userId, now);
        const newSaldo = db.addSaldo(userId, REWARD);

        await replyRich(ctx, premiumMessage({
            heading: 'Klaim Berhasil!', headingEmoji: '🎁',
            body: `<a href="tg://user?id=${userId}">${escapeHtml(ctx.from.first_name)}</a> berhasil klaim saldo harian!`,
            listItems: [
                `💰 Saldo masuk: <b>+${REWARD}</b>`,
                `💳 Total saldo: <b>${newSaldo}</b>`,
                `⏰ Klaim lagi besok ya!`
            ],
            accent: '✨',
            buttons: [
                { text: '💰 Cek Saldo', callback: 'cek_saldo', color: 'primary' }
            ]
        }));
    });
    
    // ─── 8BALL ───
    bot.command(['8ball', 'ramalan'], async (ctx) => {
        const pertanyaan = ctx.message.text.split(' ').slice(1).join(' ');
        if (!pertanyaan) return ctx.reply('🔮 <b>Magic 8 Ball</b>\n\nTanyakan sesuatu!\nContoh: <code>/8ball Apakah aku sukses?</code>', { parse_mode: 'HTML' });

        const jawaban = BALL_ANSWERS[Math.floor(Math.random() * BALL_ANSWERS.length)];
        await ctx.reply(`🔮 <b>Magic 8 Ball</b>\n\n❓ <i>${escapeHtml(pertanyaan)}</i>\n\n🎱 <b>${jawaban}</b>`, { parse_mode: 'HTML' });
    });

    // ─── RATE PROFIL ───
    bot.command(['rate', 'ratecek'], async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        let targetUser = null;

        if (ctx.message.reply_to_message?.from) {
            targetUser = ctx.message.reply_to_message.from;
        } else if (ctx.message.entities && ctx.message.entities.length > 0) {
            const mentionEntity = ctx.message.entities.find(e => e.type === 'mention' || e.type === 'text_mention');
            if (mentionEntity) {
                if (mentionEntity.type === 'text_mention') targetUser = mentionEntity.user;
                else if (mentionEntity.type === 'mention') {
                    const username = ctx.message.text.substring(mentionEntity.offset + 1, mentionEntity.offset + mentionEntity.length);
                    const found = db.findUserByUsername(username);
                    if (found) targetUser = { id: found.id, first_name: found.first_name };
                }
            }
        }
        if (!targetUser) targetUser = ctx.from;

        const displayName = targetUser.first_name || 'User';
        const mention = `<a href="tg://user?id=${targetUser.id}">${escapeHtml(displayName)}</a>`;

        const makeProgressBar = (percent) => {
            const total = 10;
            const filled = Math.round((percent / 100) * total);
            return '▓'.repeat(filled) + '░'.repeat(total - filled) + ` <b>${percent}%</b>`;
        };

        const ganteng = Math.floor(Math.random() * 100) + 1;
        const aura = Math.floor(Math.random() * 100) + 1;
        const hoki = Math.floor(Math.random() * 100) + 1;
        const asik = Math.floor(Math.random() * 100) + 1;
        const rataRata = Math.round((ganteng + aura + hoki + asik) / 4);
        let gelar = 'Warga Biasa 😐';
        if (rataRata > 80) gelar = 'Sultan Terakhir 👑';
        else if (rataRata > 65) gelar = 'Panutan Umat 🌟';
        else if (rataRata > 45) gelar = 'Anak Senja ☕';
        else if (rataRata > 25) gelar = 'Korban RT 🏃‍♂️';
        else gelar = 'Legenda Konoha 🍃';

        await replyRich(ctx, premiumMessage({
            heading: 'Hasil Rate Profil', headingEmoji: '⚖️',
            body: `Menilai profil ${mention}...`,
            listItems: [
                `👦 <b>Ganteng/Cantik:</b>\n${makeProgressBar(ganteng)}`,
                `✨ <b>Aura:</b>\n${makeProgressBar(aura)}`,
                `🍀 <b>Keberuntungan:</b>\n${makeProgressBar(hoki)}`,
                `🤝 <b>Keasikkan:</b>\n${makeProgressBar(asik)}`,
            ],
            blockquote: `📜 <b>Gelar:</b>\n${gelar}`,
            footer: 'Penilaian 100% akurat.',
            accent: '📊',
            buttons: [{ text: '🔄 Rate Ulang', callback: 'rate_again', color: 'primary' }],
        }));
    });

    bot.action('rate_again', async (ctx) => {
        await ctx.answerCbQuery('Me-rate ulang...');
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.message.text = '/rate';
        return bot.command('rate', ctx);
    });

    bot.action('rate_self', async (ctx) => {
        await ctx.answerCbQuery('Me-rate diri sendiri...');
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.message.reply_to_message = null;
        ctx.message.text = '/rate';
        return bot.command('rate', ctx);
    });

    // ─── PILIH ───
    bot.command('pilih', async (ctx) => {
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text.includes('|')) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Gunakan pemisah <code>|</code>.',
                pre: '/pilih Bakso | Mie | Nasi',
            }));
        }
        const options = text.split('|').map(o => o.trim());
        const picked = options[Math.floor(Math.random() * options.length)];
        await replyRich(ctx, `<h1>🎯 Pilihan Acak</h1><p>Bot memilih: <b>${escapeHtml(picked)}</b></p>`);
    });

    // ─── HITUNG ───
    bot.command('hitung', async (ctx) => {
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) {
            return replyRich(ctx, premiumMessage({
                heading: 'Format Salah', headingEmoji: '❌',
                body: 'Masukkan teks.',
                pre: '/hitung Halo semua',
            }));
        }
        const chars = text.length;
        const words = text.trim().split(/\s+/).length;
        const sentences = text.split(/[.!?]+/).length - 1;

        await replyRich(ctx, `
<h1>📝 Text Analyzer</h1>
<table bordered>
  <tr><td><b>Karakter</b></td><td>: ${chars}</td></tr>
  <tr><td><b>Kata</b></td><td>: ${words}</td></tr>
  <tr><td><b>Kalimat</b></td><td>: ${sentences}</td></tr>
</table>
`);
    });
}

module.exports = { registerGamesHandler };