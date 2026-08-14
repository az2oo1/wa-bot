const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

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

    fs.closeSync(fs.openSync(dbPath, 'a'));
}

function openDatabaseWithFallback() {
    const primaryPath = resolveDbPath();
    const fallbackPath = path.join('/tmp', 'wa-bot', 'bot_data.sqlite');
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

// Initialize database tables
db.exec(`
    CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS llm_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS blacklist (number TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS blocked_extensions (ext TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS whitelist (number TEXT PRIMARY KEY); 
    CREATE TABLE IF NOT EXISTS approved_numbers (number TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS secondary_verification (
        requester_id TEXT PRIMARY KEY,
        group_id TEXT,
        state TEXT,
        flow_type TEXT,
        require_email INTEGER,
        require_photo INTEGER,
        user_method_poll_id TEXT,
        email TEXT,
        code TEXT,
        created_at INTEGER,
        wait_started_at INTEGER,
        admin_group_id TEXT,
        admin_decision_msg_id TEXT,
        admin_poll_msg_id TEXT,
        admin_last_reminder_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS bait_bypassed_users (
        number TEXT PRIMARY KEY,
        bypassed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS secondary_verification_bait_log (
        requester_key TEXT PRIMARY KEY,
        last_sent_at INTEGER NOT NULL,
        sent_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS secondary_verification_reply_log (
        requester_key TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        group_id TEXT,
        bait_sent_at INTEGER NOT NULL,
        replied_at INTEGER,
        replied_text TEXT,
        reply_count INTEGER NOT NULL DEFAULT 0,
        last_state TEXT,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_key TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        group_id TEXT,
        email TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        sent_at INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS whatsapp_groups (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS custom_groups (
        group_id TEXT PRIMARY KEY, admin_group TEXT, use_default_words INTEGER,
        enable_word_filter INTEGER, enable_ai_filter INTEGER, enable_ai_media INTEGER,
        auto_action INTEGER, enable_blacklist INTEGER, enable_anti_spam INTEGER,
        spam_duplicate_limit INTEGER, spam_flood_limit INTEGER, spam_action TEXT,
        enable_welcome_message INTEGER, welcome_message_text TEXT, custom_words TEXT,
        custom_ai_trigger_words TEXT,
        enable_join_profile_screening INTEGER,
        use_global_qa INTEGER DEFAULT 0
    );
`);

// Run column migrations safely
const migrations = [
    'ALTER TABLE secondary_verification ADD COLUMN flow_type TEXT',
    'ALTER TABLE secondary_verification ADD COLUMN require_email INTEGER',
    'ALTER TABLE secondary_verification ADD COLUMN require_photo INTEGER',
    'ALTER TABLE secondary_verification ADD COLUMN user_method_poll_id TEXT',
    'ALTER TABLE secondary_verification ADD COLUMN admin_group_id TEXT',
    'ALTER TABLE secondary_verification ADD COLUMN admin_decision_msg_id TEXT',
    'ALTER TABLE secondary_verification ADD COLUMN admin_poll_msg_id TEXT',
    'ALTER TABLE secondary_verification ADD COLUMN admin_last_reminder_at INTEGER',
    'ALTER TABLE secondary_verification ADD COLUMN wait_started_at INTEGER',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN requester_id TEXT',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN group_id TEXT',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN bait_sent_at INTEGER',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN replied_at INTEGER',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN replied_text TEXT',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN reply_count INTEGER',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN last_state TEXT',
    'ALTER TABLE secondary_verification_reply_log ADD COLUMN updated_at INTEGER',
    'ALTER TABLE email_log ADD COLUMN requester_key TEXT',
    'ALTER TABLE email_log ADD COLUMN error_code TEXT',
    'ALTER TABLE email_log ADD COLUMN error_message TEXT'
];
migrations.forEach(sql => { try { db.exec(sql); } catch (e) {} });

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
    'use_global_qa INTEGER DEFAULT 0',
    'enable_qa_feature INTEGER', 'custom_qa TEXT', 'qa_event_date TEXT', 'qa_language TEXT', 'qa_event_dates TEXT',
    'admin_language TEXT', 'custom_ai_trigger_words TEXT', 'enable_join_profile_screening INTEGER',
    'enable_admin_sync INTEGER DEFAULT 0', 'enable_commands INTEGER DEFAULT 1'
];
colsToAdd.forEach(col => {
    try { db.prepare(`ALTER TABLE custom_groups ADD COLUMN ${col}`).run(); } catch (e) { }
});

function normalizeAdminLang(value) {
    return value === 'en' ? 'en' : 'ar';
}

