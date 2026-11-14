// helpers/role.js
const config = require('../config');
const { RoleModel, ensureMongo } = require('../core/mongodb');
const { ROLE_LEVELS, ROLE_CACHE_TTL } = require('../core/constants');
const { roleCache } = require('../state/maps');

async function getUserRole(userId, forceRefresh = false) {
    const key = String(userId);
    if (parseInt(userId) === config.OWNER_ID) {
        return { role: 'owner', expiredAt: null, source: 'config' };
    }

    if (!forceRefresh && roleCache.has(key)) {
        const cached = roleCache.get(key);
        if (Date.now() - cached.cachedAt < ROLE_CACHE_TTL) {
            if (cached.expiredAt && new Date(cached.expiredAt) < new Date()) {
                roleCache.delete(key);
                return { role: 'user', expiredAt: null, source: 'expired' };
            }
            return cached;
        }
    }

    if (!await ensureMongo()) return { role: 'user', expiredAt: null, source: 'db_offline' };

    try {
        const doc = await RoleModel.findOne({ userId: key });
        if (!doc) {
            const data = { role: 'user', expiredAt: null, cachedAt: Date.now() };
            roleCache.set(key, data);
            return data;
        }

        if (doc.expiredAt && new Date(doc.expiredAt) < new Date()) {
            doc.role = 'user'; doc.expiredAt = null;
            await doc.save().catch(() => {});
            const data = { role: 'user', expiredAt: null, cachedAt: Date.now() };
            roleCache.set(key, data);
            return data;
        }

        const data = { role: doc.role, expiredAt: doc.expiredAt, cachedAt: Date.now() };
        roleCache.set(key, data);
        return data;
    } catch (err) {
        return { role: 'user', expiredAt: null, source: 'error' };
    }
}

async function hasRole(userId, minRole = 'vip') {
    const { role } = await getUserRole(userId);
    return (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

async function setUserRole(userId, role, opts = {}) {
    if (!await ensureMongo()) return { success: false, error: 'MongoDB offline' };
    try {
        const key = String(userId);
        const expiredAt = opts.durationDays
            ? new Date(Date.now() + opts.durationDays * 24 * 60 * 60 * 1000)
            : (opts.expiredAt || null);

        const doc = await RoleModel.findOneAndUpdate(
            { userId: key },
            {
                userId: key,
                username: opts.username || null,
                firstName: opts.firstName || null,
                role,
                expiredAt,
                addedBy: opts.addedBy ? String(opts.addedBy) : null,
                reason: opts.reason || null,
                updatedAt: new Date(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        roleCache.set(key, { role, expiredAt, cachedAt: Date.now() });
        return { success: true, doc };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function removeUserRole(userId) {
    return setUserRole(userId, 'user', {});
}

async function listUsersByRole(role) {
    if (!await ensureMongo()) return [];
    try {
        return await RoleModel.find({ role }).sort({ updatedAt: -1 }).lean();
    } catch { return []; }
}

function formatRoleDuration(expiredAt) {
    if (!expiredAt) return '♾️ Permanent';
    const ms = new Date(expiredAt).getTime() - Date.now();
    if (ms <= 0) return '🔴 Expired';
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return `${days} hari ${hours} jam`;
    return `${hours} jam`;
}

module.exports = { getUserRole, hasRole, setUserRole, removeUserRole, listUsersByRole, formatRoleDuration };