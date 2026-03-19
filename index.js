const express = require('express');
const { Client, LocalAuth, Poll, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Database = require('better-sqlite3');
const util = require('util');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const renderDashboard = require('./UI.js');

// Ensure media storage directory exists
if (!fs.existsSync('./media')) fs.mkdirSync('./media');

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

console.log = (...args) => { origLog(...args); saveLog('معلومة', args); };
console.error = (...args) => { origErr(...args); saveLog('خطأ', args); };

const db = new Database('./bot_data.sqlite');
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
        enable_welcome_message INTEGER, welcome_message_text TEXT, custom_words TEXT
    );
`);

const colsToAdd = [
    'blocked_types TEXT', 'blocked_action TEXT', 'spam_types TEXT', 'spam_limits TEXT',
    'enable_panic_mode INTEGER', 'panic_message_limit INTEGER', 'panic_time_window INTEGER',
    'panic_lockout_duration INTEGER', 'panic_alert_target TEXT', 'panic_alert_message TEXT',
    'enable_whitelist INTEGER', 'custom_blacklist TEXT', 'custom_whitelist TEXT',
    'use_global_blacklist INTEGER', 'use_global_whitelist INTEGER',
    'enable_qa_feature INTEGER', 'custom_qa TEXT', 'qa_event_date TEXT', 'qa_language TEXT', 'qa_event_dates TEXT'
];
colsToAdd.forEach(col => {
    try { db.exec(`ALTER TABLE custom_groups ADD COLUMN ${col}`); } catch (e) { }
});

function loadConfigFromDB() {
    let newConfig = {
        enableWordFilter: true, enableAIFilter: false, enableAIMedia: false,
        autoAction: false, enableBlacklist: true, enableWhitelist: true, enableAntiSpam: false,
        safeMode: false,
        spamDuplicateLimit: 3, spamFloodLimit: 5, spamAction: 'poll',
        blockedTypes: [], blockedAction: 'delete',
        spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
        spamLimits: { text: 7, image: 3, video: 2, audio: 3, document: 3, sticker: 3 },
        defaultAdminGroup: '', defaultWords: [], aiPrompt: 'امنع أي رسالة تحتوي على إعلانات تجارية.',
        aiFilterTriggerWords: ['نعم'],
        ollamaUrl: 'http://localhost:11434', ollamaModel: 'llava', groupsConfig: {}
    };

    db.prepare('SELECT * FROM global_settings').all().forEach(row => {
        if (['defaultWords', 'blockedTypes', 'spamTypes', 'spamLimits', 'aiFilterTriggerWords'].includes(row.key)) newConfig[row.key] = JSON.parse(row.value);
        else if (['enableWordFilter', 'enableAIFilter', 'enableAIMedia', 'autoAction', 'enableBlacklist', 'enableWhitelist', 'enableAntiSpam', 'safeMode'].includes(row.key)) {
            newConfig[row.key] = row.value === '1';
        } else if (['spamDuplicateLimit', 'spamFloodLimit'].includes(row.key)) {
            newConfig[row.key] = parseInt(row.value, 10);
        } else newConfig[row.key] = row.value;
    });

    db.prepare('SELECT * FROM llm_settings').all().forEach(row => { newConfig[row.key] = row.value; });

    db.prepare('SELECT * FROM custom_groups').all().forEach(g => {
        newConfig.groupsConfig[g.group_id] = {
            adminGroup: g.admin_group, useDefaultWords: g.use_default_words === 1,
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
            enableQAFeature: g.enable_qa_feature === 1, qaList: JSON.parse(g.custom_qa || '[]'), eventDate: g.qa_event_date || '', qaLanguage: g.qa_language || 'ar', eventDates: JSON.parse(g.qa_event_dates || '[]')
        };
    });
    return newConfig;
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
        setGlobal.run('safeMode', conf.safeMode ? '1' : '0');
        setGlobal.run('spamDuplicateLimit', conf.spamDuplicateLimit.toString());
        setGlobal.run('spamAction', conf.spamAction);
        setGlobal.run('blockedTypes', JSON.stringify(conf.blockedTypes));
        setGlobal.run('blockedAction', conf.blockedAction);
        setGlobal.run('spamTypes', JSON.stringify(conf.spamTypes));
        setGlobal.run('spamLimits', JSON.stringify(conf.spamLimits));
        setGlobal.run('defaultAdminGroup', conf.defaultAdminGroup);
        setGlobal.run('defaultWords', JSON.stringify(conf.defaultWords));
        setGlobal.run('aiFilterTriggerWords', JSON.stringify(conf.aiFilterTriggerWords || ['نعم']));

        const setLLM = db.prepare('INSERT OR REPLACE INTO llm_settings (key, value) VALUES (?, ?)');
        setLLM.run('aiPrompt', conf.aiPrompt); setLLM.run('ollamaUrl', conf.ollamaUrl); setLLM.run('ollamaModel', conf.ollamaModel);

        db.prepare('DELETE FROM custom_groups').run();
        const insertGroup = db.prepare(`
            INSERT INTO custom_groups (
                group_id, admin_group, use_default_words, enable_word_filter, enable_ai_filter, 
                enable_ai_media, auto_action, enable_blacklist, enable_whitelist, enable_anti_spam, spam_duplicate_limit, 
                spam_action, enable_welcome_message, welcome_message_text, custom_words,
                blocked_types, blocked_action, spam_types, spam_limits,
                enable_panic_mode, panic_message_limit, panic_time_window, panic_lockout_duration,
                panic_alert_target, panic_alert_message, custom_blacklist, custom_whitelist, use_global_blacklist, use_global_whitelist,
                enable_qa_feature, custom_qa, qa_event_date, qa_language, qa_event_dates
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [gId, gData] of Object.entries(conf.groupsConfig)) {
            insertGroup.run(
                gId, gData.adminGroup, gData.useDefaultWords ? 1 : 0, gData.enableWordFilter ? 1 : 0,
                gData.enableAIFilter ? 1 : 0, gData.enableAIMedia ? 1 : 0, gData.autoAction ? 1 : 0,
                gData.enableBlacklist ? 1 : 0, gData.enableWhitelist ? 1 : 0, gData.enableAntiSpam ? 1 : 0, gData.spamDuplicateLimit,
                gData.spamAction, gData.enableWelcomeMessage ? 1 : 0, gData.welcomeMessageText, JSON.stringify(gData.words),
                JSON.stringify(gData.blockedTypes || []), gData.blockedAction || 'delete',
                JSON.stringify(gData.spamTypes || []), JSON.stringify(gData.spamLimits || {}),
                gData.enablePanicMode ? 1 : 0, gData.panicMessageLimit, gData.panicTimeWindow,
                gData.panicLockoutDuration, gData.panicAlertTarget, gData.panicAlertMessage,
                JSON.stringify(gData.customBlacklist || []), JSON.stringify(gData.customWhitelist || []),
                gData.useGlobalBlacklist ? 1 : 0, gData.useGlobalWhitelist ? 1 : 0,
                gData.enableQAFeature ? 1 : 0, JSON.stringify(gData.qaList || []), gData.eventDate || '', gData.qaLanguage || 'ar', JSON.stringify(gData.eventDates || [])
            );
        }
    });
    saveTx();
}

