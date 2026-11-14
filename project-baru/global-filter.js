// middleware/global-filter.js
const config = require('../config');
const { globalFilters } = require('../state/maps');

function registerGlobalFilter(bot) {
    bot.use(async (ctx, next) => {
        if (!ctx.message?.text || ctx.from?.id === config.OWNER_ID) return next();
        const text = ctx.message.text.toLowerCase();
        for (const [trigger, response] of globalFilters.entries()) {
            if (text.includes(trigger)) {
                await ctx.reply(response, { parse_mode: 'HTML' });
                return;
            }
        }
        return next();
    });
}

module.exports = { registerGlobalFilter };