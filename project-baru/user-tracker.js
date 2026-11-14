// middleware/user-tracker.js
// middleware/user-tracker.js
const db = require('../services/database');
const { userActivity } = require('../state/maps');

function registerUserTracker(bot) {
    bot.use(async (ctx, next) => {
        if (ctx.from && !ctx.from.is_bot) {
            try {
                // Ini akan selalu meng-update username & first_name terbaru
                db.saveUserInfo(ctx.from.id, ctx.from.username, ctx.from.first_name);
                userActivity.set(ctx.from.id, Date.now());
            } catch (e) {}
        }
        return next();
    });
}

module.exports = { registerUserTracker };