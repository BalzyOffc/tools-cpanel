// helpers/cooldown.js
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h} jam ${m % 60} menit`;
    if (m > 0) return `${m} menit ${s % 60} detik`;
    return `${s} detik`;
}

function checkCooldown(map, userId, ms, label) {
    const now = Date.now();
    const last = map.get(userId) || 0;
    const remain = ms - (now - last);
    if (remain > 0) return { blocked: true, remainStr: formatDuration(remain), label };
    return { blocked: false };
}

function setCooldown(map, userId) {
    map.set(userId, Date.now());
}

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

module.exports = { formatDuration, checkCooldown, setCooldown, getTodayStr };