function loadConfigFromDB() {
    let newConfig = {
        enableWordFilter: true, enableWordFilterSmartMatch: false,
        enableAIFilter: false, enableAIMedia: false,
        autoAction: false, enableBlacklist: true, enableWhitelist: true, enableAntiSpam: false,
        autoPurgeScheduleEnabled: false, autoPurgeIntervalMinutes: 60,
        adminWhitelistSyncEnabled: false, adminWhitelistSyncIntervalMinutes: 60,
        enableJoinProfileScreening: false,
        outlookPassword: "",
        enableSecondaryVerification: false,
        secondaryVerificationGroups: [],
        secondaryVerificationLanguage: "en",
        secondaryVerificationDelay: 3600,
        secondaryVerificationTimeoutDays: 2,
        enableKeywordVerification: false,
        enableEmailVerification: false,
        enablePhotoVerification: false,
        enableSecondarySmartMatch: false,
        secondaryVerificationStopCode: "",
        customMessageText: "",
        approvalKeyword: "yes",
        banKeyword: "no",
        emailDomain: "college.edu",
        smtpHost: "",
        smtpPort: 587,
        outlookEmail: "",
        enableMissedCallReply: false,
        missedCallToken: "",
        missedCallMessage: "",
        enableMissedCallReturning: false,
        missedCallReturningMessage: "",
        webhookCountryCode: "966",
        enableAnsweredCallReply: false,
        answeredCallMessage: "",
        safeMode: false,
        purgeScheduleEnabled: false, purgeScheduleIntervalHours: 24,
        adminSyncEnabled: false, adminSyncIntervalHours: 1,
        globalQAEnabled: false, enableQASmartMatch: false,
        globalQA: [],
        spamDuplicateLimit: 3, spamFloodLimit: 5, spamAction: 'poll',
        blockedTypes: [], blockedAction: 'delete',
        spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
        spamLimits: { text: 7, image: 3, video: 2, audio: 3, document: 3, sticker: 3 },
        defaultAdminGroup: '', defaultAdminLanguage: 'ar', defaultWords: [], aiPrompt: 'امنع أي رسالة تحتوي على إعلانات تجارية.',
        aiFilterTriggerWords: ['نعم'],
        ollamaUrl: 'http://localhost:11434', ollamaModel: 'llava', groupsConfig: {}
    };

    db.prepare('SELECT * FROM global_settings').all().forEach(row => {
        if (['defaultWords', 'blockedTypes', 'spamTypes', 'spamLimits', 'aiFilterTriggerWords', 'globalQA', 'secondaryVerificationGroups'].includes(row.key)) {
            try { newConfig[row.key] = JSON.parse(row.value); } catch(e) { }
        }
        else if (['enableWordFilter', 'enableWordFilterSmartMatch', 'enableAIFilter', 'enableAIMedia', 'autoAction', 'enableBlacklist', 'enableWhitelist', 'enableAntiSpam', 'safeMode', 'enableJoinProfileScreening', 'purgeScheduleEnabled', 'adminSyncEnabled', 'globalQAEnabled', 'enableQASmartMatch', 'autoPurgeScheduleEnabled', 'adminWhitelistSyncEnabled', 'enableSecondaryVerification', 'enableKeywordVerification', 'enableEmailVerification', 'enablePhotoVerification', 'enableSecondarySmartMatch', 'enableMissedCallReply', 'enableMissedCallReturning', 'enableAnsweredCallReply'].includes(row.key)) {
            newConfig[row.key] = row.value === '1';
        } else if (['spamDuplicateLimit', 'spamFloodLimit', 'purgeScheduleIntervalHours', 'adminSyncIntervalHours', 'autoPurgeIntervalMinutes', 'adminWhitelistSyncIntervalMinutes', 'secondaryVerificationDelay', 'secondaryVerificationTimeoutDays', 'smtpPort'].includes(row.key)) {
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
            useGlobalQA: g.use_global_qa === 1,
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
            enableJoinProfileScreening: g.enable_join_profile_screening === 1,
            enableAdminSync: g.enable_admin_sync === 1,
            enableCommands: g.enable_commands !== false
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
        setGlobal.run('enableWordFilterSmartMatch', conf.enableWordFilterSmartMatch ? '1' : '0');
        setGlobal.run('enableAIFilter', conf.enableAIFilter ? '1' : '0');
        setGlobal.run('enableAIMedia', conf.enableAIMedia ? '1' : '0');
        setGlobal.run('autoAction', conf.autoAction ? '1' : '0');
        setGlobal.run('enableBlacklist', conf.enableBlacklist ? '1' : '0');
        setGlobal.run('enableWhitelist', conf.enableWhitelist ? '1' : '0');
        setGlobal.run('enableAntiSpam', conf.enableAntiSpam ? '1' : '0');
        setGlobal.run('autoPurgeScheduleEnabled', conf.autoPurgeScheduleEnabled ? '1' : '0');
        setGlobal.run('autoPurgeIntervalMinutes', String(Math.max(1, parseInt(conf.autoPurgeIntervalMinutes, 10) || 60)));
        setGlobal.run('adminWhitelistSyncEnabled', conf.adminWhitelistSyncEnabled ? '1' : '0');
        setGlobal.run('adminWhitelistSyncIntervalMinutes', String(Math.max(1, parseInt(conf.adminWhitelistSyncIntervalMinutes, 10) || 60)));
        setGlobal.run('enableJoinProfileScreening', conf.enableJoinProfileScreening ? '1' : '0');
        setGlobal.run('outlookPassword', conf.outlookPassword || '');
        setGlobal.run('enableSecondaryVerification', conf.enableSecondaryVerification ? '1' : '0');
        setGlobal.run('secondaryVerificationGroups', JSON.stringify(conf.secondaryVerificationGroups || []));
        setGlobal.run('secondaryVerificationLanguage', conf.secondaryVerificationLanguage || 'en');
        setGlobal.run('secondaryVerificationTimeoutDays', String(Math.max(1, parseInt(conf.secondaryVerificationTimeoutDays, 10) || 2)));
        setGlobal.run('smtpHost', conf.smtpHost || '');
        setGlobal.run('smtpPort', String(conf.smtpPort || 587));
        setGlobal.run('enableMissedCallReply', conf.enableMissedCallReply ? '1' : '0');
        setGlobal.run('missedCallToken', conf.missedCallToken || '');
        setGlobal.run('missedCallMessage', conf.missedCallMessage || '');
        setGlobal.run('enableMissedCallReturning', conf.enableMissedCallReturning ? '1' : '0');
        setGlobal.run('missedCallReturningMessage', conf.missedCallReturningMessage || '');
        setGlobal.run('webhookCountryCode', conf.webhookCountryCode || '966');
        setGlobal.run('enableAnsweredCallReply', conf.enableAnsweredCallReply ? '1' : '0');
        setGlobal.run('answeredCallMessage', conf.answeredCallMessage || '');
        setGlobal.run('secondaryVerificationPartialTimeoutMinutes', String(Math.max(1, parseInt(conf.secondaryVerificationPartialTimeoutMinutes, 10) || 30)));
        setGlobal.run('secondaryVerificationDelay', String(Math.max(1, parseInt(conf.secondaryVerificationDelay, 10) || 3600)));
        setGlobal.run('secondaryVerificationReopenCode', conf.secondaryVerificationReopenCode || '');
        setGlobal.run('enableKeywordVerification', conf.enableKeywordVerification ? '1' : '0');
        setGlobal.run('enableEmailVerification', conf.enableEmailVerification ? '1' : '0');
        setGlobal.run('enablePhotoVerification', conf.enablePhotoVerification ? '1' : '0');
        setGlobal.run('enableSecondarySmartMatch', conf.enableSecondarySmartMatch ? '1' : '0');
        setGlobal.run('customMessageText', conf.customMessageText || '');
        setGlobal.run('secondaryVerificationStopCode', conf.secondaryVerificationStopCode || '');
        setGlobal.run('approvalKeyword', conf.approvalKeyword || '');
        setGlobal.run('banKeyword', conf.banKeyword || '');
        setGlobal.run('emailDomain', conf.emailDomain || '');
        setGlobal.run('outlookEmail', conf.outlookEmail || '');
        setGlobal.run('outlookPassword', conf.outlookPassword || '');
        setGlobal.run('safeMode', conf.safeMode ? '1' : '0');
        setGlobal.run('purgeScheduleEnabled', conf.purgeScheduleEnabled ? '1' : '0');
        setGlobal.run('purgeScheduleIntervalHours', (conf.purgeScheduleIntervalHours || 24).toString());
        setGlobal.run('adminSyncEnabled', conf.adminSyncEnabled ? '1' : '0');
        setGlobal.run('adminSyncIntervalHours', (conf.adminSyncIntervalHours || 1).toString());
        setGlobal.run('globalQAEnabled', conf.globalQAEnabled ? '1' : '0');
        setGlobal.run('enableQASmartMatch', conf.enableQASmartMatch ? '1' : '0');
        setGlobal.run('globalQA', JSON.stringify(conf.globalQA || []));
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
                panic_alert_target, panic_alert_message, custom_blacklist, custom_whitelist, use_global_blacklist, use_global_whitelist, use_global_qa,
                enable_qa_feature, custom_qa, qa_event_date, qa_language, qa_event_dates, custom_ai_trigger_words, enable_join_profile_screening,
                enable_admin_sync, enable_commands
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                gData.useGlobalQA ? 1 : 0,
                gData.enableQAFeature ? 1 : 0, JSON.stringify(gData.qaList || []), gData.eventDate || '', gData.qaLanguage || 'ar', JSON.stringify(gData.eventDates || []), JSON.stringify(gData.aiFilterTriggerWords || []), gData.enableJoinProfileScreening ? 1 : 0,
                gData.enableAdminSync ? 1 : 0, gData.enableCommands !== false ? 1 : 0
            );
        }
    });
    saveTx();
}

module.exports = {
    db,
    loadConfigFromDB,
    saveConfigToDB,
    syncTx
};
