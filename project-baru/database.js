// database.js
// Modul database bot menggunakan better-sqlite3 (synchronous, cepat)

const Database = require('better-sqlite3');
const path = require('path');

// Inisialisasi database (file bot.db di root project)
const db = new Database(path.join(__dirname, 'bot.db'));

// Optimasi performa (WAL mode untuk concurrent read/write)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// =============================================================
// === INISIALISASI TABEL ======================================
// =============================================================
db.exec(`
    -- 1. SISTEM WARNING
    CREATE TABLE IF NOT EXISTS warns (
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (chat_id, user_id)
    );

    -- 2. SETTINGS PER GRUP (JSON)
    CREATE TABLE IF NOT EXISTS settings (
        chat_id TEXT PRIMARY KEY,
        data TEXT NOT NULL
    );

    -- 3. FILTER AUTO-REPLY (ala Rose — support media)
    CREATE TABLE IF NOT EXISTS filters (
        chat_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        response TEXT,
        from_chat_id TEXT,
        message_id INTEGER,
        filter_type TEXT DEFAULT 'text',
        PRIMARY KEY (chat_id, trigger)
    );

    -- 4. AFK
    CREATE TABLE IF NOT EXISTS afk (
        user_id TEXT PRIMARY KEY,
        reason TEXT,
        since INTEGER
    );

    -- 5. SALDO
    CREATE TABLE IF NOT EXISTS saldo (
        user_id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0
    );

    -- 6. CLAIM CODES
    CREATE TABLE IF NOT EXISTS claim_codes (
        code TEXT PRIMARY KEY,
        saldo INTEGER NOT NULL,
        max_uses INTEGER DEFAULT 1,
        uses INTEGER DEFAULT 0,
        created_by TEXT
    );

    -- 7. CLAIM HISTORY
    CREATE TABLE IF NOT EXISTS claim_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        amount INTEGER NOT NULL,
        ts INTEGER NOT NULL
    );

    -- 8. GAME SCORES
    CREATE TABLE IF NOT EXISTS game_scores (
        user_id TEXT PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    );

    -- 9. USERNAME MAPPING (untuk resolve @username di AFK)
    CREATE TABLE IF NOT EXISTS user_usernames (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_username ON user_usernames(username);

    -- 10. MATCHMAKING QUEUE (suit random)
    CREATE TABLE IF NOT EXISTS game_queue (
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        game TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chat_id, user_id, game)
    );

    -- 11. GAME CHALLENGES (PvP)
    CREATE TABLE IF NOT EXISTS game_challenges (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        game TEXT NOT NULL,
        bet INTEGER DEFAULT 0,
        ts INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
    );

    -- 12. NOTES (ala Rose — optional, bisa dipakai juga)
    CREATE TABLE IF NOT EXISTS notes (
        chat_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        from_chat_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        note_type TEXT DEFAULT 'text',
        created_by TEXT,
        PRIMARY KEY (chat_id, trigger)
        );
    -- 13. Broadcast
    CREATE TABLE IF NOT EXISTS broadcast_targets (
        id TEXT PRIMARY KEY,
        type TEXT, -- 'user' atau 'group'
        updated_at INTEGER
    );
    -- 14. Inventory (Untuk fitur Mancing/Shop)
CREATE TABLE IF NOT EXISTS inventory (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    amount INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, item_id)
);
`);

// =============================================================
// === MIGRASI OTOMATIS UNTUK DB LAMA ==========================
// =============================================================
// Karena CREATE TABLE IF NOT EXISTS tidak mengubah tabel yang sudah ada,
// kita cek kolom baru di tabel `filters` dan tambahkan jika belum ada.
// Di dalam blok try migrasi database.js
try {
    const invCols = db.prepare("PRAGMA table_info(inventory)").all().map(c => c.name);
    if (!invCols.includes('durability')) {
        db.exec('ALTER TABLE inventory ADD COLUMN durability INTEGER DEFAULT 0');
        console.log('✅ Migrasi: kolom durability ditambahkan ke inventory');
    }
    const filterCols = db.prepare("PRAGMA table_info(filters)").all().map(c => c.name);
    if (!filterCols.includes('from_chat_id')) {
        db.exec('ALTER TABLE filters ADD COLUMN from_chat_id TEXT');
        console.log('✅ Migrasi: kolom from_chat_id ditambahkan ke filters');
    }
    if (!filterCols.includes('message_id')) {
        db.exec('ALTER TABLE filters ADD COLUMN message_id INTEGER');
        console.log('✅ Migrasi: kolom message_id ditambahkan ke filters');
    }
    if (!filterCols.includes('filter_type')) {
        db.exec("ALTER TABLE filters ADD COLUMN filter_type TEXT DEFAULT 'text'");
        console.log('✅ Migrasi: kolom filter_type ditambahkan ke filters');
    }
} catch (e) {
    console.error('⚠️ Migrasi filters gagal:', e.message);
}

