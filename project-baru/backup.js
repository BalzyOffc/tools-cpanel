// ═══════════════════════════════════════════════════════════════
// 📄 services/backup.js — Backup & Restore FULL PROJECT
// Mendukung:
//   - File root: index.js, config.js, database.js, dll
//   - Folder: core/, middleware/, helpers/, services/, state/, handlers/
//   - Database: bot.db, clones.json
//   - Skip: node_modules, .git, *.log, clones_*, *.zip, *.old
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const config = require('../config');

// Folder root project (lokasi index.js)
const ROOT_DIR = path.resolve(__dirname, '..');

// Folder backup disimpan
const BACKUP_DIR = path.join(ROOT_DIR, 'backups');

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI: File & folder yang BOLEH di-backup
// ═══════════════════════════════════════════════════════════════

// File di root folder (specifik)
const ROOT_FILES = [
    'index.js',
    'config.js',
    'database.js',
    'antikata.js',
    'backup.js',
    'clone-settings.js',
    'package.json',
    'package-lock.json',
    'README.md',
    'qris_profil.png',
    'bot.db',
    'clones.json',
];

// Folder yang di-backup FULL (recursive)
const FOLDERS_TO_BACKUP = [
    'core',
    'middleware',
    'helpers',
    'services',
    'state',
    'handlers',
];

// Pattern yang DI-SKIP (diabaikan saat backup)
const SKIP_PATTERNS = [
    /^node_modules$/,
    /^\.git$/,
    /^backups$/,
    /^clones_/,
    /^temp$/,
    /^\.env$/,
    /^\.env\./,
    /\.log$/,
    /\.old$/,
    /\.zip$/,
    /\.bak$/,
    /\.tmp$/,
    /^\.DS_Store$/,
    /^Thumbs\.db$/,
];

// Ukuran max backup (MB) — biar tidak kepanjangan
const MAX_BACKUP_SIZE_MB = 50;

// ═══════════════════════════════════════════════════════════════
// HELPER: cek apakah file/folder harus di-skip
// ═══════════════════════════════════════════════════════════════
function shouldSkip(name) {
    return SKIP_PATTERNS.some(pattern => pattern.test(name));
}

// ═══════════════════════════════════════════════════════════════
// HELPER: pastikan folder backup ada
// ═══════════════════════════════════════════════════════════════
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: kumpulkan semua file yang akan di-backup
// ═══════════════════════════════════════════════════════════════
function collectFiles() {
    const files = [];

    // 1. File root spesifik
    for (const file of ROOT_FILES) {
        const fullPath = path.join(ROOT_DIR, file);
        if (fs.existsSync(fullPath)) {
            files.push({ src: fullPath, rel: file });
        }
    }

    // 2. Folder full recursive
    for (const folder of FOLDERS_TO_BACKUP) {
        const folderPath = path.join(ROOT_DIR, folder);
        if (!fs.existsSync(folderPath)) continue;

        const walk = (dir, baseRel) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });

                for (const entry of entries) {
                    if (shouldSkip(entry.name)) continue;

                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.join(baseRel, entry.name);

                    if (entry.isDirectory()) {
                        walk(fullPath, relPath);
                    } else if (entry.isFile()) {
                        files.push({ src: fullPath, rel: relPath });
                    }
                }
            } catch (err) {
                console.error(`⚠️ Gagal walk folder ${dir}:`, err.message);
            }
        };

        walk(folderPath, folder);
    }

    return files;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: hitung total size file
// ═══════════════════════════════════════════════════════════════
function calculateTotalSize(files) {
    let total = 0;
    for (const f of files) {
        try {
            total += fs.statSync(f.src).size;
        } catch (e) {}
    }
    return total;
}