if (db.prepare('SELECT count(*) as count FROM global_settings').get().count === 0) saveConfigToDB(loadConfigFromDB());
let config = loadConfigFromDB();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let currentQR = '';
let botStatus = '<i class="fas fa-spinner fa-spin"></i> جاري تهيئة النظام وبدء التشغيل...';
const userTrackers = new Map(); const abortedMessages = new Set(); const spamMutedUsers = new Map();
const groupRaidTrackers = new Map(); const lockedGroups = new Set();

app.get('/', (req, res) => {
    const html = renderDashboard(req, db, config);
    res.send(html);
});

app.get('/api/groups', (req, res) => {
    try {
        const groups = db.prepare('SELECT * FROM whatsapp_groups').all();
        res.json(groups);
    } catch (e) { res.json([]); }
});

app.post('/api/blacklist/add', (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(req.body.number);
            console.log(`[أمان] تم إضافة رقم للقائمة السوداء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/whitelist/add', (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('INSERT OR IGNORE INTO whitelist (number) VALUES (?)').run(req.body.number);
            console.log(`[أمان] تم إضافة رقم موثوق للقائمة البيضاء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/blacklist/remove', (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('DELETE FROM blacklist WHERE number = ?').run(req.body.number);
            console.log(`[أمان] تم إزالة رقم من القائمة السوداء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/extensions/add', (req, res) => {
    if (req.body.ext) {
        try {
            db.prepare('INSERT OR IGNORE INTO blocked_extensions (ext) VALUES (?)').run(String(req.body.ext));
            console.log(`[أمان] تم إضافة رمز دولة للقائمة السوداء: ${req.body.ext}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/extensions/remove', (req, res) => {
    if (req.body.ext) {
        try {
            db.prepare('DELETE FROM blocked_extensions WHERE ext = ?').run(String(req.body.ext));
            console.log(`[أمان] تم إزالة رمز دولة من القائمة السوداء: ${req.body.ext}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/whitelist/remove', (req, res) => {
    if (req.body.number) {
        try {
            db.prepare('DELETE FROM whitelist WHERE number = ?').run(req.body.number);
            console.log(`[أمان] تم إزالة رقم من القائمة البيضاء عبر اللوحة: ${req.body.number}`);
        } catch (e) { }
    }
    res.sendStatus(200);
});

app.post('/api/blacklist/purge', async (req, res) => {
    if (!client.info || !client.info.wid) {
        return res.status(400).json({ error: 'البوت غير متصل حالياً، يرجى الانتظار. / Bot disconnected, please wait.' });
    }
    try {
        console.log(`[تنظيف] بدأت عملية المسح الشامل للمجموعات...`);
        const blacklistRows = db.prepare('SELECT number FROM blacklist').all();
        const blacklistArr = blacklistRows.map(r => r.number);
        const blockedExtensionsRows = db.prepare('SELECT ext FROM blocked_extensions').all();
        const blockedExtensionsArr = blockedExtensionsRows.map(r => r.ext);
        if (blacklistArr.length === 0 && blockedExtensionsArr.length === 0) return res.json({ message: 'القائمة السوداء فارغة. / Blacklist is empty.' });

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
                            let usersToReject = [];
                            for (const req of pendingReqs) {
                                let rawId = typeof req.id === 'string' ? req.id : (req.id._serialized || (req.id.user && req.id.server ? `${req.id.user}@${req.id.server}` : null));
                                if (!rawId) continue;

                                let cleanId = rawId.replace(/:[0-9]+/, '');
                                if (cleanId.includes('@lid')) {
                                    try {
                                        const contact = await client.getContactById(rawId);
                                        if (contact && contact.number) {
                                            cleanId = `${contact.number}@c.us`;
                                        }
                                    } catch (err) { }
                                }

                                const finalCleanId = cleanId.replace(/:[0-9]+/, '').replace('@c.us', '');
                                const isExtBlocked = blockedExtensionsArr.some(ext => finalCleanId.startsWith(ext));
                                if (isExtBlocked || blacklistArr.includes(finalCleanId) || blacklistArr.includes(cleanId) || blacklistArr.includes(rawId)) {
                                    usersToReject.push(rawId);
                                }
                            }

                            if (usersToReject.length > 0) {
                                await chat.rejectGroupMembershipRequests({ requesterIds: usersToReject });
                                rejectedCount += usersToReject.length;
                                console.log(`[أمان] تم رفض ${usersToReject.length} طلبات انضمام لمحظورين في: ${chat.name}`);
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

app.get('/api/status', (req, res) => {
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
    res.json({ qr: currentQR, status: translatedStatus });
});

app.get('/api/logs', (req, res) => res.json(logsHistory));

app.post('/api/logout', async (req, res) => {
    try {
        botStatus = '<i class="fas fa-spinner fa-pulse"></i> جاري إنهاء الجلسة...';
        await client.logout();
        res.sendStatus(200);
    } catch (error) { res.sendStatus(500); }
});

app.post('/save', (req, res) => {
    try {
        saveConfigToDB(req.body);
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

// Upload a file for a group
app.post('/api/media/upload/:groupId', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ filename: req.file.filename, size: req.file.size });
});

// List files for a group
app.get('/api/media/list/:groupId', (req, res) => {
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
app.delete('/api/media/delete/:groupId/:filename', (req, res) => {
    const filePath = path.join('./media', req.params.groupId, req.params.filename);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.sendStatus(200);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// ─────────────────────────────────────────────────────────────────────────────

// ── Import/Export API ─────────────────────────────────────────────────────────
// Export dataset with selected options
app.post('/api/export', (req, res) => {
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
app.post('/api/import', (req, res) => {
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
                        group_id, admin_group, use_default_words, enable_word_filter, enable_ai_filter, 
                        enable_ai_media, auto_action, enable_blacklist, enable_whitelist, enable_anti_spam, 
                        spam_duplicate_limit, spam_action, enable_welcome_message, welcome_message_text, custom_words,
                        blocked_types, blocked_action, spam_types, spam_limits,
                        enable_panic_mode, panic_message_limit, panic_time_window, panic_lockout_duration,
                        panic_alert_target, panic_alert_message, custom_blacklist, custom_whitelist, 
                        use_global_blacklist, use_global_whitelist, enable_qa_feature, custom_qa, qa_event_date, 
                        qa_language, qa_event_dates
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const row of dataset.custom_groups) {
                    stmt.run(
                        row.group_id, row.admin_group, row.use_default_words, row.enable_word_filter,
                        row.enable_ai_filter, row.enable_ai_media, row.auto_action, row.enable_blacklist,
                        row.enable_whitelist, row.enable_anti_spam, row.spam_duplicate_limit, row.spam_action,
                        row.enable_welcome_message, row.welcome_message_text, row.custom_words,
                        row.blocked_types, row.blocked_action, row.spam_types, row.spam_limits,
                        row.enable_panic_mode, row.panic_message_limit, row.panic_time_window,
                        row.panic_lockout_duration, row.panic_alert_target, row.panic_alert_message,
                        row.custom_blacklist, row.custom_whitelist, row.use_global_blacklist,
                        row.use_global_whitelist, row.enable_qa_feature, row.custom_qa, row.qa_event_date,
                        row.qa_language, row.qa_event_dates
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
// ─────────────────────────────────────────────────────────────────────────────

// Safe Mode: random delay 10-60s to mimic human behaviour and avoid WhatsApp bot detection
async function safeDelay() {
    if (!config.safeMode) return;
    const ms = (Math.floor(Math.random() * 51) + 10) * 1000; // 10–60 seconds
    console.log(`[أمان] وضع آمن: تأخير ${ms / 1000} ثانية قبل الإجراء...`);
    await new Promise(r => setTimeout(r, ms));
};

// Generate a unique temp directory for each client instance
const tempProfileDir = `/tmp/chromium-wa-bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
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
            `--user-data-dir=${tempProfileDir}`
        ]
    }
});

client.on('ready', async () => {
    try {
        const chats = await client.getChats();
        syncTx(chats);
        console.log('[معلومة] تمت مزامنة ' + chats.length + ' مجموعة بنجاح.');
        botStatus = '<i class="fas fa-check-circle"></i> متصل وجاهز للعمل';
    } catch (error) {
        console.error('[خطأ] فشل مزامنة المجموعات: ' + error.message);
    }
});

client.on('authenticated', () => {
    botStatus = '<i class="fas fa-sync fa-spin"></i> تم تسجيل الدخول بنجاح، جاري جلب البيانات...';
    currentQR = '';
});

// Handle page errors that might cause frame detachment
client.on('page_created', (page) => {
    page.on('error', (error) => {
        console.error('[خطأ] Page error:', error.message);
    });
    
    page.on('close', () => {
        console.log('[معلومة] تم إغلاق صفحة WhatsApp Web');
    });
});

// Handle QR code generation
client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('[خطأ] فشل إنشاء QR code:', err.message);
            botStatus = '<i class="fas fa-exclamation-triangle"></i> خطأ في QR code';
            return;
        }
        currentQR = url;
        botStatus = '<i class="fas fa-qrcode"></i> بانتظار مسح رمز الاستجابة السريعة (QR Code)...';
        console.log('[معلومة] QR code متاح للمسح');
    });
});

