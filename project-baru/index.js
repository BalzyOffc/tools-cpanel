// ═══════════════════════════════════════════════════════════════
// 📄 handlers/index.js — REGISTRAR FINAL SEMUA HANDLER
// ═══════════════════════════════════════════════════════════════

// Core
const { registerStartHandler } = require('./start');
const { registerMiscHandler } = require('./misc');

// Moderasi & keamanan
const { registerAntiFeaturesHandler } = require('./antifeatures');
const { registerAdminHandler } = require('./admin');
const { registerFilterHandler } = require('./filter');
const { registerRoleHandler } = require('./role');

// Fitur
const { registerConfessHandler } = require('./confess');
const { registerEmailHandler } = require('./email');
const { registerStorHandler } = require('./stor');
const { registerGamesHandler } = require('./games');
const { registerUtilityHandler } = require('./utility');
const { registerUtilityExtraHandler } = require('./utility-extra');
const { registerDownloaderHandler } = require('./downloader');
const { registerAiHandler } = require('./ai');
const { registerQrisHandler } = require('./qris');
const { registerDeployHandler } = require('./deploy');
const { registerOwnerGithubHandler } = require('./owner-github');
const { registerSettingsHandler } = require('./settings');

// Owner
const { registerOwnerHandler } = require('./owner');
const { registerOwnerStatsHandler } = require('./owner-stats');
const { registerOwnerEmergencyHandler } = require('./owner-emergency');
const { registerOwnerSaldoHandler } = require('./owner-saldo');
const { registerOwnerGfilterHandler } = require('./owner-gfilter');
const { registerOwnerBroadcastHandler } = require('./owner-broadcast');
const { registerOwnerSholatHandler } = require('./owner-sholat');
const { registerReviewHandler } = require('./review');
const { registerOwnerTools } = require('./owner-tools');
const { registerSalintoscamHandler } = require('./salintoscam');

// Text handler (WAJIB PALING AKHIR!)
const { registerTextHandler } = require('./text-handler');

function registerAllHandlers(bot) {
    // ═══ 1. CORE ═══
    registerStartHandler(bot);
    registerMiscHandler(bot);

    // ═══ 2. MODERASI & KEAMANAN ═══
    registerAntiFeaturesHandler(bot);
    registerAdminHandler(bot);
    registerFilterHandler(bot);
    registerRoleHandler(bot);

    // ═══ 3. FITUR USER ═══
    registerConfessHandler(bot);
    registerEmailHandler(bot);
    registerStorHandler(bot);
    registerGamesHandler(bot);
    registerUtilityHandler(bot);
    registerUtilityExtraHandler(bot);
    registerDownloaderHandler(bot);
    registerAiHandler(bot);
    registerQrisHandler(bot);
    registerDeployHandler(bot);
    registerOwnerGithubHandler(bot);

    // ═══ 4. OWNER ═══
    registerOwnerHandler(bot);
    registerOwnerTools(bot); // Panggil tools owner
    registerOwnerStatsHandler(bot);
    registerOwnerEmergencyHandler(bot);
    registerOwnerSaldoHandler(bot);
    registerOwnerGfilterHandler(bot);
    registerOwnerBroadcastHandler(bot);
    registerOwnerSholatHandler(bot);
    registerReviewHandler(bot);
    registerSalintoscamHandler(bot);
    registerSettingsHandler(bot);
    
    // ═══ 5. TEXT HANDLER (PALING AKHIR!) ═══
    registerTextHandler(bot);

    console.log('✅ [HANDLERS] Semua handler terdaftar');
}

module.exports = { registerAllHandlers };