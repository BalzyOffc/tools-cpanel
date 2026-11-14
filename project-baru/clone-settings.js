// =============================================================
// clone-settings.js
// Menu setting khusus bot clone (aktif jika config.IS_CLONE)
// =============================================================
const fs = require('fs');
const path = require('path');

const CLONE_SETTINGS_FILE = path.join(__dirname, 'clone-settings.json');

const DEFAULT_SETTINGS = {
    autoReact: true,
    antiLink: true,
    antiFlood: true,
    welcome: true,
    goodbye: true,
    gconly: false,
    maintenance: false,
    updatedAt: Date.now()
};

function loadCloneSettings() {
    try {
        if (fs.existsSync(CLONE_SETTINGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CLONE_SETTINGS_FILE, 'utf8'));
            return { ...DEFAULT_SETTINGS, ...data };
        }
    } catch (e) {
        console.error('Gagal load clone-settings.json:', e.message);
    }
    return { ...DEFAULT_SETTINGS };
}

function saveCloneSettings(data) {
    try {
        data.updatedAt = Date.now();
        fs.writeFileSync(CLONE_SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Gagal save clone-settings.json:', e.message);
    }
}

function renderCloneMenu(settings, config, escapeHtml) {
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    const tokenPrefix = (config.BOT_TOKEN || '').split(':')[0] || '-';

    return `
<h1>⚙️ Setting Bot Clone</h1>
<h2>🧬 ${escapeHtml(config.botName || config.BOT_NAME || 'Clone Bot')}</h2>
<table bordered striped>
  <tr><td><b>Token Prefix</b></td><td>: <code>${tokenPrefix}:***</code></td></tr>
  <tr><td><b>Versi</b></td><td>: ${escapeHtml(config.version || config.VERSION || '-')}</td></tr>
  <tr><td><b>Developer</b></td><td>: ${escapeHtml(config.developer || config.DEVELOPER || '-')}</td></tr>
  <tr><td><b>Parent Owner</b></td><td>: <code>${config.CLONE_META?.parentOwnerId || '-'}</code></td></tr>
</table>

<h2>🔧 Toggle Fitur</h2>
<table bordered striped>
  <tr><td>🎯 Auto React</td><td>${onOff(settings.autoReact)}</td></tr>
  <tr><td>🔗 Anti Link</td><td>${onOff(settings.antiLink)}</td></tr>
  <tr><td>🌊 Anti Flood</td><td>${onOff(settings.antiFlood)}</td></tr>
  <tr><td>👋 Welcome</td><td>${onOff(settings.welcome)}</td></tr>
  <tr><td>👋 Goodbye</td><td>${onOff(settings.goodbye)}</td></tr>
  <tr><td>🔒 Group Only</td><td>${onOff(settings.gconly)}</td></tr>
  <tr><td>🚧 Maintenance</td><td>${onOff(settings.maintenance)}</td></tr>
</table>

<blockquote>Klik tombol di bawah untuk toggle fitur.
Setting tersimpan otomatis di <code>clone-settings.json</code>.</blockquote>
<footer>✨ Setting ini hanya berlaku di bot clone ini, bukan bot utama.</footer>
<tg-button-row>
  <tg-button type="callback_data" style="primary" data="cs_toggle_autoReact">🎯 React: ${settings.autoReact ? 'ON' : 'OFF'}</tg-button>
  <tg-button type="callback_data" style="primary" data="cs_toggle_antiLink">🔗 Link: ${settings.antiLink ? 'ON' : 'OFF'}</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="primary" data="cs_toggle_antiFlood">🌊 Flood: ${settings.antiFlood ? 'ON' : 'OFF'}</tg-button>
  <tg-button type="callback_data" style="primary" data="cs_toggle_welcome">👋 Welcome: ${settings.welcome ? 'ON' : 'OFF'}</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="primary" data="cs_toggle_goodbye">👋 Goodbye: ${settings.goodbye ? 'ON' : 'OFF'}</tg-button>
  <tg-button type="callback_data" style="warning" data="cs_toggle_gconly">🔒 GC: ${settings.gconly ? 'ON' : 'OFF'}</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="danger" data="cs_toggle_maintenance">🚧 Maint: ${settings.maintenance ? 'ON' : 'OFF'}</tg-button>
  <tg-button type="callback_data" style="success" data="cs_reset">♻️ Reset</tg-button>
</tg-button-row>
<tg-button-row>
  <tg-button type="callback_data" style="secondary" data="cs_refresh">🔄 Refresh</tg-button>
</tg-button-row>
`;
}

module.exports = function registerCloneSettings(bot, config, helpers) {
    if (!config.IS_CLONE) {
        console.log('ℹ️ Bukan bot clone, clone-settings tidak didaftarkan.');
        return;
    }

    const { replyRich, premiumMessage, escapeHtml, cleanHtmlForFallback } = helpers;

    const isOwner = (ctx) =>
        ctx.from?.id === config.OWNER_ID ||
        ctx.from?.id === config.CLONE_META?.parentOwnerId;

    const renderAndEdit = async (ctx, settings) => {
        const html = renderCloneMenu(settings, config, escapeHtml);
        const clean = cleanHtmlForFallback(html);
        try {
            const msg = ctx.callbackQuery?.message;
            if (msg?.photo || msg?.video || msg?.document) {
                await ctx.editMessageCaption(clean, { parse_mode: 'HTML' });
            } else {
                await ctx.editMessageText(clean, { parse_mode: 'HTML' });
            }
        } catch (e) {
            await replyRich(ctx, html);
        }
    };

    bot.command(['setting', 'settings', 'clonesetting'], async (ctx) => {
        if (!isOwner(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Menu setting clone hanya untuk owner bot ini.',
                accent: '🔒'
            }));
        }
        await replyRich(ctx, renderCloneMenu(loadCloneSettings(), config, escapeHtml));
    });

    bot.command('clone', async (ctx) => {
        if (!isOwner(ctx)) {
            return replyRich(ctx, premiumMessage({
                heading: 'Akses Ditolak', headingEmoji: '🚫',
                body: 'Menu setting clone hanya untuk owner bot ini.',
                accent: '🔒'
            }));
        }
        await replyRich(ctx, renderCloneMenu(loadCloneSettings(), config, escapeHtml));
    });

    const toggles = ['autoReact', 'antiLink', 'antiFlood', 'welcome', 'goodbye', 'gconly', 'maintenance'];
    toggles.forEach(key => {
        bot.action(`cs_toggle_${key}`, async (ctx) => {
            if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Hanya owner.', { show_alert: true });
            const s = loadCloneSettings();
            s[key] = !s[key];
            saveCloneSettings(s);
            await ctx.answerCbQuery(`✅ ${key} → ${s[key] ? 'ON' : 'OFF'}`);
            await renderAndEdit(ctx, s);
        });
    });

    bot.action('cs_reset', async (ctx) => {
        if (!isOwner(ctx)) return ctx.answerCbQuery('❌ Owner only', { show_alert: true });
        saveCloneSettings({ ...DEFAULT_SETTINGS });
        await ctx.answerCbQuery('♻️ Reset ke default');
        await renderAndEdit(ctx, loadCloneSettings());
    });

    bot.action('cs_refresh', async (ctx) => {
        await ctx.answerCbQuery('🔄 Refreshing...');
        await renderAndEdit(ctx, loadCloneSettings());
    });

    console.log('⚙️ Clone settings menu registered');
};

module.exports.loadCloneSettings = loadCloneSettings;
module.exports.saveCloneSettings = saveCloneSettings;