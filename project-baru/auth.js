// helpers/auth.js
const config = require('../config');
const { ROLE_LEVELS } = require('../core/constants');

function isPV(ctx) {
    return ctx.chat && ctx.chat.type === 'private';
}

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return false;
    try {
        const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        return m.status === 'creator' || m.status === 'administrator';
    } catch { return false; }
}

async function isPrivileged(ctx) {
    if (ctx.from?.id === config.OWNER_ID) return true;
    const roleLevel = ctx.state?.roleLevel || 0;
    if (roleLevel >= ROLE_LEVELS.pt) return true;
    return await isAdmin(ctx);
}

module.exports = { isPV, isAdmin, isPrivileged };