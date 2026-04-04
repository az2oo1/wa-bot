const express = require('express');
const { Client, LocalAuth, Poll, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Database = require('better-sqlite3');
const util = require('util');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const renderDashboard = require('./UI.js');

// Ensure media storage directory exists
if (!fs.existsSync('./media')) fs.mkdirSync('./media');

function ensureDashboardLogo() {
    const publicDir = path.join(process.cwd(), 'public');
    const logoPath = path.join(publicDir, 'logo.png');

    try {
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        if (fs.existsSync(logoPath) && fs.statSync(logoPath).isFile()) return;

        const rootFiles = fs.readdirSync(process.cwd(), { withFileTypes: true })
            .filter(entry => entry.isFile())
            .map(entry => entry.name);

        const imageCandidates = rootFiles.filter(name => /\.(png|jpg|jpeg|webp)$/i.test(name));
        const firstImage = imageCandidates.find(name => name.toLowerCase() !== 'logo.png');

        if (firstImage) {
            fs.copyFileSync(path.join(process.cwd(), firstImage), logoPath);
            console.log(`[UI] Seeded missing logo from ${firstImage} -> public/logo.png`);
        }
    } catch (err) {
        console.error(`[UI] Failed to ensure dashboard logo: ${err.message || err}`);
    }
}

ensureDashboardLogo();

// Multer: dynamic storage per group
const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join('./media', req.params.groupId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Preserve original name but make it safe
        const safe = file.originalname.replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g, '_');
        cb(null, safe);
    }
});
const upload = multer({ storage: mediaStorage, limits: { fileSize: 64 * 1024 * 1024 } }); // 64 MB max

const logsHistory = [];
const origLog = console.log;
const origErr = console.error;

function saveLog(type, args) {
    const time = new Date().toLocaleTimeString('ar-SA', { hour12: false });
    const msg = util.format(...args);
    logsHistory.push(`[${time}] [${type}] ${msg}`);
    if (logsHistory.length > 200) logsHistory.shift();
}

function toLogPreview(value, maxLen = 140) {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
}

function compactMsgId(value) {
    if (typeof value !== 'string' || value.length === 0) return 'n/a';
    if (value.length <= 24) return value;
    return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function unfoldVCardLines(vcardText) {
    if (typeof vcardText !== 'string') return [];
    const lines = vcardText.replace(/\r/g, '').split('\n');
    const unfolded = [];
    for (const line of lines) {
        if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
            unfolded[unfolded.length - 1] += line.trim();
        } else {
            unfolded.push(line);
        }
    }
    return unfolded;
}

function extractVCardValue(unfoldedLines, key) {
    const upperKey = `${key.toUpperCase()}`;
    const line = unfoldedLines.find(l => l.toUpperCase().startsWith(`${upperKey}`) && l.includes(':'));
    if (!line) return '';
    return line.slice(line.indexOf(':') + 1).trim();
}

function formatVCardForDisplay(vcardText) {
    const lines = unfoldVCardLines(vcardText);
    if (lines.length === 0) return '';

    const fn = extractVCardValue(lines, 'FN');
    const tel = extractVCardValue(lines, 'TEL');

    const altName = (() => {
        const nValue = extractVCardValue(lines, 'N');
        if (!nValue) return '';
        const parts = nValue.split(';').map(p => p.trim()).filter(Boolean);
        return parts.join(' ');
    })();

    const displayName = fn || altName || 'بدون اسم';
    const displayPhone = tel || 'غير متوفر';
    return `جهة اتصال: ${displayName} (${displayPhone})`;
}

function formatVCardsForDisplay(vcards) {
    if (!Array.isArray(vcards) || vcards.length === 0) return '';
    const parsed = vcards
        .map(formatVCardForDisplay)
        .filter(Boolean);
    if (parsed.length === 0) return '';
    return parsed.join('\n');
}

function stripRawVCardBlocks(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/BEGIN:VCARD[\s\S]*?END:VCARD/gi, '').trim();
}

function normalizeAdminLang(value) {
    return value === 'en' ? 'en' : 'ar';
}

function resolveAdminLang(groupConfig, conf) {
    const defaultLang = normalizeAdminLang(conf && conf.defaultAdminLanguage ? conf.defaultAdminLanguage : 'ar');
    if (!groupConfig || !groupConfig.adminLanguage || groupConfig.adminLanguage === 'default') return defaultLang;
    return normalizeAdminLang(groupConfig.adminLanguage);
}

function tAdmin(groupConfig, conf, arText, enText) {
    return resolveAdminLang(groupConfig, conf) === 'en' ? enText : arText;
}

console.log = (...args) => { origLog(...args); saveLog('معلومة', args); };
console.error = (...args) => { origErr(...args); saveLog('خطأ', args); };

function resolveDbPath() {
    if (process.env.WA_DB_PATH && process.env.WA_DB_PATH.trim()) {
        return process.env.WA_DB_PATH.trim();
    }
    if (process.env.WA_DATA_DIR && process.env.WA_DATA_DIR.trim()) {
        return path.join(process.env.WA_DATA_DIR.trim(), 'bot_data.sqlite');
    }
    return path.join(process.cwd(), 'bot_data.sqlite');
}

function ensureDbPathReady(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        if (stat.isDirectory()) {
            throw new Error(`[DB] Invalid database path: ${dbPath} points to a directory.`);
        }
    }

    // Ensure SQLite file exists without truncating existing data.
    fs.closeSync(fs.openSync(dbPath, 'a'));
}

function openDatabaseWithFallback() {
    const primaryPath = resolveDbPath();
    const fallbackPath = path.join('/tmp', 'wa-bot', 'bot_data.sqlite');
    const hasExplicitDbPath = Boolean(
        (process.env.WA_DB_PATH && process.env.WA_DB_PATH.trim()) ||
        (process.env.WA_DATA_DIR && process.env.WA_DATA_DIR.trim())
    );
    const allowTmpFallback = process.env.WA_ALLOW_TMP_DB_FALLBACK === 'true';
    const candidates = allowTmpFallback ? [primaryPath, fallbackPath] : [primaryPath];

    for (const dbPath of candidates) {
        try {
            ensureDbPathReady(dbPath);
            const openedDb = new Database(dbPath);
            console.log(`[DB] Using database file: ${dbPath}`);
            return openedDb;
        } catch (err) {
            console.error(`[DB] Failed to open database at ${dbPath}: ${err.message || err}`);
        }
    }

    if (!allowTmpFallback) {
        throw new Error(`Could not open configured SQLite database path: ${primaryPath}. Temporary fallback is disabled.`);
    }

    throw new Error('Could not open any writable SQLite database path.');
}

const db = openDatabaseWithFallback();
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS llm_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS blacklist (number TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS blocked_extensions (ext TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS whitelist (number TEXT PRIMARY KEY); 
    CREATE TABLE IF NOT EXISTS whatsapp_groups (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS custom_groups (
        group_id TEXT PRIMARY KEY, admin_group TEXT, use_default_words INTEGER,
        enable_word_filter INTEGER, enable_ai_filter INTEGER, enable_ai_media INTEGER,
        auto_action INTEGER, enable_blacklist INTEGER, enable_anti_spam INTEGER,
        spam_duplicate_limit INTEGER, spam_flood_limit INTEGER, spam_action TEXT,
        enable_welcome_message INTEGER, welcome_message_text TEXT, custom_words TEXT,
        custom_ai_trigger_words TEXT,
        enable_join_profile_screening INTEGER
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_superadmin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permission_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        permissions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_permission_groups (
        user_id INTEGER NOT NULL,
        permission_group_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, permission_group_id),
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_group_id) REFERENCES permission_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_group_access (
        user_id INTEGER NOT NULL,
        wa_group_id TEXT NOT NULL,
        PRIMARY KEY (user_id, wa_group_id),
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );
`);

const colsToAdd = [
    'blocked_types TEXT', 'blocked_action TEXT', 'spam_types TEXT', 'spam_limits TEXT',
    'enable_panic_mode INTEGER', 'panic_message_limit INTEGER', 'panic_time_window INTEGER',
    'panic_lockout_duration INTEGER', 'panic_alert_target TEXT', 'panic_alert_message TEXT',
    'enable_whitelist INTEGER', 'custom_blacklist TEXT', 'custom_whitelist TEXT',
    'use_global_blacklist INTEGER', 'use_global_whitelist INTEGER',
    'enable_qa_feature INTEGER', 'custom_qa TEXT', 'qa_event_date TEXT', 'qa_language TEXT', 'qa_event_dates TEXT',
    'admin_language TEXT', 'custom_ai_trigger_words TEXT', 'enable_join_profile_screening INTEGER'
];
colsToAdd.forEach(col => {
    try { db.exec(`ALTER TABLE custom_groups ADD COLUMN ${col}`); } catch (e) { }
});

function loadConfigFromDB() {
    let newConfig = {
        enableWordFilter: true, enableAIFilter: false, enableAIMedia: false,
        autoAction: false, enableBlacklist: true, enableWhitelist: true, enableAntiSpam: false,
        enableJoinProfileScreening: false,
        safeMode: false,
        spamDuplicateLimit: 3, spamFloodLimit: 5, spamAction: 'poll',
        blockedTypes: [], blockedAction: 'delete',
        spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
        spamLimits: { text: 7, image: 3, video: 2, audio: 3, document: 3, sticker: 3 },
        defaultAdminGroup: '', defaultAdminLanguage: 'ar', defaultWords: [], aiPrompt: 'امنع أي رسالة تحتوي على إعلانات تجارية.',
        aiFilterTriggerWords: ['نعم'],
        ollamaUrl: 'http://localhost:11434', ollamaModel: 'llava', groupsConfig: {}
    };

    db.prepare('SELECT * FROM global_settings').all().forEach(row => {
        if (['defaultWords', 'blockedTypes', 'spamTypes', 'spamLimits', 'aiFilterTriggerWords'].includes(row.key)) newConfig[row.key] = JSON.parse(row.value);
        else if (['enableWordFilter', 'enableAIFilter', 'enableAIMedia', 'autoAction', 'enableBlacklist', 'enableWhitelist', 'enableAntiSpam', 'safeMode', 'enableJoinProfileScreening'].includes(row.key)) {
            newConfig[row.key] = row.value === '1';
        } else if (['spamDuplicateLimit', 'spamFloodLimit'].includes(row.key)) {
            newConfig[row.key] = parseInt(row.value, 10);
        } else newConfig[row.key] = row.value;
    });

    db.prepare('SELECT * FROM llm_settings').all().forEach(row => { newConfig[row.key] = row.value; });

    db.prepare('SELECT * FROM custom_groups').all().forEach(g => {
        newConfig.groupsConfig[g.group_id] = {
            adminGroup: g.admin_group, useDefaultWords: g.use_default_words === 1,
            adminLanguage: g.admin_language || 'default',
            enableWordFilter: g.enable_word_filter === 1, enableAIFilter: g.enable_ai_filter === 1,
            enableAIMedia: g.enable_ai_media === 1, autoAction: g.auto_action === 1,
            enableBlacklist: g.enable_blacklist === 1, enableWhitelist: g.enable_whitelist !== 0,
            useGlobalBlacklist: g.use_global_blacklist !== 0, useGlobalWhitelist: g.use_global_whitelist !== 0,
            customBlacklist: JSON.parse(g.custom_blacklist || '[]'), customWhitelist: JSON.parse(g.custom_whitelist || '[]'),
            enableAntiSpam: g.enable_anti_spam === 1, spamDuplicateLimit: g.spam_duplicate_limit,
            spamFloodLimit: g.spam_flood_limit, spamAction: g.spam_action,
            enableWelcomeMessage: g.enable_welcome_message === 1, welcomeMessageText: g.welcome_message_text,
            words: JSON.parse(g.custom_words || '[]'), blockedTypes: JSON.parse(g.blocked_types || '[]'),
            blockedAction: g.blocked_action || 'delete', spamTypes: JSON.parse(g.spam_types || '["text", "image", "video", "audio", "document", "sticker"]'),
            spamLimits: JSON.parse(g.spam_limits || '{"text":7,"image":3,"video":2,"audio":3,"document":3,"sticker":3}'),
            enablePanicMode: g.enable_panic_mode === 1, panicMessageLimit: g.panic_message_limit || 10,
            panicTimeWindow: g.panic_time_window || 5, panicLockoutDuration: g.panic_lockout_duration || 10,
            panicAlertTarget: g.panic_alert_target || 'both', panicAlertMessage: g.panic_alert_message || '🚨 تم رصد هجوم (Raid)! تم إغلاق المجموعة لمدة {time} دقائق.',
            enableQAFeature: g.enable_qa_feature === 1, qaList: JSON.parse(g.custom_qa || '[]'), eventDate: g.qa_event_date || '', qaLanguage: g.qa_language || 'ar', eventDates: JSON.parse(g.qa_event_dates || '[]'),
            aiFilterTriggerWords: JSON.parse(g.custom_ai_trigger_words || '[]'),
            enableJoinProfileScreening: g.enable_join_profile_screening === 1
        };
    });
    return newConfig;
}

function syncTx(chats) {
    const tx = db.transaction(() => {
        const stmt = db.prepare('INSERT OR REPLACE INTO whatsapp_groups (id, name) VALUES (?, ?)');
        for (const chat of chats) {
            try {
                if (chat.isGroup) {
                    const groupId = chat.id._serialized;
                    stmt.run(groupId, chat.name);
                }
            } catch (error) {
                console.error(`[خطأ] فشل مزامنة المجموعة: ${chat.name}`, error.message);
            }
        }
    });
    tx();
}

function saveConfigToDB(conf) {
    const saveTx = db.transaction(() => {
        const setGlobal = db.prepare('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)');
        setGlobal.run('enableWordFilter', conf.enableWordFilter ? '1' : '0');
        setGlobal.run('enableAIFilter', conf.enableAIFilter ? '1' : '0');
        setGlobal.run('enableAIMedia', conf.enableAIMedia ? '1' : '0');
        setGlobal.run('autoAction', conf.autoAction ? '1' : '0');
        setGlobal.run('enableBlacklist', conf.enableBlacklist ? '1' : '0');
        setGlobal.run('enableWhitelist', conf.enableWhitelist ? '1' : '0');
        setGlobal.run('enableAntiSpam', conf.enableAntiSpam ? '1' : '0');
        setGlobal.run('enableJoinProfileScreening', conf.enableJoinProfileScreening ? '1' : '0');
        setGlobal.run('safeMode', conf.safeMode ? '1' : '0');
        setGlobal.run('spamDuplicateLimit', conf.spamDuplicateLimit.toString());
        setGlobal.run('spamAction', conf.spamAction);
        setGlobal.run('blockedTypes', JSON.stringify(conf.blockedTypes));
        setGlobal.run('blockedAction', conf.blockedAction);
        setGlobal.run('spamTypes', JSON.stringify(conf.spamTypes));
        setGlobal.run('spamLimits', JSON.stringify(conf.spamLimits));
        setGlobal.run('defaultAdminGroup', conf.defaultAdminGroup);
        setGlobal.run('defaultAdminLanguage', normalizeAdminLang(conf.defaultAdminLanguage));
        setGlobal.run('defaultWords', JSON.stringify(conf.defaultWords));
        setGlobal.run('aiFilterTriggerWords', JSON.stringify(conf.aiFilterTriggerWords || ['نعم']));

        const setLLM = db.prepare('INSERT OR REPLACE INTO llm_settings (key, value) VALUES (?, ?)');
        setLLM.run('aiPrompt', conf.aiPrompt); setLLM.run('ollamaUrl', conf.ollamaUrl); setLLM.run('ollamaModel', conf.ollamaModel);

        db.prepare('DELETE FROM custom_groups').run();
        const insertGroup = db.prepare(`
            INSERT INTO custom_groups (
                group_id, admin_group, admin_language, use_default_words, enable_word_filter, enable_ai_filter, 
                enable_ai_media, auto_action, enable_blacklist, enable_whitelist, enable_anti_spam, spam_duplicate_limit, 
                spam_action, enable_welcome_message, welcome_message_text, custom_words,
                blocked_types, blocked_action, spam_types, spam_limits,
                enable_panic_mode, panic_message_limit, panic_time_window, panic_lockout_duration,
                panic_alert_target, panic_alert_message, custom_blacklist, custom_whitelist, use_global_blacklist, use_global_whitelist,
                enable_qa_feature, custom_qa, qa_event_date, qa_language, qa_event_dates, custom_ai_trigger_words, enable_join_profile_screening
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [gId, gData] of Object.entries(conf.groupsConfig)) {
            insertGroup.run(
                gId, gData.adminGroup, gData.adminLanguage || 'default', gData.useDefaultWords ? 1 : 0, gData.enableWordFilter ? 1 : 0,
                gData.enableAIFilter ? 1 : 0, gData.enableAIMedia ? 1 : 0, gData.autoAction ? 1 : 0,
                gData.enableBlacklist ? 1 : 0, gData.enableWhitelist ? 1 : 0, gData.enableAntiSpam ? 1 : 0, gData.spamDuplicateLimit,
                gData.spamAction, gData.enableWelcomeMessage ? 1 : 0, gData.welcomeMessageText, JSON.stringify(gData.words),
                JSON.stringify(gData.blockedTypes || []), gData.blockedAction || 'delete',
                JSON.stringify(gData.spamTypes || []), JSON.stringify(gData.spamLimits || {}),
                gData.enablePanicMode ? 1 : 0, gData.panicMessageLimit, gData.panicTimeWindow,
                gData.panicLockoutDuration, gData.panicAlertTarget, gData.panicAlertMessage,
                JSON.stringify(gData.customBlacklist || []), JSON.stringify(gData.customWhitelist || []),
                gData.useGlobalBlacklist ? 1 : 0, gData.useGlobalWhitelist ? 1 : 0,
                gData.enableQAFeature ? 1 : 0, JSON.stringify(gData.qaList || []), gData.eventDate || '', gData.qaLanguage || 'ar', JSON.stringify(gData.eventDates || []), JSON.stringify(gData.aiFilterTriggerWords || []), gData.enableJoinProfileScreening ? 1 : 0
            );
        }
    });
    saveTx();
}