client.on('disconnected', async (reason) => {
    botStatus = '<i class="fas fa-sign-out-alt"></i> تم تسجيل الخروج من الحساب...';
    currentQR = '';
    isInitializing = false;
    if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
    }
    try { await client.destroy(); } catch (e) { }
    setTimeout(() => { 
        console.log('[معلومة] إعادة تهيئة الاتصال...');
        initializeClientWithRetry(); 
    }, 3000);
});

// Flag to prevent concurrent initialization attempts
let isInitializing = false;
let initializationTimeout = null;

// Cleanup function to kill orphaned Chromium and related processes
async function cleanupChromiumProcesses() {
    return new Promise((resolve) => {
        exec('pkill -9 -f chromium 2>/dev/null; pkill -9 -f chrome 2>/dev/null; pkill -9 -f puppet 2>/dev/null; sleep 2', () => {
            setTimeout(resolve, 1500); // Wait for processes to fully terminate
        });
    });
}

// Cleanup function to remove old temporary directories and lock files
async function cleanupOldTempDirs() {
    return new Promise((resolve) => {
        exec('rm -rf /tmp/chromium-* /tmp/.org.chromium.* /tmp/.pki /tmp/.X* 2>/dev/null || true', () => {
            setTimeout(resolve, 500);
        });
    });
}