// =============================================================
// === EXPORT METHODS ==========================================
// =============================================================
module.exports = {

    // =========================================================
    // === WARNS ===============================================
    // =========================================================
    getWarn: (chatId, userId) => {
        const row = db.prepare('SELECT count FROM warns WHERE chat_id=? AND user_id=?')
                        .get(String(chatId), String(userId));
        return row ? row.count : 0;
    },
    setWarn: (chatId, userId, count) => {
        db.prepare('INSERT OR REPLACE INTO warns (chat_id,user_id,count) VALUES (?,?,?)')
          .run(String(chatId), String(userId), count);
    },
    resetWarn: (chatId, userId) => {
        db.prepare('DELETE FROM warns WHERE chat_id=? AND user_id=?')
          .run(String(chatId), String(userId));
    },
    getAllWarns: (chatId) => {
        return db.prepare('SELECT user_id, count FROM warns WHERE chat_id=? AND count>0')
                 .all(String(chatId));
    },
addTarget: (id, type) => {
    db.prepare('INSERT OR IGNORE INTO broadcast_targets (id, type, updated_at) VALUES (?,?,?)')
      .run(String(id), type, Date.now());
},
getTargets: (type) => {
    return db.prepare('SELECT id FROM broadcast_targets WHERE type=?').all(type).map(r => r.id);
},
getTargetCounts: () => {
    const users = db.prepare("SELECT COUNT(*) as c FROM broadcast_targets WHERE type='user'").get().c;
    const groups = db.prepare("SELECT COUNT(*) as c FROM broadcast_targets WHERE type='group'").get().c;
    return { users, groups };
},
    // =========================================================
    // === SETTINGS (JSON per grup) ============================
    // =========================================================
    getSetting: (chatId, key, def = null) => {
        const row = db.prepare('SELECT data FROM settings WHERE chat_id=?').get(String(chatId));
        if (!row) return def;
        try {
            const data = JSON.parse(row.data);
            return data[key] !== undefined ? data[key] : def;
        } catch (e) {
            return def;
        }
    },
    setSetting: (chatId, key, value) => {
        const row = db.prepare('SELECT data FROM settings WHERE chat_id=?').get(String(chatId));
        let data = {};
        if (row) {
            try { data = JSON.parse(row.data); } catch (e) {}
        }
        data[key] = value;
        db.prepare('INSERT OR REPLACE INTO settings (chat_id,data) VALUES (?,?)')
          .run(String(chatId), JSON.stringify(data));
    },
    getAllSettings: (chatId) => {
        const row = db.prepare('SELECT data FROM settings WHERE chat_id=?').get(String(chatId));
        if (!row) return {};
        try { return JSON.parse(row.data); } catch (e) { return {}; }
    },
    deleteSetting: (chatId, key) => {
        const row = db.prepare('SELECT data FROM settings WHERE chat_id=?').get(String(chatId));
        if (!row) return;
        try {
            const data = JSON.parse(row.data);
            delete data[key];
            db.prepare('INSERT OR REPLACE INTO settings (chat_id,data) VALUES (?,?)')
              .run(String(chatId), JSON.stringify(data));
        } catch (e) {}
    },

    // =========================================================
    // === FILTERS (ala Rose — support media) ==================
    // =========================================================
    addFilter: (chatId, trigger, response, fromChatId = null, messageId = null, filterType = 'text') => {
        db.prepare('INSERT OR REPLACE INTO filters (chat_id,trigger,response,from_chat_id,message_id,filter_type) VALUES (?,?,?,?,?,?)')
          .run(
              String(chatId),
              trigger.toLowerCase(),
              response,
              fromChatId ? String(fromChatId) : null,
              messageId,
              filterType
          );
    },
    delFilter: (chatId, trigger) => {
        db.prepare('DELETE FROM filters WHERE chat_id=? AND trigger=?')
          .run(String(chatId), trigger.toLowerCase());
    },
    getFilters: (chatId) => {
        return db.prepare('SELECT trigger, response, filter_type FROM filters WHERE chat_id=? ORDER BY trigger ASC')
                 .all(String(chatId));
    },
    // Return row lengkap supaya handler bisa tahu apakah harus copyMessage atau sendMessage
    findFilter: (chatId, text) => {
        if (!text) return null;
        const rows = db.prepare('SELECT * FROM filters WHERE chat_id=?')
                       .all(String(chatId));
        const lower = text.toLowerCase();
        return rows.find(r => lower.includes(r.trigger)) || null;
    },
    clearFilters: (chatId) => {
        db.prepare('DELETE FROM filters WHERE chat_id=?').run(String(chatId));
    },

    // =========================================================
    // === NOTES (ala Rose — optional) =========================
    // =========================================================
    saveNote: (chatId, trigger, fromChatId, messageId, noteType, createdBy) => {
        db.prepare('INSERT OR REPLACE INTO notes (chat_id,trigger,from_chat_id,message_id,note_type,created_by) VALUES (?,?,?,?,?,?)')
          .run(String(chatId), trigger.toLowerCase(), String(fromChatId), messageId, noteType, String(createdBy));
    },
    getNote: (chatId, trigger) => {
        return db.prepare('SELECT * FROM notes WHERE chat_id=? AND trigger=?')
                 .get(String(chatId), trigger.toLowerCase());
    },
    listNotes: (chatId) => {
        return db.prepare('SELECT trigger, note_type, created_by FROM notes WHERE chat_id=? ORDER BY trigger ASC')
                 .all(String(chatId));
    },
    delNote: (chatId, trigger) => {
        db.prepare('DELETE FROM notes WHERE chat_id=? AND trigger=?')
          .run(String(chatId), trigger.toLowerCase());
    },

    // =========================================================
    // === AFK =================================================
    // =========================================================
    setAfk: (userId, reason) => {
        db.prepare('INSERT OR REPLACE INTO afk (user_id,reason,since) VALUES (?,?,?)')
          .run(String(userId), reason, Date.now());
    },
    getAfk: (userId) => {
        const row = db.prepare('SELECT reason, since FROM afk WHERE user_id=?')
                        .get(String(userId));
        return row || null;
    },
    delAfk: (userId) => {
        db.prepare('DELETE FROM afk WHERE user_id=?').run(String(userId));
    },
    getAllAfk: () => {
        return db.prepare('SELECT user_id, reason, since FROM afk').all();
    },
    cleanupOldAfk: (maxAgeMs = 24 * 60 * 60 * 1000) => {
        const cutoff = Date.now() - maxAgeMs;
        const result = db.prepare('DELETE FROM afk WHERE since < ?').run(cutoff);
        return result.changes;
    },

    // =========================================================
    // === SALDO ===============================================
    // =========================================================
    getSaldo: (userId) => {
        const row = db.prepare('SELECT balance FROM saldo WHERE user_id=?')
                        .get(String(userId));
        return row ? row.balance : 0;
    },
    addSaldo: (userId, amount) => {
        const cur = module.exports.getSaldo(userId);
        const newBal = Math.max(0, cur + amount);
        db.prepare('INSERT OR REPLACE INTO saldo (user_id,balance) VALUES (?,?)')
          .run(String(userId), newBal);
        return newBal;
    },
    setSaldo: (userId, amount) => {
        const newBal = Math.max(0, amount);
        db.prepare('INSERT OR REPLACE INTO saldo (user_id,balance) VALUES (?,?)')
          .run(String(userId), newBal);
        return newBal;
    },
    getTopSaldo: (limit = 10) => {
        return db.prepare('SELECT user_id, balance FROM saldo ORDER BY balance DESC LIMIT ?')
                 .all(limit);
    },

    // =========================================================
    // === CLAIM CODES =========================================
    // =========================================================
    createCode: (code, saldo, maxUses, createdBy) => {
        db.prepare('INSERT OR REPLACE INTO claim_codes (code,saldo,max_uses,created_by) VALUES (?,?,?,?)')
          .run(code.toUpperCase(), saldo, maxUses, String(createdBy));
    },
    getCode: (code) => {
        return db.prepare('SELECT * FROM claim_codes WHERE code=?')
                 .get(code.toUpperCase());
    },
    useCode: (code) => {
        db.prepare('UPDATE claim_codes SET uses=uses+1 WHERE code=?')
          .run(code.toUpperCase());
    },
    delCode: (code) => {
        db.prepare('DELETE FROM claim_codes WHERE code=?').run(code.toUpperCase());
    },
    listCodes: () => {
        return db.prepare('SELECT * FROM claim_codes ORDER BY rowid DESC').all();
    },
    logClaim: (userId, code, amount) => {
        db.prepare('INSERT INTO claim_history (user_id,code,amount,ts) VALUES (?,?,?,?)')
          .run(String(userId), code.toUpperCase(), amount, Date.now());
    },
    hasUserClaimed: (userId, code) => {
        const row = db.prepare('SELECT 1 FROM claim_history WHERE user_id=? AND code=? LIMIT 1')
                        .get(String(userId), code.toUpperCase());
        return !!row;
    },
    getClaimHistory: (userId) => {
        return db.prepare('SELECT code, amount, ts FROM claim_history WHERE user_id=? ORDER BY ts DESC')
                 .all(String(userId));
    },

    // =========================================================
    // === GAME SCORES =========================================
    // =========================================================
    getScore: (userId) => {
        const row = db.prepare('SELECT wins, losses FROM game_scores WHERE user_id=?')
                        .get(String(userId));
        return row || { wins: 0, losses: 0 };
    },
    addWin: (userId) => {
        const s = module.exports.getScore(userId);
        db.prepare('INSERT OR REPLACE INTO game_scores (user_id,wins,losses) VALUES (?,?,?)')
          .run(String(userId), s.wins + 1, s.losses);
    },
    addLoss: (userId) => {
        const s = module.exports.getScore(userId);
        db.prepare('INSERT OR REPLACE INTO game_scores (user_id,wins,losses) VALUES (?,?,?)')
          .run(String(userId), s.wins, s.losses + 1);
    },
    getTopWins: (limit = 10) => {
        return db.prepare('SELECT user_id, wins, losses FROM game_scores ORDER BY wins DESC LIMIT ?')
                 .all(limit);
    },

    // =========================================================
// === USERNAME MAPPING ====================================
// =========================================================
saveUserInfo: (userId, username, firstName) => {
    db.prepare('INSERT OR REPLACE INTO user_usernames (user_id,username,first_name,updated_at) VALUES (?,?,?,?)')
      .run(String(userId), username ? username.toLowerCase() : null, firstName || '', Date.now());
},
findUserByUsername: (username) => {
    if (!username) return null;
    const clean = username.toLowerCase().replace('@', '');
    const row = db.prepare('SELECT user_id, first_name FROM user_usernames WHERE username=?')
                  .get(clean);
    // Ubah parseInt(row.user_id) menjadi String(row.user_id)
    return row ? { id: String(row.user_id), first_name: row.first_name } : null;
},

findUserByFirstName: (name) => {
    if (!name || name.length < 3) return null;
    const row = db.prepare('SELECT user_id, first_name FROM user_usernames WHERE LOWER(first_name) = LOWER(?) LIMIT 1')
                  .get(name);
    // Ubah parseInt(row.user_id) menjadi String(row.user_id)
    return row ? { id: String(row.user_id), first_name: row.first_name } : null;
},
// 👆 SAMPAI SINI 👆

getUserById: (userId) => {
    return db.prepare('SELECT user_id, username, first_name FROM user_usernames WHERE user_id=?')
             .get(String(userId));
},

    // =========================================================
    // === MATCHMAKING QUEUE ===================================
    // =========================================================
    addQueue: (chatId, userId, game) => {
        db.prepare('INSERT OR REPLACE INTO game_queue (chat_id,user_id,game,ts) VALUES (?,?,?,?)')
          .run(String(chatId), String(userId), game, Date.now());
    },
    removeQueue: (chatId, userId, game) => {
        db.prepare('DELETE FROM game_queue WHERE chat_id=? AND user_id=? AND game=?')
          .run(String(chatId), String(userId), game);
    },
    findOpponent: (chatId, userId, game) => {
        const row = db.prepare('SELECT user_id FROM game_queue WHERE chat_id=? AND user_id!=? AND game=? ORDER BY ts ASC LIMIT 1')
                        .get(String(chatId), String(userId), game);
        return row ? parseInt(row.user_id) : null;
    },
    clearQueue: (chatId, game) => {
        db.prepare('DELETE FROM game_queue WHERE chat_id=? AND game=?')
          .run(String(chatId), game);
    },
    cleanupOldQueue: (maxAgeMs = 10 * 60 * 1000) => {
        const cutoff = Date.now() - maxAgeMs;
        const result = db.prepare('DELETE FROM game_queue WHERE ts < ?').run(cutoff);
        return result.changes;
    },

    // =========================================================
    // === GAME CHALLENGES (PvP) ===============================
    // =========================================================
    createChallenge: (id, chatId, fromId, toId, game, bet) => {
        db.prepare('INSERT INTO game_challenges (id,chat_id,from_id,to_id,game,bet,ts) VALUES (?,?,?,?,?,?,?)')
          .run(id, String(chatId), String(fromId), String(toId), game, bet, Date.now());
    },
    getChallenge: (id) => {
        return db.prepare('SELECT * FROM game_challenges WHERE id=?').get(id);
    },
    updateChallengeStatus: (id, status) => {
        db.prepare('UPDATE game_challenges SET status=? WHERE id=?').run(status, id);
    },
    cleanupOldChallenges: (maxAgeMs = 30 * 60 * 1000) => {
        const cutoff = Date.now() - maxAgeMs;
        const result = db.prepare("DELETE FROM game_challenges WHERE ts < ? AND status='pending'").run(cutoff);
        return result.changes;
    },

    // =========================================================
    // === BACKUP & RESTORE ====================================
    // =========================================================
    exportAll: () => {
        return {
            meta: {
                version: '2.1',
                exportedAt: new Date().toISOString(),
                timestamp: Date.now()
            },
            warns: db.prepare('SELECT * FROM warns').all(),
            settings: db.prepare('SELECT * FROM settings').all(),
            filters: db.prepare('SELECT * FROM filters').all(),
            notes: db.prepare('SELECT * FROM notes').all(),
            afk: db.prepare('SELECT * FROM afk').all(),
            saldo: db.prepare('SELECT * FROM saldo').all(),
            claim_codes: db.prepare('SELECT * FROM claim_codes').all(),
            claim_history: db.prepare('SELECT * FROM claim_history').all(),
            game_scores: db.prepare('SELECT * FROM game_scores').all(),
            user_usernames: db.prepare('SELECT * FROM user_usernames').all()
        };
    },

    importAll: (data) => {
        if (!data || !data.meta) throw new Error('Format backup tidak valid');
        // Terima versi 2.0 & 2.1 (kompatibel)
        if (!['2.0', '2.1'].includes(data.meta.version)) {
            throw new Error(`Versi backup tidak cocok: ${data.meta.version}`);
        }

        const stats = {
            warns: 0, settings: 0, filters: 0, notes: 0, afk: 0, saldo: 0,
            claim_codes: 0, claim_history: 0, game_scores: 0, user_usernames: 0
        };

        const restore = db.transaction(() => {
            // Wipe semua tabel
            db.prepare('DELETE FROM warns').run();
            db.prepare('DELETE FROM settings').run();
            db.prepare('DELETE FROM filters').run();
            db.prepare('DELETE FROM notes').run();
            db.prepare('DELETE FROM afk').run();
            db.prepare('DELETE FROM saldo').run();
            db.prepare('DELETE FROM claim_codes').run();
            db.prepare('DELETE FROM claim_history').run();
            db.prepare('DELETE FROM game_scores').run();
            db.prepare('DELETE FROM user_usernames').run();
            db.prepare('DELETE FROM game_queue').run();
            db.prepare('DELETE FROM game_challenges').run();

            // Insert ulang
            if (Array.isArray(data.warns)) {
                const stmt = db.prepare('INSERT INTO warns (chat_id,user_id,count) VALUES (?,?,?)');
                for (const r of data.warns) { stmt.run(r.chat_id, r.user_id, r.count); stats.warns++; }
            }
            if (Array.isArray(data.settings)) {
                const stmt = db.prepare('INSERT INTO settings (chat_id,data) VALUES (?,?)');
                for (const r of data.settings) { stmt.run(r.chat_id, r.data); stats.settings++; }
            }
            if (Array.isArray(data.filters)) {
                const stmt = db.prepare('INSERT INTO filters (chat_id,trigger,response,from_chat_id,message_id,filter_type) VALUES (?,?,?,?,?,?)');
                for (const r of data.filters) {
                    stmt.run(r.chat_id, r.trigger, r.response || null, r.from_chat_id || null, r.message_id || null, r.filter_type || 'text');
                    stats.filters++;
                }
            }
            if (Array.isArray(data.notes)) {
                const stmt = db.prepare('INSERT INTO notes (chat_id,trigger,from_chat_id,message_id,note_type,created_by) VALUES (?,?,?,?,?,?)');
                for (const r of data.notes) {
                    stmt.run(r.chat_id, r.trigger, r.from_chat_id, r.message_id, r.note_type, r.created_by);
                    stats.notes++;
                }
            }
            if (Array.isArray(data.afk)) {
                const stmt = db.prepare('INSERT INTO afk (user_id,reason,since) VALUES (?,?,?)');
                for (const r of data.afk) { stmt.run(r.user_id, r.reason, r.since); stats.afk++; }
            }
            if (Array.isArray(data.saldo)) {
                const stmt = db.prepare('INSERT INTO saldo (user_id,balance) VALUES (?,?)');
                for (const r of data.saldo) { stmt.run(r.user_id, r.balance); stats.saldo++; }
            }
            if (Array.isArray(data.claim_codes)) {
                const stmt = db.prepare('INSERT INTO claim_codes (code,saldo,max_uses,uses,created_by) VALUES (?,?,?,?,?)');
                for (const r of data.claim_codes) { stmt.run(r.code, r.saldo, r.max_uses, r.uses, r.created_by); stats.claim_codes++; }
            }
            if (Array.isArray(data.claim_history)) {
                const stmt = db.prepare('INSERT INTO claim_history (user_id,code,amount,ts) VALUES (?,?,?,?)');
                for (const r of data.claim_history) { stmt.run(r.user_id, r.code, r.amount, r.ts); stats.claim_history++; }
            }
            if (Array.isArray(data.game_scores)) {
                const stmt = db.prepare('INSERT INTO game_scores (user_id,wins,losses) VALUES (?,?,?)');
                for (const r of data.game_scores) { stmt.run(r.user_id, r.wins, r.losses); stats.game_scores++; }
            }
            if (Array.isArray(data.user_usernames)) {
                const stmt = db.prepare('INSERT INTO user_usernames (user_id,username,first_name,updated_at) VALUES (?,?,?,?)');
                for (const r of data.user_usernames) { stmt.run(r.user_id, r.username, r.first_name, r.updated_at); stats.user_usernames++; }
            }
        });

        restore();
        return stats;
    },

    // =========================================================
    // === STATISTIK ===========================================
    // =========================================================
    getStats: () => {
        return {
            warns: db.prepare('SELECT COUNT(*) as c FROM warns').get().c,
            settings: db.prepare('SELECT COUNT(*) as c FROM settings').get().c,
            filters: db.prepare('SELECT COUNT(*) as c FROM filters').get().c,
            notes: db.prepare('SELECT COUNT(*) as c FROM notes').get().c,
            afk: db.prepare('SELECT COUNT(*) as c FROM afk').get().c,
            saldo: db.prepare('SELECT COUNT(*) as c FROM saldo').get().c,
            claim_codes: db.prepare('SELECT COUNT(*) as c FROM claim_codes').get().c,
            claim_history: db.prepare('SELECT COUNT(*) as c FROM claim_history').get().c,
            game_scores: db.prepare('SELECT COUNT(*) as c FROM game_scores').get().c,
            user_usernames: db.prepare('SELECT COUNT(*) as c FROM user_usernames').get().c,
            game_queue: db.prepare('SELECT COUNT(*) as c FROM game_queue').get().c,
            game_challenges: db.prepare('SELECT COUNT(*) as c FROM game_challenges').get().c
        };
    },

    // =========================================================
    // === UTILITY =============================================
    // =========================================================
    close: () => {
        db.close();
    },
    raw: db
};