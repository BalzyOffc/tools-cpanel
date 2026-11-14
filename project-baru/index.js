// middleware/index.js — Registrar utama middleware
const { registerUserTracker } = require('./user-tracker');
const { registerRoleLoader } = require('./role-loader');
const { registerForceJoin } = require('./force-join');
const { registerPanicSafe } = require('./panic-safe');
const { registerGlobalFilter } = require('./global-filter');
const { registerSatpam } = require('./satpam');
const { registerGcOnly } = require('./gc-only');

function registerAllMiddleware(bot) {
    // ─── Order penting! ───
    registerUserTracker(bot);     // 1. Track user dulu
    registerRoleLoader(bot);      // 2. Load role
    registerPanicSafe(bot);       // 3. Cek panic/blacklist
    registerGlobalFilter(bot);    // 4. Global auto-reply
    registerForceJoin(bot);       // 5. Force join channel
    registerGcOnly(bot);          // 6. GC-only mode
    registerSatpam(bot);          // 7. 🛡️ SATPAM GRUP (paling akhir, sebelum handler)
}

module.exports = { registerAllMiddleware };