// Initialize client with retry logic
async function initializeClientWithRetry(retries = 0, maxRetries = 5) {
    if (isInitializing) {
        console.log('[معلومة] محاولة تهيئة أخرى جارية، سيتم الانتظار...');
        return;
    }

    isInitializing = true;

    if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
    }

    try {
        console.log(`[معلومة] محاولة رقم ${retries + 1} للاتصال...`);
        await client.initialize();
        isInitializing = false;
    } catch (error) {
        console.error(`[خطأ] فشل الاتصال في المحاولة ${retries + 1}:`, error.message);
        
        if (retries < maxRetries) {
            // Longer delay for frame detachment errors
            let delayMs = Math.pow(2, retries) * 3000;
            if (error.message.includes('Navigating frame was detached')) {
                delayMs = Math.max(delayMs, 8000); // At least 8 seconds for frame detachment
                console.log('[معلومة] تم رصد انفصال الإطار، زيادة وقت الانتظار...');
            }
            
            console.log(`[معلومة] إعادة المحاولة خلال ${delayMs / 1000} ثانية...`);
            botStatus = `<i class="fas fa-exclamation-triangle fa-spin"></i> محاولة إعادة الاتصال (${retries + 1}/${maxRetries})...`;
            
            isInitializing = false;
            
            initializationTimeout = setTimeout(async () => {
                try { 
                    await client.destroy(); 
                } catch (e) { }
                
                // Cleanup before retry
                await cleanupChromiumProcesses();
                await cleanupOldTempDirs();
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
                await initializeClientWithRetry(retries + 1, maxRetries);
            }, delayMs);
        } else {
            console.error('[خطأ] فشل الاتصال بعد جميع المحاولات');
            botStatus = '<i class="fas fa-times-circle"></i> فشل الاتصال! يرجى إعادة تشغيل البوت.';
            isInitializing = false;
        }
    }
}

