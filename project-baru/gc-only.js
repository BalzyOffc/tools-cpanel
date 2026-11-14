// middleware/gc-only.js
const config = require('../config');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { state } = require('../state/maps');

function registerGcOnly(bot) {
    bot.use(async (ctx, next) => {
        if (ctx.chat?.type === 'private' && state.gcOnlyGlobal && ctx.from?.id !== config.OWNER_ID) {
            const text = ctx.message?.text || '';
            const allowed = ['/start', '/help', '/id', '/ping', '/gconly', '/menu'];
            if (text && !allowed.some(c => text.toLowerCase().startsWith(c))) {
                return replyRich(ctx, premiumMessage({
                    heading: 'Mode Group Only', headingEmoji: '🔒',
                    body: 'Bot sedang dalam mode Group Only.',
                    accent: '🔐',
                }));
            }
        }
        return next();
    });
}

module.exports = { registerGcOnly };