// ═══════════════════════════════════════════════════════════════
// 📄 services/sholat-auto.js
// Auto jadwal sholat untuk SEMUA kota di Indonesia
// Broadcast ke semua user PV — 1x per waktu (bukan per kota)
// ═══════════════════════════════════════════════════════════════
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./database');

// ─────────────────────────────────────────────────────────────
// KONFIGURASI DEFAULT
// ─────────────────────────────────────────────────────────────
const DEFAULTS = {
    enabled: true,
    adzanUrl: 'https://raw.githubusercontent.com/BalzyOffc/bot-uploads/main/uploads/upload_1794124826919_1794124826921_soq0dd.mp3',
    preWarningMinutes: 5,
};

const CONFIG_FILE = path.join(__dirname, '..', 'sholat-config.json');
const SENT_FILE = path.join(__dirname, '..', 'sholat-sent.json');
const CACHE_DIR = path.join(__dirname, '..', 'sholat-cache');

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
let botInstance = null;
let intervalHandle = null;
let sholatConfig = { ...DEFAULTS };
const sentLog = new Set();
const warningSentLog = new Set();

// Cache semua kota
let allCities = [];
let cityListLoaded = false;

// Cache jadwal harian (Map: tanggal -> Array kota dengan jadwal)
let dailyJadwalMap = new Map(); // key: "YYYY-MM-DD", value: [{ cityId, cityName, subuh, dzuhur, ... }]
let dailyJadwalLoaded = false;

// Waktu sholat
const WAKTU_SHOLAT = [
    { key: 'imsak', label: 'Imsak', emoji: '🌅' },
    { key: 'subuh', label: 'Subuh', emoji: '🌄' },
    { key: 'dzuhur', label: 'Dzuhur', emoji: '🌤️' },
    { key: 'ashar', label: 'Ashar', emoji: '🌇' },
    { key: 'maghrib', label: 'Maghrib', emoji: '🌆' },
    { key: 'isya', label: 'Isya', emoji: '🌃' },
];

// ─────────────────────────────────────────────────────────────
// HELPER: Config
// ─────────────────────────────────────────────────────────────
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            sholatConfig = { ...DEFAULTS, ...saved };
        }
    } catch (err) {
        console.error('❌ Load config gagal:', err.message);
    }

    try {
        if (fs.existsSync(SENT_FILE)) {
            const saved = JSON.parse(fs.readFileSync(SENT_FILE, 'utf8'));
            const today = getTodayDateStr();
            if (saved.date === today && Array.isArray(saved.entries)) {
                saved.entries.forEach(e => sentLog.add(e));
            }
        }
    } catch (err) {
        console.error('❌ Load sent log gagal:', err.message);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(sholatConfig, null, 2), 'utf8');
    } catch (err) { console.error('❌ Save config gagal:', err.message); }
}