client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const groupId = chat.id._serialized;
        try { db.prepare('INSERT OR REPLACE INTO whatsapp_groups (id, name) VALUES (?, ?)').run(groupId, chat.name); } catch (e) { }

        const groupConfig = config.groupsConfig[groupId];
        let isBlacklistEnabledForGroup = config.enableBlacklist;
        let isWhitelistEnabledForGroup = config.enableWhitelist;
        let targetAdminGroup = config.defaultAdminGroup;

        if (groupConfig) {
            if (typeof groupConfig.enableBlacklist !== 'undefined') isBlacklistEnabledForGroup = groupConfig.enableBlacklist;
            if (typeof groupConfig.enableWhitelist !== 'undefined') isWhitelistEnabledForGroup = groupConfig.enableWhitelist;
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
                            const reportText = `🛡️ *حماية (قائمة سوداء)*\nحاول رقم محظور الدخول لمجموعة "${chat.name}" وتم طرده.\nالرقم: @${cleanJoinedId.split('@')[0]}`;
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
        }
    } catch (error) { }
});

client.on('group_update', async (notification) => {
    try {
        const chat = await notification.getChat();
        db.prepare('UPDATE whatsapp_groups SET name = ? WHERE id = ?').run(chat.name, chat.id._serialized);
    } catch (e) { }
});

