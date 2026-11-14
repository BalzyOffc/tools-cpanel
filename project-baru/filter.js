// handlers/filter.js
const db = require('../services/database');
const { isAdmin } = require('../helpers/auth');
const { replyRich, premiumMessage } = require('../helpers/rich-message');
const { escapeHtml } = require('../helpers/html');

function registerFilterHandler(bot) {
    bot.command('filter', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const args = ctx.message.text.split(' ').slice(1);
        const trigger = args[0]?.toLowerCase();
        const replied = ctx.message.reply_to_message;
        if (!trigger) return replyRich(ctx, premiumMessage({ heading: 'Format Salah', headingEmoji: '❌', body: 'Gunakan: /filter trigger respon' }));

        if (replied) {
            let filterType = 'media';
            if (replied.photo) filterType = 'photo';
            else if (replied.video) filterType = 'video';
            else if (replied.document) filterType = 'document';
            else if (replied.sticker) filterType = 'sticker';
            else if (replied.animation) filterType = 'animation';
            else if (replied.audio) filterType = 'audio';
            else if (replied.voice) filterType = 'voice';
            else if (replied.text) filterType = 'text';

            db.addFilter(ctx.chat.id, trigger, replied.text || replied.caption || null, ctx.chat.id, replied.message_id, filterType);
            return replyRich(ctx, premiumMessage({ heading: 'Filter Media Disimpan!', headingEmoji: '🎯', body: `Trigger: <code>${trigger}</code>`, accent: '✅' }));
        }

        if (args.length < 2) return replyRich(ctx, premiumMessage({ heading: 'Konten Kosong', headingEmoji: '❌' }));
        const respon = args.slice(1).join(' ');
        db.addFilter(ctx.chat.id, trigger, respon, null, null, 'text');
        await replyRich(ctx, premiumMessage({ heading: 'Filter Ditambahkan!', headingEmoji: '🎯', body: `Trigger: <code>${trigger}</code>`, accent: '✅' }));
    });

    bot.command('filters', async (ctx) => {
        const filters = db.getFilters(ctx.chat.id);
        if (filters.length === 0) return replyRich(ctx, premiumMessage({ heading: 'Belum Ada Filter', headingEmoji: '📭', accent: '🔍' }));
        const list = filters.map(f => `<code>${f.trigger}</code> (${f.filter_type})`).join('\n');
        await replyRich(ctx, premiumMessage({ heading: 'Daftar Filter', headingEmoji: '📋', body: `Total: ${filters.length}`, pre: list, accent: '🔍' }));
    });

    bot.command('stop', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const trigger = ctx.message.text.split(' ')[1];
        if (!trigger) return;
        db.delFilter(ctx.chat.id, trigger);
        await replyRich(ctx, premiumMessage({ heading: 'Filter Dihapus', headingEmoji: '🗑️', body: `Trigger <mark>${escapeHtml(trigger)}</mark> dihapus.`, accent: '✅' }));
    });

    bot.command('setwelcome', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) return;
        db.setSetting(ctx.chat.id, 'welcomeText', text);
        await replyRich(ctx, premiumMessage({
            heading: 'Welcome Diatur', headingEmoji: '👋',
            body: 'Preview:',
            blockquote: text.replace(/{name}/g, ctx.from.first_name),
            footer: 'Variabel: {name}, {chat}, {count}',
            accent: '✅',
        }));
    });

    bot.command('setgoodbye', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        if (!text) return;
        db.setSetting(ctx.chat.id, 'goodbyeText', text);
        await replyRich(ctx, premiumMessage({
            heading: 'Goodbye Diatur', headingEmoji: '👋',
            body: 'Preview:',
            blockquote: text.replace(/{name}/g, ctx.from.first_name),
            footer: 'Variabel: {name}, {chat}',
            accent: '✅',
        }));
    });

    bot.command('welcome', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const arg = ctx.message.text.split(' ')[1];
        if (arg === 'on' || arg === 'off') {
            db.setSetting(ctx.chat.id, 'welcome', arg === 'on');
            await replyRich(ctx, premiumMessage({ heading: `Welcome ${arg.toUpperCase()}`, headingEmoji: arg === 'on' ? '✅' : '❌', accent: '👋' }));
        }
    });

    bot.command('goodbye', async (ctx) => {
        if (!await isAdmin(ctx)) return;
        const arg = ctx.message.text.split(' ')[1];
        if (arg === 'on' || arg === 'off') {
            db.setSetting(ctx.chat.id, 'goodbye', arg === 'on');
            await replyRich(ctx, premiumMessage({ heading: `Goodbye ${arg.toUpperCase()}`, headingEmoji: arg === 'on' ? '✅' : '❌', accent: '👋' }));
        }
    });

    // New member handler (welcome + force join)
    bot.on('new_chat_members', async (ctx) => {
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
            db.addTarget(ctx.chat.id, 'group');
        }
        // Welcome baru
        for (const user of ctx.message.new_chat_members) {
            if (user.is_bot) continue;
            const welcomeOn = db.getSetting(ctx.chat.id, 'welcome', true);
            if (!welcomeOn) continue;
            const tpl = db.getSetting(ctx.chat.id, 'welcomeText', 'Selamat datang {name} di {chat}!');
            const count = await ctx.telegram.getChatMembersCount(ctx.chat.id).catch(() => '?');
            const text = tpl
                .replace(/{name}/g, `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`)
                .replace(/{chat}/g, escapeHtml(ctx.chat.title || 'grup'))
                .replace(/{count}/g, count);

            try {
                const msg = await ctx.reply(text, { parse_mode: 'HTML' });
                autoDeleteMessage(ctx.chat.id, msg.message_id, 60000);
            } catch (e) {}
        }
    });
}

function autoDeleteMessage(chatId, messageId, delayMs) {
    setTimeout(async () => {
        try { require('../core/bot-instance').bot.telegram.deleteMessage(chatId, messageId); } catch (e) {}
    }, delayMs);
}

module.exports = { registerFilterHandler };