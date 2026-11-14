// middleware/role-loader.js
const { ROLE_LEVELS } = require('../core/constants');
const { getUserRole } = require('../helpers/role');

function registerRoleLoader(bot) {
    bot.use(async (ctx, next) => {
        if (ctx.from && !ctx.from.is_bot) {
            try {
                const roleData = await getUserRole(ctx.from.id);
                ctx.state.userRole = roleData.role;
                ctx.state.userRoleData = roleData;
                ctx.state.roleLevel = ROLE_LEVELS[roleData.role] || 0;
            } catch {
                ctx.state.userRole = 'user';
                ctx.state.roleLevel = 10;
            }
        }
        return next();
    });
}

module.exports = { registerRoleLoader };