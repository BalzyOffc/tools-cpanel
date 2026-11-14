// helpers/user.js
const db = require('../services/database');

async function getTargetUser(ctx) {
    const reply = ctx.message.reply_to_message;
    if (reply) return reply.from;
    const args = ctx.message.text.split(' ').slice(1);
    if (args[0]) {
        const id = parseInt(args[0].replace('@', ''));
        if (!isNaN(id)) {
            try { return await ctx.telegram.getChat(String(id)); } catch (e) {}
        }
    }
    return null;
}

async function resolveUser(ctx, arg) {
    if (!arg) return null;
    if (ctx.message.reply_to_message?.from) return ctx.message.reply_to_message.from;

    if (arg.startsWith('@')) {
        const username = arg.replace('@', '');
        const found = db.findUserByUsername(username);
        if (found) return { id: found.id, first_name: found.first_name, username };
        try {
            const chat = await ctx.telegram.getChat('@' + username);
            return { id: chat.id, first_name: chat.first_name, username };
        } catch { return null; }
    }

    const id = parseInt(arg);
    if (!isNaN(id)) {
        try {
            const chat = await ctx.telegram.getChat(id);
            return { id: chat.id, first_name: chat.first_name || 'User', username: chat.username };
        } catch {
            return { id, first_name: `User ${id}` };
        }
    }

    return null;
}

module.exports = { getTargetUser, resolveUser };