const SESSION_COOKIE_NAME = 'wa_bot_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessionStore = new Map();

const DEFAULT_PERMISSION_GROUPS = [
    {
        name: 'Viewer',
        description: 'Read-only dashboard access',
        permissions: ['dashboard:read', 'groups:view', 'logs:view']
    },
    {
        name: 'Group Manager',
        description: 'Manage scoped groups and media',
        permissions: ['dashboard:read', 'groups:view', 'groups:manage-scoped', 'config:write-scoped', 'media:manage', 'logs:view']
    },
    {
        name: 'Security Manager',
        description: 'Manage security lists and anti-abuse actions',
        permissions: ['dashboard:read', 'groups:view', 'security:manage', 'logs:view']
    },
    {
        name: 'Operator',
        description: 'Daily operations with import/export and bot actions',
        permissions: ['dashboard:read', 'groups:view', 'config:write', 'security:manage', 'media:manage', 'import-export:manage', 'bot:logout', 'logs:view', 'users:manage']
    }
];

function nowIso() {
    return new Date().toISOString();
}

function sanitizeUsername(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
}

function parseJsonArray(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function normalizePermissionGroupName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizePermissionList(values) {
    if (!Array.isArray(values)) return [];
    const cleaned = values
        .map(v => String(v || '').trim())
        .filter(Boolean);
    return Array.from(new Set(cleaned));
}

function hashPassword(password, saltHex) {
    const salt = saltHex || crypto.randomBytes(16).toString('hex');
    const digest = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
    const [salt, savedDigestHex] = storedHash.split(':');
    const actualDigestHex = crypto.scryptSync(password, salt, 64).toString('hex');
    const savedDigest = Buffer.from(savedDigestHex, 'hex');
    const actualDigest = Buffer.from(actualDigestHex, 'hex');
    if (savedDigest.length !== actualDigest.length) return false;
    return crypto.timingSafeEqual(savedDigest, actualDigest);
}

function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    return header.split(';').reduce((acc, segment) => {
        const idx = segment.indexOf('=');
        if (idx === -1) return acc;
        const key = decodeURIComponent(segment.slice(0, idx).trim());
        const val = decodeURIComponent(segment.slice(idx + 1).trim());
        acc[key] = val;
        return acc;
    }, {});
}

function setSessionCookie(res, token, ttlMs = SESSION_TTL_MS) {
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSeconds = Math.max(1, Math.floor((ttlMs || SESSION_TTL_MS) / 1000));
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessionStore.entries()) {
        if (!session || session.expiresAt <= now) {
            sessionStore.delete(token);
        }
    }
}

setInterval(cleanupExpiredSessions, 15 * 60 * 1000).unref();

function ensureDefaultPermissionGroups() {
    const upsert = db.prepare(`
        INSERT INTO permission_groups (name, description, permissions)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            description = excluded.description,
            permissions = excluded.permissions
    `);
    for (const group of DEFAULT_PERMISSION_GROUPS) {
        upsert.run(group.name, group.description, JSON.stringify(group.permissions));
    }
}

function ensureBootstrapAdmin() {
    const count = db.prepare('SELECT COUNT(*) AS count FROM app_users').get().count;
    if (count > 0) return;

    const username = 'admin';
    const password = 'admin123';
    const timestamp = nowIso();
    const insertUser = db.prepare(`
        INSERT INTO app_users (username, password_hash, display_name, is_active, is_superadmin, created_at, updated_at)
        VALUES (?, ?, ?, 1, 1, ?, ?)
    `);
    const info = insertUser.run(username, hashPassword(password), 'System Admin', timestamp, timestamp);
    db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)')
        .run(Number(info.lastInsertRowid), 'must_change_credentials', '1');
    console.log('[Auth] Created bootstrap superadmin user: admin / admin123 (change immediately).');
}

function getUserByUsername(username) {
    return db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);
}

function getUserById(userId) {
    return db.prepare('SELECT * FROM app_users WHERE id = ?').get(userId);
}

function isDefaultCredentialChangeRequired(userId) {
    const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, 'must_change_credentials');
    return Boolean(row && row.value === '1');
}

function setDefaultCredentialChangeRequired(userId, required) {
    if (required) {
        db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)')
            .run(userId, 'must_change_credentials', '1');
        return;
    }
    db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, 'must_change_credentials');
}

function shouldShowDefaultLoginHint() {
    const row = db.prepare("SELECT COUNT(*) AS count FROM user_settings WHERE key = 'must_change_credentials' AND value = '1'").get();
    return row && row.count > 0;
}

function ensureLegacyBootstrapCredentialChangeFlag() {
    const adminUser = getUserByUsername('admin');
    if (!adminUser) return;
    if (isDefaultCredentialChangeRequired(adminUser.id)) return;
    if (verifyPassword('admin123', adminUser.password_hash)) {
        setDefaultCredentialChangeRequired(adminUser.id, true);
        console.log('[Auth] Marked legacy bootstrap admin account to require credential change.');
    }
}

function getEffectivePermissions(user) {
    if (!user || user.is_active !== 1) return [];
    if (user.is_superadmin === 1) return ['*'];

    const rows = db.prepare(`
        SELECT pg.permissions
        FROM user_permission_groups upg
        JOIN permission_groups pg ON pg.id = upg.permission_group_id
        WHERE upg.user_id = ?
    `).all(user.id);

    const merged = new Set();
    rows.forEach(r => parseJsonArray(r.permissions).forEach(p => merged.add(String(p))));
    return Array.from(merged);
}

function hasPermission(user, permission) {
    const permissions = getEffectivePermissions(user);
    return permissions.includes('*') || permissions.includes(permission);
}

function getAllowedGroupIds(user) {
    if (!user || user.is_superadmin === 1) return null;
    const rows = db.prepare('SELECT wa_group_id FROM user_group_access WHERE user_id = ?').all(user.id);
    return new Set(rows.map(r => r.wa_group_id));
}

function createSession(userId, ttlMs = SESSION_TTL_MS) {
    const token = crypto.randomBytes(32).toString('hex');
    const effectiveTtl = Math.max(1, Number(ttlMs) || SESSION_TTL_MS);
    sessionStore.set(token, { userId, ttlMs: effectiveTtl, expiresAt: Date.now() + effectiveTtl });
    return token;
}

function destroySession(req, res) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) sessionStore.delete(token);
    clearSessionCookie(res);
}

function requireAuthApi(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token || !sessionStore.has(token)) return res.status(401).json({ error: 'Unauthorized' });

    const session = sessionStore.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Session expired' });
    }

    const user = getUserById(session.userId);
    if (!user || user.is_active !== 1) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.status(401).json({ error: 'User inactive or not found' });
    }

    const ttlMs = session.ttlMs || SESSION_TTL_MS;
    session.ttlMs = ttlMs;
    session.expiresAt = Date.now() + ttlMs;
    req.authUser = user;
    req.authPermissions = getEffectivePermissions(user);
    next();
}

function requireAuthPage(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token || !sessionStore.has(token)) return res.redirect('/login');

    const session = sessionStore.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.redirect('/login');
    }

    const user = getUserById(session.userId);
    if (!user || user.is_active !== 1) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.redirect('/login');
    }

    const ttlMs = session.ttlMs || SESSION_TTL_MS;
    session.ttlMs = ttlMs;
    session.expiresAt = Date.now() + ttlMs;
    req.authUser = user;
    req.authPermissions = getEffectivePermissions(user);
    next();
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' });
        if (hasPermission(req.authUser, permission)) return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}

function normalizeUserAccessPayload(payload) {
    const permissionGroupIds = Array.isArray(payload.permissionGroupIds) ? payload.permissionGroupIds.map(n => parseInt(n, 10)).filter(Number.isFinite) : [];
    const allowedGroupIds = Array.isArray(payload.allowedGroupIds) ? payload.allowedGroupIds.map(g => String(g)) : [];
    const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
    return { permissionGroupIds, allowedGroupIds, settings };
}

ensureDefaultPermissionGroups();
ensureBootstrapAdmin();
ensureLegacyBootstrapCredentialChangeFlag();

if (db.prepare('SELECT count(*) as count FROM global_settings').get().count === 0) saveConfigToDB(loadConfigFromDB());
let config = loadConfigFromDB();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

let currentQR = '';
let botStatus = '<i class="fas fa-spinner fa-spin"></i> جاري تهيئة النظام وبدء التشغيل...';
let botStatusKind = 'initializing';
const userTrackers = new Map(); const abortedMessages = new Set(); const spamMutedUsers = new Map();
const groupRaidTrackers = new Map(); const lockedGroups = new Set();
const joinProfileReviewCache = new Map();

// Client initialization tracking and debugging
let isInitializing = false;
let initializationTimeout = null;
let initializationStartTime = null;
let lastConnectionTimestamp = null;
let clientConnectionHistory = [];

function addConnectionLog(status, details = '') {
    const timestamp = new Date().toLocaleTimeString('ar-SA', { hour12: false });
    const logEntry = `[${timestamp}] Status: ${status}${details ? ` | Details: ${details}` : ''}`;
    clientConnectionHistory.push(logEntry);
    if (clientConnectionHistory.length > 100) clientConnectionHistory.shift();
    console.log(`[اتصال] ${logEntry}`);
}