const pendingBans = new Map();

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

                            if (alertTarget === 'group' || alertTarget === 'both') await client.sendMessage(groupId, alertMsgText);
                            if (alertTarget === 'admin' || alertTarget === 'both') await client.sendMessage(targetAdminGroup, `🚨 *تنبيه طوارئ (Panic Mode)* 🚨\nتم رصد هجوم في مجموعة "${chat.name}" وإغلاقها تلقائياً لمدة ${lockMins} دقائق.`);

                            setTimeout(async () => {
                                try {
                                    await chat.setMessagesAdminsOnly(false);
                                    if (alertTarget === 'group' || alertTarget === 'both') await client.sendMessage(groupId, '🔓 *انتهت فترة الإغلاق التلقائي. يمكنكم إرسال الرسائل الآن.*');
                                    if (alertTarget === 'admin' || alertTarget === 'both') await client.sendMessage(targetAdminGroup, `🔓 *تنبيه طوارئ*\nتم إعادة فتح مجموعة "${chat.name}" بعد انتهاء فترة الإغلاق التلقائي.`);
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

            if (groupConfig) {
                targetAdminGroup = (groupConfig.adminGroup && groupConfig.adminGroup.trim() !== '') ? groupConfig.adminGroup.trim() : config.defaultAdminGroup;
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
                        const reportText = `🚨 *حظر تلقائي (نوع ممنوع)*\nأرسل العضو ملف (${internalMsgType}) في "${chat.name}" وتم طرده.\n👤 *المرسل:* @${cleanAuthorId.split('@')[0]}`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanAuthorId] });
                    } catch (e) { }
                } else if (blockedAction === 'poll') {
                    const pollTitle = `🚨 إشعار بمخالفة في "${chat.name}"\nالمرسل: @${cleanAuthorId.split('@')[0]}\nالسبب: إرسال نوع ممنوع (${internalMsgType})\n\nهل ترغب في طرد الرقم${isBlacklistEnabled ? ' وإضافته للقائمة السوداء' : ''}؟`;
                    const poll = new Poll(pollTitle, isBlacklistEnabled ? ['نعم، طرد وحظر', 'لا'] : ['نعم، طرد', 'لا']);
                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [cleanAuthorId] });
                    pendingBans.set(pollMsg.id._serialized, { senderId: cleanAuthorId, pollMsg: pollMsg, isBlacklistEnabled: isBlacklistEnabled });
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
                            const reportText = `🚨 *حظر تلقائي (إزعاج)*\nتم طرد العضو من "${chat.name}"${isBlacklistEnabled ? ' وإدراجه في القائمة السوداء' : ''}.\n\n👤 *المرسل:* @${senderId.split('@')[0]}\n📋 *السبب:* ${spamFlagReason}`;
                            await client.sendMessage(targetAdminGroup, reportText, { mentions: [senderId] });
                        } catch (e) { }
                    } else {
                        const pollOptions = isBlacklistEnabled ? ['نعم، طرد وحظر', 'لا، اكتف بالحذف'] : ['نعم، طرد العضو', 'لا'];
                        const pollTitle = `🚨 إشعار إزعاج في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${spamFlagReason}\n\nهل ترغب في طرد الرقم${isBlacklistEnabled ? ' وإضافته للقائمة السوداء' : ''}؟`;
                        const poll = new Poll(pollTitle, pollOptions);
                        const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });
                        pendingBans.set(pollMsg.id._serialized, { senderId: senderId, pollMsg: pollMsg, isBlacklistEnabled: isBlacklistEnabled });
                    }
                    return;
                }
            }

            let isViolating = false;
            let violationReason = '';
            const isMediaContent = internalMsgType !== 'text';

            if (isWordFilterEnabled && forbiddenWords.length > 0 && msg.body) {
                const matchedWord = forbiddenWords.find(word => msg.body.includes(word));
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
                        if (groupConfig.eventDate) {
                            finalAnswer = finalAnswer.replace(/{eventdate}/g, getEventDateStr(groupConfig.eventDate));
                        } else if (groupConfig.eventDates && groupConfig.eventDates.length > 0) {
                            // If no single eventDate, use the first one from eventDates array for {eventdate}
                            finalAnswer = finalAnswer.replace(/{eventdate}/g, getEventDateStr(groupConfig.eventDates[0].date));
                        }

                        // Handle labeled {eventdate:Label}
                        if (groupConfig.eventDates && groupConfig.eventDates.length > 0) {
                            groupConfig.eventDates.forEach(ed => {
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
                    const msgText = msg.body || '[صورة بدون نص مرفق]';
                    const aiPromptText = `أنت مشرف مجموعة صارم. تعليماتك هي: ${config.aiPrompt}\n\nبناء على التعليمات، هل هذا المحتوى يعتبر مخالف؟ أجب بكلمة "نعم" أو "لا" فقط.\nالمحتوى: "${msgText}"`;

                    const payload = { model: config.ollamaModel, prompt: aiPromptText, stream: false };
                    if (base64Image) payload.images = [base64Image];

                    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                    });

                    if (abortedMessages.has(msgId)) { abortedMessages.delete(msgId); return; }

                    const data = await response.json();
                    const triggerWords = config.aiFilterTriggerWords || ['نعم'];
                    if (data.response && triggerWords.some(word => data.response.includes(word))) {
                        isViolating = true;
                        violationReason = 'تم التصنيف كمخالفة عبر الذكاء الاصطناعي';
                    }
                } catch (error) { }
            }

            if (isViolating) {
                const contact = await msg.getContact();
                let senderId = cleanAuthorId;
                if (contact && contact.number) senderId = `${contact.number}@c.us`;

                const messageContent = msg.body || '[مرفق وسائط]';
                await safeDelay();
                await msg.delete(true);

                if (isAutoActionEnabled) {
                    try {
                        await chat.removeParticipants([rawAuthorId]);
                        if (isBlacklistEnabled) db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(senderId);

                        const reportText = `🚨 *تقرير إجراء وحظر تلقائي*\nتم مسح محتوى مخالف وطرد العضو من "${chat.name}".\n\n👤 *المرسل:* @${senderId.split('@')[0]}\n📋 *السبب:* ${violationReason}\n📝 *النص الممسوح:*\n"${messageContent}"`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [senderId] });
                    } catch (e) { }
                } else {
                    const pollOptions = isBlacklistEnabled ? ['نعم، طرد وحظر', 'لا، اكتف بالحذف'] : ['نعم، طرد', 'لا'];
                    const pollTitle = `🚨 إشعار بمحتوى مخالف في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${violationReason}\nالنص:\n"${messageContent}"\n\nهل ترغب في طرده؟`;
                    const poll = new Poll(pollTitle, pollOptions);

                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });
                    pendingBans.set(pollMsg.id._serialized, { senderId: senderId, pollMsg: pollMsg, isBlacklistEnabled: isBlacklistEnabled });
                }
            }
        }
    } catch (error) { }
});

