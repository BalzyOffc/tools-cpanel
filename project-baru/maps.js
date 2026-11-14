// state/maps.js — Semua Map/Set global bot
// ═══════════════════════════════════════════════════════════════

// Satpam & Anti-features
const antiforwardCache = new Map();
const antilinkWarn = new Map();
const antispamCache = new Map();

// Games
const pendingTrivia = new Map();
const tebakAngkaSessions = new Map();
const activeMathGame = new Map();
const gameCooldown = new Map();
const pendingDadu = new Map();
const pendingType = new Map();
const pendingGanjilGenap = new Map();
const pendingBom = new Map();
const pendingTembakLayar = new Map();
const pendingTebakKata = new Map();
const pendingSlotBet = new Map();
const pendingSuit = new Map();

// Downloads & uploads
const pendingDownloads = new Map();
const pendingTourl = new Map();
const pendingCreateBase = new Map();

// QRIS & payments
const pendingQris = new Map();
const pendingQrisSessions = new Map();

// Confess
const activeUserConfess = new Map();
const pendingConfess = new Map();

// Join lock
const pendingJoinLock = new Map();

// Settings & moderation
const pendingSettings = new Map();
const pendingBroadcast = new Map();
const pendingRestore = new Map();
const pendingUpdate = new Map();
const pendingVerification = new Map();
const welcomeMsgIds = new Map();
const mutedUsers = new Set();
const userMessageTimes = new Map();

// Temp email
const tempMailCooldown = new Map();
const tempMailDaily = new Map();
const tempEmailSessions = new Map();

// Pinterest
const pinterestCache = new Map();

// Role cache
const roleCache = new Map();

// Owner tools
const systemBlacklist = new Set();
const globalFilters = new Map();
const userActivity = new Map();

// GC Only
const gcOnlyMode = new Map();

// Clone
const activeClones = new Map();

// Giveaway
const activeGiveaways = new Map();

const dailyCooldown = new Map(); 

// === MUTABLE STATE ===
const state = {
    gcOnlyGlobal: false,
    maintenanceMode: false,
    panicMode: false,
    safeMode: false,
    broadcastRunning: false,
};

module.exports = {
    // Satpam
    antiforwardCache, antilinkWarn, antispamCache,
    // Games
    pendingTrivia, tebakAngkaSessions, activeMathGame, gameCooldown,
    pendingDadu, pendingType, pendingGanjilGenap, pendingBom, pendingTembakLayar, pendingTebakKata,
    pendingSlotBet, pendingSuit,
    // Downloads
    pendingDownloads, pendingTourl, pendingCreateBase,
    // QRIS
    pendingQris, pendingQrisSessions,
    // Confess
    activeUserConfess, pendingConfess,
    // Join
    pendingJoinLock,
    // Settings/moderation
    pendingSettings, pendingBroadcast, pendingRestore, pendingUpdate,
    pendingVerification, welcomeMsgIds, mutedUsers, userMessageTimes,
    // Temp email
    tempMailCooldown, tempMailDaily, tempEmailSessions,
    // Pinterest
    pinterestCache,
    // Role
    roleCache,
    // Owner tools
    systemBlacklist, globalFilters, userActivity,
    // GC
    gcOnlyMode,
    // Clone
    activeClones,
    // Giveaway
    activeGiveaways,
    // State
    state,
    dailyCooldown,
};