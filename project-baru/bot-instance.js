// core/bot-instance.js
const { Telegraf, Markup } = require('telegraf');
const config = require('../config');

const bot = new Telegraf(config.BOT_TOKEN);

module.exports = { bot, Markup };