app.get('/login', (req, res) => {
        const lang = req.headers.cookie && req.headers.cookie.includes('bot_lang=en') ? 'en' : 'ar';
        const dir = lang === 'en' ? 'ltr' : 'rtl';
        const t = (ar, en) => lang === 'en' ? en : ar;
    const showDefaultHint = shouldShowDefaultLoginHint();
        const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${t('تسجيل الدخول', 'Sign In')}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root{--bg:#080c10;--card-bg:#131920;--card-border:#1e2830;--input-bg:#0a0f14;--input-border:#1e2830;--text:#dce8f5;--text-muted:#6b8099;--accent:#00c853;--accent-dim:rgba(0,200,83,.12);--red:#ff5252;--blue:#40c4ff}
        *{box-sizing:border-box} html,body{margin:0;padding:0}
        body{font-family:'IBM Plex Sans Arabic',sans-serif;background:radial-gradient(circle at 0 0,#0f1720 0,#080c10 45%,#070a0d 100%);color:var(--text);min-height:100vh;display:grid;place-items:center;padding:18px}
        .card{width:min(96vw,460px);background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
        .brand{display:flex;align-items:center;gap:12px;margin-bottom:12px}
        .brand .icon{width:80px;height:80px;border-radius:14px;background:transparent;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;box-shadow:none;overflow:hidden}
        .brand .icon img{width:100%;height:100%;object-fit:cover}
        h1{margin:0;font-size:25px}
        p{margin:4px 0 0;color:var(--text-muted)}
        label{display:block;margin:14px 0 6px;font-weight:700;color:var(--text-muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
        input{width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid var(--input-border);background:var(--input-bg);color:var(--text);font-family:inherit}
        input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
        .btn{margin-top:15px;width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid rgba(0,200,83,.45);background:var(--accent-dim);color:var(--accent);font-weight:700;cursor:pointer;font-size:15px;transition:all .2s}
        .btn:hover{transform:translateY(-1px);filter:none;box-shadow:none}
        .lang-row{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
        .lang-btn{border:1.5px solid rgba(64,196,255,.45);background:rgba(64,196,255,.1);color:var(--blue);padding:6px 10px;border-radius:10px;cursor:pointer;font-weight:700;transition:all .2s}
        .lang-btn:hover{transform:translateY(-1px);filter:none;box-shadow:none}
        .hint{margin-top:12px;color:#ffd68a;font-size:13px}
        .error{margin-top:8px;color:#ff9f9f;min-height:19px}
        .input-wrap{position:relative}
        .input-wrap input{padding-inline-end:48px}
        [dir="rtl"] .input-wrap input{padding-inline-end:14px;padding-inline-start:48px}
        .peek-btn{position:absolute;top:50%;transform:translateY(-50%);right:12px;background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px;line-height:1;border-radius:8px;transition:color .2s}
        .peek-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .peek-btn:hover{color:var(--accent)}
        [dir="rtl"] .peek-btn{left:12px;right:auto}
        .form-options{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
        .remember-toggle{display:inline-flex}
        .remember-toggle input{display:none}
        .remember-chip{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1.5px solid var(--card-border);background:var(--input-bg);color:var(--text-muted);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}
        .remember-toggle input:checked + .remember-chip{border-color:rgba(0,200,83,.45);background:var(--accent-dim);color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
        .remember-note{font-size:12px;color:var(--text-muted)}
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <div class="icon"><img src="/public/logo.png" alt="Bot Logo" onerror="this.style.display='none';document.querySelector('.brand .icon i')?.style.display='flex';"><i class="fas fa-robot" style="display:none"></i></div>
            <div>
                <h1>WA Bot</h1>
                <p>${t('تسجيل الدخول للوصول إلى لوحة التحكم', 'Sign in to access dashboard controls')}</p>
            </div>
        </div>
        <form id="loginForm">
            <label for="username">${t('اسم المستخدم', 'Username')}</label>
            <input id="username" name="username" autocomplete="username" required>
            <label for="password">${t('كلمة المرور', 'Password')}</label>
            <div class="input-wrap">
                <input id="password" name="password" type="password" autocomplete="current-password" required>
                <button type="button" class="peek-btn" id="passwordPeek" aria-label="${t('إظهار كلمة المرور', 'Show password')}" aria-pressed="false">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
            <div class="form-options">
                <label class="remember-toggle">
                    <input type="checkbox" id="rememberMe" name="rememberMe">
                    <span class="remember-chip"><i class="fas fa-lock"></i> ${t('إبقني مسجلاً للدخول', 'Keep me logged in')}</span>
                </label>
                <span class="remember-note">${t('تجنب استخدام هذا الخيار على الأجهزة المشتركة.', 'Avoid using this on shared devices.')}</span>
            </div>
            <button class="btn" type="submit">${t('تسجيل الدخول', 'Sign In')}</button>
            <div class="error" id="error"></div>
            ${showDefaultHint ? `<div class="hint">${t('بيانات الدخول الافتراضية أول مرة: admin / admin123', 'Default first login: admin / admin123')}</div>` : ''}
            <div class="lang-row">
                <span style="color:var(--text-muted);font-size:12px">${t('اللغة', 'Language')}</span>
                <button class="lang-btn" type="button" onclick="switchLanguage()">${lang === 'en' ? 'AR' : 'EN'}</button>
            </div>
        </form>
    </div>
    <script>
        const dict = {
            login_failed: '${t('فشل تسجيل الدخول', 'Login failed')}',
            show_password: '${t('إظهار كلمة المرور', 'Show password')}',
            hide_password: '${t('إخفاء كلمة المرور', 'Hide password')}'
        };
        const form = document.getElementById('loginForm');
        const err = document.getElementById('error');
        const passwordInput = document.getElementById('password');
        const peekBtn = document.getElementById('passwordPeek');
        const rememberInput = document.getElementById('rememberMe');

        if (peekBtn && passwordInput) {
            peekBtn.addEventListener('click', () => {
                const reveal = passwordInput.type === 'password';
                passwordInput.type = reveal ? 'text' : 'password';
                peekBtn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
                peekBtn.setAttribute('aria-label', reveal ? dict.hide_password : dict.show_password);
                peekBtn.innerHTML = reveal ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
                passwordInput.focus();
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            err.textContent = '';
            const payload = {
                username: document.getElementById('username').value,
                password: passwordInput ? passwordInput.value : '',
                rememberMe: rememberInput ? rememberInput.checked : false
            };
            const res = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: dict.login_failed }));
                err.textContent = data.error || dict.login_failed;
                return;
            }
            window.location.href = '/';
        });

        function switchLanguage() {
            const current = '${lang}';
            const next = current === 'en' ? 'ar' : 'en';
            document.cookie = 'bot_lang=' + next + '; path=/; max-age=31536000';
            location.reload();
        }
    </script>
</body>
</html>`;
        res.send(html);
});

app.post('/auth/login', (req, res) => {
        const username = sanitizeUsername(req.body.username);
        const password = String(req.body.password || '');

        if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = getUserByUsername(username);
        if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
                return res.status(401).json({ error: 'Invalid credentials' });
        }

        const rememberMe = req.body && (req.body.rememberMe === true || req.body.rememberMe === 'true');
        const ttlMs = rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
        const token = createSession(user.id, ttlMs);
        setSessionCookie(res, token, ttlMs);
        return res.json({ success: true, rememberMe, mustChangeCredentials: isDefaultCredentialChangeRequired(user.id) });
});

app.post('/auth/logout', requireAuthApi, (req, res) => {
        destroySession(req, res);
        return res.sendStatus(200);
});

app.get('/auth/me', requireAuthApi, (req, res) => {
        const allowedSet = getAllowedGroupIds(req.authUser);
        res.json({
                id: req.authUser.id,
                username: req.authUser.username,
                displayName: req.authUser.display_name,
                isSuperadmin: req.authUser.is_superadmin === 1,
                permissions: req.authPermissions,
        allowedGroupIds: allowedSet ? Array.from(allowedSet) : null,
        mustChangeCredentials: isDefaultCredentialChangeRequired(req.authUser.id)
        });
});

app.post('/auth/first-login-change', requireAuthApi, (req, res) => {
    if (!isDefaultCredentialChangeRequired(req.authUser.id)) {
        return res.status(400).json({ error: 'Credential change not required' });
    }

    const username = sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!username || username.length < 3 || !/^[a-z0-9._-]+$/.test(username)) {
        return res.status(400).json({ error: 'Username must be at least 3 chars and contain only a-z, 0-9, dot, underscore, hyphen' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 chars' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    const existing = db.prepare('SELECT id FROM app_users WHERE username = ?').get(username);
    if (existing && existing.id !== req.authUser.id) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const tx = db.transaction(() => {
        db.prepare('UPDATE app_users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?')
            .run(username, hashPassword(password), nowIso(), req.authUser.id);
        setDefaultCredentialChangeRequired(req.authUser.id, false);
    });
    tx();

    return res.json({ success: true });
});

app.get('/', requireAuthPage, requirePermission('dashboard:read'), (req, res) => {
    const html = renderDashboard(req, db, config);
    res.send(html);
});

app.get('/api/groups', requireAuthApi, requirePermission('groups:view'), (req, res) => {
    try {
                let groups = db.prepare('SELECT * FROM whatsapp_groups').all();
                const allowedSet = getAllowedGroupIds(req.authUser);
                if (allowedSet) groups = groups.filter(g => allowedSet.has(g.id));
        res.json(groups);
    } catch (e) { res.json([]); }
});

app.post('/api/blacklist/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(req.body.number);
            console.log(`[أمان] تم إضافة رقم للقائمة السوداء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/whitelist/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('INSERT OR IGNORE INTO whitelist (number) VALUES (?)').run(req.body.number);
            console.log(`[أمان] تم إضافة رقم موثوق للقائمة البيضاء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/blacklist/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('DELETE FROM blacklist WHERE number = ?').run(req.body.number);
            console.log(`[أمان] تم إزالة رقم من القائمة السوداء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/extensions/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    if (req.body.ext) {
        try {
            db.prepare('INSERT OR IGNORE INTO blocked_extensions (ext) VALUES (?)').run(String(req.body.ext));
            console.log(`[أمان] تم إضافة رمز دولة للقائمة السوداء: ${req.body.ext}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/extensions/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    if (req.body.ext) {
        try {
            db.prepare('DELETE FROM blocked_extensions WHERE ext = ?').run(String(req.body.ext));
            console.log(`[أمان] تم إزالة رمز دولة من القائمة السوداء: ${req.body.ext}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/whitelist/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('DELETE FROM whitelist WHERE number = ?').run(req.body.number);
            console.log(`[أمان] تم إزالة رقم من القائمة البيضاء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/blacklist/purge', requireAuthApi, requirePermission('security:manage'), async (req, res) => {
    if (!client.info || !client.info.wid) {
        return res.status(400).json({ error: 'البوت غير متصل حالياً، يرجى الانتظار. / Bot disconnected, please wait.' });
    }
    try {
        console.log(`[تنظيف] بدأت عملية المسح الشامل للمجموعات...`);
        const blacklistRows = db.prepare('SELECT number FROM blacklist').all();
        const blacklistArr = blacklistRows.map(r => r.number);
        const blockedExtensionsRows = db.prepare('SELECT ext FROM blocked_extensions').all();
        const blockedExtensionsArr = blockedExtensionsRows.map(r => r.ext);


        const chats = await client.getChats();
        const botId = client.info.wid._serialized;
        let kickedCount = 0;
        let rejectedCount = 0;

        for (const chat of chats) {
            if (chat.isGroup) {
                const botData = chat.participants.find(p => p.id._serialized === botId);
                const botIsAdmin = botData && (botData.isAdmin || botData.isSuperAdmin);
                if (botIsAdmin) {
                    const usersToKick = chat.participants
                        .map(p => p.id._serialized)
                        .filter(id => {
                            const cleanId = id.replace(/:[0-9]+/, '');
                            const finalCleanId = cleanId.replace('@c.us', '');
                            const isExtBlocked = blockedExtensionsArr.some(ext => finalCleanId.startsWith(ext));
                            return isExtBlocked || blacklistArr.includes(cleanId) || blacklistArr.includes(id);
                        });
                    if (usersToKick.length > 0) {
                        try {
                            await chat.removeParticipants(usersToKick);
                            kickedCount += usersToKick.length;
                            console.log(`[أمان] تم طرد ${usersToKick.length} محظورين من: ${chat.name}`);
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        } catch (e) { }
                    }

                    try {
                        const pendingReqs = await chat.getGroupMembershipRequests();
                        if (pendingReqs && pendingReqs.length > 0) {
                            // Resolve per-group screening settings
                            const groupId = chat.id._serialized;
                            const groupConfig = config.groupsConfig[groupId];
                            let isJoinProfileScreeningEnabled = config.enableJoinProfileScreening;
                            let isWordFilterEnabled = config.enableWordFilter;
                            let isAIFilterEnabled = config.enableAIFilter;
                            let isBlacklistEnabled = config.enableBlacklist;
                            let forbiddenWords = [...config.defaultWords];
                            let aiTriggerWords = Array.isArray(config.aiFilterTriggerWords) && config.aiFilterTriggerWords.length > 0 ? config.aiFilterTriggerWords : ['نعم'];
                            if (groupConfig) {
                                if (typeof groupConfig.enableJoinProfileScreening !== 'undefined') isJoinProfileScreeningEnabled = groupConfig.enableJoinProfileScreening;
                                if (typeof groupConfig.enableWordFilter !== 'undefined') isWordFilterEnabled = groupConfig.enableWordFilter;
                                if (typeof groupConfig.enableAIFilter !== 'undefined') isAIFilterEnabled = groupConfig.enableAIFilter;
                                if (typeof groupConfig.enableBlacklist !== 'undefined') isBlacklistEnabled = groupConfig.enableBlacklist;
                                if (groupConfig.useDefaultWords === false) forbiddenWords = [];
                                if (groupConfig.words && groupConfig.words.length > 0) forbiddenWords = [...forbiddenWords, ...groupConfig.words];
                                if (Array.isArray(groupConfig.aiFilterTriggerWords) && groupConfig.aiFilterTriggerWords.length > 0) aiTriggerWords = groupConfig.aiFilterTriggerWords;
                            }
                            const canScreenProfiles = isJoinProfileScreeningEnabled && (isWordFilterEnabled || isAIFilterEnabled);

                            let usersToReject = [];
                            for (const req of pendingReqs) {
                                let rawId = typeof req.id === 'string' ? req.id : (req.id._serialized || (req.id.user && req.id.server ? `${req.id.user}@${req.id.server}` : null));
                                if (!rawId) continue;

                                let cleanId = rawId.replace(/:[0-9]+/, '');
                                if (cleanId.includes('@lid')) {
                                    try {
                                        const contact = await client.getContactById(rawId);
                                        if (contact && contact.number) cleanId = `${contact.number}@c.us`;
                                    } catch (err) { }
                                }

                                const finalCleanId = cleanId.replace(/:[0-9]+/, '').replace('@c.us', '');
                                const isExtBlocked = blockedExtensionsArr.some(ext => finalCleanId.startsWith(ext));

                                // 1. Blacklist / blocked-extensions check
                                if (isExtBlocked || blacklistArr.includes(finalCleanId) || blacklistArr.includes(cleanId) || blacklistArr.includes(rawId)) {
                                    usersToReject.push(rawId);
                                    continue;
                                }

                                // 2. Join Profile Screening check
                                if (canScreenProfiles) {
                                    try {
                                        const profileResult = await evaluateJoinProfileViolation({
                                            participantId: rawId,
                                            cleanUserId: cleanId,
                                            groupName: chat.name,
                                            isWordFilterEnabled,
                                            isAIFilterEnabled,
                                            forbiddenWords,
                                            aiTriggerWords
                                        });
                                        if (profileResult.isViolating) {
                                            usersToReject.push(rawId);
                                            if (isBlacklistEnabled) {
                                                try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId); } catch (e) { }
                                            }
                                            console.log(`[تنظيف] رفض طلب انضمام (فحص الملف الشخصي) - ${cleanId} في ${chat.name}: ${profileResult.reason}`);
                                        }
                                    } catch (e) { }
                                }
                            }

                            if (usersToReject.length > 0) {
                                await chat.rejectGroupMembershipRequests({ requesterIds: usersToReject });
                                rejectedCount += usersToReject.length;
                                console.log(`[أمان] تم رفض ${usersToReject.length} طلبات انضمام في: ${chat.name}`);
                                await new Promise(resolve => setTimeout(resolve, 1500));
                            }
                        }
                    } catch (e) { console.error(`[خطأ] فشل رفض طلبات الانضمام في ${chat.name}:`, e.message); }
                }
            }
        }
        console.log(`[تنظيف] انتهت عملية المسح. طرد ${kickedCount} شخص ورفض ${rejectedCount} طلبات.`);
        res.json({ message: `تمت عملية المسح بنجاح! تم طرد (${kickedCount}) محظور ورفض (${rejectedCount}) طلب. / Purge complete! Kicked (${kickedCount}), rejected (${rejectedCount}).` });
    } catch (error) {
        console.error('[خطأ]', error);
        res.status(500).json({ error: 'حدث خطأ في السيرفر أثناء عملية المسح. / Server error during purge.' });
    }
});

app.get('/api/status', requireAuthApi, requirePermission('dashboard:read'), (req, res) => {
    const l = req.query.lang === 'en' ? 'en' : 'ar';
    let translatedStatus = botStatus;
    if (l === 'en') {
        translatedStatus = translatedStatus
            .replace('جاري تهيئة النظام وبدء التشغيل...', 'Initializing system and starting...')
            .replace('بانتظار مسح رمز الاستجابة السريعة (QR Code)...', 'Waiting for QR Code scan...')
            .replace('متصل وجاهز للعمل', 'Connected and ready')
            .replace('تم تسجيل الدخول بنجاح، جاري جلب البيانات...', 'Logged in successfully, fetching data...')
            .replace('تم تسجيل الخروج من الحساب...', 'Logged out of account...')
            .replace('جاري إنهاء الجلسة...', 'Terminating session...');
    }
    const statusText = String(translatedStatus).replace(/<[^>]*>/g, '').trim();
    res.json({ qr: currentQR, status: translatedStatus, statusText, statusKind: botStatusKind });
});

app.get('/api/logs', requireAuthApi, requirePermission('logs:view'), (req, res) => res.json(logsHistory));

// Get connection/initialization logs for debugging
app.get('/api/connection-logs', requireAuthApi, requirePermission('logs:view'), (req, res) => {
    const connectionData = {
        currentStatus: botStatus,
        isConnected: botStatusKind === 'connected',
        isInitializing,
        connectionHistory: clientConnectionHistory,
        lastConnectionTimestamp,
        initializationStartTime,
        uptime: initializationStartTime ? Math.floor((Date.now() - initializationStartTime) / 1000) : 'N/A',
        totalConnectionLogs: clientConnectionHistory.length,
        timestamp: new Date().toISOString()
    };
    res.json(connectionData);
});

app.post('/api/logout', requireAuthApi, requirePermission('bot:logout'), async (req, res) => {
    try {
        botStatus = '<i class="fas fa-spinner fa-pulse"></i> جاري إنهاء الجلسة...';
        botStatusKind = 'terminating';
        await client.logout();
        res.sendStatus(200);
    } catch (error) { res.sendStatus(500); }
});

app.post('/save', requireAuthApi, (req, res) => {
    try {
        const canWriteAll = hasPermission(req.authUser, 'config:write');
        const canWriteScoped = hasPermission(req.authUser, 'config:write-scoped');
        if (!canWriteAll && !canWriteScoped) return res.status(403).json({ error: 'Forbidden' });

        if (canWriteAll) {
            saveConfigToDB(req.body);
        } else {
            const current = loadConfigFromDB();
            const incomingGroups = req.body && req.body.groupsConfig ? req.body.groupsConfig : {};
            const allowedSet = getAllowedGroupIds(req.authUser) || new Set();
            for (const [groupId, groupConfig] of Object.entries(incomingGroups)) {
                if (allowedSet.has(groupId)) current.groupsConfig[groupId] = groupConfig;
            }
            saveConfigToDB(current);
        }
        config = loadConfigFromDB();
        console.log('[فحص] تم حفظ الإعدادات بنجاح.');
        res.sendStatus(200);
    } catch (e) {
        console.error('[خطأ] تعذر الحفظ في قاعدة البيانات:', e.message);
        res.sendStatus(500);
    }
});

app.listen(3000, () => console.log('لوحة التحكم تعمل عبر المنفذ 3000...'));

// ── Media API ────────────────────────────────────────────────────────────────
// Serve uploaded media files statically
app.use('/media', express.static(path.join(__dirname, 'media')));

// Copy a file from one group to another
app.post('/api/media/copy/:fromGroupId/:toGroupId', requireAuthApi, requirePermission('media:manage'), (req, res) => {
    const filename = req.body.filename;
    if (!filename) return res.status(400).json({ error: 'Filename required' });
    const fromPath = path.join('./media', req.params.fromGroupId, filename);
    const toDir = path.join('./media', req.params.toGroupId);
    const toPath = path.join(toDir, filename);

    if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'Source file not found' });
    
    try {
        if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });
        fs.copyFileSync(fromPath, toPath);
        res.json({ success: true, filename: filename });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload a file for a group
app.post('/api/media/upload/:groupId', requireAuthApi, requirePermission('media:manage'), upload.single('file'), (req, res) => {
    const allowedSet = getAllowedGroupIds(req.authUser);
    if (allowedSet && !allowedSet.has(req.params.groupId)) return res.status(403).json({ error: 'Forbidden group' });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ filename: req.file.filename, size: req.file.size });
});

// List files for a group
app.get('/api/media/list/:groupId', requireAuthApi, requirePermission('media:manage'), (req, res) => {
    const allowedSet = getAllowedGroupIds(req.authUser);
    if (allowedSet && !allowedSet.has(req.params.groupId)) return res.status(403).json({ error: 'Forbidden group' });
    const dir = path.join('./media', req.params.groupId);
    if (!fs.existsSync(dir)) return res.json([]);
    try {
        const files = fs.readdirSync(dir).map(name => {
            const stat = fs.statSync(path.join(dir, name));
            return { name, size: stat.size, modified: stat.mtimeMs };
        });
        res.json(files);
    } catch (e) { res.json([]); }
});

// Delete a file for a group
app.delete('/api/media/delete/:groupId/:filename', requireAuthApi, requirePermission('media:manage'), (req, res) => {
    const allowedSet = getAllowedGroupIds(req.authUser);
    if (allowedSet && !allowedSet.has(req.params.groupId)) return res.status(403).json({ error: 'Forbidden group' });
    const filePath = path.join('./media', req.params.groupId, req.params.filename);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.sendStatus(200);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// ─────────────────────────────────────────────────────────────────────────────

// ── Import/Export API ─────────────────────────────────────────────────────────
// Export dataset with selected options
app.post('/api/export', requireAuthApi, requirePermission('import-export:manage'), (req, res) => {
    try {
        const selected = req.body.selected || {};
        const dataset = {};

        if (selected.global_settings) {
            dataset.global_settings = db.prepare('SELECT * FROM global_settings').all();
        }
        if (selected.llm_settings) {
            dataset.llm_settings = db.prepare('SELECT * FROM llm_settings').all();
        }
        if (selected.blacklist) {
            dataset.blacklist = db.prepare('SELECT * FROM blacklist').all();
        }
        if (selected.whitelist) {
            dataset.whitelist = db.prepare('SELECT * FROM whitelist').all();
        }
        if (selected.blocked_extensions) {
            dataset.blocked_extensions = db.prepare('SELECT * FROM blocked_extensions').all();
        }
        if (selected.whatsapp_groups) {
            dataset.whatsapp_groups = db.prepare('SELECT * FROM whatsapp_groups').all();
        }
        if (selected.custom_groups) {
            dataset.custom_groups = db.prepare('SELECT * FROM custom_groups').all();
        }
        if (selected.media) {
            const mediaData = {};
            const mediaDir = require('path').join(__dirname, 'media');
            if (fs.existsSync(mediaDir)) {
                const groups = fs.readdirSync(mediaDir);
                for (const group of groups) {
                    const groupPath = require('path').join(mediaDir, group);
                    if (fs.statSync(groupPath).isDirectory()) {
                        const files = fs.readdirSync(groupPath);
                        for (const file of files) {
                            const filePath = require('path').join(groupPath, file);
                            if (fs.statSync(filePath).isFile()) {
                                const b64 = fs.readFileSync(filePath, { encoding: 'base64' });
                                mediaData[group + '/' + file] = b64;
                            }
                        }
                    }
                }
            }
            dataset.media = mediaData;
        }

        const exportData = {
            version: '6.1',
            timestamp: new Date().toISOString(),
            data: dataset
        };

        res.json(exportData);
    } catch (error) {
        console.error('[خطأ] فشل التصدير:', error);
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// Import dataset with selected options
app.post('/api/import', requireAuthApi, requirePermission('import-export:manage'), (req, res) => {
    try {
        const { dataset, selected } = req.body;
        
        if (!dataset || !selected) {
            return res.status(400).json({ error: 'Invalid import data' });
        }

        const importTx = db.transaction(() => {
            if (selected.global_settings && dataset.global_settings) {
                const stmt = db.prepare('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)');
                for (const row of dataset.global_settings) {
                    stmt.run(row.key, row.value);
                }
            }
            if (selected.llm_settings && dataset.llm_settings) {
                const stmt = db.prepare('INSERT OR REPLACE INTO llm_settings (key, value) VALUES (?, ?)');
                for (const row of dataset.llm_settings) {
                    stmt.run(row.key, row.value);
                }
            }
            if (selected.blacklist && dataset.blacklist) {
                if (selected.blacklist_clear) db.prepare('DELETE FROM blacklist').run();
                const stmt = db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)');
                for (const row of dataset.blacklist) {
                    stmt.run(row.number);
                }
            }
            if (selected.whitelist && dataset.whitelist) {
                if (selected.whitelist_clear) db.prepare('DELETE FROM whitelist').run();
                const stmt = db.prepare('INSERT OR IGNORE INTO whitelist (number) VALUES (?)');
                for (const row of dataset.whitelist) {
                    stmt.run(row.number);
                }
            }
            if (selected.blocked_extensions && dataset.blocked_extensions) {
                if (selected.blocked_extensions_clear) db.prepare('DELETE FROM blocked_extensions').run();
                const stmt = db.prepare('INSERT OR IGNORE INTO blocked_extensions (ext) VALUES (?)');
                for (const row of dataset.blocked_extensions) {
                    stmt.run(row.ext);
                }
            }
            if (selected.whatsapp_groups && dataset.whatsapp_groups) {
                const stmt = db.prepare('INSERT OR REPLACE INTO whatsapp_groups (id, name) VALUES (?, ?)');
                for (const row of dataset.whatsapp_groups) {
                    stmt.run(row.id, row.name);
                }
            }
            if (selected.custom_groups && dataset.custom_groups) {
                if (selected.custom_groups_clear) db.prepare('DELETE FROM custom_groups').run();
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO custom_groups (
                        group_id, admin_group, admin_language, use_default_words, enable_word_filter, enable_ai_filter, 
                        enable_ai_media, auto_action, enable_blacklist, enable_whitelist, enable_anti_spam, 
                        spam_duplicate_limit, spam_action, enable_welcome_message, welcome_message_text, custom_words,
                        blocked_types, blocked_action, spam_types, spam_limits,
                        enable_panic_mode, panic_message_limit, panic_time_window, panic_lockout_duration,
                        panic_alert_target, panic_alert_message, custom_blacklist, custom_whitelist, 
                        use_global_blacklist, use_global_whitelist, enable_qa_feature, custom_qa, qa_event_date, 
                        qa_language, qa_event_dates, custom_ai_trigger_words, enable_join_profile_screening
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const row of dataset.custom_groups) {
                    stmt.run(
                        row.group_id, row.admin_group, row.admin_language || 'default', row.use_default_words, row.enable_word_filter,
                        row.enable_ai_filter, row.enable_ai_media, row.auto_action, row.enable_blacklist,
                        row.enable_whitelist, row.enable_anti_spam, row.spam_duplicate_limit, row.spam_action,
                        row.enable_welcome_message, row.welcome_message_text, row.custom_words,
                        row.blocked_types, row.blocked_action, row.spam_types, row.spam_limits,
                        row.enable_panic_mode, row.panic_message_limit, row.panic_time_window,
                        row.panic_lockout_duration, row.panic_alert_target, row.panic_alert_message,
                        row.custom_blacklist, row.custom_whitelist, row.use_global_blacklist,
                        row.use_global_whitelist, row.enable_qa_feature, row.custom_qa, row.qa_event_date,
                        row.qa_language, row.qa_event_dates, row.custom_ai_trigger_words || '[]', row.enable_join_profile_screening || 0
                    );
                }
            }
        });

        importTx();
        config = loadConfigFromDB();
        console.log('[استيراد] تم استيراد البيانات بنجاح');
        res.json({ success: true, message: 'Import completed successfully' });
    } catch (error) {
        console.error('[خطأ] فشل الاستيراد:', error);
        res.status(500).json({ error: 'Import failed: ' + error.message });
    }
});

app.get('/api/access/permission-groups', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const rows = db.prepare('SELECT id, name, description, permissions FROM permission_groups ORDER BY name').all();
    const data = rows.map(r => ({ ...r, permissions: parseJsonArray(r.permissions) }));
    res.json(data);
});

app.post('/api/access/permission-groups/create', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const name = normalizePermissionGroupName(req.body.name);
    const description = String(req.body.description || '').trim();
    const permissions = normalizePermissionList(req.body.permissions);
    if (!name || permissions.length === 0) return res.status(400).json({ error: 'Invalid permission group payload' });

    try {
        const existing = db.prepare('SELECT id FROM permission_groups WHERE lower(name) = lower(?)').get(name);
        if (existing) return res.status(409).json({ error: 'Permission group name already exists' });

        db.prepare('INSERT INTO permission_groups (name, description, permissions) VALUES (?, ?, ?)')
            .run(name, description, JSON.stringify(permissions));
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/access/permission-groups/update', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const id = parseInt(req.body.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const name = normalizePermissionGroupName(req.body.name);
    const description = String(req.body.description || '').trim();
    const permissions = normalizePermissionList(req.body.permissions);
    if (!name || permissions.length === 0) return res.status(400).json({ error: 'Invalid permission group payload' });

    try {
        const current = db.prepare('SELECT id FROM permission_groups WHERE id = ?').get(id);
        if (!current) return res.status(404).json({ error: 'Permission group not found' });

        const duplicate = db.prepare('SELECT id FROM permission_groups WHERE lower(name) = lower(?) AND id <> ?').get(name, id);
        if (duplicate) return res.status(409).json({ error: 'Permission group name already exists' });

        db.prepare('UPDATE permission_groups SET name = ?, description = ?, permissions = ? WHERE id = ?')
            .run(name, description, JSON.stringify(permissions), id);
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/access/permission-groups/delete', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const id = parseInt(req.body.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    try {
        const tx = db.transaction(() => {
            db.prepare('DELETE FROM user_permission_groups WHERE permission_group_id = ?').run(id);
            const info = db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id);
            if (!info || info.changes === 0) {
                throw new Error('Permission group not found');
            }
        });
        tx();
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/users', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const users = db.prepare('SELECT id, username, display_name, is_active, is_superadmin, created_at, updated_at FROM app_users ORDER BY id ASC').all();
    const rows = db.prepare(`
        SELECT upg.user_id, pg.id AS group_id, pg.name
        FROM user_permission_groups upg
        JOIN permission_groups pg ON pg.id = upg.permission_group_id
    `).all();
    const groupAccess = db.prepare('SELECT user_id, wa_group_id FROM user_group_access').all();

    const byUserGroups = new Map();
    rows.forEach(r => {
        if (!byUserGroups.has(r.user_id)) byUserGroups.set(r.user_id, []);
        byUserGroups.get(r.user_id).push({ id: r.group_id, name: r.name });
    });

    const byUserWaAccess = new Map();
    groupAccess.forEach(r => {
        if (!byUserWaAccess.has(r.user_id)) byUserWaAccess.set(r.user_id, []);
        byUserWaAccess.get(r.user_id).push(r.wa_group_id);
    });

    res.json(users.map(u => ({
        ...u,
        permissionGroups: byUserGroups.get(u.id) || [],
        allowedGroupIds: byUserWaAccess.get(u.id) || []
    })));
});

app.post('/api/users/create', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const username = sanitizeUsername(req.body.username);
    const displayName = String(req.body.displayName || '').trim();
    const password = String(req.body.password || '');
    const isSuperadmin = req.body.isSuperadmin ? 1 : 0;

    if (!username || !displayName || password.length < 8) {
        return res.status(400).json({ error: 'username/displayName required and password must be at least 8 chars' });
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
        return res.status(400).json({ error: 'username can contain only a-z, 0-9, dot, underscore, hyphen' });
    }

    try {
        const timestamp = nowIso();
        db.prepare(`
            INSERT INTO app_users (username, password_hash, display_name, is_active, is_superadmin, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)
        `).run(username, hashPassword(password), displayName, isSuperadmin, timestamp, timestamp);
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/users/update', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.body.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const params = [];

    if (typeof req.body.displayName === 'string') {
        updates.push('display_name = ?');
        params.push(req.body.displayName.trim());
    }
    if (typeof req.body.isActive !== 'undefined') {
        updates.push('is_active = ?');
        params.push(req.body.isActive ? 1 : 0);
    }
    if (typeof req.body.isSuperadmin !== 'undefined') {
        updates.push('is_superadmin = ?');
        params.push(req.body.isSuperadmin ? 1 : 0);
    }
    if (typeof req.body.password === 'string' && req.body.password.length > 0) {
        if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 chars' });
        updates.push('password_hash = ?');
        params.push(hashPassword(req.body.password));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid updates' });

    updates.push('updated_at = ?');
    params.push(nowIso());
    params.push(userId);

    db.prepare(`UPDATE app_users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.sendStatus(200);
});

app.post('/api/users/delete', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.body.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });
    if (req.authUser.id === userId) return res.status(400).json({ error: 'You cannot delete your own account' });

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM user_permission_groups WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_group_access WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM app_users WHERE id = ?').run(userId);
    });

    tx();
    res.sendStatus(200);
});

app.get('/api/users/:userId/access', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const permissionGroups = db.prepare(`
        SELECT pg.id, pg.name
        FROM user_permission_groups upg
        JOIN permission_groups pg ON pg.id = upg.permission_group_id
        WHERE upg.user_id = ?
    `).all(userId);

    const allowedGroupIds = db.prepare('SELECT wa_group_id FROM user_group_access WHERE user_id = ?').all(userId).map(r => r.wa_group_id);
    const settingsRows = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
    const settings = {};
    settingsRows.forEach(r => {
        settings[r.key] = r.value;
    });

    res.json({
        userId,
        permissionGroupIds: permissionGroups.map(g => g.id),
        allowedGroupIds,
        settings
    });
});

app.post('/api/users/:userId/access', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const payload = normalizeUserAccessPayload(req.body || {});

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM user_permission_groups WHERE user_id = ?').run(userId);
        const insertPermission = db.prepare('INSERT OR IGNORE INTO user_permission_groups (user_id, permission_group_id) VALUES (?, ?)');
        payload.permissionGroupIds.forEach(groupId => insertPermission.run(userId, groupId));

        db.prepare('DELETE FROM user_group_access WHERE user_id = ?').run(userId);
        const insertGroup = db.prepare('INSERT OR IGNORE INTO user_group_access (user_id, wa_group_id) VALUES (?, ?)');
        payload.allowedGroupIds.forEach(waGroupId => insertGroup.run(userId, waGroupId));

        db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
        const insertSetting = db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');
        Object.entries(payload.settings).forEach(([key, value]) => {
            insertSetting.run(userId, String(key), typeof value === 'string' ? value : JSON.stringify(value));
        });

        db.prepare('UPDATE app_users SET updated_at = ? WHERE id = ?').run(nowIso(), userId);
    });

    tx();
    res.sendStatus(200);
});
// ─────────────────────────────────────────────────────────────────────────────

// Safe Mode: random delay 10-60s to mimic human behaviour and avoid WhatsApp bot detection
async function safeDelay() {
    if (!config.safeMode) return;
    const ms = (Math.floor(Math.random() * 51) + 10) * 1000; // 10–60 seconds
    console.log(`[أمان] وضع آمن: تأخير ${ms / 1000} ثانية قبل الإجراء...`);
    await new Promise(r => setTimeout(r, ms));
};

const authDataPath = process.env.WA_AUTH_PATH || path.join(process.cwd(), '.wwebjs_auth');
const browserProfileDir = process.env.WA_BROWSER_PROFILE_DIR || `/tmp/chromium-wa-bot-${process.pid}`;

function resolveBrowserExecutablePath() {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH && process.env.PUPPETEER_EXECUTABLE_PATH.trim();
    if (envPath) return envPath;

    if (process.platform === 'win32') {
        const winCandidates = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Chromium\\Application\\chrome.exe')
        ].filter(Boolean);
        const found = winCandidates.find(p => fs.existsSync(p));
        return found || null;
    }

    if (process.platform === 'linux') {
        const linuxCandidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
        const found = linuxCandidates.find(p => fs.existsSync(p));
        return found || null;
    }

    return null;
}

const resolvedBrowserExecutablePath = resolveBrowserExecutablePath();

function cleanupStaleAuthLocks(authPath) {
    try {
        if (!fs.existsSync(authPath)) return;
        const lockPatterns = [
            /lock/i,
            /^Singleton/i,
            /^\.parent-lock$/i
        ];
        const walk = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath);
                    continue;
                }
                if (lockPatterns.some((pattern) => pattern.test(entry.name))) {
                    try { fs.unlinkSync(fullPath); } catch (e) { }
                }
            }
        };
        walk(authPath);
        console.log(`[أمان] تنظيف ملفات القفل القديمة من: ${authPath}`);
    } catch (err) {
        console.error(`[خطأ] فشل تنظيف أقفال المصادقة القديمة: ${err.message || err}`);
    }
}