client.on('vote_update', async vote => {
    const pollId = vote.parentMessage.id._serialized;
    if (pendingBans.has(pollId)) {
        if (vote.selectedOptions && vote.selectedOptions.length > 0) {
            const selectedOption = vote.selectedOptions[0].name;
            const data = pendingBans.get(pollId);
            const userToBan = data.senderId;

            if (selectedOption.includes('نعم')) {
                if (data.isBlacklistEnabled) {
                    try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(userToBan); } catch (e) { }
                }
                const botId = client.info.wid._serialized;
                const chats = await client.getChats();
                for (const chat of chats) {
                    if (chat.isGroup) {
                        const botData = chat.participants.find(p => p.id._serialized === botId);
                        if (botData && (botData.isAdmin || botData.isSuperAdmin)) {
                            try {
                                await chat.removeParticipants([userToBan]);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } catch (e) { }
                        }
                    }
                }
                const replyText = data.isBlacklistEnabled ? '✅ *تم تطبيق الطرد وإدراج الرقم في القائمة السوداء بنجاح.*' : '✅ *تم تطبيق الطرد بنجاح.*';
                await data.pollMsg.reply(replyText);
            } else if (selectedOption.includes('لا')) {
                await data.pollMsg.reply('🛑 *تم إلغاء الطرد بناءً على تصويت الإدارة.*');
            }
            pendingBans.delete(pollId);
        }
    }
});

