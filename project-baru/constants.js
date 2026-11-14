// core/constants.js
const ROLE_LEVELS = {
    owner: 100,
    pt: 80,
    reseller: 60,
    vip: 40,
    user: 10,
};

const ROLE_META = {
    owner:    { emoji: '👑', label: 'Owner',    color: 'danger' },
    pt:       { emoji: '💎', label: 'PT',       color: 'primary' },
    reseller: { emoji: '🏪', label: 'Reseller', color: 'success' },
    vip:      { emoji: '⭐', label: 'VIP',      color: 'warning' },
    user:     { emoji: '👤', label: 'User',     color: 'secondary' },
};

const ROLE_CACHE_TTL = 5 * 60 * 1000;

module.exports = { ROLE_LEVELS, ROLE_META, ROLE_CACHE_TTL };