// ═══════════════════════════════════════════════════════════════
// CREATE ZIP BACKUP
// ═══════════════════════════════════════════════════════════════
async function createBackupZip(type = 'manual') {
    ensureBackupDir();

    const files = collectFiles();

    if (files.length === 0) {
        throw new Error('Tidak ada file yang bisa di-backup.');
    }

    // Cek ukuran total
    const totalSize = calculateTotalSize(files);
    const totalSizeMB = totalSize / 1024 / 1024;

    if (totalSizeMB > MAX_BACKUP_SIZE_MB) {
        throw new Error(`Ukuran backup terlalu besar (${totalSizeMB.toFixed(2)} MB). Max ${MAX_BACKUP_SIZE_MB} MB.`);
    }

    // Nama file backup
    const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .substring(0, 19);

    const filename = `backup_${type}_${timestamp}.zip`;
    const filePath = path.join(BACKUP_DIR, filename);

    // Buat ZIP
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);

        for (const f of files) {
            try {
                archive.file(f.src, { name: f.rel });
            } catch (err) {
                console.error(`⚠️ Gagal tambah file ${f.rel}:`, err.message);
            }
        }

        archive.finalize();
    });

    const stat = fs.statSync(filePath);
    const sizeKB = (stat.size / 1024).toFixed(2);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

    return {
        filename,
        filepath: filePath,
        size: stat.size,
        sizeKB,
        sizeMB,
        files: files.map(f => f.rel),
        totalFiles: files.length,
        originalSizeMB: totalSizeMB.toFixed(2),
    };
}

// ═══════════════════════════════════════════════════════════════
// SEND BACKUP TO OWNER
// ═══════════════════════════════════════════════════════════════
async function sendBackupToOwner(bot, ownerId, result, type = 'manual') {
    // Pisah file jadi 3 grup untuk preview
    const rootFiles = result.files.filter(f => !f.includes('/') && !f.includes('\\'));
    const folderFiles = result.files.filter(f => f.includes('/') || f.includes('\\'));

    // Preview max 15 root + 15 folder
    const rootPreview = rootFiles.slice(0, 15).map(f => `• ${f}`).join('\n');
    const folderPreview = folderFiles.slice(0, 15).map(f => `• ${f}`).join('\n');

    let caption = `💾 <b>Backup Bot — ${type.toUpperCase()}</b>\n\n`;
    caption += `📁 File: <code>${result.filename}</code>\n`;
    caption += `📦 Total files: <b>${result.totalFiles}</b>\n`;
    caption += `📊 Original: <b>${result.originalSizeMB} MB</b>\n`;
    caption += `🗜️ Compressed: <b>${result.sizeMB} MB</b>\n`;
    caption += `⏰ ${new Date().toLocaleString('id-ID')}\n\n`;

    if (rootPreview) {
        caption += `<b>📄 Root Files:</b>\n<pre>${rootPreview}${rootFiles.length > 15 ? `\n... +${rootFiles.length - 15} lagi` : ''}</pre>\n`;
    }

    if (folderPreview) {
        caption += `<b>📂 Folder Files:</b>\n<pre>${folderPreview}${folderFiles.length > 15 ? `\n... +${folderFiles.length - 15} lagi` : ''}</pre>`;
    }

    // Truncate caption if terlalu panjang
    if (caption.length > 3800) {
        caption = caption.substring(0, 3700) + '\n\n<i>... (dipotong)</i>';
    }

    await bot.telegram.sendDocument(
        ownerId,
        { source: result.filepath, filename: result.filename },
        {
            caption,
            parse_mode: 'HTML',
        }
    );

    return true;
}

