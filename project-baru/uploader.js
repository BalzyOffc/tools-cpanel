// ═══════════════════════════════════════════════════════════════
// 📄 services/uploader.js — Multi-API Uploader
// API: GitHub, Catbox, Uguu, TmpFiles, 0x0.st
// Fitur: Auto-retry, Auto-fallback, Anti-error
// ═══════════════════════════════════════════════════════════════
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI API
// ═══════════════════════════════════════════════════════════════
const UPLOAD_APIS = {
    // ─── GitHub (Priority 1) ───
    github: {
        name: '🐙 GitHub',
        priority: 1,
        recommended: true,
        handler: uploadToGithub,
        config: {
            token: config.GITHUB_TOKEN || '',
            owner: config.GITHUB_OWNER || '',
            repo: config.GITHUB_REPO || 'bot-uploads',
            branch: config.GITHUB_BRANCH || 'main',
            folder: config.GITHUB_FOLDER || 'uploads',
        },
    },

    // ─── Catbox (Priority 2) ───
    catbox: {
        name: '📦 Catbox',
        priority: 2,
        recommended: true,
        handler: uploadToCatbox,
    },

    // ─── Uguu (Priority 3) ───
    uguu: {
        name: '🌊 Uguu',
        priority: 3,
        recommended: false,
        handler: uploadToUguu,
    },

    // ─── TmpFiles (Priority 4) ───
    tmpfiles: {
        name: '📁 TmpFiles',
        priority: 4,
        recommended: false,
        handler: uploadToTmpFiles,
    },

    // ─── 0x0.st (Priority 5) ───
    zeroxzero: {
        name: '0️⃣ 0x0.st',
        priority: 5,
        recommended: false,
        handler: uploadTo0x0,
    },
};

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI UPLOAD
// ═══════════════════════════════════════════════════════════════
const UPLOAD_CONFIG = {
    timeout: 60000,         // 60 detik
    retryPerApi: 2,         // Coba 2x per API sebelum fallback
    maxSizeMB: 100,         // Max 100 MB (limit GitHub API)
    delayBetweenRetries: 1000, // 1 detik
};