cleanupStaleAuthLocks(authDataPath);

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authDataPath,
        clientId: process.env.WA_CLIENT_ID || 'main'
    }),
    puppeteer: { 
        ...(resolvedBrowserExecutablePath ? { executablePath: resolvedBrowserExecutablePath } : {}),
        headless: true,
        timeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-resources',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-device-discovery-notifications',
            '--disable-hang-monitor',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--disable-default-apps',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-device-orientation-request-prompt',
            '--no-default-browser-check',
            '--start-maximized',
            `--user-data-dir=${browserProfileDir}`
        ]
    }
});

client.on('ready', async () => {
    const readyStartTime = Date.now();
    addConnectionLog('جاهز', 'البوت جاهز الآن والعميل مصرح');
    isInitializing = false;
    lastConnectionTimestamp = Date.now();
    
    if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
    }
    
    try {
        console.log('[معلومة] بدء مزامنة المجموعات من قاعدة البيانات...');
        const chats = await client.getChats();
        addConnectionLog('مزامنة مجموعات', `تم جلب ${chats.length} مجموعة`);
        
        console.log('[معلومة] بدء تحديث قاعدة البيانات...');
        syncTx(chats);
        
        const syncDuration = Date.now() - readyStartTime;
        const totalInitTime = initializationStartTime ? Date.now() - initializationStartTime : 0;
        
        console.log('[معلومة] تمت مزامنة ' + chats.length + ' مجموعة بنجاح.', {
            syncDurationMs: syncDuration,
            totalInitDurationMs: totalInitTime,
            timestamp: new Date().toISOString()
        });
        
        botStatus = '<i class="fas fa-check-circle"></i> متصل وجاهز للعمل';
        botStatusKind = 'connected';
        addConnectionLog('متصل', `متصل وجاهز - ${chats.length} مجموعة`);
    } catch (error) {
        const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
        const errorStack = error && error.stack ? error.stack : 'No stack trace';
        
        addConnectionLog('خطأ في المزامنة', errorMsg);
        console.error('[خطأ] فشل مزامنة المجموعات:', {
            message: errorMsg,
            stack: errorStack,
            timestamp: new Date().toISOString(),
            timeSinceReady: Date.now() - readyStartTime
        });
    }
});

