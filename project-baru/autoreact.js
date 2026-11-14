const fs = require('fs');
const path = require('path');
const config = require('../config');
const { replyHtml } = require('../helpers/edit-html');

const STATE_FILE = path.join(__dirname, '..', 'autoreact-state.json');

// Fungsi baca status dari file JSON
function getAutoReactStatus() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            return data.enabled;
        }
    } catch (e) {}
    return config.AUTO_REACT_ENABLED;
}

// Fungsi simpan status ke file JSON
function saveAutoReactStatus(status) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled: status }, null, 2), 'utf8');
    } catch (e) {}
}

function registerAutoReactHandler(bot) {
    // Sinkronisasi awal saat bot menyala
    config.AUTO_REACT_ENABLED = getAutoReactStatus();

    // Command /autoreact
    bot.command(['autoreact', 'toggleautoreact'], async (ctx) => {
        // 1. Cek Owner
        if (ctx.from.id !== config.OWNER_ID) {
            return replyHtml(ctx, `🚫 <b>Akses Ditolak</b>\nKhusus Owner.`);
        }

        // 2. Ambil argumen (on/off)
        const args = ctx.message.text.split(' ');
        const action = args[1]?.toLowerCase();

        // Jika user hanya ketik /autoreact tanpa argumen
        if (!action) {
            const statusText = config.AUTO_REACT_ENABLED ? '🟢 <b>AKTIF</b>' : '🔴 <b>MATI</b>';
            return replyHtml(ctx, `<b>⚙️ Status Auto-React</b>

Saat ini: ${statusText}

<b>Format:</b>
<code>/autoreact on</code> — Menyalakan
<code>/autoreact off</code> — Mematikan`);
        }

        // 3. Logika ON/OFF
        let newStatus;
        if (action === 'on') {
            newStatus = true;
        } else if (action === 'off') {
            newStatus = false;
        } else {
            return replyHtml(ctx, `❌ <b>Format Salah</b>\nGunakan: <code>/autoreact on</code> atau <code>/autoreact off</code>`);
        }

        // 4. Simpan dan Update
        config.AUTO_REACT_ENABLED = newStatus;
        saveAutoReactStatus(newStatus);

        const statusText = newStatus ? '🟢 <b>AKTIF</b>' : '🔴 <b>MATI</b>';
        
        await replyHtml(ctx, `<b>⚙️ Status Auto-React Diperbarui</b>

Status sekarang: ${statusText}

<i>Status ini tersimpan permanen meskipun bot di-restart.</i>`);
    });
}

module.exports = { registerAutoReactHandler, getAutoReactStatus };