// ═══════════════════════════════════════════════════════════════
// HELPER: Format Size
// ═══════════════════════════════════════════════════════════════
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Sanitize Filename
// ═══════════════════════════════════════════════════════════════
function sanitizeFilename(name) {
    if (!name) return 'file.bin';
    return name
        .replace(/[^a-zA-Z0-9.\-_]/g, '_')  // Hanya alfanumerik, titik, strip, underscore
        .replace(/_{2,}/g, '_')             // Multiple underscore → single
        .substring(0, 100);                 // Max 100 char
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Generate Unique Filename
// ═══════════════════════════════════════════════════════════════
function generateFilename(originalName) {
    const ext = (originalName.split('.').pop() || 'bin').toLowerCase();
    const base = originalName.replace(`.${ext}`, '').substring(0, 30);
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    return sanitizeFilename(`${base}_${timestamp}_${rand}.${ext}`);
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD HANDLER: GitHub
// ═══════════════════════════════════════════════════════════════
async function uploadToGithub(buffer, filename, cfg, logger = console) {
    const { token, owner, repo, branch, folder } = cfg;

    // Validasi config
    if (!token) throw new Error('GITHUB_TOKEN belum diset di config');
    if (!owner) throw new Error('GITHUB_OWNER belum diset di config');
    if (!repo) throw new Error('GITHUB_REPO belum diset di config');

    const safeName = generateFilename(filename);
    const filePath = `${folder}/${safeName}`.replace(/\/+/g, '/');
    const content = buffer.toString('base64');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;

    logger.log?.(`[GitHub] Uploading ${safeName} (${formatSize(buffer.length)}) to ${owner}/${repo}...`);

    const res = await axios.put(apiUrl, {
        message: `📤 Upload: ${safeName} (${new Date().toISOString()})`,
        content,
        branch,
    }, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'TelegramBot-Uploader',
        },
        timeout: UPLOAD_CONFIG.timeout,
        maxContentLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
        maxBodyLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
    });

    if (!res.data || !res.data.content) {
        throw new Error('GitHub upload gagal: response tidak valid');
    }

    const rawUrl = res.data.content.download_url;
    const htmlUrl = res.data.content.html_url;

    logger.log?.(`[GitHub] ✅ Success: ${rawUrl}`);

    return {
        url: rawUrl,
        htmlUrl,
        filename: safeName,
        repoPath: filePath,
    };
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD HANDLER: Catbox
// ═══════════════════════════════════════════════════════════════
async function uploadToCatbox(buffer, filename, logger = console) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { filename });

    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: UPLOAD_CONFIG.timeout,
        maxContentLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
        maxBodyLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
    });

    if (!res.data || !res.data.startsWith('http')) {
        throw new Error('Catbox upload gagal: response bukan URL');
    }

    return {
        url: res.data.trim(),
        filename,
    };
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD HANDLER: Uguu
// ═══════════════════════════════════════════════════════════════
async function uploadToUguu(buffer, filename, logger = console) {
    const form = new FormData();
    form.append('files[]', buffer, { filename });

    const res = await axios.post('https://uguu.se/upload.php', form, {
        headers: form.getHeaders(),
        timeout: UPLOAD_CONFIG.timeout,
        maxContentLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
        maxBodyLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
    });

    if (!res.data || !res.data.success || !res.data.files || !res.data.files[0]) {
        throw new Error('Uguu upload gagal');
    }

    return {
        url: res.data.files[0].url,
        filename: res.data.files[0].filename || filename,
    };
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD HANDLER: TmpFiles
// ═══════════════════════════════════════════════════════════════
async function uploadToTmpFiles(buffer, filename, logger = console) {
    const form = new FormData();
    form.append('file', buffer, { filename });

    const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
        headers: form.getHeaders(),
        timeout: UPLOAD_CONFIG.timeout,
        maxContentLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
        maxBodyLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
    });

    if (!res.data || !res.data.data || !res.data.data.url) {
        throw new Error('TmpFiles upload gagal');
    }

    // Convert: https://tmpfiles.org/12345/file.jpg → https://tmpfiles.org/dl/12345/file.jpg
    const directUrl = res.data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');

    return {
        url: directUrl,
        filename,
    };
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD HANDLER: 0x0.st
// ═══════════════════════════════════════════════════════════════
async function uploadTo0x0(buffer, filename, logger = console) {
    const form = new FormData();
    form.append('file', buffer, { filename });

    const res = await axios.post('https://0x0.st', form, {
        headers: form.getHeaders(),
        timeout: UPLOAD_CONFIG.timeout,
        maxContentLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
        maxBodyLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
    });

    if (!res.data || !res.data.startsWith('http')) {
        throw new Error('0x0.st upload gagal');
    }

    return {
        url: res.data.trim(),
        filename,
    };
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD DENGAN FALLBACK
// ═══════════════════════════════════════════════════════════════
async function uploadWithFallback(buffer, filename, preferredApi = null, logger = console) {
    // Validasi input
    if (!buffer || buffer.length === 0) {
        throw new Error('Buffer kosong');
    }

    if (buffer.length > UPLOAD_CONFIG.maxSizeMB * 1024 * 1024) {
        throw new Error(`File terlalu besar (max ${UPLOAD_CONFIG.maxSizeMB} MB). File kamu: ${formatSize(buffer.length)}`);
    }

    // Urutkan API: preferred dulu, lalu sort by priority
    const apiKeys = Object.keys(UPLOAD_APIS).sort((a, b) => {
        if (a === preferredApi) return -1;
        if (b === preferredApi) return 1;
        return UPLOAD_APIS[a].priority - UPLOAD_APIS[b].priority;
    });

    let lastError = null;
    const startTime = Date.now();

    for (const key of apiKeys) {
        const api = UPLOAD_APIS[key];
        if (!api || !api.handler) continue;

        // Skip GitHub kalau token belum diset
        if (key === 'github' && !api.config?.token) {
            logger.log?.(`[Upload] GitHub skip: token belum diset`);
            continue;
        }

        // Retry logic
        for (let retry = 0; retry < UPLOAD_CONFIG.retryPerApi; retry++) {
            try {
                logger.log?.(`[Upload] Trying ${api.name} (attempt ${retry + 1})...`);

                const result = await api.handler(buffer, filename, api.config || {}, logger);

                // Sukses
                return {
                    url: result.url,
                    apiUsed: api.name,
                    filename: result.filename || filename,
                    fallback: key !== preferredApi,
                    retries: retry,
                    durationMs: Date.now() - startTime,
                    extra: result,
                };

            } catch (err) {
                lastError = err;
                logger.error?.(`[Upload] ${api.name} failed: ${err.message}`);

                // Kalau error karena token/config, jangan retry — langsung skip API ini
                if (
                    err.message.includes('belum diset') ||
                    (err.message.includes('invalid') && err.message.includes('token')) ||
                    err.response?.status === 401 ||
                    err.response?.status === 403
                ) {
                    break;
                }

                // Delay sebelum retry
                if (retry < UPLOAD_CONFIG.retryPerApi - 1) {
                    await new Promise(r => setTimeout(r, UPLOAD_CONFIG.delayBetweenRetries * (retry + 1)));
                }
            }
        }
    }

    // Semua API gagal
    throw new Error(`Semua API upload gagal. Error terakhir: ${lastError?.message || 'Unknown'}`);
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD DARI FILE TELEGRAM
// ═══════════════════════════════════════════════════════════════
async function uploadFromTelegramFile(ctx, fileId, preferredApi = null, logger = console) {
    const fileLink = await ctx.telegram.getFileLink(fileId);

    const res = await axios.get(fileLink.href, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: UPLOAD_CONFIG.maxSizeMB * 1024 * 1024,
    });

    const buffer = Buffer.from(res.data);
    const filename = fileLink.path.split('/').pop() || 'file.bin';

    return await uploadWithFallback(buffer, filename, preferredApi, logger);
}

// ═══════════════════════════════════════════════════════════════
// TEST GITHUB CONFIG
// ═══════════════════════════════════════════════════════════════
async function testGithubConfig() {
    const cfg = UPLOAD_APIS.github.config;

    if (!cfg.token) return { ok: false, error: 'GITHUB_TOKEN belum diset di config.js' };
    if (!cfg.owner) return { ok: false, error: 'GITHUB_OWNER belum diset di config.js' };
    if (!cfg.repo) return { ok: false, error: 'GITHUB_REPO belum diset di config.js' };

    try {
        // Cek user
        const userRes = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${cfg.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout: 10000,
        });

        // Cek repo
        const repoRes = await axios.get(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
            headers: {
                'Authorization': `Bearer ${cfg.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout: 10000,
        });

        return {
            ok: true,
            user: userRes.data.login,
            repo: repoRes.data.full_name,
            private: repoRes.data.private,
            permissions: repoRes.data.permissions,
        };

    } catch (err) {
        return {
            ok: false,
            error: err.response?.data?.message || err.message,
            status: err.response?.status,
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
module.exports = {
    UPLOAD_APIS,
    UPLOAD_CONFIG,
    uploadWithFallback,
    uploadFromTelegramFile,
    formatSize,
    sanitizeFilename,
    generateFilename,
    testGithubConfig,
};