client.on('authenticated', () => {
    addConnectionLog('مصرح', 'تم التحقق من الهوية بنجاح من خوادم WhatsApp');
    lastConnectionTimestamp = Date.now();
    botStatus = '<i class="fas fa-sync fa-spin"></i> تم تسجيل الدخول بنجاح، جاري جلب البيانات...';
    botStatusKind = 'syncing';
    currentQR = '';
    
    if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
    }
    
    console.log('[معلومة] تم التحقق من الهوية بنجاح', {
        authenticatedAt: new Date().toISOString(),
        timeSinceInitialization: initializationStartTime ? `${Date.now() - initializationStartTime}ms` : 'N/A'
    });
});

// Handle page errors that might cause frame detachment
client.on('page_created', (page) => {
    addConnectionLog('صفحة تم إنشاؤها', 'صفحة WhatsApp Web تم إنشاؤها بنجاح');
    lastConnectionTimestamp = Date.now();
    
    page.on('error', (error) => {
        const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
        const errorStack = error && error.stack ? error.stack : 'No stack trace';
        addConnectionLog('خطأ في الصفحة', `${errorMsg}`);
        console.error('[خطأ] Page error details:', {
            message: errorMsg,
            stack: errorStack,
            timestamp: new Date().toISOString()
        });
    });
    
    page.on('close', () => {
        addConnectionLog('صفحة مغلقة', 'تم إغلاق صفحة WhatsApp Web');
        console.log('[معلومة] تم إغلاق صفحة WhatsApp Web');
    });
    
    page.on('framenavigated', () => {
        addConnectionLog('انتقال إطار', 'تم التنقل إلى إطار جديد');
    });
});

// Handle QR code generation
client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('[خطأ] فشل إنشاء QR code:', err.message);
            botStatus = '<i class="fas fa-exclamation-triangle"></i> خطأ في QR code';
            botStatusKind = 'error';
            return;
        }
        currentQR = url;
        botStatus = '<i class="fas fa-qrcode"></i> بانتظار مسح رمز الاستجابة السريعة (QR Code)...';
        botStatusKind = 'waiting_qr';
        console.log('[معلومة] QR code متاح للمسح');
    });
});

client.on('disconnected', async (reason) => {
    const disconnectReason = reason || 'Unknown reason';
    addConnectionLog('قطع الاتصال', disconnectReason);
    
    botStatus = '<i class="fas fa-sign-out-alt"></i> تم تسجيل الخروج من الحساب...';
    botStatusKind = 'disconnected';
    currentQR = '';
    isInitializing = false;
    
    console.error('[تنبيه] توقع البوت، السبب:', {
        reason: disconnectReason,
        timestampOfDisconnect: new Date().toISOString(),
        connectionDurationMs: lastConnectionTimestamp ? Date.now() - lastConnectionTimestamp : 'N/A'
    });
    
    if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
    }
    
    try { 
        console.log('[معلومة] تنظيف موارد العميل...');
        await client.destroy(); 
    } catch (e) { 
        console.error('[خطأ] خطأ أثناء تنظيف العميل:', e.message);
    }
    
    console.log('[معلومة] سيتم إعادة تهيئة الاتصال بعد 3 ثوانٍ...');
    setTimeout(() => { 
        console.log('[معلومة] بدء إعادة تهيئة الاتصال...');
        initializeClientWithRetry(); 
    }, 3000);
});



// Global error handler for client errors
client.on('error', (error) => {
    const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
    const errorStack = error && error.stack ? error.stack : 'No stack trace';
    const errorName = error && error.name ? error.name : 'GenericError';
    
    console.error('[خطأ حرج] خطأ عام في العميل:', {
        errorName,
        message: errorMsg,
        stack: errorStack,
        timestamp: new Date().toISOString()
    });
    
    addConnectionLog('خطأ حرج', `${errorName}: ${errorMsg}`);
});

// Handle authentication failures
client.on('auth_failure', (msg) => {
    const failureMsg = msg || 'Unknown authentication failure';
    console.error('[خطأ] فشل المصادقة:', {
        message: failureMsg,
        timestamp: new Date().toISOString()
    });
    addConnectionLog('فشل المصادقة', failureMsg);
    botStatus = '<i class="fas fa-exclamation-triangle"></i> خطأ في المصادقة: ' + failureMsg;
    botStatusKind = 'error';
});

// Handle incoming call notifications
client.on('call', (call) => {
    console.log('[معلومة] تنبيه مكالمة واردة:', {
        from: call.from,
        isGroup: call.isGroup,
        timestamp: new Date().toISOString()
    });
});

// Monitor uncaught exceptions globally  
process.on('unhandledRejection', (reason, promise) => {
    const reasonMsg = reason ? (reason.message || reason.toString()) : 'Unknown rejection';
    const reasonStack = reason && reason.stack ? reason.stack : 'No stack trace';
    
    console.error('[خطأ] رفض غير معالج:', {
        reason: reasonMsg,
        stack: reasonStack,
        promise: promise.toString(),
        timestamp: new Date().toISOString()
    });
    
    addConnectionLog('رفض غير معالج', reasonMsg);
    if (!isInitializing && botStatus.includes('متصل')) {
        botStatus = '<i class="fas fa-exclamation-triangle"></i> حدث خطأ غير متوقع';
        botStatusKind = 'error';
    }
});

// Monitor uncaught exceptions
process.on('uncaughtException', (error) => {
    const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
    const errorStack = error && error.stack ? error.stack : 'No stack trace';
    const errorName = error && error.name ? error.name : 'Unknown';
    
    console.error('[خطأ حرج] استثناء غير معالج:', {
        errorName,
        message: errorMsg,
        stack: errorStack,
        timestamp: new Date().toISOString()
    });
    
    addConnectionLog('استثناء حرج', `${errorName}: ${errorMsg}`);
});

client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const groupId = chat.id._serialized;
        try { db.prepare('INSERT OR REPLACE INTO whatsapp_groups (id, name) VALUES (?, ?)').run(groupId, chat.name); } catch (e) { }

        const groupConfig = config.groupsConfig[groupId];
        let isBlacklistEnabledForGroup = config.enableBlacklist;
        let isWhitelistEnabledForGroup = config.enableWhitelist;
        let isJoinProfileScreeningEnabled = config.enableJoinProfileScreening;
        let targetAdminGroup = config.defaultAdminGroup;
        let isWordFilterEnabled = config.enableWordFilter;
        let isAIFilterEnabled = config.enableAIFilter;
        let forbiddenWords = [...config.defaultWords];
        let aiTriggerWords = Array.isArray(config.aiFilterTriggerWords) && config.aiFilterTriggerWords.length > 0 ? config.aiFilterTriggerWords : ['نعم'];

        if (groupConfig) {
            if (typeof groupConfig.enableBlacklist !== 'undefined') isBlacklistEnabledForGroup = groupConfig.enableBlacklist;
            if (typeof groupConfig.enableWhitelist !== 'undefined') isWhitelistEnabledForGroup = groupConfig.enableWhitelist;
            if (typeof groupConfig.enableJoinProfileScreening !== 'undefined') isJoinProfileScreeningEnabled = groupConfig.enableJoinProfileScreening;
            if (typeof groupConfig.enableWordFilter !== 'undefined') isWordFilterEnabled = groupConfig.enableWordFilter;
            if (typeof groupConfig.enableAIFilter !== 'undefined') isAIFilterEnabled = groupConfig.enableAIFilter;
            if (groupConfig.useDefaultWords === false) forbiddenWords = [];
            if (groupConfig.words && groupConfig.words.length > 0) forbiddenWords = [...forbiddenWords, ...groupConfig.words];
            if (Array.isArray(groupConfig.aiFilterTriggerWords) && groupConfig.aiFilterTriggerWords.length > 0) {
                aiTriggerWords = groupConfig.aiFilterTriggerWords;
            }
            if (groupConfig.adminGroup && groupConfig.adminGroup.trim() !== '') targetAdminGroup = groupConfig.adminGroup.trim();
        }

        for (const participantId of notification.recipientIds) {
            let cleanJoinedId = participantId.replace(/:[0-9]+/, '');
            if (cleanJoinedId.includes('@lid')) {
                try {
                    const contact = await client.getContactById(participantId);
                    if (contact && contact.number) cleanJoinedId = `${contact.number}@c.us`;
                    else cleanJoinedId = cleanJoinedId.replace('@lid', '@c.us');
                } catch (e) { cleanJoinedId = cleanJoinedId.replace('@lid', '@c.us'); }
            }

            let isWhitelisted = false;
            if (isWhitelistEnabledForGroup) {
                const globalWl = db.prepare('SELECT 1 FROM whitelist WHERE number = ?').get(cleanJoinedId);
                const useGlobal = groupConfig ? (groupConfig.useGlobalWhitelist !== false) : true;
                const inCustom = groupConfig && groupConfig.customWhitelist ? groupConfig.customWhitelist.includes(cleanJoinedId) : false;
                if ((useGlobal && globalWl) || inCustom) isWhitelisted = true;
            }

            let isKicked = false;

            if (isBlacklistEnabledForGroup && !isWhitelisted) {
                const globalBl = db.prepare('SELECT 1 FROM blacklist WHERE number = ?').get(cleanJoinedId);
                const blockedExtensionsRows = db.prepare('SELECT ext FROM blocked_extensions').all();
                const isExtBlocked = blockedExtensionsRows.some(r => cleanJoinedId.replace('@c.us', '').startsWith(r.ext));
                const useGlobal = groupConfig ? (groupConfig.useGlobalBlacklist !== false) : true;
                const inCustom = groupConfig && groupConfig.customBlacklist ? groupConfig.customBlacklist.includes(cleanJoinedId) : false;

                if ((useGlobal && (globalBl || isExtBlocked)) || inCustom) {
                    console.log(`[أمان] محاولة دخول رقم محظور (${cleanJoinedId}). جاري الطرد...`);
                    isKicked = true;
                    setTimeout(async () => {
                        try {
                            await safeDelay();
                            await chat.removeParticipants([participantId]);
                            const reportText = tAdmin(
                                groupConfig,
                                config,
                                `🛡️ *حماية (قائمة سوداء)*\nحاول رقم محظور الدخول لمجموعة "${chat.name}" وتم طرده.\nالرقم: @${cleanJoinedId.split('@')[0]}`,
                                `🛡️ *Protection (Blacklist)*\nA blacklisted number attempted to join "${chat.name}" and was removed.\nNumber: @${cleanJoinedId.split('@')[0]}`
                            );
                            await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanJoinedId] });
                        } catch (err) { }
                    }, 2000);
                }
            }

            if (!isKicked && groupConfig && groupConfig.enableWelcomeMessage && groupConfig.welcomeMessageText) {
                setTimeout(async () => {
                    try {
                        await safeDelay();
                        const welcomeText = groupConfig.welcomeMessageText.replace(/{user}/g, `@${cleanJoinedId.split('@')[0]}`);
                        await client.sendMessage(groupId, welcomeText, { mentions: [cleanJoinedId] });
                    } catch (err) { }
                }, 3500);
            }

            if (!isKicked && isJoinProfileScreeningEnabled && !isWhitelisted && (isWordFilterEnabled || isAIFilterEnabled)) {
                setTimeout(async () => {
                    try {
                        const profileResult = await evaluateJoinProfileViolation({
                            participantId,
                            cleanUserId: cleanJoinedId,
                            groupName: chat.name,
                            isWordFilterEnabled,
                            isAIFilterEnabled,
                            forbiddenWords,
                            aiTriggerWords
                        });
                        if (!profileResult.isViolating) return;

                        await safeDelay();
                        await chat.removeParticipants([participantId]);
                        if (isBlacklistEnabledForGroup) {
                            try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanJoinedId); } catch (e) { }
                        }

                        const reportText = tAdmin(
                            groupConfig,
                            config,
                            `🚫 *فحص الانضمام*
تم طرد عضو جديد بعد فحص الاسم/النبذة.
المجموعة: "${chat.name}"
الرقم: @${cleanJoinedId.split('@')[0]}
السبب: ${profileResult.reason}
البيانات:
"${profileResult.profileText || 'غير متوفر'}"`,
                            `🚫 *Join Screening*
A newly joined member was removed after profile screening.
Group: "${chat.name}"
Number: @${cleanJoinedId.split('@')[0]}
Reason: ${profileResult.reason}
Profile:
"${profileResult.profileText || 'Unavailable'}"`
                        );
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanJoinedId] });
                    } catch (err) { }
                }, 2800);
            }
        }
    } catch (error) { }
});

async function resolveContactForJoinScreening(participantId, cleanUserId) {
    const candidates = [participantId, cleanUserId];
    const numberOnly = typeof cleanUserId === 'string' ? cleanUserId.split('@')[0] : '';
    if (numberOnly) candidates.push(`${numberOnly}@c.us`);
    if (numberOnly) candidates.push(`${numberOnly}@lid`);
    for (const id of candidates) {
        if (!id) continue;
        try {
            const c = await client.getContactById(id);
            if (c) return c;
        } catch (e) { }
    }
    return null;
}

async function extractJoinProfileText(participantId, cleanUserId) {
    const contact = await resolveContactForJoinScreening(participantId, cleanUserId);
    const displayName = contact ? (contact.pushname || contact.name || contact.shortName || '') : '';
    let about = '';
    if (contact && typeof contact.getAbout === 'function') {
        try {
            const aboutText = await contact.getAbout();
            if (typeof aboutText === 'string') about = aboutText.trim();
        } catch (e) { }
    }

    const lines = [];
    if (displayName) lines.push(`name: ${displayName}`);
    if (about) lines.push(`bio: ${about}`);
    return lines.join('\n').trim();
}