// ═══════════════════════════════════════════════════════════════
// LIST BACKUPS
// ═══════════════════════════════════════════════════════════════
function listBackups() {
    ensureBackupDir();

    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const backups = [];

        for (const file of files) {
            if (!file.endsWith('.zip') && !file.endsWith('.json')) continue;

            const fullPath = path.join(BACKUP_DIR, file);
            const stat = fs.statSync(fullPath);

            backups.push({
                filename: file,
                size: stat.size,
                sizeKB: (stat.size / 1024).toFixed(2),
                mtime: stat.mtime,
                type: file.endsWith('.zip') ? 'zip' : 'json',
                filepath: fullPath,
            });
        }

        // Sort by mtime (terbaru dulu)
        backups.sort((a, b) => b.mtime - a.mtime);

        return backups;

    } catch (err) {
        console.error('listBackups error:', err.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE BACKUP
// ═══════════════════════════════════════════════════════════════
function deleteBackup(filename) {
    try {
        const filepath = path.join(BACKUP_DIR, filename);
        if (!fs.existsSync(filepath)) return false;

        fs.unlinkSync(filepath);
        return true;

    } catch (err) {
        console.error('deleteBackup error:', err.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP OLD BACKUPS (simpan N terakhir)
// ═══════════════════════════════════════════════════════════════
function cleanupOldBackups(keepCount = 10) {
    try {
        const backups = listBackups();

        if (backups.length <= keepCount) return 0;

        const toDelete = backups.slice(keepCount);
        let deleted = 0;

        for (const b of toDelete) {
            if (deleteBackup(b.filename)) deleted++;
        }

        console.log(`🧹 Cleanup: ${deleted} backup lama dihapus`);
        return deleted;

    } catch (err) {
        console.error('cleanupOldBackups error:', err.message);
        return 0;
    }
}

// ═══════════════════════════════════════════════════════════════
// GET BACKUP PATH
// ═══════════════════════════════════════════════════════════════
function getBackupPath(filename) {
    const filepath = path.join(BACKUP_DIR, filename);
    return fs.existsSync(filepath) ? filepath : null;
}

// ═══════════════════════════════════════════════════════════════
// RESTORE FROM ZIP
// ═══════════════════════════════════════════════════════════════
async function restoreFromZip(buffer) {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const restored = [];
    const skipped = [];

    // 1. Restore database & config utama dulu
    const priorityFiles = ['bot.db', 'clones.json', 'config.js'];
    const dbFiles = entries.filter(e =>
        priorityFiles.some(p => e.entryName === p || e.entryName.endsWith('/' + p))
    );

    // 2. Restore file lain
    const otherFiles = entries.filter(e =>
        !e.isDirectory && !dbFiles.includes(e)
    );

    // Proses priority dulu
    for (const entry of [...dbFiles, ...otherFiles]) {
        if (entry.isDirectory) continue;

        try {
            // Skip file yang tidak aman
            if (entry.entryName.includes('..')) {
                skipped.push(`${entry.entryName} (path traversal)`);
                continue;
            }

            if (shouldSkip(path.basename(entry.entryName))) {
                skipped.push(`${entry.entryName} (skip pattern)`);
                continue;
            }

            // Path tujuan
            const targetPath = path.join(ROOT_DIR, entry.entryName);

            // Pastikan folder tujuan ada
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Backup file lama (kalau ada) sebelum overwrite
            if (fs.existsSync(targetPath)) {
                try {
                    fs.copyFileSync(targetPath, targetPath + '.pre-restore.bak');
                } catch (e) {}
            }

            // Write file
            fs.writeFileSync(targetPath, entry.getData());
            restored.push(entry.entryName);

        } catch (err) {
            skipped.push(`${entry.entryName} (${err.message})`);
        }
    }

    return {
        message: `Restore selesai: ${restored.length} file dipulihkan`,
        files: restored,
        restored: restored.length,
        skipped: skipped.length,
        skippedFiles: skipped,
        dbRestored: restored.includes('bot.db') || restored.some(f => f.endsWith('/bot.db')),
    };
}

// ═══════════════════════════════════════════════════════════════
// RESTORE FROM BUFFER (JSON)
// ═══════════════════════════════════════════════════════════════
function restoreFromBuffer(buffer) {
    try {
        // Coba parse sebagai JSON
        const json = JSON.parse(buffer.toString('utf8'));

        // Kalau JSON berisi field "backup" atau "data"
        const data = json.backup || json.data || json;

        // Simpan sebagai bot.db? Tergantung database kamu
        // Ini cuma fallback — biasanya restore lewat ZIP
        const targetPath = path.join(ROOT_DIR, 'bot.db');

        if (typeof data === 'object' && !Buffer.isBuffer(data)) {
            // Simpan sebagai JSON
            fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
            return {
                message: 'Restore JSON berhasil (sebagai bot.db)',
                dbRestored: true,
            };
        }

        throw new Error('Format JSON tidak valid');

    } catch (err) {
        throw new Error(`Restore gagal: ${err.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
module.exports = {
    // Paths
    ROOT_DIR,
    BACKUP_DIR,

    // Config
    ROOT_FILES,
    FOLDERS_TO_BACKUP,
    SKIP_PATTERNS,

    // Core functions
    createBackupZip,
    sendBackupToOwner,
    listBackups,
    deleteBackup,
    cleanupOldBackups,
    getBackupPath,
    restoreFromZip,
    restoreFromBuffer,

    // Helpers
    collectFiles,
    calculateTotalSize,
    shouldSkip,
    ensureBackupDir,
};