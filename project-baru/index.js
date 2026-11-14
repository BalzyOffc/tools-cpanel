// index.js — Entry point RAMPING
const { bot } = require('./core/bot-instance');
const { registerRichHandler } = require('./handlers/rich');
const { registerGlobalMiddleware } = require('./middleware/global');    
const { verifyBotToken } = require('./core/mongodb');
const { registerAllMiddleware } = require('./middleware');
const { startAutoBackup } = require('./handlers/owner-tools');
const { registerAllHandlers } = require('./handlers');
const { registerSettingsHandler } = require('./handlers/settings');
const { registerAutoReactHandler } = require('./handlers/autoreact');
const { registerEconomyHandler } = require('./handlers/economy');
const { registerRampokHandler } = require('./handlers/rampok');
const { registerPlayHandler } = require('./handlers/play'); // <-- TAMBAHKAN IMPORT INI
const sholatAuto = require('./services/sholat-auto');
const backup = require('./services/backup');
const config = require('./config');

const chalk = require('chalk');

function printBanner() {
    console.clear();
    
    console.log(chalk.cyan(`
  ██████╗  █████╗ ██╗     ███████╗██╗   ██╗
  ██╔══██╗██╔══██╗██║     ╚══███╔╝╚██╗ ██╔╝
  ██████╔╝███████║██║       ███╔╝  ╚████╔╝ 
  ██╔══██╗██╔══██║██║      ███╔╝    ╚██╔╝  
  ██████╔╝██║  ██║███████╗███████╗   ██║   
  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   
  `));

    console.log(chalk.yellow(`  ─────────────────────────────────────`));
    console.log(chalk.bold.white(`   🤖 Bot Name : `) + chalk.bold.green('BALZY MD'));
    console.log(chalk.bold.white(`   🚀 Version  : `) + chalk.bold.cyan('2.0.0'));
    console.log(chalk.bold.white(`   👑 Owner    : `) + chalk.bold.magenta('BalzyOffc'));
    console.log(chalk.bold.white(`   ⚙️ Mode     : `) + chalk.bold.green(process.env.NODE_ENV === 'production' ? 'Production' : 'Development'));
    console.log(chalk.bold.white(`   🟢 Status   : `) + chalk.bold.green('Online & Connected'));
    console.log(chalk.yellow(`  ─────────────────────────────────────\n`));
}

// 1. PASANG MIDDLEWARE GLOBAL PALING ATAS
registerGlobalMiddleware(bot); 

// Register middleware (URUTAN PENTING)
registerAllMiddleware(bot);

// Register semua handler
registerAllHandlers(bot);

registerSettingsHandler(bot);
registerRichHandler(bot);
registerAutoReactHandler(bot);
registerPlayHandler(bot); // <-- DAFTARKAN PLAY HANDLER DI SINI
registerEconomyHandler(bot);
registerRampokHandler(bot);

// Auto-backup tiap 6 jam
setInterval(async () => {
    try {
        const result = await backup.createBackupZip('auto');
        backup.cleanupOldBackups(10);
        await backup.sendBackupToOwner(bot, config.OWNER_ID, result, 'auto');
        console.log(`💾 Auto-backup: ${result.filename}`);
    } catch (err) {
        console.error('❌ Auto-backup gagal:', err.message);
    }
}, 6 * 60 * 60 * 1000);

// Bot error handler
bot.catch((err, ctx) => {
    console.error(`❌ Error di ${ctx?.updateType}:`, err);
});

// Launch
(async () => {
    try {
        await verifyBotToken();
        
        bot.launch().then(() => {
            console.log(chalk.bold.blue('🚀 Bot Telegram berhasil dijalankan!\n'));
        });
        
         printBanner();
        startAutoBackup();
        sholatAuto.start(bot);
    } catch (err) {
        console.error(chalk.red('❌ Gagal menjalankan bot:'), err.message);
    }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));