async function evaluateJoinProfileViolation({ participantId, cleanUserId, groupName, isWordFilterEnabled, isAIFilterEnabled, forbiddenWords, aiTriggerWords }) {
    const profileText = await extractJoinProfileText(participantId, cleanUserId);
    if (!profileText) return { isViolating: false, reason: '', profileText: '' };

    if (isWordFilterEnabled && Array.isArray(forbiddenWords) && forbiddenWords.length > 0) {
        const lowered = profileText.toLowerCase();
        const matchedWord = forbiddenWords.find(word => typeof word === 'string' && word.trim() && lowered.includes(word.toLowerCase()));
        if (matchedWord) {
            return { isViolating: true, reason: `كلمة محظورة في الملف الشخصي: [${matchedWord}]`, profileText };
        }
    }

    if (isAIFilterEnabled) {
        try {
            const payload = {
                model: config.ollamaModel,
                prompt: `Profile screening for group join in "${groupName}".\nCheck this profile text:\n${profileText}`,
                stream: false
            };
            const response = await fetch(`${config.ollamaUrl}/api/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await response.json();
            const aiText = data && typeof data.response === 'string' ? data.response : '';
            const triggers = Array.isArray(aiTriggerWords) && aiTriggerWords.length > 0 ? aiTriggerWords : ['نعم'];
            if (aiText && triggers.some(word => aiText.includes(word))) {
                return { isViolating: true, reason: 'تم تصنيف الملف الشخصي كمخالفة عبر الذكاء الاصطناعي', profileText };
            }
        } catch (e) { }
    }

    return { isViolating: false, reason: '', profileText };
}

client.on('group_update', async (notification) => {
    try {
        const chat = await notification.getChat();
        db.prepare('UPDATE whatsapp_groups SET name = ? WHERE id = ?').run(chat.name, chat.id._serialized);
    } catch (e) { }
});

const pendingBans = new Map();

function resolvePollOptionLocalIds(parentMessage) {
    const opts = (parentMessage && (parentMessage.pollOptions || (parentMessage._data && parentMessage._data.pollOptions))) || [];
    const yesLocalId = opts[0] && opts[0].localId ? opts[0].localId : null;
    const noLocalId = opts[1] && opts[1].localId ? opts[1].localId : null;
    return { yesLocalId, noLocalId };
}

function normalizeSelectedOptionName(option) {
    if (!option) return '';
    if (typeof option === 'string') return option;
    if (typeof option.name === 'string') return option.name;
    return '';
}

function isYesVoteSelected(vote, parentMessage) {
    const { yesLocalId } = resolvePollOptionLocalIds(parentMessage);
    const options = Array.isArray(vote && vote.selectedOptions) ? vote.selectedOptions : [];
    for (const option of options) {
        const name = normalizeSelectedOptionName(option);
        if (name && (name.includes('نعم') || /\byes\b/i.test(name))) return true;
        if (option && typeof option === 'object' && yesLocalId && option.localId && option.localId === yesLocalId) return true;
    }
    return false;
}

function isNoVoteSelected(vote, parentMessage) {
    const { noLocalId } = resolvePollOptionLocalIds(parentMessage);
    const options = Array.isArray(vote && vote.selectedOptions) ? vote.selectedOptions : [];
    for (const option of options) {
        const name = normalizeSelectedOptionName(option);
        if (name && (name.includes('لا') || /\bno\b/i.test(name))) return true;
        if (option && typeof option === 'object' && noLocalId && option.localId && option.localId === noLocalId) return true;
    }
    return false;
}

async function tryKickFromChat(chat, candidateIds) {
    if (!chat || !chat.isGroup || !Array.isArray(candidateIds) || candidateIds.length === 0) return false;
    for (const id of candidateIds) {
        if (!id || typeof id !== 'string') continue;
        try {
            await chat.removeParticipants([id]);
            return true;
        } catch (e) { }
    }
    return false;
}

client.on('message', async msg => {
    try {
        const chat = await msg.getChat();
        const msgId = msg.id._serialized;

        if (chat.isGroup) {
            if (msg.fromMe) return;

            const rawAuthorId = msg.author || msg.from;
            let cleanAuthorId = rawAuthorId.replace(/:[0-9]+/, '');

            if (cleanAuthorId.includes('@lid')) {
                try {
                    const contact = await msg.getContact();
                    if (contact && contact.number) cleanAuthorId = `${contact.number}@c.us`;
                    else cleanAuthorId = cleanAuthorId.replace('@lid', '@c.us');
                } catch (e) { cleanAuthorId = cleanAuthorId.replace('@lid', '@c.us'); }
            }

            const groupId = chat.id._serialized;
            const groupConfig = config.groupsConfig[groupId];

            // ── Inline commands: /ban  /kick  /report ────────────────────────
            const cmdBody = (msg.body || '').trim();
            const cmdMatch = cmdBody.match(/^\/(\w+)/i);
            if (cmdMatch && ['ban', 'kick', 'report'].includes(cmdMatch[1].toLowerCase())) {
                const cmd = cmdMatch[1].toLowerCase();

                // Only whitelisted senders may use commands
                const senderGlobalWl = db.prepare('SELECT 1 FROM whitelist WHERE number = ?').get(cleanAuthorId);
                const senderUseGlobal = groupConfig ? (groupConfig.useGlobalWhitelist !== false) : true;
                const senderInCustom = groupConfig && groupConfig.customWhitelist ? groupConfig.customWhitelist.includes(cleanAuthorId) : false;
                const isSenderWhitelisted = (senderUseGlobal && senderGlobalWl) || senderInCustom;

                if (isSenderWhitelisted) {
                    const cmdAdminLang = resolveAdminLang(groupConfig, config);
                    const cmdAdminGroup = (groupConfig && groupConfig.adminGroup && groupConfig.adminGroup.trim() !== '')
                        ? groupConfig.adminGroup.trim()
                        : config.defaultAdminGroup;
                    const cmdBlacklistEnabled = groupConfig
                        ? (typeof groupConfig.enableBlacklist !== 'undefined' ? groupConfig.enableBlacklist : config.enableBlacklist)
                        : config.enableBlacklist;

                    // Resolve target: mention takes priority, then quoted message author
                    let targetRawId = null;
                    let targetCleanId = null;

                    if (msg.mentionedIds && msg.mentionedIds.length > 0) {
                        targetRawId = msg.mentionedIds[0];
                        targetCleanId = targetRawId.replace(/:[0-9]+/, '');
                    }
                    if (!targetRawId && msg.hasQuotedMsg) {
                        try {
                            const quoted = await msg.getQuotedMessage();
                            targetRawId = quoted.author || quoted.from;
                            targetCleanId = targetRawId ? targetRawId.replace(/:[0-9]+/, '') : null;
                        } catch (e) { }
                    }

                    if (!targetRawId) {
                        // No target — tell the user how to use it
                        try {
                            await msg.reply(cmdAdminLang === 'en'
                                ? `⚠️ Please mention a user or reply to their message with /${cmd}.`
                                : `⚠️ يرجى ذكر مستخدم أو الرد على رسالته مع الأمر /${cmd}.`);
                        } catch (e) { }
                    } else if (cmd === 'kick' || cmd === 'ban') {
                        const botWid = client.info && client.info.wid ? client.info.wid._serialized : null;
                        const botParticipant = botWid ? chat.participants.find(p => p.id._serialized === botWid) : null;
                        const botIsAdmin = botParticipant && (botParticipant.isAdmin || botParticipant.isSuperAdmin);

                        if (!botIsAdmin) {
                            try {
                                await msg.reply(cmdAdminLang === 'en'
                                    ? '⚠️ The bot must be a group admin to use this command.'
                                    : '⚠️ يجب أن يكون البوت مشرفاً في المجموعة لتنفيذ هذا الأمر.');
                            } catch (e) { }
                        } else {
                            try {
                                await safeDelay();
                                await chat.removeParticipants([targetRawId]);
                                if (cmd === 'ban' && cmdBlacklistEnabled) {
                                    try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(targetCleanId); } catch (e) { }
                                }
                                const senderNum = cleanAuthorId.split('@')[0];
                                const targetNum = (targetCleanId || '').split('@')[0];
                                const confirmText = cmdAdminLang === 'en'
                                    ? `✅ *${cmd === 'ban' ? 'Ban' : 'Kick'} executed*\nGroup: "${chat.name}"\nBy: @${senderNum}\nTarget: @${targetNum}${cmd === 'ban' && cmdBlacklistEnabled ? '\n🚫 Added to blacklist.' : ''}`
                                    : `✅ *تم تنفيذ ${cmd === 'ban' ? 'الحظر' : 'الطرد'}*\nالمجموعة: "${chat.name}"\nبواسطة: @${senderNum}\nالمستهدف: @${targetNum}${cmd === 'ban' && cmdBlacklistEnabled ? '\n🚫 تم إضافته للقائمة السوداء.' : ''}`;
                                try { await client.sendMessage(cmdAdminGroup, confirmText, { mentions: [cleanAuthorId, targetCleanId] }); } catch (e) { }
                                console.log(`[أمر] ${cmd} على ${targetCleanId} في ${chat.name} بواسطة ${cleanAuthorId}`);
                            } catch (err) {
                                try {
                                    await msg.reply(cmdAdminLang === 'en'
                                        ? '⚠️ Failed to remove the participant. They may have already left or the bot lacks permissions.'
                                        : '⚠️ فشل الطرد. ربما غادر العضو مسبقاً أو البوت لا يملك الصلاحية الكافية.');
                                } catch (e) { }
                            }
                        }
                    } else if (cmd === 'report') {
                        // Get quoted message body for context
                        let reportedContent = '';
                        if (msg.hasQuotedMsg) {
                            try {
                                const quoted = await msg.getQuotedMessage();
                                reportedContent = quoted.body || '';
                            } catch (e) { }
                        }
                        const senderNum = cleanAuthorId.split('@')[0];
                        const targetNum = (targetCleanId || '').split('@')[0];
                        const pollTitle = cmdAdminLang === 'en'
                            ? `🚨 Member Report in "${chat.name}"\nReported by: @${senderNum}\nReported user: @${targetNum}${reportedContent ? `\nMessage:\n"${reportedContent.slice(0, 200)}"` : ''}\n\nRemove this member${cmdBlacklistEnabled ? ' and blacklist' : ''}?`
                            : `🚨 بلاغ عضو في "${chat.name}"\nأرسله: @${senderNum}\nالمُبلَّغ عنه: @${targetNum}${reportedContent ? `\nالمحتوى:\n"${reportedContent.slice(0, 200)}"` : ''}\n\nهل تريد طرد هذا العضو${cmdBlacklistEnabled ? ' وحظره' : ''}؟`;
                        const pollOptions = cmdBlacklistEnabled
                            ? (cmdAdminLang === 'en' ? ['Yes, remove and blacklist', 'No'] : ['نعم، طرد وحظر', 'لا'])
                            : (cmdAdminLang === 'en' ? ['Yes, remove', 'No'] : ['نعم، طرد', 'لا']);
                        try {
                            const poll = new Poll(pollTitle, pollOptions);
                            const pollMsg = await client.sendMessage(cmdAdminGroup, poll, { mentions: [cleanAuthorId, targetCleanId] });
                            pendingBans.set(pollMsg.id._serialized, {
                                senderId: targetCleanId,
                                rawSenderId: targetRawId,
                                sourceGroupId: groupId,
                                pollMsg,
                                isBlacklistEnabled: cmdBlacklistEnabled
                            });
                            await msg.reply(cmdAdminLang === 'en'
                                ? '✅ Your report has been sent to the admins for review.'
                                : '✅ تم إرسال بلاغك للإدارة للمراجعة والتصويت.');
                            console.log(`[أمر] /report على ${targetCleanId} في ${chat.name} بواسطة ${cleanAuthorId}`);
                        } catch (e) { }
                    }
                }
                return; // Always exit after a command (authorized or not)
            }
            // ─────────────────────────────────────────────────────────────────

            let isWhitelistEnabled = config.enableWhitelist;
            if (groupConfig && typeof groupConfig.enableWhitelist !== 'undefined') {
                isWhitelistEnabled = groupConfig.enableWhitelist;
            }

            if (isWhitelistEnabled) {
                const globalWl = db.prepare('SELECT 1 FROM whitelist WHERE number = ?').get(cleanAuthorId);
                const useGlobal = groupConfig ? (groupConfig.useGlobalWhitelist !== false) : true;
                const inCustom = groupConfig && groupConfig.customWhitelist ? groupConfig.customWhitelist.includes(cleanAuthorId) : false;
                if ((useGlobal && globalWl) || inCustom) return;
            }

            if (groupConfig && groupConfig.enablePanicMode) {
                if (!lockedGroups.has(groupId)) {
                    const now = Date.now();
                    if (!groupRaidTrackers.has(groupId)) groupRaidTrackers.set(groupId, []);
                    let raidTracker = groupRaidTrackers.get(groupId);
                    raidTracker.push(now);
                    const timeWindowMs = (groupConfig.panicTimeWindow || 5) * 1000;
                    raidTracker = raidTracker.filter(t => now - t < timeWindowMs);
                    groupRaidTrackers.set(groupId, raidTracker);

                    const limit = groupConfig.panicMessageLimit || 10;
                    if (raidTracker.length >= limit) {
                        lockedGroups.add(groupId);
                        groupRaidTrackers.delete(groupId);
                        console.log(`[أمان] تم رصد هجوم (Raid) في مجموعة ${chat.name}! جاري الإغلاق...`);
                        try {
                            await chat.setMessagesAdminsOnly(true);
                            const lockMins = groupConfig.panicLockoutDuration || 10;
                            const rawAlertMsg = groupConfig.panicAlertMessage || '🚨 تم رصد هجوم (Raid)! تم إغلاق المجموعة لمدة {time} دقائق.';
                            const alertMsgText = rawAlertMsg.replace(/{time}/g, lockMins);
                            const alertTarget = groupConfig.panicAlertTarget || 'both';
                            let targetAdminGroup = (groupConfig.adminGroup && groupConfig.adminGroup.trim() !== '') ? groupConfig.adminGroup.trim() : config.defaultAdminGroup;
                            const panicAdminOpenText = tAdmin(
                                groupConfig,
                                config,
                                `🚨 *تنبيه طوارئ (Panic Mode)* 🚨\nتم رصد هجوم في مجموعة "${chat.name}" وإغلاقها تلقائياً لمدة ${lockMins} دقائق.`,
                                `🚨 *Panic Mode Alert* 🚨\nRaid activity was detected in "${chat.name}". The group was locked for ${lockMins} minutes.`
                            );
                            const panicAdminCloseText = tAdmin(
                                groupConfig,
                                config,
                                `🔓 *تنبيه طوارئ*\nتم إعادة فتح مجموعة "${chat.name}" بعد انتهاء فترة الإغلاق التلقائي.`,
                                `🔓 *Panic Mode Alert*\n"${chat.name}" has been unlocked after the automatic lock period ended.`
                            );

                            if (alertTarget === 'group' || alertTarget === 'both') await client.sendMessage(groupId, alertMsgText);
                            if (alertTarget === 'admin' || alertTarget === 'both') await client.sendMessage(targetAdminGroup, panicAdminOpenText);

                            setTimeout(async () => {
                                try {
                                    await chat.setMessagesAdminsOnly(false);
                                    if (alertTarget === 'group' || alertTarget === 'both') await client.sendMessage(groupId, '🔓 *انتهت فترة الإغلاق التلقائي. يمكنكم إرسال الرسائل الآن.*');
                                    if (alertTarget === 'admin' || alertTarget === 'both') await client.sendMessage(targetAdminGroup, panicAdminCloseText);
                                } catch (e) { console.error('[خطأ] فشل فتح المجموعة:', e); }
                                lockedGroups.delete(groupId);
                            }, lockMins * 60 * 1000);
                        } catch (e) {
                            console.error('[خطأ] فشل إغلاق المجموعة في وضع الطوارئ.', e);
                            lockedGroups.delete(groupId);
                        }
                    }
                }
            }

            let internalMsgType = 'text';
            if (msg.type === 'image') internalMsgType = 'image';
            else if (msg.type === 'video') internalMsgType = 'video';
            else if (msg.type === 'audio' || msg.type === 'ptt') internalMsgType = 'audio';
            else if (msg.type === 'document') internalMsgType = 'document';
            else if (msg.type === 'sticker') internalMsgType = 'sticker';

            const normalizedMessageText = (() => {
                const chunks = [];
                const bodyWithoutVCard = stripRawVCardBlocks(msg.body || '');
                if (bodyWithoutVCard.length > 0) chunks.push(bodyWithoutVCard);
                if ((msg.type === 'vcard' || msg.type === 'multi_vcard') && Array.isArray(msg.vCards) && msg.vCards.length > 0) {
                    const prettyVcards = formatVCardsForDisplay(msg.vCards);
                    if (prettyVcards) chunks.push(prettyVcards);
                }
                return chunks.join('\n').trim();
            })();

            const compactId = compactMsgId(msgId);
            const msgPreview = toLogPreview(normalizedMessageText, 100) || `[${internalMsgType}]`;
            console.log(`[رسالة] استلام | id=${compactId} | نوع=${internalMsgType} | نص="${msgPreview}"`);

            let targetAdminGroup = config.defaultAdminGroup;
            let isWordFilterEnabled = config.enableWordFilter;
            let isAIFilterEnabled = config.enableAIFilter;
            let isAIMediaEnabled = config.enableAIMedia;
            let isAutoActionEnabled = config.autoAction;
            let isBlacklistEnabled = config.enableBlacklist;
            let isAntiSpamEnabled = config.enableAntiSpam;
            let spamDuplicateLimit = config.spamDuplicateLimit;
            let spamAction = config.spamAction;
            let spamTypes = config.spamTypes;
            let spamLimits = config.spamLimits;
            let blockedTypes = config.blockedTypes;
            let blockedAction = config.blockedAction;
            let forbiddenWords = [...config.defaultWords];
            let aiTriggerWords = Array.isArray(config.aiFilterTriggerWords) && config.aiFilterTriggerWords.length > 0 ? config.aiFilterTriggerWords : ['نعم'];
            let adminMessageLang = normalizeAdminLang(config.defaultAdminLanguage);

            if (groupConfig) {
                targetAdminGroup = (groupConfig.adminGroup && groupConfig.adminGroup.trim() !== '') ? groupConfig.adminGroup.trim() : config.defaultAdminGroup;
                adminMessageLang = resolveAdminLang(groupConfig, config);
                if (typeof groupConfig.enableWordFilter !== 'undefined') isWordFilterEnabled = groupConfig.enableWordFilter;
                if (typeof groupConfig.enableAIFilter !== 'undefined') isAIFilterEnabled = groupConfig.enableAIFilter;
                if (typeof groupConfig.enableAIMedia !== 'undefined') isAIMediaEnabled = groupConfig.enableAIMedia;
                if (typeof groupConfig.autoAction !== 'undefined') isAutoActionEnabled = groupConfig.autoAction;
                if (typeof groupConfig.enableBlacklist !== 'undefined') isBlacklistEnabled = groupConfig.enableBlacklist;
                if (typeof groupConfig.enableAntiSpam !== 'undefined') {
                    isAntiSpamEnabled = groupConfig.enableAntiSpam;
                    spamDuplicateLimit = groupConfig.spamDuplicateLimit || 3;
                    spamAction = groupConfig.spamAction || 'poll';
                }
                if (groupConfig.spamTypes) spamTypes = groupConfig.spamTypes;
                if (groupConfig.spamLimits) spamLimits = groupConfig.spamLimits;
                if (groupConfig.blockedTypes) blockedTypes = groupConfig.blockedTypes;
                if (groupConfig.blockedAction) blockedAction = groupConfig.blockedAction;
                if (groupConfig.useDefaultWords === false) forbiddenWords = [];
                if (groupConfig.words && groupConfig.words.length > 0) forbiddenWords = [...forbiddenWords, ...groupConfig.words];
                if (Array.isArray(groupConfig.aiFilterTriggerWords) && groupConfig.aiFilterTriggerWords.length > 0) {
                    aiTriggerWords = groupConfig.aiFilterTriggerWords;
                }
            }

            if (isBlacklistEnabled) {
                const globalBl = db.prepare('SELECT 1 FROM blacklist WHERE number = ?').get(cleanAuthorId);
                const blockedExtensionsRows = db.prepare('SELECT ext FROM blocked_extensions').all();
                const isExtBlocked = blockedExtensionsRows.some(r => cleanAuthorId.replace('@c.us', '').startsWith(r.ext));
                const useGlobal = groupConfig ? (groupConfig.useGlobalBlacklist !== false) : true;
                const inCustom = groupConfig && groupConfig.customBlacklist ? groupConfig.customBlacklist.includes(cleanAuthorId) : false;
                if ((useGlobal && (globalBl || isExtBlocked)) || inCustom) {
                    console.log(`[أمان] رقم محظور أرسل رسالة. سيتم حذفه.`);
                    await safeDelay();
                    await msg.delete(true);
                    await chat.removeParticipants([rawAuthorId]);
                    return;
                }
            }

            if (blockedTypes.includes(internalMsgType)) {
                console.log(`[أمان] رصد نوع ممنوع قطعي (${internalMsgType}). يتم الحذف.`);
                await safeDelay();
                try { await msg.delete(true); } catch (e) { }
                if (blockedAction === 'auto') {
                    try {
                        await chat.removeParticipants([rawAuthorId]);
                        if (isBlacklistEnabled) db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanAuthorId);
                        const reportText = adminMessageLang === 'en'
                            ? `🚨 *Auto Ban (Blocked Type)*\nA member sent (${internalMsgType}) in "${chat.name}" and was removed.\n👤 *Sender:* @${cleanAuthorId.split('@')[0]}`
                            : `🚨 *حظر تلقائي (نوع ممنوع)*\nأرسل العضو ملف (${internalMsgType}) في "${chat.name}" وتم طرده.\n👤 *المرسل:* @${cleanAuthorId.split('@')[0]}`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanAuthorId] });
                    } catch (e) { }
                } else if (blockedAction === 'poll') {
                    const pollTitle = adminMessageLang === 'en'
                        ? `🚨 Violation Alert in "${chat.name}"\nSender: @${cleanAuthorId.split('@')[0]}\nReason: Sent blocked type (${internalMsgType})\n\nDo you want to remove this number${isBlacklistEnabled ? ' and add it to blacklist' : ''}?`
                        : `🚨 إشعار بمخالفة في "${chat.name}"\nالمرسل: @${cleanAuthorId.split('@')[0]}\nالسبب: إرسال نوع ممنوع (${internalMsgType})\n\nهل ترغب في طرد الرقم${isBlacklistEnabled ? ' وإضافته للقائمة السوداء' : ''}؟`;
                    const poll = new Poll(pollTitle, isBlacklistEnabled ? (adminMessageLang === 'en' ? ['Yes, remove and blacklist', 'No'] : ['نعم، طرد وحظر', 'لا']) : (adminMessageLang === 'en' ? ['Yes, remove', 'No'] : ['نعم، طرد', 'لا']));
                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [cleanAuthorId] });
                    pendingBans.set(pollMsg.id._serialized, {
                        senderId: cleanAuthorId,
                        rawSenderId: rawAuthorId,
                        sourceGroupId: groupId,
                        pollMsg: pollMsg,
                        isBlacklistEnabled: isBlacklistEnabled
                    });
                }
                return;
            }

            if (isAntiSpamEnabled) {
                const trackerKey = `${groupId}_${cleanAuthorId}`;
                if (spamMutedUsers.has(trackerKey)) {
                    if (Date.now() < spamMutedUsers.get(trackerKey)) {
                        try { await msg.delete(true); } catch (e) { }
                        return;
                    } else { spamMutedUsers.delete(trackerKey); }
                }

                if (!userTrackers.has(trackerKey)) userTrackers.set(trackerKey, []);
                let tracker = userTrackers.get(trackerKey);
                const messageTime = msg.timestamp * 1000;
                tracker.push({ text: msg.body, time: messageTime, msgObj: msg, id: msgId, type: internalMsgType });
                tracker = tracker.filter(m => messageTime - m.time < 15000);
                userTrackers.set(trackerKey, tracker);

                let isSpamFlagged = false;
                let spamFlagReason = '';

                if (spamTypes.includes(internalMsgType)) {
                    const typeCount = tracker.filter(m => m.type === internalMsgType).length;
                    const typeLimit = spamLimits[internalMsgType] || 5;
                    if (typeCount >= typeLimit) {
                        isSpamFlagged = true;
                        const arNames = { text: 'نصوص', image: 'صور', video: 'فيديو', audio: 'صوتيات', document: 'ملفات', sticker: 'ملصقات' };
                        spamFlagReason = `إرسال (${arNames[internalMsgType] || internalMsgType}) بسرعة تتجاوز الحد المسموح (${typeLimit} خلال 15ث)`;
                    }
                }

                if (!isSpamFlagged && internalMsgType === 'text') {
                    const textCounts = {};
                    for (const m of tracker) {
                        if (m.type === 'text' && m.text && m.text.trim().length > 0) {
                            textCounts[m.text] = (textCounts[m.text] || 0) + 1;
                            if (textCounts[m.text] >= spamDuplicateLimit) {
                                isSpamFlagged = true;
                                spamFlagReason = `تكرار نفس النص ${textCounts[m.text]} مرات متتالية`;
                                break;
                            }
                        }
                    }
                }

                if (isSpamFlagged) {
                    console.log(`[أمان] تم رصد مزعج في (${chat.name}): ${spamFlagReason}`);
                    spamMutedUsers.set(trackerKey, Date.now() + 60000);
                    for (const m of tracker) abortedMessages.add(m.id);
                    await safeDelay();
                    try { await msg.delete(true); } catch (e) { }
                    for (const m of tracker) {
                        if (m.id !== msgId) {
                            try { await m.msgObj.delete(true); await new Promise(r => setTimeout(r, 500)); } catch (err) { }
                        }
                    }
                    try {
                        const recentMsgs = await chat.fetchMessages({ limit: 15 });
                        for (const rMsg of recentMsgs) {
                            if ((rMsg.author || rMsg.from) === rawAuthorId) {
                                try { await rMsg.delete(true); await new Promise(r => setTimeout(r, 200)); } catch (e) { }
                            }
                        }
                    } catch (err) { }
                    userTrackers.delete(trackerKey);

                    const contact = await msg.getContact();
                    let senderId = cleanAuthorId;
                    if (contact && contact.number) senderId = `${contact.number}@c.us`;

                    if (spamAction === 'auto') {
                        try {
                            await chat.removeParticipants([rawAuthorId]);
                            if (isBlacklistEnabled) {
                                db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(senderId);
                            }
                            const reportText = adminMessageLang === 'en'
                                ? `🚨 *Auto Ban (Spam)*\nThe member was removed from "${chat.name}"${isBlacklistEnabled ? ' and added to blacklist' : ''}.\n\n👤 *Sender:* @${senderId.split('@')[0]}\n📋 *Reason:* ${spamFlagReason}`
                                : `🚨 *حظر تلقائي (إزعاج)*\nتم طرد العضو من "${chat.name}"${isBlacklistEnabled ? ' وإدراجه في القائمة السوداء' : ''}.\n\n👤 *المرسل:* @${senderId.split('@')[0]}\n📋 *السبب:* ${spamFlagReason}`;
                            await client.sendMessage(targetAdminGroup, reportText, { mentions: [senderId] });
                        } catch (e) { }
                    } else {
                        const pollOptions = isBlacklistEnabled
                            ? (adminMessageLang === 'en' ? ['Yes, remove and blacklist', 'No, only delete'] : ['نعم، طرد وحظر', 'لا، اكتف بالحذف'])
                            : (adminMessageLang === 'en' ? ['Yes, remove member', 'No'] : ['نعم، طرد العضو', 'لا']);
                        const pollTitle = adminMessageLang === 'en'
                            ? `🚨 Spam Alert in "${chat.name}"\nSender: @${senderId.split('@')[0]}\nReason: ${spamFlagReason}\n\nDo you want to remove this number${isBlacklistEnabled ? ' and add it to blacklist' : ''}?`
                            : `🚨 إشعار إزعاج في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${spamFlagReason}\n\nهل ترغب في طرد الرقم${isBlacklistEnabled ? ' وإضافته للقائمة السوداء' : ''}؟`;
                        const poll = new Poll(pollTitle, pollOptions);
                        const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });
                        pendingBans.set(pollMsg.id._serialized, {
                            senderId: senderId,
                            rawSenderId: rawAuthorId,
                            sourceGroupId: groupId,
                            pollMsg: pollMsg,
                            isBlacklistEnabled: isBlacklistEnabled
                        });
                    }
                    return;
                }
            }

            let isViolating = false;
            let violationReason = '';
            const isMediaContent = internalMsgType !== 'text';

            if (isWordFilterEnabled && forbiddenWords.length > 0 && normalizedMessageText) {
                const normalizedLower = normalizedMessageText.toLowerCase();
                const matchedWord = forbiddenWords.find(word => {
                    if (typeof word !== 'string' || word.trim().length === 0) return false;
                    return normalizedLower.includes(word.toLowerCase());
                });
                if (matchedWord) {
                    isViolating = true;
                    violationReason = `تطابق تام مع الكلمة المحظورة: [${matchedWord}]`;
                }
            }

            // Q&A Feature Check
            let isQAMatched = false;
            let qaAnswer = '';
            let matchedQA = null;
            if (groupConfig && groupConfig.enableQAFeature && groupConfig.qaList && groupConfig.qaList.length > 0 && msg.body && internalMsgType === 'text') {
                const messageText = msg.body.toLowerCase().trim();
                for (const qa of groupConfig.qaList) {
                    const questions = qa.questions || [qa.question];
                    const matchedQuestion = questions.find(q => messageText.includes(q.toLowerCase().trim()));
                    if (matchedQuestion) {
                        isQAMatched = true;
                        qaAnswer = qa.answer || '';
                        matchedQA = qa;
                        console.log(`[Q&A] تم رصد سؤال مطابق في "${chat.name}": "${matchedQuestion}"`);
                        break;
                    }
                }

                // Send Q&A response (with optional media attachment)
                if (isQAMatched && (qaAnswer || (matchedQA && matchedQA.mediaFile))) {
                    try {
                        let finalAnswer = qaAnswer;

                        // Replace {date}
                        const now = new Date();
                        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
                        finalAnswer = finalAnswer.replace(/{date}/g, dateStr);

                        // Replace {eventdate} and {eventdate:Label}
                        const isArabic = (groupConfig.qaLanguage || 'ar') === 'ar';
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        function getEventDateStr(dateVal) {
                            if (!dateVal) return '';
                            const eventDate = new Date(dateVal);
                            eventDate.setHours(0, 0, 0, 0);
                            const daysLeft = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
                            const eventDateStr = `${String(eventDate.getDate()).padStart(2, '0')}/${String(eventDate.getMonth() + 1).padStart(2, '0')}/${eventDate.getFullYear()}`;
                            if (isArabic) {
                                return daysLeft > 0 ? `${daysLeft} أيام متبقية - ${eventDateStr}` : (daysLeft === 0 ? `اليوم - ${eventDateStr}` : `منذ ${Math.abs(daysLeft)} أيام - ${eventDateStr}`);
                            } else {
                                return daysLeft > 0 ? `${daysLeft} days left - ${eventDateStr}` : (daysLeft === 0 ? `Today - ${eventDateStr}` : `${Math.abs(daysLeft)} days ago - ${eventDateStr}`);
                            }
                        }

                        // Handle legacy {eventdate}
                        let eventDateLegacy = matchedQA.eventDate || groupConfig.eventDate;
                        let eventDatesArray = (matchedQA.eventDates && matchedQA.eventDates.length > 0) ? matchedQA.eventDates : groupConfig.eventDates;

                        if (eventDateLegacy) {
                            finalAnswer = finalAnswer.replace(/{eventdate}/g, getEventDateStr(eventDateLegacy));
                        } else if (eventDatesArray && eventDatesArray.length > 0) {
                            // If no single eventDate, use the first one from eventDates array for {eventdate}
                            finalAnswer = finalAnswer.replace(/{eventdate}/g, getEventDateStr(eventDatesArray[0].date));
                        }

                        // Handle labeled {eventdate:Label}
                        if (eventDatesArray && eventDatesArray.length > 0) {
                            eventDatesArray.forEach(ed => {
                                if (ed.label && ed.date) {
                                    const regex = new RegExp(`{eventdate:${ed.label}}`, 'g');
                                    finalAnswer = finalAnswer.replace(regex, getEventDateStr(ed.date));
                                }
                            });
                        }

                        // Replace {user}
                        const contact = await msg.getContact();
                        const userName = contact ? (contact.name || contact.number) : cleanAuthorId.split('@')[0];
                        finalAnswer = finalAnswer.replace(/{user}/g, userName);

                        // Send media + caption, or plain text
                        await safeDelay();
                        if (matchedQA && matchedQA.mediaFile) {
                            const mediaPath = path.join(__dirname, 'media', groupId, matchedQA.mediaFile);
                            if (fs.existsSync(mediaPath)) {
                                const media = MessageMedia.fromFilePath(mediaPath);
                                await chat.sendMessage(media, { caption: finalAnswer || undefined });
                            } else {
                                if (finalAnswer) await chat.sendMessage(finalAnswer);
                            }
                        } else {
                            await chat.sendMessage(finalAnswer);
                        }
                    } catch (err) {
                        console.error(`[Q&A] خطأ في إرسال الإجابة: ${err.message}`);
                    }
                    return;
                }
            }


            let canSendToAI = false;
            let base64Image = null;

            if (!isViolating && isAIFilterEnabled) {
                if (!isMediaContent) {
                    if (msg.body && msg.body.trim().length > 0) canSendToAI = true;
                } else {
                    if (isAIMediaEnabled) {
                        canSendToAI = true;
                        if (msg.type === 'image') {
                            try {
                                const media = await msg.downloadMedia();
                                if (media && media.data) base64Image = media.data;
                            } catch (err) { }
                        }
                    } else if (msg.body && msg.body.trim().length > 0) {
                        canSendToAI = true;
                    }
                }
            }

            if (canSendToAI) {
                try {
                    const msgText = normalizedMessageText;
                    console.log(`[AI] إرسال | id=${compactId} | نص="${toLogPreview(msgText, 100)}"`);
                    const payload = { model: config.ollamaModel, prompt: msgText, stream: false };
                    if (base64Image) payload.images = [base64Image];

                    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                    });

                    if (abortedMessages.has(msgId)) { abortedMessages.delete(msgId); return; }

                    const data = await response.json();
                    const aiText = data && typeof data.response === 'string' ? data.response : '';
                    console.log(`[AI] رد | id=${compactId} | نص="${toLogPreview(aiText, 140)}"`);
                    if (aiText && aiTriggerWords.some(word => aiText.includes(word))) {
                        isViolating = true;
                        violationReason = 'تم التصنيف كمخالفة عبر الذكاء الاصطناعي';
                    }
                } catch (error) {
                    console.error(`[AI] خطأ | id=${compactId} | السبب=${error.message || error}`);
                }
            } else {
                let aiSkipReason = 'غير مستوفية لشروط الفحص';
                const hasText = normalizedMessageText.length > 0;
                if (isViolating) aiSkipReason = 'تم اعتبارها مخالفة قبل AI';
                else if (!isAIFilterEnabled) aiSkipReason = 'فلتر AI معطل';
                else if (!hasText && !isAIMediaEnabled) aiSkipReason = 'وسائط بدون نص وفلتر الوسائط معطل';
                else if (!hasText) aiSkipReason = 'لا يوجد نص للتحليل';
                console.log(`[AI] تخطي | id=${compactId} | السبب=${aiSkipReason}`);
            }

            if (isViolating) {
                const contact = await msg.getContact();
                let senderId = cleanAuthorId;
                if (contact && contact.number) senderId = `${contact.number}@c.us`;

                const cleanBodyFallback = stripRawVCardBlocks(msg.body || '');
                const messageContent = normalizedMessageText || cleanBodyFallback || '[مرفق وسائط]';
                await safeDelay();
                await msg.delete(true);

                if (isAutoActionEnabled) {
                    try {
                        await chat.removeParticipants([rawAuthorId]);
                        if (isBlacklistEnabled) db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(senderId);

                        const reportText = adminMessageLang === 'en'
                            ? `🚨 *Auto Moderation Report*\nViolating content was deleted and the member was removed from "${chat.name}".\n\n👤 *Sender:* @${senderId.split('@')[0]}\n📋 *Reason:* ${violationReason}\n📝 *Deleted Content:*\n"${messageContent}"`
                            : `🚨 *تقرير إجراء وحظر تلقائي*\nتم مسح محتوى مخالف وطرد العضو من "${chat.name}".\n\n👤 *المرسل:* @${senderId.split('@')[0]}\n📋 *السبب:* ${violationReason}\n📝 *النص الممسوح:*\n"${messageContent}"`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [senderId] });
                    } catch (e) { }
                } else {
                    const pollOptions = isBlacklistEnabled
                        ? (adminMessageLang === 'en' ? ['Yes, remove and blacklist', 'No, only delete'] : ['نعم، طرد وحظر', 'لا، اكتف بالحذف'])
                        : (adminMessageLang === 'en' ? ['Yes, remove', 'No'] : ['نعم، طرد', 'لا']);
                    const pollTitle = adminMessageLang === 'en'
                        ? `🚨 Violation Alert in "${chat.name}"\nSender: @${senderId.split('@')[0]}\nReason: ${violationReason}\nContent:\n"${messageContent}"\n\nDo you want to remove this member?`
                        : `🚨 إشعار بمحتوى مخالف في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${violationReason}\nالنص:\n"${messageContent}"\n\nهل ترغب في طرده؟`;
                    const poll = new Poll(pollTitle, pollOptions);

                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });
                    pendingBans.set(pollMsg.id._serialized, {
                        senderId: senderId,
                        rawSenderId: rawAuthorId,
                        sourceGroupId: groupId,
                        pollMsg: pollMsg,
                        isBlacklistEnabled: isBlacklistEnabled
                    });
                }
            }
        }
    } catch (error) { }
});

client.on('vote_update', async vote => {
    const pollId = vote && vote.parentMessage && vote.parentMessage.id ? vote.parentMessage.id._serialized : null;
    if (!pollId || !pendingBans.has(pollId)) return;

    const data = pendingBans.get(pollId);
    const userToBan = data.senderId;
    const userNumber = (typeof userToBan === 'string' ? userToBan.split('@')[0] : '').trim();
    const candidateIds = [];
    if (data.rawSenderId) candidateIds.push(data.rawSenderId);
    if (userToBan) candidateIds.push(userToBan);
    if (userNumber) candidateIds.push(`${userNumber}@c.us`);
    if (userNumber) candidateIds.push(`${userNumber}@lid`);

    const yesSelected = isYesVoteSelected(vote, vote.parentMessage);
    const noSelected = isNoVoteSelected(vote, vote.parentMessage);

    if (!yesSelected && !noSelected) {
        return;
    }

    if (yesSelected) {
        if (data.isBlacklistEnabled) {
            try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(userToBan); } catch (e) { }
        }

        let removed = false;
        if (data.sourceGroupId) {
            try {
                const sourceChat = await client.getChatById(data.sourceGroupId);
                removed = await tryKickFromChat(sourceChat, candidateIds);
            } catch (e) { }
        }

        if (!removed) {
            const botId = client.info && client.info.wid ? client.info.wid._serialized : null;
            const chats = await client.getChats();
            for (const chat of chats) {
                if (!chat.isGroup) continue;
                const botData = botId ? chat.participants.find(p => p.id._serialized === botId) : null;
                if (!botData || !(botData.isAdmin || botData.isSuperAdmin)) continue;
                const done = await tryKickFromChat(chat, candidateIds);
                if (done) {
                    removed = true;
                    break;
                }
            }
        }

        const replyText = removed
            ? (data.isBlacklistEnabled ? '✅ *تم تطبيق الطرد وإدراج الرقم في القائمة السوداء بنجاح.*' : '✅ *تم تطبيق الطرد بنجاح.*')
            : (data.isBlacklistEnabled ? '⚠️ *تم إدراج الرقم في القائمة السوداء، لكن فشل الطرد الآن. قد يكون العضو غير موجود أو ليست هناك صلاحية كافية.*' : '⚠️ *فشل الطرد الآن. قد يكون العضو غير موجود أو ليست هناك صلاحية كافية.*');
        await data.pollMsg.reply(replyText);
        pendingBans.delete(pollId);
        return;
    }

    if (noSelected) {
        await data.pollMsg.reply('🛑 *تم إلغاء الطرد بناءً على تصويت الإدارة.*');
        pendingBans.delete(pollId);
    }
});

// Initialize client with retry logic and detailed logging
async function initializeClientWithRetry(retryCount = 0, maxRetries = 5) {
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
    
    if (retryCount > 0) {
        console.log(`[معلومة] المحاولة ${retryCount} لتهيئة الاتصال...`);
        addConnectionLog(`اعادة محاولة #${retryCount}`, `انتظر ${retryDelay}ms قبل اعادة المحاولة`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    try {
        if (retryCount === 0) {
            console.log('[معلومة] جاري بدء البوت...');
            addConnectionLog('بدء البوت', 'محاولة اولى للتهيئة');
            initializationStartTime = Date.now();
        }
        
        isInitializing = true;
        botStatusKind = 'initializing';
        console.log(`[معلومة] مرحلة 1: اوضاي التهيئة...`);
        addConnectionLog('التهيئة الجارية', 'مرحلة 1/3: التهيئة');
        
        // Set initialization timeout to detect hangs
        initializationTimeout = setTimeout(() => {
            console.error('[خطأ] استنزاف وقت التهيئة (timeout)!');
            addConnectionLog('انتهاء الوقت', 'انقضى وقت التهيئة المسموح به (60 ثانية)');
            isInitializing = false;
            botStatus = '<i class="fas fa-exclamation-triangle"></i> خطأ: انقضى وقت التهيئة';
            botStatusKind = 'error';
        }, 60000); // 60 second timeout
        
        await client.initialize();
        
        // Clear timeout if initialization completes successfully
        if (initializationTimeout) {
            clearTimeout(initializationTimeout);
            initializationTimeout = null;
        }
        
        console.log('[معلومة] تمت تهيئة البوت بنجاح في المحاولة ' + (retryCount + 1));
        addConnectionLog('تهيئة ناجحة', `تمت التهيئة في المحاولة ${retryCount + 1}`);
        
    } catch (error) {
        isInitializing = false;
        
        if (initializationTimeout) {
            clearTimeout(initializationTimeout);
            initializationTimeout = null;
        }
        
        const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
        const errorStack = error && error.stack ? error.stack : 'No stack trace available';
        const errorName = error && error.name ? error.name : 'Unknown';
        
        console.error(`[خطأ] فشلت تهيئة البوت مرة ${retryCount + 1}:`, {
            errorName,
            message: errorMsg,
            stack: errorStack,
            retryAttempt: retryCount + 1,
            maxRetries,
            timestamp: new Date().toISOString(),
            elapsedMs: initializationStartTime ? Date.now() - initializationStartTime : 'N/A'
        });
        
        addConnectionLog(`خطأ #${retryCount + 1}`, `${errorName}: ${errorMsg}`);
        
        if (retryCount < maxRetries) {
            console.log(`[معلومة] سيتم إعادة المحاولة (رقم ${retryCount + 2} من ${maxRetries + 1})`);
            botStatus = `<i class="fas fa-spin fa-spinner"></i> خطأ - اعادة محاولة (${retryCount + 1}/${maxRetries})`;
            botStatusKind = 'retrying';
            
            // Retry with exponential backoff
            return initializeClientWithRetry(retryCount + 1, maxRetries);
        } else {
            console.error(`[خطأ حرج] فشلت جميع محاولات التهيئة (${maxRetries + 1} محاولات)!`);
            botStatus = `<i class="fas fa-exclamation-triangle"></i> فشل بدء البوت بعد ${maxRetries + 1} محاولات`;
            botStatusKind = 'error';
            addConnectionLog('فشل نهائي', `فشلت جميع ${maxRetries + 1} محاولات برسالة: ${errorMsg}`);
        }
    }
}

// Start the client
(async () => {
    try {
        await initializeClientWithRetry();
    } catch (error) {
        console.error('[خطأ] خطأ غير متوقع عند بدء البوت:', error);
    }
})();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[معلومة] تم استقبال إشارة SIGTERM، جاري إغلاق البوت...');
    try {
        await client.destroy();
    } catch (e) {
        console.error('[خطأ] خطأ أثناء إغلاق البوت:', e.message);
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[معلومة] تم استقبال إشارة SIGINT، جاري إغلاق البوت...');
    try {
        await client.destroy();
    } catch (e) {
        console.error('[خطأ] خطأ أثناء إغلاق البوت:', e.message);
    }
    process.exit(0);
});

async function screenPendingMembershipRequests() {
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            if (!chat.isGroup) continue;

            const groupId = chat.id._serialized;
            const groupConfig = config.groupsConfig[groupId];

            let isJoinProfileScreeningEnabled = config.enableJoinProfileScreening;
            let isWordFilterEnabled = config.enableWordFilter;
            let isAIFilterEnabled = config.enableAIFilter;
            let isBlacklistEnabled = config.enableBlacklist;
            let isWhitelistEnabled = config.enableWhitelist;
            let targetAdminGroup = config.defaultAdminGroup;
            let forbiddenWords = [...config.defaultWords];
            let aiTriggerWords = Array.isArray(config.aiFilterTriggerWords) && config.aiFilterTriggerWords.length > 0 ? config.aiFilterTriggerWords : ['نعم'];

            if (groupConfig) {
                if (typeof groupConfig.enableJoinProfileScreening !== 'undefined') isJoinProfileScreeningEnabled = groupConfig.enableJoinProfileScreening;
                if (typeof groupConfig.enableWordFilter !== 'undefined') isWordFilterEnabled = groupConfig.enableWordFilter;
                if (typeof groupConfig.enableAIFilter !== 'undefined') isAIFilterEnabled = groupConfig.enableAIFilter;
                if (typeof groupConfig.enableBlacklist !== 'undefined') isBlacklistEnabled = groupConfig.enableBlacklist;
                if (typeof groupConfig.enableWhitelist !== 'undefined') isWhitelistEnabled = groupConfig.enableWhitelist;
                if (groupConfig.adminGroup && groupConfig.adminGroup.trim() !== '') targetAdminGroup = groupConfig.adminGroup.trim();
                if (groupConfig.useDefaultWords === false) forbiddenWords = [];
                if (groupConfig.words && groupConfig.words.length > 0) forbiddenWords = [...forbiddenWords, ...groupConfig.words];
                if (Array.isArray(groupConfig.aiFilterTriggerWords) && groupConfig.aiFilterTriggerWords.length > 0) {
                    aiTriggerWords = groupConfig.aiFilterTriggerWords;
                }
            }

            // Skip this group entirely only if neither blacklist nor profile screening is active
            if (!isBlacklistEnabled && (!isJoinProfileScreeningEnabled || (!isWordFilterEnabled && !isAIFilterEnabled))) continue;

            let pendingReqs = [];
            try {
                pendingReqs = await chat.getGroupMembershipRequests();
            } catch (e) {
                continue;
            }
            if (!pendingReqs || pendingReqs.length === 0) continue;

            // Load blacklist data once per group iteration
            const blacklistRows = db.prepare('SELECT number FROM blacklist').all();
            const blacklistArr = blacklistRows.map(r => r.number);
            const blockedExtensionsRows = db.prepare('SELECT ext FROM blocked_extensions').all();
            const blockedExtensionsArr = blockedExtensionsRows.map(r => r.ext);

            for (const req of pendingReqs) {
                const rawRequesterId = (req && (req.id || req.requesterId || req.author)) ? (req.id || req.requesterId || req.author) : null;
                if (!rawRequesterId) continue;

                const cacheKey = `${groupId}::${rawRequesterId}`;
                const lastTs = joinProfileReviewCache.get(cacheKey) || 0;
                if (Date.now() - lastTs < 2 * 60 * 1000) continue;
                joinProfileReviewCache.set(cacheKey, Date.now());

                let cleanRequesterId = rawRequesterId.replace(/:[0-9]+/, '');
                if (cleanRequesterId.includes('@lid')) {
                    try {
                        const contact = await client.getContactById(rawRequesterId);
                        if (contact && contact.number) cleanRequesterId = `${contact.number}@c.us`;
                        else cleanRequesterId = cleanRequesterId.replace('@lid', '@c.us');
                    } catch (e) { cleanRequesterId = cleanRequesterId.replace('@lid', '@c.us'); }
                }

                if (isWhitelistEnabled) {
                    const globalWl = db.prepare('SELECT 1 FROM whitelist WHERE number = ?').get(cleanRequesterId);
                    const useGlobalWl = groupConfig ? (groupConfig.useGlobalWhitelist !== false) : true;
                    const inCustomWl = groupConfig && groupConfig.customWhitelist ? groupConfig.customWhitelist.includes(cleanRequesterId) : false;
                    if ((useGlobalWl && globalWl) || inCustomWl) {
                        continue;
                    }
                }

                // ── Blacklist check for pending join requests ──────────────────
                if (isBlacklistEnabled) {
                    const finalCleanId = cleanRequesterId.replace('@c.us', '');
                    const isExtBlocked = blockedExtensionsArr.some(ext => finalCleanId.startsWith(ext));
                    const useGlobalBl = groupConfig ? (groupConfig.useGlobalBlacklist !== false) : true;
                    const inCustomBl = groupConfig && groupConfig.customBlacklist ? groupConfig.customBlacklist.includes(cleanRequesterId) : false;
                    const globalBl = db.prepare('SELECT 1 FROM blacklist WHERE number = ?').get(cleanRequesterId);

                    if ((useGlobalBl && (globalBl || isExtBlocked)) || inCustomBl) {
                        console.log(`[أمان] رفض طلب انضمام لرقم محظور (${cleanRequesterId}) في: ${chat.name}`);
                        try {
                            await chat.rejectGroupMembershipRequests({ requesterIds: [rawRequesterId] });
                            const reportText = tAdmin(
                                groupConfig,
                                config,
                                `🛡️ *حماية (قائمة سوداء)*\nتم رفض طلب انضمام لرقم محظور في مجموعة "${chat.name}" تلقائياً.\nالرقم: @${cleanRequesterId.split('@')[0]}`,
                                `🛡️ *Protection (Blacklist)*\nA join request from a blacklisted number was automatically rejected in "${chat.name}".\nNumber: @${cleanRequesterId.split('@')[0]}`
                            );
                            try { await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanRequesterId] }); } catch (e) { }
                        } catch (e) { }
                        continue; // skip profile screening for this requester
                    }
                }
                // ─────────────────────────────────────────────────────────────

                if (!isJoinProfileScreeningEnabled || (!isWordFilterEnabled && !isAIFilterEnabled)) continue;

                const profileResult = await evaluateJoinProfileViolation({
                    participantId: rawRequesterId,
                    cleanUserId: cleanRequesterId,
                    groupName: chat.name,
                    isWordFilterEnabled,
                    isAIFilterEnabled,
                    forbiddenWords,
                    aiTriggerWords
                });
                if (!profileResult.isViolating) continue;

                try {
                    await chat.rejectGroupMembershipRequests({ requesterIds: [rawRequesterId] });
                } catch (e) {
                    continue;
                }

                if (isBlacklistEnabled) {
                    try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanRequesterId); } catch (e) { }
                }

                const reportText = tAdmin(
                    groupConfig,
                    config,
                    `🚫 *فحص طلب الانضمام*
تم رفض طلب انضمام بعد فحص الاسم/النبذة.
المجموعة: "${chat.name}"
الرقم: @${cleanRequesterId.split('@')[0]}
السبب: ${profileResult.reason}
البيانات:
"${profileResult.profileText || 'غير متوفر'}"`,
                    `🚫 *Join Request Screening*
Join request was rejected after profile screening.
Group: "${chat.name}"
Number: @${cleanRequesterId.split('@')[0]}
Reason: ${profileResult.reason}
Profile:
"${profileResult.profileText || 'Unavailable'}"`
                );
                try { await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanRequesterId] }); } catch (e) { }
            }
        }
    } catch (e) { }
}

setInterval(() => {
    screenPendingMembershipRequests().catch(() => { });
}, 30000);