// Start the client with retry logic
(async () => {
    console.log('[معلومة] جاري تنظيف العمليات المتبقية...');
    
    // Aggressive cleanup of any existing Chromium processes
    await cleanupChromiumProcesses();
    await cleanupOldTempDirs();
    
    // Clean only Chromium lock files, NOT the entire auth session
    // LocalAuth needs the session data to persist across restarts
    console.log('[معلومة] جاري حذف ملفات القفل...');
    await new Promise((resolve) => {
        exec('find /app/.wwebjs_auth -name "*lock*" -delete 2>/dev/null || true; find /app/.wwebjs_auth -name ".parent-lock" -delete 2>/dev/null || true', () => {
            setTimeout(resolve, 500);
        });
    });
    
    // Wait to ensure all cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('[معلومة] تم التنظيف، جاري بدء البوت...');
    
    // Add error handler for uncaught promise rejections during initialization
    process.once('unhandledRejection', (reason, promise) => {
        if (reason.message && (reason.message.includes('TargetCloseError') || reason.message.includes('Target closed') || reason.message.includes('Navigating frame was detached') || reason.message.includes('already running'))) {
            console.error('[خطأ] حدث خطأ أثناء التهيئة:', reason.message);
            isInitializing = false;
            if (initializationTimeout) clearTimeout(initializationTimeout);
            setTimeout(() => initializeClientWithRetry(0, 5), 3000);
        } else {
            console.error('[خطأ] استثناء غير معالج:', reason);
        }
    });
    
    initializeClientWithRetry();
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