function saveSentLog() {
    try {
        const today = getTodayDateStr();
        fs.writeFileSync(SENT_FILE, JSON.stringify({
            date: today,
            entries: [...sentLog],
        }, null, 2), 'utf8');
    } catch (err) { console.error('❌ Save sent log gagal:', err.message); }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Waktu WIB
// ─────────────────────────────────────────────────────────────
function getCurrentTimeWIB() {
    const now = new Date();
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const wibMinutes = (utcMinutes + 7 * 60) % 1440;
    const hh = Math.floor(wibMinutes / 60).toString().padStart(2, '0');
    const mm = (wibMinutes % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
}

function getTodayDateStr() {
    const now = new Date();
    const wibTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return wibTime.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────
// LOAD: Daftar Semua Kota
// ─────────────────────────────────────────────────────────────
async function loadAllCities() {
    if (cityListLoaded && allCities.length > 0) return allCities;

    try {
        console.log('🕌 [SHOLAT] Mengambil daftar semua kota Indonesia...');
        const res = await axios.get('https://api.myquran.com/v2/sholat/kota/semua', { timeout: 30000 });

        if (!res.data.status || !res.data.data) {
            throw new Error('API kota gagal');
        }

        allCities = res.data.data.map(c => ({
            id: c.id,
            name: c.lokasi,
        }));

        cityListLoaded = true;
        console.log(`🕌 [SHOLAT] ✅ Total kota: ${allCities.length}`);
        return allCities;

    } catch (err) {
        console.error('❌ Load cities gagal:', err.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// LOAD: Jadwal Harian SEMUA Kota (paralel, dengan delay)
// ─────────────────────────────────────────────────────────────
async function loadDailyJadwalAllCities(forceReload = false) {
    const today = getTodayDateStr();

    if (!forceReload && dailyJadwalLoaded && dailyJadwalMap.has(today)) {
        return dailyJadwalMap.get(today);
    }

    const cities = await loadAllCities();
    if (cities.length === 0) return [];

    console.log(`🕌 [SHOLAT] Mengambil jadwal ${today} untuk ${cities.length} kota...`);

    const result = [];
    const batchSize = 10; // Ambil 10 kota per batch (biar tidak rate limit)
    const startTime = Date.now();

    for (let i = 0; i < cities.length; i += batchSize) {
        const batch = cities.slice(i, i + batchSize);

        const promises = batch.map(async (city) => {
            try {
                const res = await axios.get(
                    `https://api.myquran.com/v2/sholat/jadwal/${city.id}/${today}`,
                    { timeout: 15000 }
                );

                if (res.data.status && res.data.data) {
                    const j = res.data.data.jadwal;
                    return {
                        cityId: city.id,
                        cityName: j.lokasi || city.name,
                        imsak: j.imsak,
                        subuh: j.subuh,
                        dzuhur: j.dzuhur,
                        ashar: j.ashar,
                        maghrib: j.maghrib,
                        isya: j.isya,
                    };
                }
                return null;
            } catch (e) {
                return null;
            }
        });

        const batchResult = await Promise.all(promises);
        batchResult.forEach(r => { if (r) result.push(r); });

        // Delay antar batch (500ms) biar tidak rate limit
        if (i + batchSize < cities.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🕌 [SHOLAT] ✅ Loaded ${result.length}/${cities.length} jadwal dalam ${duration}s`);

    dailyJadwalMap.set(today, result);

    // Hapus cache hari kemarin
    for (const key of dailyJadwalMap.keys()) {
        if (key !== today) dailyJadwalMap.delete(key);
    }

    dailyJadwalLoaded = true;
    return result;
}

// ─────────────────────────────────────────────────────────────
// BROADCAST ADZAN (1x per waktu, gabung semua kota)
// ─────────────────────────────────────────────────────────────
async function broadcastAdzanGrouped(waktuKey, waktuLabel, waktuJam, emoji, kotaList, isWarning = false, minutesBefore = 0) {
    if (!botInstance) return { success: 0, failed: 0 };

    const users = db.getTargets('user');
    if (!users || users.length === 0) return { success: 0, failed: 0 };

    // Batasi nama kota di caption (max 15)
    const kotaPreview = kotaList.slice(0, 15).join(', ');
    const kotaSuffix = kotaList.length > 15 ? ` dan ${kotaList.length - 15} kota lainnya` : '';
    const kotaStr = `${kotaPreview}${kotaSuffix}`;

    const caption = isWarning
        ? `⏰ <b>Peringatan ${waktuLabel}</b>\n\n` +
          `${emoji} Sholat <b>${waktuLabel}</b> akan masuk dalam <b>${minutesBefore} menit</b>.\n` +
          `🕐 Pukul <b>${waktuJam} WIB</b>\n\n` +
          `📍 <b>Berlaku untuk:</b>\n${escapeHtml(kotaStr)}\n\n` +
          `<i>Bersiap ambil wudhu ya~</i> 🤲`
        : `🕌 <b>Waktu Sholat ${waktuLabel}</b>\n\n` +
          `${emoji} Sudah masuk waktu <b>${waktuLabel}</b>.\n` +
          `🕐 Pukul <b>${waktuJam} WIB</b>\n\n` +
          `📍 <b>Berlaku untuk:</b>\n${escapeHtml(kotaStr)}\n\n` +
          `<i>Mari tunaikan sholat, tinggalkan sejenak aktivitas dunia.</i> 🤲`;

    let success = 0;
    let failed = 0;

    for (const userId of users) {
        try {
            if (isWarning) {
                await botInstance.telegram.sendMessage(userId, caption, { parse_mode: 'HTML' });
            } else {
                try {
                    await botInstance.telegram.sendAudio(
                        userId,
                        sholatConfig.adzanUrl,
                        {
                            caption,
                            parse_mode: 'HTML',
                            title: `Adzan ${waktuLabel}`,
                            performer: 'Muadzin',
                        }
                    );
                } catch (audioErr) {
                    await botInstance.telegram.sendMessage(userId, caption, { parse_mode: 'HTML' });
                }
            }
            success++;
        } catch (err) {
            failed++;
        }
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`🕌 Adzan ${waktuLabel}: ${success} sukses, ${failed} gagal (${kotaList.length} kota)`);

    // Notif owner
    try {
        await botInstance.telegram.sendMessage(config.OWNER_ID,
            `🕌 <b>Broadcast ${isWarning ? 'Warning ' : ''}${waktuLabel}</b>\n\n` +
            `✅ Sukses: <b>${success}</b>\n` +
            `❌ Gagal: <b>${failed}</b>\n` +
            `🏙️ Kota: <b>${kotaList.length}</b>\n` +
            `🕐 Pukul: <b>${waktuJam} WIB</b>`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {}

    return { success, failed };
}

// ─────────────────────────────────────────────────────────────
// CEK & TRIGGER (dipanggil tiap 30 detik)
// ─────────────────────────────────────────────────────────────
async function checkAndBroadcast() {
    if (!sholatConfig.enabled) return;

    const nowTime = getCurrentTimeWIB();
    const today = getTodayDateStr();

    // Load jadwal kalau belum ada
    if (!dailyJadwalLoaded || !dailyJadwalMap.has(today)) {
        await loadDailyJadwalAllCities();
    }

    const jadwalList = dailyJadwalMap.get(today) || [];
    if (jadwalList.length === 0) return;

    for (const waktu of WAKTU_SHOLAT) {
        // ─── Kumpulkan kota yang jadwalnya cocok ───
        const matchingCities = jadwalList.filter(j => j[waktu.key] === nowTime).map(j => j.cityName);
        const matchingWarningCities = [];

        // Cek warning
        if (sholatConfig.preWarningMinutes > 0) {
            const [h, m] = nowTime.split(':').map(Number);
            const nowMinutes = h * 60 + m;
            const warnMinutes = nowMinutes + sholatConfig.preWarningMinutes;
            
            if (warnMinutes < 1440) {
                const warnH = Math.floor(warnMinutes / 60).toString().padStart(2, '0');
                const warnM = (warnMinutes % 60).toString().padStart(2, '0');
                const warnTime = `${warnH}:${warnM}`;

                jadwalList.forEach(j => {
                    if (j[waktu.key] === warnTime) {
                        matchingWarningCities.push(j.cityName);
                    }
                });
            }
        }

        // ─── Trigger Warning ───
        if (matchingWarningCities.length > 0) {
            const warnKey = `${today}_${waktu.key}_warning`;
            if (!warningSentLog.has(warnKey)) {
                warningSentLog.add(warnKey);
                await broadcastAdzanGrouped(waktu.key, waktu.label, nowTime, waktu.emoji, matchingWarningCities, true, sholatConfig.preWarningMinutes);
            }
        }

        // ─── Trigger Adzan ───
        if (matchingCities.length > 0) {
            const adzanKey = `${today}_${waktu.key}`;
            if (!sentLog.has(adzanKey)) {
                sentLog.add(adzanKey);
                saveSentLog();
                await broadcastAdzanGrouped(waktu.key, waktu.label, nowTime, waktu.emoji, matchingCities, false);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// START / STOP
// ─────────────────────────────────────────────────────────────
function start(bot) {
    botInstance = bot;
    loadConfig();

    if (intervalHandle) clearInterval(intervalHandle);

    console.log(`🕌 [SHOLAT] Auto-service started (All Kota, ${sholatConfig.enabled ? 'ON' : 'OFF'})`);

    // Load data awal
    setTimeout(async () => {
        await loadAllCities();
        await loadDailyJadwalAllCities();
    }, 3000);

    // Cek tiap 30 detik
    intervalHandle = setInterval(() => {
        checkAndBroadcast().catch(err => console.error('❌ Sholat check error:', err.message));
    }, 30000);

    // Cek pertama setelah 10 detik
    setTimeout(() => {
        checkAndBroadcast().catch(() => {});
    }, 10000);

    // Reset cache harian tiap jam 00:00 WIB
    scheduleDailyReset();
}

function scheduleDailyReset() {
    const now = new Date();
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const tomorrow = new Date(wibNow);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - wibNow.getTime();

    setTimeout(async () => {
        console.log('🕌 [SHOLAT] Daily reset: reload jadwal hari baru...');
        dailyJadwalLoaded = false;
        sentLog.clear();
        warningSentLog.clear();
        await loadDailyJadwalAllCities();
        scheduleDailyReset();
    }, msUntilMidnight);
}

function stop() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
    console.log('🕌 [SHOLAT] Auto-service stopped');
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────
function getConfig() { return { ...sholatConfig }; }
function setConfig(updates) { sholatConfig = { ...sholatConfig, ...updates }; saveConfig(); return sholatConfig; }

function getStats() {
    const today = getTodayDateStr();
    const list = dailyJadwalMap.get(today) || [];
    return {
        enabled: sholatConfig.enabled,
        adzanUrl: sholatConfig.adzanUrl,
        preWarningMinutes: sholatConfig.preWarningMinutes,
        totalCities: allCities.length,
        cachedCities: list.length,
        sentToday: sentLog.size,
        warningToday: warningSentLog.size,
    };
}

async function testAdzan(waktuLabel = 'Test') {
    const cities = (dailyJadwalMap.get(getTodayDateStr()) || []).map(c => c.cityName);
    return await broadcastAdzanGrouped('test', waktuLabel, getCurrentTimeWIB(), '🕌', cities.slice(0, 20), false);
}

// Helper untuk escape HTML
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = {
    start,
    stop,
    getConfig,
    setConfig,
    getStats,
    testAdzan,
    WAKTU_SHOLAT,
    loadAllCities,
    loadDailyJadwalAllCities,
};