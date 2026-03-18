const express = require('express');
const { Client, LocalAuth, Poll, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Database = require('better-sqlite3');
const util = require('util');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

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
        ollamaUrl: 'http://localhost:11434', ollamaModel: 'llava', groupsConfig: {}
    };

    db.prepare('SELECT * FROM global_settings').all().forEach(row => {
        if (['defaultWords', 'blockedTypes', 'spamTypes', 'spamLimits'].includes(row.key)) newConfig[row.key] = JSON.parse(row.value);
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
    let lang = 'ar';
    if (req.headers.cookie && req.headers.cookie.includes('bot_lang=en')) lang = 'en';
    const t = (ar, en) => lang === 'en' ? en : ar;
    const dir = lang === 'en' ? 'ltr' : 'rtl';
    const mediaTypesMeta = [
        { id: 'text', icon: '<i class="fas fa-file-alt"></i>', name: t('نصوص', 'Text') },
        { id: 'image', icon: '<i class="fas fa-image"></i>', name: t('صور', 'Images') },
        { id: 'video', icon: '<i class="fas fa-video"></i>', name: t('فيديو', 'Videos') },
        { id: 'audio', icon: '<i class="fas fa-music"></i>', name: t('صوتيات', 'Audio') },
        { id: 'document', icon: '<i class="fas fa-file"></i>', name: t('ملفات', 'Documents') },
        { id: 'sticker', icon: '<i class="fas fa-smile"></i>', name: t('ملصقات', 'Stickers') }
    ];
    const blacklistArr = db.prepare('SELECT number FROM blacklist').all().map(r => r.number);
    const blockedExtensionsArr = db.prepare('SELECT ext FROM blocked_extensions').all().map(r => r.ext);
    const whitelistArr = db.prepare('SELECT number FROM whitelist').all().map(r => r.number);

    const html = `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${t('لوحة تحكم المشرف الآلي', 'Auto Mod Dashboard')}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><style>*{box-sizing:border-box;margin:0;padding:0}:root{--bg:#080c10;--sidebar-bg:#0e1318;--card-bg:#131920;--card-border:#1e2830;--input-bg:#0a0f14;--input-border:#1e2830;--text:#dce8f5;--text-muted:#6b8099;--accent:#00c853;--accent-dim:rgba(0,200,83,0.1);--accent-hover:#00a846;--red:#ff5252;--red-dim:rgba(255,82,82,0.1);--orange:#ffab40;--orange-dim:rgba(255,171,64,0.1);--blue:#40c4ff;--blue-dim:rgba(64,196,255,0.1);--purple:#d18cff;--purple-dim:rgba(209,140,255,0.1);--modal-bg:rgba(0,0,0,0.8);--topbar-bg:rgba(8,12,16,0.92);--radius:12px;--font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px}html[lang="ar"]{--font:'IBM Plex Sans Arabic',sans-serif}html.light{--bg:#f0f4f8;--sidebar-bg:#fff;--card-bg:#fff;--card-border:#dde3eb;--input-bg:#f5f8fb;--input-border:#dde3eb;--text:#0f1923;--text-muted:#5a7289;--accent:#00a846;--accent-dim:rgba(0,168,70,0.1);--accent-hover:#008c3a;--red:#e53935;--red-dim:rgba(229,57,53,0.1);--orange:#f57c00;--orange-dim:rgba(245,124,0,0.1);--blue:#0288d1;--blue-dim:rgba(2,136,209,0.1);--purple:#7b1fa2;--purple-dim:rgba(123,31,162,0.1);--modal-bg:rgba(0,0,0,0.55);--topbar-bg:rgba(240,244,248,0.94)}html.light .nav-item:hover{background:rgba(0,0,0,0.05);color:var(--text)}html.light .toggle-row{background:rgba(0,0,0,0.03)}html.light .toggle-row.danger{background:rgba(229,57,53,0.06)}html.light .toggle-row.warning{background:rgba(245,124,0,0.06)}html.light .toggle-row.blue{background:rgba(2,136,209,0.06)}html.light .toggle-row.purple{background:rgba(123,31,162,0.06)}html.light .toggle-row.pink{background:rgba(194,24,91,0.06)}html.light .toggle-row.green{background:rgba(0,150,80,0.06)}html.light .slider{background:#d0dae4;border-color:#b8c8d8}html.light .slider:before{background:#8fa8bf}html.light input:checked+.slider{background:rgba(0,168,70,0.18);border-color:var(--accent)}html.light input:checked+.slider:before{background:var(--accent)}html.light .sub-panel{background:rgba(0,0,0,0.03)}html.light #terminalOutput{background:#1a1a2e}html.light .card.danger,html.light .card.info,html.light .card.purple,html.light .card.success,html.light .card.warning{background:linear-gradient(180deg,var(--accent-dim) 0,var(--card-bg) 60%)}html.light .card.danger{background:linear-gradient(180deg,rgba(229,57,53,0.04) 0,var(--card-bg) 60%)}html.light .card.warning{background:linear-gradient(180deg,rgba(245,124,0,0.04) 0,var(--card-bg) 60%)}html.light .card.info{background:linear-gradient(180deg,rgba(2,136,209,0.04) 0,var(--card-bg) 60%)}html.light .card.success{background:linear-gradient(180deg,rgba(0,168,70,0.04) 0,var(--card-bg) 60%)}html.light .card.purple{background:linear-gradient(180deg,rgba(123,31,162,0.04) 0,var(--card-bg) 60%)}html.light .logo-icon{box-shadow:0 0 20px rgba(0,168,70,0.2)}html.light .btn-primary{box-shadow:none}html.light .qr-wrap{background:#e8edf3}html.light ::-webkit-scrollbar-track{background:var(--bg)}html.light ::-webkit-scrollbar-thumb{background:#c5d0db}html.light .group-list-card:hover{border-color:rgba(2,136,209,0.4)}.icon-btn{width:38px;height:38px;border-radius:10px;border:1.5px solid var(--card-border);background:var(--input-bg);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .2s;flex-shrink:0}.icon-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-dim)}body,.card,.cb-label,.chip,.chip-container,.group-card,.group-list-card,.limit-item,.main,.modal-content,.nav-item,.qr-wrap,.sidebar,.sidebar-footer button,.status-pill,.sub-panel,.toggle-row,.topbar,input,select,textarea{transition:background .25s ease,border-color .25s ease,color .15s ease,box-shadow .25s ease}html{font-size:16px}body{font-family:var(--font);font-size:1rem;background:var(--bg);color:var(--text);min-height:100vh;display:flex;line-height:1.6}.sidebar{width:260px;min-height:100vh;background:var(--sidebar-bg);border-inline-end:1px solid var(--card-border);display:flex;flex-direction:column;position:fixed;inset-inline-start:0;top:0;z-index:100;transition:transform .3s}.sidebar-logo{padding:28px 22px 20px;border-bottom:1px solid var(--card-border);display:flex;align-items:center;gap:14px}.logo-icon{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#00e676,#00b0ff);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:0 0 20px rgba(0,230,118,0.3);color:#fff}.logo-text{font-size:15px;font-weight:700;color:var(--text);line-height:1.3}.logo-text small{display:block;font-weight:400;color:var(--text-muted);font-size:12px;margin-top:2px}.nav-section{padding:18px 16px 8px;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:1.5px;text-transform:uppercase}.nav-item{display:flex;align-items:center;gap:12px;padding:12px 18px;margin:2px 10px;border-radius:10px;cursor:pointer;color:var(--text-muted);font-size:15px;transition:all .2s;border:none;background:0 0;width:calc(100% - 20px);text-align:start;font-family:var(--font)}.nav-item:hover{background:rgba(255,255,255,0.06);color:var(--text)}.nav-item.active{background:var(--accent-dim);color:var(--accent);font-weight:600;border:1px solid rgba(0,230,118,0.2)}.nav-item .nav-icon{font-size:18px;width:24px;text-align:center;flex-shrink:0}.nav-item .nav-badge{margin-inline-start:auto;background:var(--red);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;min-width:22px;text-align:center}.sidebar-footer{margin-top:auto;padding:18px;border-top:1px solid var(--card-border);display:flex;gap:10px}.sidebar-footer button{flex:1;padding:11px 8px;border-radius:10px;border:1px solid var(--card-border);background:var(--input-bg);color:var(--text-muted);cursor:pointer;font-size:14px;transition:all .2s;font-family:var(--font);font-weight:600}.sidebar-footer button:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-dim)}.main{margin-inline-start:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0}.topbar{position:sticky;top:0;z-index:50;background:var(--topbar-bg);backdrop-filter:blur(16px);border-bottom:1px solid var(--card-border);padding:0 40px;height:66px;display:flex;align-items:center;justify-content:space-between}.topbar-title{font-size:18px;font-weight:700;color:var(--text)}.topbar-right{display:flex;align-items:center;gap:14px}.status-pill{display:flex;align-items:center;gap:10px;background:var(--card-bg);border:1px solid var(--card-border);padding:8px 18px;border-radius:24px;font-size:14px;color:var(--text-muted)}.status-dot{width:9px;height:9px;border-radius:50%;background:var(--text-muted);flex-shrink:0}.status-dot.online{background:var(--accent);box-shadow:0 0 10px var(--accent);animation:pulse 2s infinite}.status-dot.waiting{background:var(--orange);box-shadow:0 0 8px var(--orange)}@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 10px var(--accent)}50%{opacity:.6;box-shadow:0 0 4px var(--accent)}}.page{display:none;padding:32px 40px;width:100%;max-width:1400px}.page.active{display:block}.page-header{margin-bottom:28px}.page-header h2{font-size:26px;font-weight:700;color:var(--text);letter-spacing:-.3px;display:flex;align-items:center;gap:10px}.page-header p{color:var(--text-muted);font-size:15px;margin-top:5px}.card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:24px;margin-bottom:20px}.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--card-border)}.card-header h3{font-size:17px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px}.card.danger{border-color:rgba(255,82,82,0.35);background:linear-gradient(180deg,rgba(255,82,82,0.04) 0,var(--card-bg) 60%)}.card.warning{border-color:rgba(255,171,64,0.35);background:linear-gradient(180deg,rgba(255,171,64,0.04) 0,var(--card-bg) 60%)}.card.info{border-color:rgba(64,196,255,0.35);background:linear-gradient(180deg,rgba(64,196,255,0.04) 0,var(--card-bg) 60%)}.card.purple{border-color:rgba(209,140,255,0.35);background:linear-gradient(180deg,rgba(209,140,255,0.04) 0,var(--card-bg) 60%)}.card.success{border-color:rgba(0,230,118,0.35);background:linear-gradient(180deg,rgba(0,230,118,0.04) 0,var(--card-bg) 60%)}label.field-label{display:block;font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.8px}input[type=number],input[type=text],select,textarea{width:100%;padding:12px 16px;background:var(--input-bg);border:1.5px solid var(--input-border);border-radius:10px;color:var(--text);font-size:15px;font-family:var(--font);transition:border-color .2s,box-shadow .2s;outline:0}input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,0.12)}textarea{resize:vertical}select option{background:var(--card-bg);color:var(--text)}.field-group{margin-bottom:20px}.field-row{display:flex;gap:14px}.field-row>*{flex:1}.input-with-btn{display:flex;gap:10px}.input-with-btn input{margin:0}.btn{padding:11px 22px;border-radius:10px;border:1.5px solid transparent;font-size:15px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .2s;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;letter-spacing:.2px}.btn-primary{background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700}.btn-primary:hover{background:rgba(0,230,118,0.18);border-color:rgba(0,230,118,0.7);transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,230,118,0.2)}.btn-danger{background:var(--red);color:#fff;border-color:transparent}.btn-danger:hover{background:#ff1744;transform:translateY(-1px);box-shadow:0 4px 14px rgba(255,82,82,0.4)}.btn-warning{background:var(--orange);color:#000;border-color:transparent}.btn-warning:hover{background:#ff9100;transform:translateY(-1px)}.btn-ghost{background:0 0;border:1.5px solid var(--card-border);color:var(--text-muted)}.btn-ghost:hover{border-color:var(--text);color:var(--text)}.btn-blue{background:var(--blue);color:#000;border-color:transparent}.btn-blue:hover{transform:translateY(-1px)}.btn-sm{padding:7px 14px;font-size:13px}.btn-full{width:100%;justify-content:center;padding:15px;font-size:16px}.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-radius:10px;background:rgba(255,255,255,0.03);border:1.5px solid var(--card-border);margin-bottom:12px;gap:14px}.toggle-row.danger{border-color:rgba(255,82,82,0.3);background:rgba(255,82,82,0.05)}.toggle-row.warning{border-color:rgba(255,171,64,0.3);background:rgba(255,171,64,0.05)}.toggle-row.blue{border-color:rgba(64,196,255,0.3);background:rgba(64,196,255,0.05)}.toggle-row.purple{border-color:rgba(209,140,255,0.3);background:rgba(209,140,255,0.05)}.toggle-row.pink{border-color:rgba(240,100,170,0.3);background:rgba(240,100,170,0.05)}.toggle-row.green{border-color:rgba(100,200,120,0.3);background:rgba(100,200,120,0.05)}.toggle-left{display:flex;align-items:center;gap:16px}.toggle-label{font-size:15px;font-weight:600;color:var(--text)}.toggle-label small{display:block;font-size:12px;color:var(--text-muted);font-weight:400;margin-top:2px}.toggle-label.danger{color:var(--red)}.toggle-label.warning{color:var(--orange)}.toggle-label.blue{color:var(--blue)}.toggle-label.purple{color:var(--purple)}.toggle-label.pink{color:#ff80ab}.toggle-label.green{color:#69f0ae}.switch{position:relative;display:inline-block;width:50px;height:28px;flex-shrink:0}.switch input{opacity:0;width:0;height:0}.slider{position:absolute;cursor:pointer;inset:0;background:#1e2830;border:1.5px solid #2a3a4a;transition:.3s;border-radius:28px}.slider:before{position:absolute;content:"";height:20px;width:20px;bottom:2px;inset-inline-start:2px;background:#4a5a6a;transition:.3s;border-radius:50%}input:checked+.slider{background:rgba(0,230,118,0.2);border-color:var(--accent)}input:checked+.slider:before{background:var(--accent);box-shadow:0 0 8px rgba(0,230,118,0.6)}[dir=ltr] input:checked+.slider:before{transform:translateX(22px)}[dir=rtl] input:checked+.slider:before{transform:translateX(-22px)}.lang-slider:before{height:14px;width:14px;bottom:1.5px;inset-inline-start:1.5px}[dir=ltr] input:checked+.lang-slider:before{transform:translateX(20px)}[dir=rtl] input:checked+.lang-slider:before{transform:translateX(-20px)}.chip-container{display:flex;flex-wrap:wrap;gap:10px;padding:14px;background:var(--input-bg);border-radius:10px;min-height:52px;max-height:220px;overflow-y:auto;border:1.5px dashed var(--card-border);margin-top:10px}.chip{background:var(--accent-dim);color:var(--accent);padding:6px 14px;border-radius:20px;font-size:14px;display:flex;align-items:center;gap:8px;border:1px solid rgba(0,230,118,0.3);font-weight:500}.chip.red-chip{background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3)}.chip-remove{cursor:pointer;font-size:16px;font-weight:700;opacity:.6;line-height:1}.chip-remove:hover{opacity:1}.sub-panel{background:rgba(0,0,0,0.2);border:1.5px solid var(--card-border);border-radius:10px;padding:18px;margin-top:12px}.sub-panel.orange{border-color:rgba(255,171,64,0.3)}.sub-panel.red{border-color:rgba(255,82,82,0.3)}.sub-panel h4{font-size:14px;font-weight:700;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:.5px}.cb-group{display:flex;gap:10px;flex-wrap:wrap}.cb-label{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:8px;cursor:pointer;font-size:14px;color:var(--text-muted);transition:all .2s;user-select:none}.cb-label:hover{border-color:var(--accent);color:var(--text)}.cb-label input{accent-color:var(--accent);width:16px;height:16px;cursor:pointer}.limit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.limit-item{display:flex;align-items:center;gap:10px;background:var(--card-bg);padding:10px 14px;border-radius:9px;border:1.5px solid var(--card-border)}.limit-item input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px;cursor:pointer;flex-shrink:0}.limit-item span{font-size:14px;flex:1;color:var(--text)}.limit-item input[type=number]{width:60px;padding:6px 8px;font-size:14px;margin:0;text-align:center}.group-list-card{background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:14px;margin-bottom:14px;display:flex;align-items:center;gap:18px;padding:18px 22px;cursor:pointer;transition:border-color .2s,transform .2s}.group-list-card:hover{border-color:rgba(64,196,255,0.35);transform:translateY(-1px)}.group-list-card:hover .glc-arrow{opacity:1}.glc-avatar{width:52px;height:52px;border-radius:13px;flex-shrink:0;background:var(--accent-dim);border:1.5px solid var(--card-border);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;font-weight:700;color:var(--accent)}.glc-avatar img{width:100%;height:100%;object-fit:cover;border-radius:11px}.glc-info{flex:1;min-width:0}.glc-name{font-size:16px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.glc-id{font-family:monospace;font-size:11px;color:var(--text-muted);background:var(--input-bg);padding:2px 8px;border-radius:5px;border:1px solid var(--card-border);margin-top:4px;display:inline-block}.glc-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.glc-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}.glc-chip.green{background:var(--accent-dim);color:var(--accent);border:1px solid rgba(0,200,83,0.25)}.glc-chip.orange{background:var(--orange-dim);color:var(--orange);border:1px solid rgba(255,171,64,0.25)}.glc-chip.blue{background:var(--blue-dim);color:var(--blue);border:1px solid rgba(64,196,255,0.25)}.glc-chip.red{background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.25)}.glc-chip.purple{background:var(--purple-dim);color:var(--purple);border:1px solid rgba(209,140,255,0.25)}.glc-arrow{font-size:16px;color:var(--blue);opacity:0;transition:opacity .2s;flex-shrink:0;margin-inline-start:4px}.group-detail-bar{display:flex;align-items:center;gap:16px;margin-bottom:28px;flex-wrap:wrap}.group-detail-identity{display:flex;align-items:center;gap:14px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:12px 20px;flex:1}.group-detail-avatar{width:46px;height:46px;border-radius:12px;flex-shrink:0;background:var(--accent-dim);border:1.5px solid var(--card-border);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:17px;font-weight:700;color:var(--accent)}.group-detail-avatar img{width:100%;height:100%;object-fit:cover;border-radius:10px}.group-card{background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:14px;margin-bottom:16px;overflow:hidden;transition:border-color .2s}.group-card-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--card-border)}.group-card-title{font-size:16px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px}.group-card-body{padding:20px}.group-id-badge{font-family:monospace;font-size:12px;color:var(--text-muted);background:var(--input-bg);padding:3px 10px;border-radius:6px;border:1px solid var(--card-border)}.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:20px;padding:36px;background:var(--input-bg);border-radius:12px;border:1.5px dashed var(--card-border)}#qr-image{max-width:230px;border-radius:12px;border:10px solid #fff;box-shadow:0 8px 30px rgba(0,0,0,0.5);display:none}.toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(24px);background:var(--accent);color:#000;padding:13px 28px;border-radius:40px;font-weight:700;font-size:15px;z-index:9999;opacity:0;transition:all .35s;pointer-events:none;box-shadow:0 4px 20px rgba(0,230,118,0.5)}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.modal{display:none;position:fixed;z-index:1000;inset:0;background:var(--modal-bg);backdrop-filter:blur(8px);align-items:center;justify-content:center}.modal.open{display:flex}.modal-content{background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:16px;padding:32px;width:90%;max-width:640px;box-shadow:0 24px 80px rgba(0,0,0,0.7);animation:slideIn .25s ease;max-height:90vh;overflow-y:auto}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.modal-header h3{font-size:20px;font-weight:700}.close-modal{background:0 0;border:none;color:var(--text-muted);font-size:26px;cursor:pointer;padding:4px;line-height:1}.close-modal:hover{color:var(--red)}@keyframes slideIn{from{transform:translateY(-24px);opacity:0}to{transform:translateY(0);opacity:1}}#terminalOutput{background:#000;color:#00ff88;font-family:'Courier New',monospace;height:400px;overflow-y:auto;padding:16px;border-radius:10px;font-size:13px;direction:ltr;text-align:start;border:1px solid #0a1a0a}#terminalOutput div{margin-bottom:5px;border-bottom:1px solid #0a1a0a;padding-bottom:5px;word-wrap:break-word;line-height:1.6}.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.card-grid .card{margin-bottom:0}.card-grid-full{grid-column:1/-1}@media (max-width:1100px){.card-grid{grid-template-columns:1fr}}.section-sep{height:1px;background:var(--card-border);margin:20px 0}::-webkit-scrollbar{width:7px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--card-border);border-radius:4px}.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99}.hamburger{display:none;background:0 0;border:none;color:var(--text);font-size:24px;cursor:pointer;padding:4px}.group-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--card-border);margin-bottom:20px}.group-tab{padding:10px 18px;border:none;background:0 0;color:var(--text-muted);font-size:14px;font-weight:600;font-family:var(--font);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .2s;display:flex;align-items:center;gap:7px;border-radius:8px 8px 0 0}.group-tab:hover{color:var(--text);background:rgba(255,255,255,0.04)}.group-tab.active{color:var(--accent);border-bottom-color:var(--accent);background:var(--accent-dim)}.group-tab-panel{display:none}.group-tab-panel.active{display:block}.step-badge{display:inline-block;background:var(--blue-dim);color:var(--blue);padding:2px 9px;border-radius:12px;margin-inline-end:6px;font-weight:700;font-size:13px}@media (max-width:768px){.sidebar{transform:translateX(100%)}[dir=ltr] .sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}.sidebar-overlay.open{display:block}.main{margin-inline-start:0}.hamburger{display:block}.page{padding:18px}.topbar{padding:0 18px}.limit-grid{grid-template-columns:1fr}.card-grid{grid-template-columns:1fr}.field-row{flex-direction:column}}</style>
    </head>
    <body>
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-logo">
                <div class="logo-icon"><i class="fas fa-robot"></i></div>
                <div class="logo-text">${t('المشرف الآلي', 'Auto Mod')} <small>${t('لوحة التحكم V6', 'Dashboard V6')}</small></div>
            </div>

            <div class="nav-section">${t('الرئيسية', 'Main')}</div>
            <button class="nav-item active" onclick="showPage('page-status', this)">
                <span class="nav-icon"><i class="fas fa-satellite-dish"></i></span> ${t('حالة الاتصال', 'Connection Status')}
            </button>
            <button class="nav-item" onclick="showPage('page-blacklist', this)">
                <span class="nav-icon"><i class="fas fa-users-slash"></i></span> ${t('إدارة الأرقام', 'Manage Numbers')}
                <span class="nav-badge" id="blacklist-count">0</span>
            </button>

            <div class="nav-section">${t('الإعدادات', 'Settings')}</div>
            <button class="nav-item" onclick="showPage('page-general', this)">
                <span class="nav-icon"><i class="fas fa-cog"></i></span> ${t('الإعدادات العامة', 'General Settings')}
            </button>
            <button class="nav-item" onclick="showPage('page-spam', this)">
                <span class="nav-icon"><i class="fas fa-shield-alt"></i></span> ${t('مكافحة الإزعاج', 'Anti-Spam')}
            </button>
            <button class="nav-item" onclick="showPage('page-media', this)">
                <span class="nav-icon"><i class="fas fa-filter"></i></span> ${t('فلتر الوسائط', 'Media Filter')}
            </button>
            <button class="nav-item" onclick="showPage('page-ai', this)">
                <span class="nav-icon"><i class="fas fa-brain"></i></span> ${t('الذكاء الاصطناعي', 'AI Moderator')}
            </button>
            <button class="nav-item" onclick="showPage('page-groups', this)">
                <span class="nav-icon"><i class="fas fa-users-cog"></i></span> ${t('المجموعات المخصصة', 'Custom Groups')}
            </button>

            <div class="nav-section">${t('أدوات', 'Tools')}</div>
            <button class="nav-item" onclick="openDebuggerModal()">
                <span class="nav-icon"><i class="fas fa-bug"></i></span> ${t('سجل الأحداث', 'Event Logs')}
            </button>

            <div class="sidebar-footer">
                <button id="logoutBtn" onclick="logoutBot()" style="display:none; background: var(--red-dim); border-color: rgba(248,81,73,0.4); color: var(--red);"><i class="fas fa-sign-out-alt"></i> ${t('قطع الاتصال', 'Disconnect')}</button>
                <button onclick="saveConfig()" style="background: var(--accent-dim); border-color: rgba(0,230,118,0.4); color: var(--accent); font-weight:700;"><i class="fas fa-save"></i> ${t('حفظ', 'Save')}</button>
            </div>
        </nav>

        <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

        <div class="main">
            <div class="topbar">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="hamburger" onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
                    <span class="topbar-title" id="topbarTitle">${t('حالة الاتصال', 'Connection Status')}</span>
                </div>
                <div class="topbar-right">
                    
                    <div style="display: flex; align-items: center; gap: 6px; background: var(--input-bg); padding: 4px 10px; border-radius: 20px; border: 1.5px solid var(--card-border);">
                        <span style="font-size: 11px; font-weight: 700; color: ${lang === 'ar' ? 'var(--accent)' : 'var(--text-muted)'}; transition: color 0.3s;">AR</span>
                        <label class="switch" style="width: 36px; height: 20px;">
                            <input type="checkbox" id="langToggle" onchange="switchLanguage(this)" ${lang === 'en' ? 'checked' : ''}>
                            <span class="slider lang-slider" style="border-radius: 20px;"></span>
                        </label>
                        <span style="font-size: 11px; font-weight: 700; color: ${lang === 'en' ? 'var(--accent)' : 'var(--text-muted)'}; transition: color 0.3s;">EN</span>
                    </div>

                    <button class="icon-btn" id="themeToggle" onclick="toggleTheme()" title="Toggle light/dark mode"><i class="fas fa-moon"></i></button>   
                    <div class="status-pill">
                        <div class="status-dot" id="statusDot"></div>
                        <span id="status-text"><i class="fas fa-spinner fa-spin"></i> ${t('جاري تهيئة النظام وبدء التشغيل...', 'Initializing system...')}</span>
                    </div>
                </div>
            </div>

            <form id="configForm">

            <div class="page active" id="page-status">
                <div class="page-header">
                    <h2><i class="fas fa-wifi"></i> ${t('حالة الاتصال بواتساب', 'WhatsApp Connection Status')}</h2>
                    <p>${t('اربط حساب واتساب بمسح رمز QR أو راقب الاتصال الحالي', 'Link WhatsApp account by scanning the QR code or monitor connection')}</p>
                </div>
                <div class="card-grid">
                    <div class="card" style="grid-column: 1;">
                        <div class="card-header"><h3><i class="fas fa-qrcode"></i> ${t('رمز QR', 'QR Code')}</h3></div>
                        <div class="qr-wrap">
                            <img id="qr-image" src="" alt="QR Code" />
                            <div id="qr-placeholder" style="text-align:center; color: var(--text-muted); padding: 20px 0;">
                                <div style="font-size: 64px; margin-bottom: 16px;"><i class="fas fa-mobile-alt"></i></div>
                                <div style="font-size: 18px; font-weight: 700; color: var(--text);">${t('في انتظار رمز QR...', 'Waiting for QR code...')}</div>
                                <div style="font-size: 14px; margin-top: 8px;">${t('سيظهر الرمز هنا تلقائياً', 'Code will appear here automatically')}</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <div class="card success">
                            <div class="card-header"><h3 style="color:var(--accent);"><i class="fas fa-chart-line"></i> ${t('حالة النظام', 'System Status')}</h3></div>
                            <div style="font-size:16px; color:var(--text-muted); line-height:2.2;">
                                <div><i class="fas fa-robot"></i> <strong style="color:var(--text);">${t('البوت:', 'Bot:')}</strong> <span id="status-text-detail">...</span></div>
                                <div><i class="fas fa-database"></i> <strong style="color:var(--text);">${t('قاعدة البيانات:', 'Database:')}</strong> <span style="color:var(--accent);">${t('متصلة', 'Connected')} <i class="fas fa-check"></i></span></div>
                                <div><i class="fas fa-globe"></i> <strong style="color:var(--text);">${t('المنفذ:', 'Port:')}</strong> <span style="color:var(--accent);">3000 <i class="fas fa-check"></i></span></div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-header"><h3><i class="fas fa-users"></i> ${t('مجموعة الإدارة الافتراضية', 'Default Admin Group')}</h3></div>
                            <div class="field-group" id="defaultAdminGroupContainer">
                                <label class="field-label">${t('اختر المجموعة لتلقي التنبيهات', 'Select Group for Alerts')}</label>
                                </div>
                        </div>
                        <div class="card info">
                            <div class="card-header"><h3 style="color:var(--blue);"><i class="fas fa-info-circle"></i> ${t('تعليمات الاستخدام', 'Instructions')}</h3></div>
                            <div style="font-size:14px; color:var(--text-muted); line-height:2.2;">
                                <div><span class="step-badge">1</span> ${t('امسح رمز QR بهاتفك من واتساب', 'Scan QR code with your phone')}</div>
                                <div><span class="step-badge">2</span> ${t('أضف البوت كمشرف في المجموعات', 'Add bot as group admin')}</div>
                                <div><span class="step-badge">3</span> ${t('افتح صفحة الإعدادات وخصّص القواعد', 'Customize rules in settings')}</div>
                                <div><span class="step-badge">4</span> ${t('اضغط على حفظ لتطبيق التغييرات', 'Click Save to apply changes')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-blacklist">
                <div class="page-header">
                    <h2><i class="fas fa-shield-alt"></i> ${t('إدارة الأرقام (حظر وتوثيق)', 'Number Management (Ban & VIP)')}</h2>
                    <p>${t('أضف الأرقام المحظورة (طرد فوري) أو الموثوقة (تخطي الفلاتر)', 'Add banned numbers (instant kick) or trusted VIPs (bypass filters)')}</p>
                </div>
                <div class="card-grid">
                    
                    <div class="card danger">
                        <div class="card-header">
                            <h3 style="color:var(--red);"><i class="fas fa-user-plus"></i> ${t('القائمة السوداء (حظر)', 'Blacklist (Banned)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">${t('طرد فوري', 'Instant Kick')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newBlacklistNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlacklistNumber();}">
                                <button type="button" class="btn btn-danger" onclick="addBlacklistNumber()"><i class="fas fa-ban"></i> ${t('حظر', 'Ban')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام المحظورة حالياً', 'Currently Banned Numbers')}</label>
                        <div id="blacklistContainer" class="chip-container"></div>
                        
                        <div class="toggle-row danger" style="margin-top:20px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableBlacklist" ${config.enableBlacklist ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label danger">
                                    ${t('تفعيل نظام القائمة السوداء', 'Enable Blacklist System')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card danger">
                        <div class="card-header">
                            <h3 style="color:var(--red);"><i class="fas fa-globe"></i> ${t('رموز الدول المحظورة', 'Blocked Extensions')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">${t('حظر دول كاملة', 'Ban Entire Countries')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رمز الدولة (بدون +)', 'Country Code (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="number" id="newBlockedExtension" placeholder="Ex: 1, 91" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlockedExtension();}">
                                <button type="button" class="btn btn-danger" onclick="addBlockedExtension()"><i class="fas fa-ban"></i> ${t('حظر', 'Ban')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('رموز الدول المحظورة حالياً', 'Currently Blocked Extensions')}</label>
                        <div id="blockedExtensionsContainer" class="chip-container"></div>
                    </div>

                    <div class="card success">
                        <div class="card-header">
                            <h3 style="color:var(--accent);"><i class="fas fa-star"></i> ${t('القائمة البيضاء (VIP)', 'Whitelist (VIP)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--accent-dim); padding:4px 10px; border-radius:20px;">${t('تخطي جميع القيود', 'Bypasses all rules')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newWhitelistNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addWhitelistNumber();}">
                                <button type="button" class="btn btn-primary" onclick="addWhitelistNumber()"><i class="fas fa-check"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام الموثوقة حالياً', 'Currently Trusted Numbers')}</label>
                        <div id="whitelistContainer" class="chip-container"></div>

                        <div class="toggle-row green" style="margin-top:20px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWhitelist" ${config.enableWhitelist ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label green">
                                    ${t('تفعيل نظام القائمة البيضاء', 'Enable Whitelist System')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card warning card-grid-full">
                        <div class="card-header"><h3 style="color:var(--orange);"><i class="fas fa-broom"></i> ${t('طرد رجعي شامل', 'Global Purge')}</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom: 18px; line-height:1.8;">${t('سيبحث البوت في جميع المجموعات التي هو فيها مشرف، ويطرد كل من في القائمة السوداء فوراً.', 'Bot will scan all managed groups and kick anyone in the blacklist immediately.')}</p>
                        <button type="button" id="purgeBtn" class="btn btn-warning" style="width:100%; justify-content:center; padding:15px; font-size:16px;" onclick="purgeBlacklisted()">
                            <i class="fas fa-gavel"></i> ${t('تنفيذ الطرد الشامل الآن', 'Execute Global Purge Now')}
                        </button>
                    </div>

                </div>
            </div>

            <div class="page" id="page-general">
                <div class="page-header">
                    <h2><i class="fas fa-cog"></i> ${t('الإعدادات العامة', 'General Settings')}</h2>
                    <p>${t('تطبّق على جميع المجموعات التي لا تملك إعدادات مخصصة', 'Applies to all groups without custom settings')}</p>
                </div>

                <div class="card" style="border-color:rgba(100,220,150,0.5); background:linear-gradient(160deg,rgba(100,220,150,0.07) 0,var(--card-bg) 55%); margin-bottom:24px; position:relative; overflow:hidden;">
                    <style>
                        @keyframes safePulse {
                            0%,100% { box-shadow: 0 0 0 0 rgba(100,220,150,0.55); }
                            50%      { box-shadow: 0 0 0 8px rgba(100,220,150,0); }
                        }
                        #safeMode + .slider { transition: background 0.35s ease, box-shadow 0.35s ease !important; }
                        #safeMode:not(:checked) + .slider { animation: safePulse 1.8s ease-in-out infinite; }
                    </style>

                    <!-- Recommended ribbon -->
                    <div style="display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,rgba(255,171,64,0.18),rgba(255,171,64,0.04));border:1px solid rgba(255,171,64,0.4);border-radius:10px;padding:11px 16px;margin-bottom:18px;">
                        <i class="fas fa-exclamation-triangle" style="color:var(--orange);font-size:18px;flex-shrink:0;"></i>
                        <div>
                            <strong style="color:var(--orange);font-size:14px;">${t('يُنصح بشدة بتفعيله', '⚠️ Strongly Recommended')}</strong>
                            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${t('تشغيل البوت بدون هذا الوضع يزيد من احتمالية حظر حسابك من واتساب', 'Running the bot without Safe Mode significantly increases the risk of your WhatsApp account being banned')}</div>
                        </div>
                    </div>

                    <div class="card-header" style="padding-bottom:14px;">
                        <h3 style="color:#64dc96;"><i class="fas fa-user-shield"></i> ${t('الوضع الآمن (Safe Mode)', 'Safe Mode')}</h3>
                        <span style="font-size:12px; background:rgba(100,220,150,0.15); color:#64dc96; border:1px solid rgba(100,220,150,0.4); padding:3px 12px; border-radius:20px; font-weight:700;">${t('حماية من الحظر', 'Anti-Ban')}</span>
                    </div>
                    <div class="toggle-row" style="border-color:rgba(100,220,150,0.35); background:rgba(100,220,150,0.07); margin-bottom:16px; padding:14px 18px; border-radius:12px;">
                        <div class="toggle-left" style="gap:16px;">
                            <label class="switch" style="flex-shrink:0;"><input type="checkbox" id="safeMode" ${config.safeMode ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="toggle-label" style="color:#64dc96;">
                                ${t('تفعيل الوضع الآمن', 'Enable Safe Mode')}
                                <small>${t('تأخير عشوائي 10–60 ثانية قبل كل إجراء لتجنب كشف البوت', 'Random 10–60s delay before each action to avoid bot detection')}</small>
                            </div>
                        </div>
                        ${config.safeMode
            ? `<span style="font-size:12px;background:rgba(100,220,150,0.15);color:#64dc96;border:1px solid rgba(100,220,150,0.3);padding:3px 10px;border-radius:20px;font-weight:700;"><i class="fas fa-check"></i> ${t('مفعّل', 'Active')}</span>`
            : `<span style="font-size:12px;background:rgba(255,82,82,0.12);color:var(--red);border:1px solid rgba(255,82,82,0.3);padding:3px 10px;border-radius:20px;font-weight:700;"><i class="fas fa-times"></i> ${t('معطّل', 'Off')}</span>`
        }
                    </div>
                    <div style="font-size:13px; color:var(--text-muted); line-height:2.2; padding:14px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                        <div><i class="fas fa-times-circle" style="color:var(--red);"></i> <strong style="color:var(--text);">${t('إيقاف:', 'Off:')}</strong> ${t('إجراءات فورية — أسرع ولكن تُعرّض حسابك للحظر', 'Instant actions — faster but risks getting your account banned')}</div>
                        <div><i class="fas fa-shield-alt" style="color:#64dc96;"></i> <strong style="color:var(--text);">${t('تشغيل:', 'On:')}</strong> ${t('تأخير عشوائي 10–60 ث — يحاكي سلوك الإنسان ويقلل خطر الحظر بشكل كبير', 'Random 10–60s delay — mimics human behaviour, greatly reduces ban risk')}</div>
                        <div><i class="fas fa-info-circle" style="color:var(--blue);"></i> <strong style="color:var(--text);">${t('يؤثر على:', 'Covers:')}</strong> ${t('الطرد، الحذف، التصويت، الإبلاغ، رسائل الترحيب', 'Kicks, deletes, polls, reports, welcome messages')}</div>
                    </div>
                </div>


                <div class="card-grid">
                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-filter"></i> ${t('فلتر الكلمات الممنوعة', 'Forbidden Word Filter')}</h3></div>
                        <div class="toggle-row" style="margin-bottom:18px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWordFilter" ${config.enableWordFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل فلتر الكلمات', 'Enable Word Filter')}<small>${t('حذف فوري عند رصد أي كلمة ممنوعة', 'Instant delete on detecting forbidden words')}</small></div>
                            </div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('الكلمات الممنوعة الافتراضية', 'Default Forbidden Words')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newDefaultWord" placeholder="${t('أدخل الكلمة الممنوعة...', 'Enter forbidden word...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addDefaultWord();}">
                                <button type="button" class="btn btn-primary" onclick="addDefaultWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                            <div id="defaultWordsContainer" class="chip-container"></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-bolt"></i> ${t('الإجراء التلقائي', 'Automatic Action')}</h3></div>
                        <div class="toggle-row pink">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="autoAction" ${config.autoAction ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label pink">
                                    ${t('الحذف والإبلاغ المباشر', 'Direct Delete & Report')}
                                    <small>${t('تخطي تصويت الإدارة عند رصد المخالفات', 'Skip admin poll upon detecting violations')}</small>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:20px; padding:16px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2;">
                                <div><i class="fas fa-circle text-danger" style="color:var(--red); font-size: 10px; margin-inline-end: 5px;"></i> <strong style="color:var(--text);">${t('مفعّل:', 'Enabled:')}</strong> ${t('حذف فوري + طرد تلقائي', 'Instant delete + auto kick')}</div>
                                <div><i class="fas fa-circle text-warning" style="color:var(--orange); font-size: 10px; margin-inline-end: 5px;"></i> <strong style="color:var(--text);">${t('معطّل:', 'Disabled:')}</strong> ${t('حذف + تصويت للإدارة', 'Delete + admin poll')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-spam">
                <div class="page-header">
                    <h2><i class="fas fa-shield-alt"></i> ${t('مكافحة الإزعاج', 'Anti-Spam')}</h2>
                    <p>${t('رصد الرسائل المتكررة خلال نافذة 15 ثانية', 'Monitor repeated messages within a 15-second window')}</p>
                </div>

                <div class="card warning" style="max-width:700px;">
                    <div class="toggle-row warning" style="margin-bottom:0; border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch">
                                <input type="checkbox" id="enableAntiSpam" ${config.enableAntiSpam ? 'checked' : ''} onchange="toggleGroupPanel('global', 'spam', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="toggle-label warning">
                                ${t('تفعيل نظام Anti-Spam', 'Enable Anti-Spam System')}
                                <small>${t('مراقبة معدل إرسال كل مستخدم خلال نافذة 15 ثانية', 'Monitor per-user send rate within 15 secs')}</small>
                            </div>
                        </div>
                    </div>

                    <div id="group_spam_panel_global" style="overflow: hidden; max-height: ${config.enableAntiSpam ? '800px' : '0px'}; opacity: ${config.enableAntiSpam ? '1' : '0'}; transition: max-height 0.45s ease, opacity 0.35s ease, margin-top 0.35s ease; margin-top: ${config.enableAntiSpam ? '20px' : '0px'};">
                        <div style="border-top: 1px dashed rgba(255,171,64,0.3); padding-top: 20px;">
                            <div class="field-row" style="margin-bottom:20px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الإجراء عند الرصد', 'Action on Detection')}</label>
                                    <select id="spamAction">
                                        <option value="poll" ${config.spamAction === 'poll' ? 'selected' : ''}><i class="fas fa-poll"></i> ${t('تصويت للإدارة', 'Admin Poll')}</option>
                                        <option value="auto" ${config.spamAction === 'auto' ? 'selected' : ''}><i class="fas fa-hammer"></i> ${t('طرد تلقائي وحظر', 'Auto Kick & Ban')}</option>
                                    </select>
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('حد تكرار نفس النص', 'Duplicate Text Limit')}</label>
                                    <input type="number" id="spamDuplicateLimit" value="${config.spamDuplicateLimit}" min="2" max="15" placeholder="3">
                                </div>
                            </div>
                            <label class="field-label" style="margin-bottom:12px;"><i class="fas fa-stopwatch"></i> ${t('حدود كل نوع خلال 15 ثانية', 'Limits per media type (15s)')}</label>
                            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">${t('فعّل النوع المراد مراقبته، ثم حدد الحد الأقصى للرسائل المسموح بها', 'Check the type to monitor, then set max allowed messages')}</p>
                            <div class="limit-grid">
                                ${mediaTypesMeta.map(tData => `
                                <div class="limit-item">
                                    <input type="checkbox" id="global_spam_check_${tData.id}" value="${tData.id}" ${config.spamTypes.includes(tData.id) ? 'checked' : ''}>
                                    <span>${tData.icon} ${tData.name}</span>
                                    <input type="number" id="global_spam_limit_${tData.id}" value="${config.spamLimits[tData.id] || 5}" min="1">
                                </div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-media">
                <div class="page-header">
                    <h2><i class="fas fa-filter"></i> ${t('فلتر الوسائط', 'Media Filter')}</h2>
                    <p>${t('منع قطعي لأنواع محددة — الحذف يحدث فوراً بغض النظر عن أي إعداد آخر', 'Absolute ban for specific media types — deleted instantly regardless of other settings')}</p>
                </div>
                <div class="card-grid">
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);"><i class="fas fa-folder-minus"></i> ${t('اختر الأنواع الممنوعة', 'Select Blocked Types')}</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom:18px;">${t('أي رسالة من هذه الأنواع ستُحذف تلقائياً ودون استثناء.', 'Any message of these types will be deleted automatically without exception.')}</p>
                        <div class="cb-group" id="globalBlockedTypes" style="gap:12px;">
                            ${mediaTypesMeta.map(tData => `
                            <label class="cb-label" style="flex:1; min-width:120px; justify-content:center; padding:12px;">
                                <input type="checkbox" value="${tData.id}" ${config.blockedTypes.includes(tData.id) ? 'checked' : ''}> ${tData.icon} ${tData.name}
                            </label>`).join('')}
                        </div>
                    </div>
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);"><i class="fas fa-gavel"></i> ${t('الإجراء عند الرصد', 'Action on Detection')}</h3></div>
                        <div class="field-group">
                            <label class="field-label">${t('ماذا يفعل البوت عند إرسال نوع ممنوع؟', 'What should the bot do when a blocked type is sent?')}</label>
                            <select id="globalBlockedAction" style="font-size:15px; padding:14px;">
                                <option value="delete" ${config.blockedAction === 'delete' ? 'selected' : ''}>${t('حذف الرسالة فقط (بصمت)', 'Delete Message Only (Silent)')}</option>
                                <option value="poll" ${config.blockedAction === 'poll' ? 'selected' : ''}>${t('حذف + فتح تصويت للإدارة', 'Delete + Open Admin Poll')}</option>
                                <option value="auto" ${config.blockedAction === 'auto' ? 'selected' : ''}>${t('حذف + طرد تلقائي وحظر', 'Delete + Auto Kick & Ban')}</option>
                            </select>
                        </div>
                        <div style="margin-top:16px; padding:16px; background:var(--red-dim); border-radius:10px; border:1px solid rgba(255,82,82,0.2);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2.2;">
                                <div><i class="fas fa-trash"></i> <strong style="color:var(--text);">${t('حذف فقط:', 'Delete Only:')}</strong> ${t('صامت، لا يعلم المرسل', 'Silent, sender is unaware')}</div>
                                <div><i class="fas fa-poll"></i> <strong style="color:var(--text);">${t('تصويت:', 'Poll:')}</strong> ${t('تنبيه الإدارة لاتخاذ قرار', 'Alert admins to decide')}</div>
                                <div><i class="fas fa-hammer"></i> <strong style="color:var(--text);">${t('طرد تلقائي:', 'Auto Kick:')}</strong> ${t('أقوى إجراء، حظر فوري', 'Strictest action, instant ban')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-ai">
                <div class="page-header">
                    <h2><i class="fas fa-brain"></i> ${t('المشرف الذكي (AI)', 'AI Moderator')}</h2>
                    <p>${t('تحليل المحتوى باستخدام نموذج Ollama LLM محلي', 'Analyze content using a local Ollama LLM model')}</p>
                </div>
                <div class="card-grid">
                    <div class="card info">
                        <div class="card-header">
                            <h3 style="color:var(--blue);"><i class="fas fa-plug"></i> ${t('تفعيل الذكاء الاصطناعي', 'Enable AI')}</h3>
                            <button type="button" class="btn btn-blue btn-sm" onclick="openOllamaModal()"><i class="fas fa-cog"></i> ${t('إعداد الخادم', 'Server Setup')}</button>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIFilter" ${config.enableAIFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label blue">${t('تحليل النصوص بالـ AI', 'AI Text Analysis')}<small>${t('فحص كل رسالة نصية قبل السماح بها', 'Scan every text message before allowing')}</small></div>
                            </div>
                        </div>
                        <div class="toggle-row purple">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIMedia" ${config.enableAIMedia ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label purple">${t('تحليل الصور (Vision AI)', 'Image Analysis (Vision)')}<small>${t('يتطلب نموذجاً يدعم Vision مثل llava', 'Requires a vision-capable model like llava')}</small></div>
                            </div>
                        </div>
                    </div>
                    <div class="card" id="aiPromptContainer">
                        <div class="card-header"><h3><i class="fas fa-file-alt"></i> ${t('تعليمات الذكاء الاصطناعي', 'AI Prompt Instructions')}</h3></div>
                        <div class="field-group">
                            <label class="field-label">${t('صف المحتوى الممنوع للنموذج', 'Describe forbidden content to the model')}</label>
                            <textarea id="aiPromptText" rows="6" style="font-size:14px; line-height:1.8;">${config.aiPrompt}</textarea>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-groups">

                <div id="groupsListView">
                    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <h2><i class="fas fa-users-cog"></i> ${t('المجموعات المخصصة', 'Custom Groups')}</h2>
                            <p>${t('إعدادات مخصصة لكل مجموعة — تتجاوز الإعدادات العامة', 'Custom settings per group — overrides global settings')}</p>
                        </div>
                        <button type="button" class="btn btn-blue" onclick="addGroup()"><i class="fas fa-plus"></i> ${t('إضافة مجموعة', 'Add Group')}</button>
                    </div>
                    <div id="groupsContainer"></div>
                </div>

                <div id="groupsDetailView" style="display:none;">
                    <div class="group-detail-bar">
                        <button type="button" class="btn btn-ghost" onclick="closeGroupDetail()">
                            <i class="fas fa-arrow-${lang === 'en' ? 'left' : 'right'}"></i> ${t('رجوع', 'Back')}
                        </button>
                        <div class="group-detail-identity">
                            <div class="group-detail-avatar" id="detailGroupAvatar"></div>
                            <div>
                                <div style="font-size:18px; font-weight:700;" id="detailGroupName"></div>
                                <span class="group-id-badge" id="detailGroupId"></span>
                            </div>
                        </div>
                        <button type="button" class="btn btn-danger btn-sm" id="detailDeleteBtn"><i class="fas fa-trash"></i> ${t('حذف', 'Delete')}</button>
                    </div>
                    <div id="groupDetailBody"></div>
                </div>

            </div>

            <div id="saveMsgToast" class="toast"><i class="fas fa-check-circle"></i> ${t('تم الحفظ في قاعدة البيانات بنجاح!', 'Saved to database successfully!')}</div>

            </form>
        </div>

        <div id="ollamaModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 style="color:var(--blue);"><i class="fas fa-link"></i> ${t('إعدادات خادم Ollama', 'Ollama Server Settings')}</h3>
                    <button class="close-modal" onclick="closeOllamaModal()">×</button>
                </div>
                <div class="field-group">
                    <label class="field-label">${t('رابط الخادم (Endpoint URL)', 'Server URL (Endpoint)')}</label>
                    <input type="text" id="ollamaUrl" value="${config.ollamaUrl}" dir="ltr" style="text-align:left; font-family:monospace;">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('اسم النموذج', 'Model Name')}</label>
                    <input type="text" id="ollamaModel" value="${config.ollamaModel}" dir="ltr" style="text-align:left; font-family:monospace;" placeholder="Ex: llava">
                </div>
                <button type="button" class="btn btn-primary btn-full" onclick="closeOllamaModal()">${t('حفظ وإغلاق', 'Save & Close')}</button>
            </div>
        </div>

        <div id="debuggerModal" class="modal">
            <div class="modal-content" style="max-width:800px; background:#0d1117; border-color:#21262d;">
                <div class="modal-header">
                    <h3 style="color:var(--accent); font-family:monospace;"><i class="fas fa-terminal"></i> ${t('سجل الأحداث المباشر', 'Live Event Logs')}</h3>
                    <button class="close-modal" onclick="closeDebuggerModal()">×</button>
                </div>
                <div id="terminalOutput"></div>
                <button type="button" class="btn btn-ghost btn-full" style="margin-top:14px;" onclick="closeDebuggerModal()">${t('إغلاق', 'Close')}</button>
            </div>
        </div>

        <script>
            const currentLang = '${lang}';
            const currentDir = '${dir}';
            let fetchedGroups = [];

            const dict = {
                'delete_confirm': '${t("هل أنت متأكد من رغبتك في حذف الإعدادات المخصصة لهذه المجموعة؟", "Are you sure you want to delete settings for this group?")}',
                'logout_confirm': '${t("هل أنت متأكد من رغبتك في تسجيل الخروج من حساب واتساب؟ سيتم فصل البوت.", "Are you sure you want to log out of WhatsApp? The bot will disconnect.")}',
                'logging_out': '<i class="fas fa-spinner fa-spin"></i> ${t("جاري تسجيل الخروج...", "Logging out...")}',
                'purge_warn': '⚠️ ${t("تحذير: هذا الخيار سيجعل البوت يبحث في جميع المجموعات، وسيطرد أي شخص موجود في القائمة السوداء فوراً. متأكد؟", "Warning: The bot will scan all groups and instantly kick anyone in the blacklist. Sure?")}',
                'purging': '<i class="fas fa-spinner fa-spin"></i> ${t("جاري المسح والطرد من المجموعات...", "Scanning and purging...")}',
                'conn_err': '${t("حدث خطأ في الاتصال بالخادم.", "Connection error.")}',
                'save_success': '<i class="fas fa-check-circle"></i> ${t("تم الحفظ في قاعدة البيانات بنجاح!", "Saved to database successfully!")}',
                'save_fail': '<i class="fas fa-times-circle"></i> ${t("فشل الحفظ، تحقق من السيرفر", "Save failed, check server")}',
                'group': '${t("المجموعة", "Group")}',
                'no_id': '${t("لم يتم التحديد", "Not Selected")}',
                'delete': '${t("حذف", "Delete")}',
                'target_group': '${t("اختر المجموعة المستهدفة", "Select Target Group")}',
                'admin_group': '${t("مجموعة الإدارة (اتركه فارغاً للافتراضي)", "Admin Group (leave empty for default)")}',
                'admin_group_label': '${t("اختر المجموعة لتلقي التنبيهات", "Select Group for Alerts")}',
                'blocked_types': '${t("الأنواع الممنوعة قطعياً", "Absolute Blocked Types")}',
                'block_action': '${t("إجراء المنع", "Block Action")}',
                'act_del': '${t("حذف الرسالة فقط", "Delete Message Only")}',
                'act_poll': '${t("حذف + تصويت للإدارة", "Delete + Admin Poll")}',
                'act_auto': '${t("حذف + طرد تلقائي", "Delete + Auto Kick")}',
                'anti_spam': '${t("مكافحة الإزعاج (Anti-Spam)", "Anti-Spam")}',
                'spam_desc': '${t("رصد الرسائل المتكررة خلال 15 ثانية", "Detect repeated messages within 15s")}',
                'limits_15s': '${t("حدود كل نوع (15 ثانية)", "Type Limits (15s)")}',
                'text_dup': '${t("تكرار النص", "Text Dup Limit")}',
                'action': '${t("الإجراء", "Action")}',
                'poll': '${t("تصويت للإدارة", "Admin Poll")}',
                'auto_kick': '${t("طرد تلقائي", "Auto Kick")}',
                'welcome_msg': '${t("رسالة ترحيبية عند الانضمام", "Welcome Message on Join")}',
                'welcome_desc': '${t("يُرسلها البوت لكل عضو جديد", "Sent by bot to new members")}',
                'msg_text': '${t("نص الرسالة ({user} للمنشن)", "Message Text ({user} for mention)")}',
                'enable_bl': '${t("تفعيل القائمة السوداء", "Enable Blacklist")}',
                'bl_desc': '${t("طرد فوري لأي رقم محظور", "Instant kick for banned numbers")}',
                'word_filter': '${t("فلتر الكلمات الممنوعة", "Forbidden Word Filter")}',
                'wf_desc': '${t("حذف فوري عند رصد كلمة ممنوعة", "Instant delete on forbidden word")}',
                'use_global': '${t("تطبيق الكلمات العامة أيضاً", "Apply Global Words Too")}',
                'ug_desc': '${t("إضافة قائمة الكلمات العامة لهذه المجموعة", "Include global words list")}',
                'custom_words': '${t("كلمات ممنوعة مخصصة لهذه المجموعة", "Custom forbidden words for this group")}',
                'add': '${t("إضافة", "Add")}',
                'ai_text': '${t("المشرف الذكي (AI) للنصوص", "AI Moderator for Text")}',
                'ai_vision': '${t("تحليل الصور (Vision)", "Image Analysis (Vision)")}',
                'direct_del': '${t("الحذف المباشر (تخطي التصويت)", "Direct Delete (Skip Poll)")}',
                'select_group': '${t("اختر مجموعة...", "Select a Group...")}',
                'default_setting': '${t("الاختيار الافتراضي (عام)", "Default (Global)")}',
                'panic_mode': '${t("وضع الطوارئ (Panic Mode)", "Panic Mode")}',
                'panic_desc': '${t("إغلاق المجموعة تلقائياً عند رصد هجوم", "Auto-lock group on raid detection")}',
                'panic_msg_limit': '${t("عدد الرسائل", "Message Limit")}',
                'panic_time_window': '${t("خلال (ثواني)", "Within (Seconds)")}',
                'panic_lock_dur': '${t("مدة الإغلاق (دقائق)", "Lockout Duration (Mins)")}',
                'panic_target': '${t("إرسال التنبيه إلى", "Send Alert To")}',
                'target_group_only': '${t("المجموعة المستهدفة فقط", "Target Group Only")}',
                'admin_group_only': '${t("مجموعة الإدارة فقط", "Admin Group Only")}',
                'target_both': '${t("كلاهما (المجموعة والإدارة)", "Both")}',
                'panic_msg_text': '${t("نص التنبيه ({time} للمدة)", "Alert Text ({time} for duration)")}',
                'enable_wl': '${t("تفعيل القائمة البيضاء", "Enable Whitelist")}',
                'wl_desc': '${t("تخطي الفلاتر للأرقام الموثوقة", "Bypass filters for trusted numbers")}',
                'use_global_bl': '${t("تطبيق القائمة السوداء العامة", "Apply Global Blacklist")}',
                'ug_bl_desc': '${t("دمج الأرقام المحظورة العامة مع هذه المجموعة", "Include globally banned numbers")}',
                'custom_bl': '${t("أرقام محظورة مخصصة لهذه المجموعة", "Custom banned numbers for this group")}',
                'use_global_wl': '${t("تطبيق القائمة البيضاء العامة", "Apply Global Whitelist")}',
                'ug_wl_desc': '${t("دمج الأرقام الموثوقة العامة مع هذه المجموعة", "Include globally trusted numbers")}',
                'custom_wl': '${t("أرقام موثوقة مخصصة لهذه المجموعة", "Custom trusted numbers for this group")}'
            };

            async function loadKnownGroups() {
                try {
                    const res = await fetch('/api/groups');
                    fetchedGroups = await res.json();

                    const defAdminContainer = document.getElementById('defaultAdminGroupContainer');
                    if (defAdminContainer) {
                        let defHTML = \`
                            <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>\${dict.admin_group_label}</span>
                                <span style="cursor:pointer; color:var(--accent); font-size:14px;" onclick="loadKnownGroups()" title="Refresh Groups"><i class="fas fa-sync"></i></span>
                            </label>
                            <select id="defaultAdminGroup" dir="ltr" style="text-align:\${currentDir === 'rtl' ? 'right' : 'left'};">
                        \`;
                        defHTML += \`<option value="">-- \${dict.select_group} --</option>\`;
                        
                        let defFound = false;
                        fetchedGroups.forEach(g => {
                            const sel = g.id === '${config.defaultAdminGroup}' ? 'selected' : '';
                            if(sel) defFound = true;
                            defHTML += \`<option value="\${g.id}" \${sel}>\${g.name}</option>\`;
                        });

                        if ('${config.defaultAdminGroup}' && !defFound) {
                            defHTML += \`<option value="${config.defaultAdminGroup}" selected>${config.defaultAdminGroup} (Unknown)</option>\`;
                        }
                        defHTML += \`</select>\`;
                        defAdminContainer.innerHTML = defHTML;
                    }
                    
                    renderGroups();

                } catch(e) {}
            }

            function createGroupSelectHTML(selectedValue, onchangeCode, allowEmpty = false) {
                let html = \`<select onchange="\${onchangeCode}" dir="ltr" style="text-align:\${currentDir === 'rtl' ? 'right' : 'left'};">\`;
                html += \`<option value="">\${allowEmpty ? '-- ' + dict.default_setting + ' --' : '-- ' + dict.select_group + ' --'}</option>\`;
                let found = false;
                fetchedGroups.forEach(g => {
                    let sel = g.id === selectedValue ? 'selected' : '';
                    if(sel) found = true;
                    html += \`<option value="\${g.id}" \${sel}>\${g.name}</option>\`;
                });
                if (selectedValue && !found) {
                    html += \`<option value="\${selectedValue}" selected>\${selectedValue} (Unknown)</option>\`;
                }
                html += \`</select>\`;
                return html;
            }

            function switchLanguage(checkbox) {
                const newLang = checkbox.checked ? 'en' : 'ar';
                document.cookie = "bot_lang=" + newLang + "; path=/; max-age=31536000";
                window.location.reload();
            }

            function openOllamaModal() { document.getElementById('ollamaModal').classList.add('open'); }
            function closeOllamaModal() { document.getElementById('ollamaModal').classList.remove('open'); }
            
            let debuggerInterval;
            function openDebuggerModal() { 
                document.getElementById('debuggerModal').classList.add('open'); 
                fetchLogs();
                debuggerInterval = setInterval(fetchLogs, 1500); 
            }
            function closeDebuggerModal() { 
                document.getElementById('debuggerModal').classList.remove('open'); 
                clearInterval(debuggerInterval);
            }

            window.onclick = function(event) {
                if (event.target === document.getElementById('ollamaModal')) closeOllamaModal();
                if (event.target === document.getElementById('debuggerModal')) closeDebuggerModal();
            }

            async function fetchLogs() {
                try {
                    let res = await fetch('/api/logs');
                    let logs = await res.json();
                    const term = document.getElementById('terminalOutput');
                    
                    let html = logs.map(l => {
                        let styled = l.replace(/\\[خطأ\\]/g, '<span style="color:#ff3b30">[ERROR]</span>')
                                      .replace(/\\[معلومة\\]/g, '<span style="color:#4fc3f7">[INFO]</span>')
                                      .replace(/\\[فحص\\]/g, '<span style="color:#ffeb3b">[SCAN]</span>')
                                      .replace(/\\[أمان\\]/g, '<span style="color:#ff9800">[SECURITY]</span>')
                                      .replace(/\\[تنظيف\\]/g, '<span style="color:#9c27b0">[PURGE]</span>');
                        return \`<div>\${styled}</div>\`;
                    }).join('');
                    
                    if (term.innerHTML !== html) {
                        term.innerHTML = html;
                        term.scrollTop = term.scrollHeight;
                    }
                } catch(e) {}
            }

            async function logoutBot() {
                if(confirm(dict.logout_confirm.replace(/<[^>]*>?/gm, ''))) {
                    document.getElementById('status-text').innerHTML = dict.logging_out;
                    document.getElementById('logoutBtn').style.display = 'none';
                    await fetch('/api/logout', { method: 'POST' });
                }
            }

            const pageTitles = {
                'page-status': '${t("حالة الاتصال", "Connection Status")}',
                'page-blacklist': '${t("إدارة الأرقام", "Manage Numbers")}',
                'page-general': '${t("الإعدادات العامة", "General Settings")}',
                'page-spam': '${t("مكافحة الإزعاج", "Anti-Spam")}',
                'page-media': '${t("فلتر الوسائط", "Media Filter")}',
                'page-ai': '${t("الذكاء الاصطناعي", "AI Moderator")}',
                'page-groups': '${t("المجموعات المخصصة", "Custom Groups")}'
            };
            function showPage(pageId, btn) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById(pageId).classList.add('active');
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                if(btn) btn.classList.add('active');
                document.getElementById('topbarTitle').textContent = pageTitles[pageId] || '';
                closeSidebar();
                if (pageId === 'page-groups') {
                    document.getElementById('groupsListView').style.display = 'block';
                    document.getElementById('groupsDetailView').style.display = 'none';
                }
            }
            function toggleSidebar() {
                document.getElementById('sidebar').classList.toggle('open');
                document.getElementById('sidebarOverlay').classList.toggle('open');
            }
            function closeSidebar() {
                document.getElementById('sidebar').classList.remove('open');
                document.getElementById('sidebarOverlay').classList.remove('open');
            }
            function showToast(msg) {
                const t = document.getElementById('saveMsgToast');
                if(msg) t.innerHTML = msg;
                t.classList.add('show');
                setTimeout(() => t.classList.remove('show'), 3000);
            }

            let defaultWordsArr = ${JSON.stringify(config.defaultWords)};
            let blacklistArr = ${JSON.stringify(blacklistArr)}; 
            let blockedExtensionsArr = ${JSON.stringify(blockedExtensionsArr)}; 
            let whitelistArr = ${JSON.stringify(whitelistArr)}; 
            let groupsConfigObj = ${JSON.stringify(config.groupsConfig)};
            const metaTypes = ${JSON.stringify(mediaTypesMeta)};
            
            let groupsArr = Object.keys(groupsConfigObj).map(key => ({
                id: key,
                adminGroup: groupsConfigObj[key].adminGroup || '',
                words: groupsConfigObj[key].words || [],
                useDefaultWords: groupsConfigObj[key].useDefaultWords !== false,
                enableWordFilter: groupsConfigObj[key].enableWordFilter !== false,
                enableAIFilter: groupsConfigObj[key].enableAIFilter || false,
                enableAIMedia: groupsConfigObj[key].enableAIMedia || false,
                autoAction: groupsConfigObj[key].autoAction || false,
                enableBlacklist: groupsConfigObj[key].enableBlacklist !== false,
                enableWhitelist: groupsConfigObj[key].enableWhitelist !== false,
                useGlobalBlacklist: groupsConfigObj[key].useGlobalBlacklist !== false,
                useGlobalWhitelist: groupsConfigObj[key].useGlobalWhitelist !== false,
                customBlacklist: groupsConfigObj[key].customBlacklist || [],
                customWhitelist: groupsConfigObj[key].customWhitelist || [],
                enableAntiSpam: groupsConfigObj[key].enableAntiSpam || false,
                spamDuplicateLimit: groupsConfigObj[key].spamDuplicateLimit || 3,
                spamAction: groupsConfigObj[key].spamAction || 'poll',
                enableWelcomeMessage: groupsConfigObj[key].enableWelcomeMessage || false, 
                welcomeMessageText: groupsConfigObj[key].welcomeMessageText || '${t("مرحباً بك يا {user} في مجموعتنا!", "Welcome {user} to our group!")}',
                blockedTypes: groupsConfigObj[key].blockedTypes || [],
                blockedAction: groupsConfigObj[key].blockedAction || 'delete',
                spamTypes: groupsConfigObj[key].spamTypes || ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                spamLimits: groupsConfigObj[key].spamLimits || {text:7, image:3, video:2, audio:3, document:3, sticker:3},
                enablePanicMode: groupsConfigObj[key].enablePanicMode || false,
                panicMessageLimit: groupsConfigObj[key].panicMessageLimit || 10,
                panicTimeWindow: groupsConfigObj[key].panicTimeWindow || 5,
                panicLockoutDuration: groupsConfigObj[key].panicLockoutDuration || 10,
                panicAlertTarget: groupsConfigObj[key].panicAlertTarget || 'both',
                panicAlertMessage: groupsConfigObj[key].panicAlertMessage || '${t("🚨 عذراً، تم رصد هجوم (Raid)! سيتم إغلاق المجموعة لمدة {time} دقائق.", "🚨 Raid detected! Group is locked for {time} minutes.")}',
                enableQAFeature: groupsConfigObj[key].enableQAFeature || false,
                qaList: groupsConfigObj[key].qaList || [],
                eventDate: groupsConfigObj[key].eventDate || '',
                eventDates: groupsConfigObj[key].eventDates || [],
                qaLanguage: groupsConfigObj[key].qaLanguage || 'ar',
                currentQAQuestions: []
            }));

            let currentDetailIndex = null;

            function switchGroupTab(groupIndex, tabName, btn) {
                document.querySelectorAll('#gtabs_' + groupIndex + ' .group-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('[id^="gtab_' + groupIndex + '_"]').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById('gtab_' + groupIndex + '_' + tabName);
                if (panel) panel.classList.add('active');
            }

            function renderGroups() {
                const container = document.getElementById('groupsContainer');
                container.innerHTML = '';

                if (groupsArr.length === 0) {
                    container.innerHTML = \`<div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
                        <i class="fas fa-users-cog" style="font-size:48px; margin-bottom:16px; display:block; opacity:0.3;"></i>
                        <div style="font-size:16px; font-weight:600;">\${currentLang === 'en' ? 'No custom groups yet' : 'لا توجد مجموعات مخصصة بعد'}</div>
                        <div style="font-size:13px; margin-top:6px;">\${currentLang === 'en' ? 'Click "Add Group" to get started' : 'اضغط على "إضافة مجموعة" للبدء'}</div>
                    </div>\`;
                    return;
                }

                groupsArr.forEach((group, groupIndex) => {
                    const knownGroup = fetchedGroups.find(g => g.id === group.id);
                    const groupName = knownGroup ? knownGroup.name : (group.id ? group.id.split('@')[0].slice(-10) + '...' : dict.no_id);
                    const initials = groupName.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').slice(0, 2) || '؟';

                    let chips = '';
                    if (group.enablePanicMode) chips += \`<span class="glc-chip orange"><i class="fas fa-radiation"></i> \${currentLang==='en'?'Panic Mode':'طوارئ'}</span>\`;
                    if (group.enableAntiSpam)  chips += \`<span class="glc-chip orange"><i class="fas fa-shield-alt"></i> Anti-Spam</span>\`;
                    if (group.enableAIFilter)  chips += \`<span class="glc-chip blue"><i class="fas fa-brain"></i> AI</span>\`;
                    if (group.enableWordFilter) chips += \`<span class="glc-chip green"><i class="fas fa-filter"></i> \${currentLang==='en'?'Word Filter':'فلتر كلمات'}</span>\`;
                    if (group.enableWelcomeMessage) chips += \`<span class="glc-chip green"><i class="fas fa-door-open"></i> \${currentLang==='en'?'Welcome':'ترحيب'}</span>\`;
                    if (group.blockedTypes && group.blockedTypes.length > 0) chips += \`<span class="glc-chip red"><i class="fas fa-ban"></i> \${group.blockedTypes.length} \${currentLang==='en'?'blocked':'ممنوع'}</span>\`;

                    const card = document.createElement('div');
                    card.className = 'group-list-card';
                    card.onclick = () => openGroupDetail(groupIndex);
                    card.innerHTML = \`
                        <div class="glc-avatar">\${initials}</div>
                        <div class="glc-info">
                            <div class="glc-name">\${groupName}</div>
                            \${group.id ? \`<span class="glc-id">\${group.id}</span>\` : \`<span style="color:var(--orange);font-size:12px;">\${dict.no_id}</span>\`}
                            \${chips ? \`<div class="glc-chips">\${chips}</div>\` : ''}
                        </div>
                        <i class="fas fa-chevron-\${currentLang==='en'?'right':'left'} glc-arrow"></i>
                    \`;
                    container.appendChild(card);
                });
            }

            function openGroupDetail(groupIndex) {
                currentDetailIndex = groupIndex;
                const group = groupsArr[groupIndex];
                const knownGroup = fetchedGroups.find(g => g.id === group.id);
                const groupName = knownGroup ? knownGroup.name : (group.id || dict.no_id);
                const initials = groupName.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').slice(0, 2) || '؟';

                const av = document.getElementById('detailGroupAvatar');
                av.textContent = initials;
                document.getElementById('detailGroupName').textContent = groupName;
                document.getElementById('detailGroupId').textContent = group.id || dict.no_id;

                document.getElementById('detailDeleteBtn').onclick = () => {
                    if (confirm(dict.delete_confirm.replace(/<[^>]*>?/gm, ''))) {
                        groupsArr.splice(groupIndex, 1);
                        closeGroupDetail();
                    }
                };

                renderGroupDetailBody(groupIndex);

                document.getElementById('groupsListView').style.display = 'none';
                document.getElementById('groupsDetailView').style.display = 'block';
            }

            function closeGroupDetail() {
                document.getElementById('groupsDetailView').style.display = 'none';
                document.getElementById('groupsListView').style.display = 'block';
                currentDetailIndex = null;
                renderGroups();
            }

            function renderGroupChips(groupIndex, type) {
                const group = groupsArr[groupIndex];
                let html = '';
                let containerId = '';
                if (type === 'words') {
                    html = group.words.map((word, wordIndex) => '<div class="chip">' + word + ' <span class="chip-remove" onclick="removeGroupWord(' + groupIndex + ', ' + wordIndex + ')">&times;</span></div>').join('');
                    containerId = 'chip_container_words_' + groupIndex;
                } else if (type === 'blacklist') {
                    html = group.customBlacklist.map((num, idx) => '<div class="chip red-chip">' + num + ' <span class="chip-remove" onclick="removeGroupBlacklist(' + groupIndex + ', ' + idx + ')">&times;</span></div>').join('');
                    containerId = 'chip_container_bl_' + groupIndex;
                } else if (type === 'whitelist') {
                    html = group.customWhitelist.map((num, idx) => '<div class="chip">' + num + ' <span class="chip-remove" onclick="removeGroupWhitelist(' + groupIndex + ', ' + idx + ')">&times;</span></div>').join('');
                    containerId = 'chip_container_wl_' + groupIndex;
                }
                const container = document.getElementById(containerId);
                if (container) container.innerHTML = html;
            }

            function renderGroupDetailBody(groupIndex, activeTab = 'general') {
                const group = groupsArr[groupIndex];
                const container = document.getElementById('groupDetailBody');

                let wordsHtml = group.words.map((word, wordIndex) => 
                    '<div class="chip">' + word + ' <span class="chip-remove" onclick="removeGroupWord(' + groupIndex + ', ' + wordIndex + ')">&times;</span></div>'
                ).join('');

                let blHtml = group.customBlacklist.map((num, idx) => 
                    '<div class="chip red-chip">' + num + ' <span class="chip-remove" onclick="removeGroupBlacklist(' + groupIndex + ', ' + idx + ')">&times;</span></div>'
                ).join('');

                let wlHtml = group.customWhitelist.map((num, idx) => 
                    '<div class="chip">' + num + ' <span class="chip-remove" onclick="removeGroupWhitelist(' + groupIndex + ', ' + idx + ')">&times;</span></div>'
                ).join('');

                const blockedChecks = metaTypes.map(t => 
                    '<label class="cb-label"><input type="checkbox" value="' + t.id + '" ' + (group.blockedTypes.includes(t.id)?'checked':'') + ' onchange="updateGroupArray(' + groupIndex + ', \'blockedTypes\', \'' + t.id + '\', this.checked)"> ' + t.icon + ' ' + t.name + '</label>'
                ).join('');

                const spamLimitGrid = metaTypes.map(t => {
                    const isChecked = group.spamTypes.includes(t.id) ? 'checked' : '';
                    const limitVal = group.spamLimits[t.id] || 5;
                    return '<div class="limit-item"><input type="checkbox" value="' + t.id + '" ' + isChecked + ' onchange="updateGroupArray(' + groupIndex + ', \'spamTypes\', \'' + t.id + '\', this.checked)"><span style=\"font-size:13px;width:70px;\">' + t.icon + ' ' + t.name + '</span><input type="number" value="' + limitVal + '" min="1" onchange="updateSpamLimit(' + groupIndex + ', \'' + t.id + '\', this.value)"></div>';
                }).join('');

                const tabs = [
                    { id: 'general', icon: 'fa-cog',        label: currentLang==='en'?'General':'عام' },
                    { id: 'filters', icon: 'fa-filter',     label: currentLang==='en'?'Filters':'فلاتر' },
                    { id: 'qa',      icon: 'fa-question',   label: currentLang==='en'?'Q&A':'س و ج' },
                    { id: 'spam',    icon: 'fa-shield-alt', label: currentLang==='en'?'Anti-Spam':'سبام' },
                    { id: 'panic',   icon: 'fa-radiation',  label: currentLang==='en'?'Panic':'طوارئ' },
                    { id: 'lists',   icon: 'fa-list',       label: currentLang==='en'?'Lists':'القوائم' },
                ];
                const tabButtons = tabs.map((tab, i) =>
                    '<button type="button" class="group-tab ' + (tab.id===activeTab?'active':'') + '" onclick="switchGroupTab(' + groupIndex + ',\'' + tab.id + '\',this)' + (tab.id==='qa'?';loadGroupMedia('+groupIndex+')':'') + '"><i class="fas ' + tab.icon + '"></i> ' + tab.label + '</button>'
                ).join('');

                container.innerHTML = \`
                    <div class="field-row" style="margin-bottom:20px;">
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">\${dict.target_group}</label>
                            \${createGroupSelectHTML(group.id, \\\`updateGroupData(\${groupIndex}, 'id', this.value)\\\`, false)}
                        </div>
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">\${dict.admin_group}</label>
                            \${createGroupSelectHTML(group.adminGroup, \\\`updateGroupData(\${groupIndex}, 'adminGroup', this.value)\\\`, true)}
                        </div>
                    </div>

                    <div class="group-tabs" id="gtabs_\${groupIndex}">\${tabButtons}</div>

                    <div class="group-tab-panel \${activeTab==='general'?'active':''}" id="gtab_\${groupIndex}_general">
                        <div class="sub-panel red" style="margin-bottom:16px;">
                            <h4 style="color:var(--red);">\${dict.blocked_types}</h4>
                            <div class="cb-group" style="margin-bottom:10px;">\${blockedChecks}</div>
                            <label class="field-label">\${dict.block_action}</label>
                            <select onchange="updateGroupData(\${groupIndex}, 'blockedAction', this.value)">
                                <option value="delete" \${group.blockedAction==='delete'?'selected':''}>\${dict.act_del}</option>
                                <option value="poll" \${group.blockedAction==='poll'?'selected':''}>\${dict.act_poll}</option>
                                <option value="auto" \${group.blockedAction==='auto'?'selected':''}>\${dict.act_auto}</option>
                            </select>
                        </div>
                        <div class="card success">
                            <div class="toggle-row green" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWelcomeMessage?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'welcome',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">\${dict.welcome_msg}<small>\${dict.welcome_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_welcome_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableWelcomeMessage?'200px':'0px'};opacity:\${group.enableWelcomeMessage?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableWelcomeMessage?'20px':'0px'};">
                                <label class="field-label">\${dict.msg_text}</label>
                                <textarea rows="2" onchange="updateGroupData(\${groupIndex}, 'welcomeMessageText', this.value)">\${group.welcomeMessageText}</textarea>
                            </div>
                        </div>
                        <div class="toggle-row pink" style="margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.autoAction?'checked':''} onchange="updateGroupToggle(\${groupIndex},'autoAction',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label pink">\${dict.direct_del}</div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='filters'?'active':''}" id="gtab_\${groupIndex}_filters">
                        <div class="card warning">
                            <div class="toggle-row warning" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWordFilter?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'words',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">\${dict.word_filter}<small>\${dict.wf_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_words_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableWordFilter?'600px':'0px'};opacity:\${group.enableWordFilter?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableWordFilter?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(255,171,64,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" \${group.useDefaultWords?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useDefaultWords',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">\${dict.use_global}<small>\${dict.ug_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">\${dict.custom_words}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupWord_\${groupIndex}" placeholder="..." onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWord(\${groupIndex});}">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWord(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_words_\${groupIndex}">\${wordsHtml}</div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.enableAIFilter?'checked':''} onchange="updateGroupToggle(\${groupIndex},'enableAIFilter',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label blue">\${dict.ai_text}</div>
                            </div>
                        </div>
                        <div class="toggle-row purple" style="margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.enableAIMedia?'checked':''} onchange="updateGroupToggle(\${groupIndex},'enableAIMedia',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label purple">\${dict.ai_vision}</div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='qa'?'active':''}" id="gtab_\${groupIndex}_qa">
                        <div class="card info">
                            <div class="toggle-row blue" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableQAFeature?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'qa',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label blue">\${currentLang==='en'?'Enable Q&A Feature':'تفعيل ميزة الأسئلة والأجوبة'}<small>\${currentLang==='en'?'Auto-respond to predefined questions with dynamic fields':'الإجابة التلقائية على الأسئلة المحددة مع حقول ديناميكية'}</small></div>
                                </div>
                            </div>
                            <div id="group_qa_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableQAFeature?'1200px':'0px'};opacity:\${group.enableQAFeature?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableQAFeature?'20px':'0px'};">
                                <div class="sub-panel blue" style="margin-bottom:16px;">
                                    <h4 style="color:var(--blue);">\${currentLang==='en'?'Dynamic Fields Reference':'مرجع الحقول الديناميكية'}</h4>
                                    <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
                                        <div><strong style="color:var(--blue);">{eventdate}</strong> - \${currentLang==='en'?'Primary event/deadline (first in list)':'الحدث الأساسي (الأول في القائمة)'}</div>
                                        <div><strong style="color:var(--blue);">{eventdate:Label}</strong> - \${currentLang==='en'?'Specific event by label':'حدث معين حسب العنوان'}</div>
                                        <div><strong style="color:var(--blue);">{user}</strong> - \${currentLang==='en'?'Sender username':'اسم المرسل'}</div>
                                    </div>
                                </div>
                                
                                <div class="sub-panel blue" style="margin-bottom: 24px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                        <h4 style="color: var(--blue); margin-bottom: 0;"><i class="fas fa-calendar-alt"></i> \${currentLang === 'en' ? 'Manage Events/Deadlines' : 'إدارة الأحداث والمواعيد'}</h4>
                                        <button type="button" class="btn btn-primary btn-sm" onclick="addEventDate(\${groupIndex})">
                                            <i class="fas fa-plus"></i> \${currentLang === 'en' ? 'Add Event' : 'إضافة حدث'}
                                        </button>
                                    </div>
                                    <div id="event_dates_container_\${groupIndex}">
                                        \${(group.eventDates || []).map((ed, edIdx) => {
                                            return '<div class="toggle-row blue" style="margin-bottom: 8px; padding: 12px; border-radius: 10px; border: 1.5px solid var(--card-border);"><div style="display: flex; gap: 12px; align-items: center; width: 100%;"><div style="flex: 1;"><label class="field-label" style="font-size: 10px; margin-bottom: 4px;">' + (currentLang === 'en' ? 'Label (e.g. Exam)' : 'العنوان (مثل: اختبار)') + '</label><input type="text" value="' + (ed.label || '') + '" placeholder="..." onchange="updateEventDate(' + groupIndex + ', ' + edIdx + ', \'label\', this.value)" style="padding: 8px 12px; font-size: 14px;"></div><div style="flex: 1;"><label class="field-label" style="font-size: 10px; margin-bottom: 4px;">' + (currentLang === 'en' ? 'Date' : 'التاريخ') + '</label><input type="date" value="' + (ed.date || '') + '" onchange="updateEventDate(' + groupIndex + ', ' + edIdx + ', \'date\', this.value)" style="color-scheme: dark; padding: 8px 12px; font-size: 14px;"></div><button type="button" class="icon-btn" onclick="removeEventDate(' + groupIndex + ', ' + edIdx + ')" style="background: var(--red-dim); color: var(--red); border-color: rgba(255,82,82,0.3); margin-top: 18px;" title="' + (currentLang === 'en' ? 'Delete' : 'حذف') + '"><i class="fas fa-trash"></i></button></div></div>';
                                        }).join('')}
                                        \${(!group.eventDates || group.eventDates.length === 0) ? \`<div style="font-size: 13px; color: var(--text-muted); padding: 20px; text-align: center; border: 1.5px dashed var(--card-border); border-radius: 10px; background: rgba(0,0,0,0.1);">
                                            <i class="fas fa-calendar-times" style="font-size: 24px; display: block; margin-bottom: 8px; opacity: 0.5;"></i>
                                            \${currentLang === 'en' ? 'No extra events added yet.' : 'لم يتم إضافة أحداث إضافية بعد.'}
                                        </div>\` : ''}
                                    </div>
                                </div>

                                <div class="field-row" style="margin-bottom:16px;">
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label" style="margin-bottom:4px;">\${currentLang==='en'?'Legacy Event Date (for {eventdate})':'تاريخ الحدث القديم (لحقل {eventdate})'}</label>
                                        <input type="date" id="newQAEventDate_\${groupIndex}" value="\${group.eventDate || ''}" onchange="updateGroupData(\${groupIndex}, 'eventDate', this.value)" style="color-scheme: dark; font-family: var(--font);">
                                    </div>
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label" style="margin-bottom:4px;">\${currentLang==='en'?'Days-Left Language':'لغة عرض الأيام المتبقية'}</label>
                                        <select id="qaLang_\${groupIndex}" onchange="updateGroupData(\${groupIndex}, 'qaLanguage', this.value)">
                                            <option value="ar" \${(group.qaLanguage||'ar')==='ar'?'selected':''}>\${currentLang==='en'?'Arabic (عربي)':'العربية'}</option>
                                            <option value="en" \${(group.qaLanguage||'ar')==='en'?'selected':''}>English</option>
                                        </select>
                                    </div>
                                </div>

                                <label class="field-label">\${currentLang==='en'?'Add Questions for This Answer':'أضف أسئلة لهذه الإجابة'}</label>
                                <div class="field-group" style="margin-bottom:10px;">
                                    <input type="text" id="newQAQuestion_\${groupIndex}" placeholder="\${currentLang==='en'?'Enter a question variant (e.g., when is the test)...':'أدخل صيغة السؤال...'}" style="margin-bottom:10px;" onkeypress="if(event.key==='Enter'){event.preventDefault();addQuestionToQA(\${groupIndex});}">
                                    <button type="button" class="btn btn-full" onclick="addQuestionToQA(\${groupIndex})" style="margin-bottom:10px;background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-plus"></i> \${currentLang==='en'?'Add Question Variant':'إضافة صيغة سؤال'}</button>
                                    <div class="chip-container" id="qa_questions_container_\${groupIndex}" style="min-height:40px;">\${(group.currentQAQuestions || []).map((q, qIdx) => '<div class="chip"><span>' + q + '</span><span class="chip-remove" onclick="removeQuestionFromQA(' + groupIndex + ', ' + qIdx + ')">×</span></div>').join('')}</div>
                                </div>
                                <label class="field-label">\${currentLang==='en'?'Answer (Use {date}, {eventdate}, {user} for dynamic values)':'الإجابة (استخدم {date}, {eventdate}, {user} للحقول الديناميكية)'}</label>
                                <div class="field-group" style="margin-bottom:10px;">
                                    <textarea id="newQAAnswer_\${groupIndex}" placeholder="\${currentLang==='en'?'Enter answer with optional dynamic fields...':'أدخل الإجابة مع الحقول الديناميكية الاختيارية...'}" rows="3" style="margin-bottom:10px;"></textarea>
                                    <button type="button" id="saveQABtn_\${groupIndex}" class="btn btn-full" onclick="addGroupQA(\${groupIndex})" style="background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-save"></i> \${currentLang==='en'?'Save Q&A Pair':'حفظ زوج س و ج'}</button>
                                </div>

                                <!-- Media Attachment Section -->
                                <div class="sub-panel" style="margin-bottom:16px;border-color:rgba(100,220,150,0.3);background:rgba(100,220,150,0.04);">
                                    <h4 style="color:#64dc96;margin-bottom:12px;"><i class="fas fa-paperclip"></i> \${currentLang==='en'?'Attach Media to This Answer':'إرفاق وسائط بهذه الإجابة'}</h4>
                                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">\${currentLang==='en'?'Select a file to automatically attach it when saving the Q&A pair. The bot will send the file + answer caption.':'اختر ملفاً ليُرفق تلقائياً عند حفظ الزوج. سيرسل البوت الملف مع نص الإجابة كتعليق.'}</p>
                                    <!-- Selected file indicator -->
                                    <div id="qa_media_selected_\${groupIndex}" style="display:none;align-items:center;gap:10px;background:rgba(100,220,150,0.1);border:1px solid rgba(100,220,150,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                                        <i class="fas fa-paperclip" style="color:#64dc96;"></i>
                                        <span id="qa_media_selected_name_\${groupIndex}" style="font-size:13px;color:#64dc96;flex:1;"></span>
                                        <button type="button" onclick="clearQAMedia(\${groupIndex})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button>
                                    </div>
                                    <!-- Upload area -->
                                    <div style="display:flex;gap:10px;margin-bottom:14px;">
                                        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--input-bg);border:1.5px dashed rgba(100,220,150,0.4);border-radius:10px;cursor:pointer;font-size:13px;color:var(--text-muted);transition:all 0.2s;" onmouseover="this.style.borderColor='#64dc96'" onmouseout="this.style.borderColor='rgba(100,220,150,0.4)'">
                                            <i class="fas fa-cloud-upload-alt" style="color:#64dc96;font-size:18px;"></i>
                                            <span>\${currentLang==='en'?'Click to upload a file':'انقر لرفع ملف'}</span>
                                            <input type="file" id="qa_file_input_\${groupIndex}" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onchange="uploadGroupMedia(\${groupIndex}, this)">
                                        </label>
                                    </div>
                                    <!-- Upload progress -->
                                    <div id="qa_upload_status_\${groupIndex}" style="display:none;font-size:12px;color:var(--text-muted);margin-bottom:10px;"></div>
                                    <!-- File grid -->
                                    <div id="qa_media_grid_\${groupIndex}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;"></div>
                                </div>

                                <label class="field-label" style="margin-top:16px;">\${currentLang==='en'?'Q&A Pairs':'أزواج الأسئلة والأجوبة'}</label>
                                <div id="qa_container_\${groupIndex}">
                                    \${(group.qaList || []).map((qa, qaIdx) => \`
                                        <div class="group-card" style="margin-bottom:10px;">
                                            <div class="group-card-header" style="padding:12px;">
                                                <div class="group-card-title" style="font-size:14px;">
                                                    <i class="fas fa-question" style="color:var(--blue);"></i> \${currentLang==='en'?'Question Variations':'صيغ الأسئلة'} (\${(qa.questions || []).length})
                                                </div>
                                                <div style="display:flex;gap:8px;">
                                                    <button type="button" class="icon-btn" onclick="editGroupQA(\${groupIndex}, \${qaIdx})" title="\${currentLang==='en'?'Edit':'تعديل'}" style="background:var(--blue-dim);color:var(--blue);border-color:rgba(64,196,255,0.3);">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button type="button" class="icon-btn" onclick="removeGroupQA(\${groupIndex}, \${qaIdx})" title="\${currentLang==='en'?'Delete':'حذف'}" style="background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3);">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="group-card-body" style="padding:12px;">
                                                <div style="margin-bottom:10px;">
                                                    <div class="chip-container" style="background:rgba(64,196,255,0.05);border-color:rgba(64,196,255,0.2);">\${(qa.questions || []).map((q) => '<div class="chip" style="background:rgba(64,196,255,0.15);color:var(--blue);border-color:rgba(64,196,255,0.3);"><i class="fas fa-search"></i> ' + q + '</div>').join('')}</div>
                                                </div>
                                                <div style="color:var(--text-muted);font-size:13px;">
                                                    <strong>\${currentLang==='en'?'Answer':'الإجابة'}:</strong> \${qa.answer || '(empty)'}
                                                </div>
                                                \${qa.mediaFile ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:#64dc96;"><i class="fas fa-paperclip"></i> ' + qa.mediaFile + '</div>' : ''}
                                            </div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='spam'?'active':''}" id="gtab_\${groupIndex}_spam">
                        <div class="card warning">
                            <div class="toggle-row warning" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableAntiSpam?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'spam',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">\${dict.anti_spam}<small>\${dict.spam_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_spam_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableAntiSpam?'800px':'0px'};opacity:\${group.enableAntiSpam?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableAntiSpam?'20px':'0px'};">
                                <div style="border-top:1px dashed rgba(255,171,64,0.3);padding-top:20px;">
                                    <div class="field-row" style="margin-bottom:20px;">
                                        <div class="field-group" style="margin-bottom:0;">
                                            <label class="field-label">\${dict.action}</label>
                                            <select onchange="updateGroupData(\${groupIndex}, 'spamAction', this.value)">
                                                <option value="poll" \${group.spamAction==='poll'?'selected':''}>\${dict.poll}</option>
                                                <option value="auto" \${group.spamAction==='auto'?'selected':''}>\${dict.auto_kick}</option>
                                            </select>
                                        </div>
                                        <div class="field-group" style="margin-bottom:0;">
                                            <label class="field-label">\${dict.text_dup}</label>
                                            <input type="number" value="\${group.spamDuplicateLimit}" min="2" max="15" onchange="updateGroupData(\${groupIndex},'spamDuplicateLimit',parseInt(this.value))">
                                        </div>
                                    </div>
                                    <label class="field-label" style="margin-bottom:12px;"><i class="fas fa-stopwatch"></i> \${dict.limits_15s}</label>
                                    <div class="limit-grid">\${spamLimitGrid}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='panic'?'active':''}" id="gtab_\${groupIndex}_panic">
                        <div class="card danger">
                            <div class="toggle-row danger" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enablePanicMode?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'panic',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">\${dict.panic_mode}<small>\${dict.panic_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_panic_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enablePanicMode?'800px':'0px'};opacity:\${group.enablePanicMode?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enablePanicMode?'20px':'0px'};">
                                <div style="border-top:1px dashed rgba(255,82,82,0.3);padding-top:20px;">
                                    <div class="field-row" style="margin-bottom:12px;">
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">\${dict.panic_msg_limit}</label><input type="number" value="\${group.panicMessageLimit}" min="2" onchange="updateGroupData(\${groupIndex},'panicMessageLimit',parseInt(this.value))"></div>
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">\${dict.panic_time_window}</label><input type="number" value="\${group.panicTimeWindow}" min="1" onchange="updateGroupData(\${groupIndex},'panicTimeWindow',parseInt(this.value))"></div>
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">\${dict.panic_lock_dur}</label><input type="number" value="\${group.panicLockoutDuration}" min="1" onchange="updateGroupData(\${groupIndex},'panicLockoutDuration',parseInt(this.value))"></div>
                                    </div>
                                    <div class="field-group">
                                        <label class="field-label">\${dict.panic_target}</label>
                                        <select onchange="updateGroupData(\${groupIndex},'panicAlertTarget',this.value)">
                                            <option value="both" \${group.panicAlertTarget==='both'?'selected':''}>\${dict.target_both}</option>
                                            <option value="group" \${group.panicAlertTarget==='group'?'selected':''}>\${dict.target_group_only}</option>
                                            <option value="admin" \${group.panicAlertTarget==='admin'?'selected':''}>\${dict.admin_group_only}</option>
                                        </select>
                                    </div>
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label">\${dict.panic_msg_text}</label>
                                        <textarea rows="2" onchange="updateGroupData(\${groupIndex},'panicAlertMessage',this.value)">\${group.panicAlertMessage}</textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='lists'?'active':''}" id="gtab_\${groupIndex}_lists">
                        <div class="card danger">
                            <div class="toggle-row danger" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableBlacklist?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'blacklist',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">\${dict.enable_bl}<small>\${dict.bl_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_blacklist_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableBlacklist?'600px':'0px'};opacity:\${group.enableBlacklist?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableBlacklist?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(255,82,82,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" \${group.useGlobalBlacklist?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useGlobalBlacklist',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">\${dict.use_global_bl}<small>\${dict.ug_bl_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">\${dict.custom_bl}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupBl_\${groupIndex}" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupBlacklist(\${groupIndex});}">
                                    <button type="button" class="btn btn-danger btn-sm" onclick="addGroupBlacklist(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_bl_\${groupIndex}">\${blHtml}</div>
                            </div>
                        </div>
                        <div class="card success">
                            <div class="toggle-row green" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWhitelist?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'whitelist',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">\${dict.enable_wl}<small>\${dict.wl_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_whitelist_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableWhitelist?'600px':'0px'};opacity:\${group.enableWhitelist?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableWhitelist?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(0,230,118,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" \${group.useGlobalWhitelist?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useGlobalWhitelist',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">\${dict.use_global_wl}<small>\${dict.ug_wl_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">\${dict.custom_wl}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupWl_\${groupIndex}" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWhitelist(\${groupIndex});}">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWhitelist(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_wl_\${groupIndex}">\${wlHtml}</div>
                            </div>
                        </div>
                    </div>\`;
            }function updateGroupArray(gIndex, arrName, val, isChecked) {
                let arr = groupsArr[gIndex][arrName];
                if (isChecked && !arr.includes(val)) arr.push(val);
                if (!isChecked) {
                    let idx = arr.indexOf(val);
                    if (idx > -1) arr.splice(idx, 1);
                }
            }

            function updateSpamLimit(gIndex, type, val) {
                if (!groupsArr[gIndex].spamLimits) groupsArr[gIndex].spamLimits = {};
                groupsArr[gIndex].spamLimits[type] = parseInt(val) || 5;
            }

            function getCheckedValues(containerId) {
                const checkboxes = document.querySelectorAll(\`#\${containerId} input[type="checkbox"]:checked\`);
                return Array.from(checkboxes).map(cb => cb.value);
            }

            function renderBlacklist() {
                const container = document.getElementById('blacklistContainer');
                container.innerHTML = '';
                blacklistArr.forEach((number, index) => {
                    container.innerHTML += \`<div class="chip red-chip">\${number} <span class="chip-remove" onclick="removeBlacklistNumber(\${index})">&times;</span></div>\`;
                });
                document.getElementById('blacklist-count').innerText = blacklistArr.length;
            }

            function renderWhitelist() {
                const container = document.getElementById('whitelistContainer');
                container.innerHTML = '';
                whitelistArr.forEach((number, index) => {
                    container.innerHTML += \`<div class="chip">\${number} <span class="chip-remove" onclick="removeWhitelistNumber(\${index})">&times;</span></div>\`;
                });
            }

            function renderBlockedExtensions() {
                const container = document.getElementById('blockedExtensionsContainer');
                if(!container) return;
                container.innerHTML = '';
                blockedExtensionsArr.forEach((ext, index) => {
                    container.innerHTML += \`<div class="chip red-chip">+\${ext} <span class="chip-remove" onclick="removeBlockedExtension(\${index})">&times;</span></div>\`;
                });
            }
            window.addEventListener('DOMContentLoaded', () => { renderBlockedExtensions(); });

            async function addBlacklistNumber() {
                const input = document.getElementById('newBlacklistNumber');
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!blacklistArr.includes(finalId)) {
                        blacklistArr.push(finalId);
                        renderBlacklist(); 
                        try {
                            await fetch('/api/blacklist/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function addBlockedExtension() {
                const input = document.getElementById('newBlockedExtension');
                let justNumbers = input.value.replace(/\\D/g, '');
                if (justNumbers) {
                    if (!blockedExtensionsArr.includes(justNumbers)) {
                        blockedExtensionsArr.push(justNumbers);
                        renderBlockedExtensions();
                        try {
                            await fetch('/api/extensions/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ext: justNumbers}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function removeBlockedExtension(index) {
                const extToRemove = blockedExtensionsArr[index];
                blockedExtensionsArr.splice(index, 1);
                renderBlockedExtensions();
                try {
                    await fetch('/api/extensions/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ext: extToRemove}) });
                } catch(e) {}
            }

            async function addWhitelistNumber() {
                const input = document.getElementById('newWhitelistNumber');
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!whitelistArr.includes(finalId)) {
                        whitelistArr.push(finalId);
                        renderWhitelist(); 
                        try {
                            await fetch('/api/whitelist/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function removeBlacklistNumber(index) {
                const numberToRemove = blacklistArr[index];
                blacklistArr.splice(index, 1);
                renderBlacklist();
                try {
                    await fetch('/api/blacklist/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function removeWhitelistNumber(index) {
                const numberToRemove = whitelistArr[index];
                whitelistArr.splice(index, 1);
                renderWhitelist();
                try {
                    await fetch('/api/whitelist/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function purgeBlacklisted() {
                if(!confirm(dict.purge_warn.replace(/<[^>]*>?/gm, ''))) return;
                const btn = document.getElementById('purgeBtn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = dict.purging;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/blacklist/purge', { method: 'POST' });
                    const data = await res.json();
                    if(data.error) alert('Error: ' + data.error);
                    else alert('Success: ' + data.message);
                } catch(e) {
                    alert(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }

            function renderDefaultWords() {
                const container = document.getElementById('defaultWordsContainer');
                container.innerHTML = '';
                defaultWordsArr.forEach((word, index) => {
                    container.innerHTML += \`<div class="chip">\${word} <span class="chip-remove" onclick="removeDefaultWord(\${index})">&times;</span></div>\`;
                });
            }
            function addDefaultWord() {
                const input = document.getElementById('newDefaultWord');
                const word = input.value.trim();
                if (word && !defaultWordsArr.includes(word)) {
                    defaultWordsArr.push(word);
                    input.value = '';
                    renderDefaultWords();
                }
            }
            function removeDefaultWord(index) {
                defaultWordsArr.splice(index, 1);
                renderDefaultWords();
            }

            function toggleGroupPanel(groupIndex, type, enabled) {
                const panelMap = { spam: 'spam', welcome: 'welcome', words: 'words', qa: 'qa', panic: 'panic', blacklist: 'blacklist', whitelist: 'whitelist' };
                const fieldMap = { spam: 'enableAntiSpam', welcome: 'enableWelcomeMessage', words: 'enableWordFilter', qa: 'enableQAFeature', panic: 'enablePanicMode', blacklist: 'enableBlacklist', whitelist: 'enableWhitelist' };
                const maxHeightMap = { spam: '600px', welcome: '200px', words: '600px', qa: '1200px', panic: '800px', blacklist: '600px', whitelist: '600px' };

                if (groupIndex !== 'global') {
                    groupsArr[groupIndex][fieldMap[type]] = enabled;
                }

                const panel = document.getElementById(\`group_\${panelMap[type]}_panel_\${groupIndex}\`);
                const toggle = panel ? panel.previousElementSibling : null;
                if (!panel) return;

                if (enabled) {
                    panel.style.maxHeight = maxHeightMap[type];
                    panel.style.opacity = '1';
                    panel.style.marginTop = '20px';
                    if (toggle) toggle.style.borderRadius = '10px 10px 0 0';
                } else {
                    panel.style.maxHeight = '0px';
                    panel.style.opacity = '0';
                    panel.style.marginTop = '0px';
                    if (toggle) toggle.style.borderRadius = '10px';
                }
            }

            function addGroup() {
                groupsArr.push({ 
                    id: '', adminGroup: '', words: [], useDefaultWords: true, 
                    enableWordFilter: true, enableAIFilter: false, enableAIMedia: false, 
                    autoAction: false, enableBlacklist: true, enableWhitelist: true,
                    useGlobalBlacklist: true, useGlobalWhitelist: true,
                    customBlacklist: [], customWhitelist: [],
                    enableAntiSpam: false, spamDuplicateLimit: 3, spamAction: 'poll',
                    enableWelcomeMessage: false, welcomeMessageText: '${t("مرحباً بك يا {user} في مجموعتنا!", "Welcome {user} to our group!")}',
                    blockedTypes: [], blockedAction: 'delete', 
                    spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                    spamLimits: {text:7, image:3, video:2, audio:3, document:3, sticker:3},
                    enablePanicMode: false, panicMessageLimit: 10, panicTimeWindow: 5, panicLockoutDuration: 10, panicAlertTarget: 'both', panicAlertMessage: '${t("🚨 عذراً، تم رصد هجوم (Raid)! سيتم إغلاق المجموعة لمدة {time} دقائق.", "🚨 Raid detected! Group is locked for {time} minutes.")}',
                    enableQAFeature: false, qaList: [], eventDate: '', eventDates: [], qaLanguage: 'ar', currentQAQuestions: []
                });
                openGroupDetail(groupsArr.length - 1);
            }

            function removeGroup(index) {
                if(confirm(dict.delete_confirm.replace(/<[^>]*>?/gm, ''))) {
                    groupsArr.splice(index, 1);
                    closeGroupDetail();
                }
            }

            function updateGroupData(index, field, value) {
                groupsArr[index][field] = value;
                if (field === 'id' && index === currentDetailIndex) {
                    const knownGroup = fetchedGroups.find(g => g.id === value);
                    const groupName = knownGroup ? knownGroup.name : (value || dict.no_id);
                    const initials = groupName.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').slice(0, 2) || '؟';
                    document.getElementById('detailGroupName').textContent = groupName;
                    document.getElementById('detailGroupId').textContent = value || dict.no_id;
                    document.getElementById('detailGroupAvatar').textContent = initials;
                }
            }
            function updateGroupToggle(index, field, isChecked) { groupsArr[index][field] = isChecked; }

            function addGroupWord(groupIndex) {
                const input = document.getElementById(\`newGroupWord_\${groupIndex}\`);
                const word = input.value.trim();
                if (word && !groupsArr[groupIndex].words.includes(word)) {
                    groupsArr[groupIndex].words.push(word);
                    input.value = '';
                    renderGroupChips(groupIndex, 'words');
                }
            }
            function removeGroupWord(groupIndex, wordIndex) {
                groupsArr[groupIndex].words.splice(wordIndex, 1);
                renderGroupChips(groupIndex, 'words');
            }

            function addQuestionToQA(groupIndex) {
                const input = document.getElementById(\`newQAQuestion_\${groupIndex}\`);
                const question = input.value.trim().toLowerCase();
                if (question) {
                    if (!groupsArr[groupIndex].currentQAQuestions) groupsArr[groupIndex].currentQAQuestions = [];
                    if (!groupsArr[groupIndex].currentQAQuestions.includes(question)) {
                        groupsArr[groupIndex].currentQAQuestions.push(question);
                        input.value = '';
                        renderQAQuestions(groupIndex);
                    } else {
                        alert(currentLang === 'en' ? 'This question variant already exists' : 'صيغة السؤال هذه موجودة بالفعل');
                    }
                }
            }
            
            function removeQuestionFromQA(groupIndex, questionIndex) {
                if (groupsArr[groupIndex].currentQAQuestions) {
                    groupsArr[groupIndex].currentQAQuestions.splice(questionIndex, 1);
                    renderQAQuestions(groupIndex);
                }
            }

            function addEventDate(groupIndex) {
                if (!groupsArr[groupIndex].eventDates) groupsArr[groupIndex].eventDates = [];
                groupsArr[groupIndex].eventDates.push({ label: '', date: '' });
                renderGroupDetailBody(groupIndex, 'qa');
            }

            function removeEventDate(groupIndex, dateIndex) {
                groupsArr[groupIndex].eventDates.splice(dateIndex, 1);
                renderGroupDetailBody(groupIndex, 'qa');
            }

            function updateEventDate(groupIndex, dateIndex, field, value) {
                if (!groupsArr[groupIndex].eventDates[dateIndex]) return;
                groupsArr[groupIndex].eventDates[dateIndex][field] = value;
            }
            
            function renderQAQuestions(groupIndex) {
                const container = document.getElementById(\`qa_questions_container_\${groupIndex}\`);
                if (!container) return;
                const questions = groupsArr[groupIndex].currentQAQuestions || [];
                container.innerHTML = questions.map((q, qIdx) => \`
                    <div class="chip">
                        <span>\${q}</span>
                        <span class="chip-remove" onclick="removeQuestionFromQA(\${groupIndex}, \${qIdx})">×</span>
                    </div>
                \`).join('');
            }

            function addGroupQA(groupIndex) {
                const answerInput = document.getElementById(\`newQAAnswer_\${groupIndex}\`);
                const answer = answerInput.value.trim();
                const questions = groupsArr[groupIndex].currentQAQuestions || [];
                const mediaFile = groupsArr[groupIndex].pendingMediaFile || '';
                
                if (questions.length > 0 && (answer || mediaFile)) {
                    if (!groupsArr[groupIndex].qaList) groupsArr[groupIndex].qaList = [];
                    const newPair = { questions: questions, answer: answer };
                    if (mediaFile) newPair.mediaFile = mediaFile;
                    groupsArr[groupIndex].qaList.push(newPair);
                    answerInput.value = '';
                    groupsArr[groupIndex].currentQAQuestions = [];
                    // Clear media selection
                    groupsArr[groupIndex].pendingMediaFile = '';
                    const indicator = document.getElementById(\`qa_media_selected_\${groupIndex}\`);
                    if (indicator) indicator.style.display = 'none';
                    loadGroupMedia(groupIndex); // refresh grid (deselects all)
                    renderQAQuestions(groupIndex);
                    renderGroupQA(groupIndex);
                    // Reset save button back to normal
                    const saveBtn = document.getElementById(\`saveQABtn_\${groupIndex}\`);
                    if (saveBtn) {
                        saveBtn.innerHTML = '<i class="fas fa-save"></i> ' + (currentLang==='en' ? 'Save Q&A Pair' : 'حفظ زوج س و ج');
                        saveBtn.style.background = '';
                        saveBtn.style.color = '';
                    }
                } else {
                    const msg = currentLang === 'en' ? 'Please add at least one question variant and an answer or attach a media file' : 'يرجى إضافة صيغة سؤال واحدة على الأقل وملء الإجابة أو إرفاق وسائط';
                    alert(msg);
                }
            }

            
            function removeGroupQA(groupIndex, qaIndex) {
                if (groupsArr[groupIndex].qaList) {
                    groupsArr[groupIndex].qaList.splice(qaIndex, 1);
                    renderGroupQA(groupIndex);
                }
            }
            
            function renderGroupQA(groupIndex) {
                const container = document.getElementById(\`qa_container_\${groupIndex}\`);
                if (!container) return;
                const qaList = groupsArr[groupIndex].qaList || [];
                container.innerHTML = qaList.map((qa, qaIdx) => \`
                    <div class="group-card" style="margin-bottom:10px;">
                        <div class="group-card-header" style="padding:12px;">
                            <div class="group-card-title" style="font-size:14px;">
                                <i class="fas fa-question" style="color:var(--blue);"></i> \${currentLang==='en'?'Question Variations':'\u0635\u064a\u063a \u0627\u0644\u0623\u0633\u0626\u0644\u0629'} (\${(qa.questions || []).length})
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button type="button" class="icon-btn" onclick="editGroupQA(\${groupIndex}, \${qaIdx})" style="background:var(--blue-dim);color:var(--blue);border-color:rgba(64,196,255,0.3);" title="\${currentLang==='en'?'Edit':'\u062a\u0639\u062f\u064a\u0644'}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button type="button" class="icon-btn" onclick="removeGroupQA(\${groupIndex}, \${qaIdx})" style="background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3);" title="\${currentLang==='en'?'Delete':'\u062d\u0630\u0641'}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="group-card-body" style="padding:12px;">
                            <div style="margin-bottom:10px;">
                                <div class="chip-container" style="background:rgba(64,196,255,0.05);border-color:rgba(64,196,255,0.2);">\${(qa.questions || []).map(q => \`<div class="chip" style="background:rgba(64,196,255,0.15);color:var(--blue);border-color:rgba(64,196,255,0.3);"><i class="fas fa-search"></i> \${q}</div>\`).join('')}</div>
                            </div>
                            <div style="color:var(--text-muted);font-size:13px;margin-bottom:6px;">
                                <strong>\${currentLang==='en'?'Answer':'\u0627\u0644\u0625\u062c\u0627\u0628\u0629'}:</strong> \${qa.answer || '(empty)'}
                            </div>
                            \${qa.mediaFile ? \`<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64dc96;"><i class="fas fa-paperclip"></i> \${qa.mediaFile}</div>\` : ''}
                        </div>
                    </div>
                \`).join('');
            }

            // ── Media management for Q&A ──────────────────────────────────────
            function loadGroupMedia(groupIndex) {
                const group = groupsArr[groupIndex];
                const groupId = encodeURIComponent(group.id);
                fetch(\`/api/media/list/\${groupId}\`)
                    .then(r => r.json())
                    .then(files => renderMediaGrid(groupIndex, files))
                    .catch(() => {});
            }

            function renderMediaGrid(groupIndex, files) {
                const grid = document.getElementById(\`qa_media_grid_\${groupIndex}\`);
                if (!grid) return;
                if (files.length === 0) { grid.innerHTML = \`<p style="font-size:12px;color:var(--text-muted);grid-column:1/-1;">\${currentLang==='en'?'No files uploaded yet.':'لا توجد ملفات محملة بعد.'}</p>\`; return; }
                const imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
                const vidExts = ['mp4','mov','webm','mkv','avi'];
                const audExts = ['mp3','ogg','wav','m4a','aac'];
                grid.innerHTML = files.map(f => {
                    const ext = f.name.split('.').pop().toLowerCase();
                    const groupId = encodeURIComponent(groupsArr[groupIndex].id);
                    let preview;
                    if (imgExts.includes(ext)) {
                        preview = \`<img src="/media/\${groupId}/\${encodeURIComponent(f.name)}" style="width:100%;height:72px;object-fit:cover;border-radius:6px 6px 0 0;">\`;
                    } else {
                        const icons = { mp4:'fa-film', mov:'fa-film', webm:'fa-film', mkv:'fa-film', mp3:'fa-music', ogg:'fa-music', wav:'fa-music', pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', zip:'fa-file-archive', rar:'fa-file-archive' };
                        const icon = icons[ext] || 'fa-file';
                        preview = \`<div style="width:100%;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:6px 6px 0 0;"><i class="fas \${icon}" style="font-size:28px;color:var(--text-muted);"></i></div>\`;
                    }
                    const kb = (f.size/1024).toFixed(1);
                    const isSelected = groupsArr[groupIndex].pendingMediaFile === f.name;
                    return \`<div style="background:var(--card-bg);border:1.5px solid \${isSelected ? '#64dc96' : 'var(--card-border)'};border-radius:8px;overflow:hidden;">
                        \${preview}
                        <div style="padding:6px 8px;">
                            <div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="\${f.name}">\${f.name}</div>
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">\${kb} KB</div>
                            <div style="display:flex;gap:4px;">
                                <button type="button" onclick="selectQAMedia(\${groupIndex},'\${f.name}')" style="flex:1;font-size:11px;padding:4px;background:\${isSelected ? 'rgba(100,220,150,0.15)' : 'var(--input-bg)'};color:\${isSelected ? '#64dc96' : 'var(--text-muted)'};border:1px solid \${isSelected ? 'rgba(100,220,150,0.4)' : 'var(--card-border)'};border-radius:5px;cursor:pointer;">
                                    <i class="fas \${isSelected ? 'fa-check' : 'fa-link'}"></i> \${isSelected ? (currentLang==='en'?'Selected':'محدد') : (currentLang==='en'?'Select':'اختر')}
                                </button>
                                <button type="button" onclick="deleteGroupMedia(\${groupIndex},'\${f.name}')" style="padding:4px 6px;background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.3);border-radius:5px;cursor:pointer;font-size:11px;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>\`;
                }).join('');
            }

            function uploadGroupMedia(groupIndex, input) {
                const file = input.files[0];
                if (!file) return;
                const group = groupsArr[groupIndex];
                const groupId = encodeURIComponent(group.id);
                const statusEl = document.getElementById(\`qa_upload_status_\${groupIndex}\`);
                statusEl.style.display = 'block';
                statusEl.textContent = currentLang==='en' ? '⏳ Uploading...' : '⏳ جاري الرفع...';
                const fd = new FormData();
                fd.append('file', file);
                fetch(\`/api/media/upload/\${groupId}\`, { method:'POST', body:fd })
                    .then(r => r.json())
                    .then(data => {
                        statusEl.textContent = currentLang==='en' ? '✅ Uploaded: ' + data.filename : '✅ تم الرفع: ' + data.filename;
                        setTimeout(() => { statusEl.style.display='none'; }, 3000);
                        loadGroupMedia(groupIndex);
                        input.value = '';
                    })
                    .catch(() => { statusEl.textContent = currentLang==='en' ? '❌ Upload failed' : '❌ فشل الرفع'; });
            }

            function selectQAMedia(groupIndex, filename) {
                const wasSelected = groupsArr[groupIndex].pendingMediaFile === filename;
                groupsArr[groupIndex].pendingMediaFile = wasSelected ? '' : filename;
                // Update selected indicator
                const indicator = document.getElementById(\`qa_media_selected_\${groupIndex}\`);
                const nameEl = document.getElementById(\`qa_media_selected_name_\${groupIndex}\`);
                if (!wasSelected && filename) {
                    indicator.style.display = 'flex';
                    nameEl.textContent = '📎 ' + filename;
                } else {
                    indicator.style.display = 'none';
                }
                // Re-render grid to update button states
                fetch(\`/api/media/list/\${encodeURIComponent(groupsArr[groupIndex].id)}\`)
                    .then(r => r.json()).then(files => renderMediaGrid(groupIndex, files)).catch(()=>{});
            }

            function clearQAMedia(groupIndex) { selectQAMedia(groupIndex, ''); }

            function deleteGroupMedia(groupIndex, filename) {
                if (!confirm(currentLang==='en' ? \`Delete \${filename}?\` : \`حذف \${filename}؟\`)) return;
                const groupId = encodeURIComponent(groupsArr[groupIndex].id);
                fetch(\`/api/media/delete/\${groupId}/\${encodeURIComponent(filename)}\`, { method:'DELETE' })
                    .then(() => {
                        if (groupsArr[groupIndex].pendingMediaFile === filename) selectQAMedia(groupIndex, '');
                        loadGroupMedia(groupIndex);
                    });
            }

            function editGroupQA(groupIndex, qaIndex) {
                const qa = groupsArr[groupIndex].qaList[qaIndex];
                if (!qa) return;
                // Pre-fill questions
                groupsArr[groupIndex].currentQAQuestions = [...(qa.questions || [])];
                renderQAQuestions(groupIndex);
                // Pre-fill answer
                const answerEl = document.getElementById(\`newQAAnswer_\${groupIndex}\`);
                if (answerEl) answerEl.value = qa.answer || '';
                // Remove the old entry so saving creates a fresh one
                groupsArr[groupIndex].qaList.splice(qaIndex, 1);
                renderGroupQA(groupIndex);
                // Update save button appearance to indicate edit mode
                const saveBtn = document.getElementById(\`saveQABtn_\${groupIndex}\`);
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> ' + (currentLang==='en' ? 'Update Q&A Pair' : 'تحديث زوج س و ج');
                    saveBtn.style.background = 'var(--orange)';
                    saveBtn.style.color = '#000';
                }
                // Scroll to form
                const questionInput = document.getElementById(\`newQAQuestion_\${groupIndex}\`);
                if (questionInput) questionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            function addGroupBlacklist(gIndex) {
                const input = document.getElementById(\`newGroupBl_\${gIndex}\`);
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!groupsArr[gIndex].customBlacklist.includes(finalId)) {
                        groupsArr[gIndex].customBlacklist.push(finalId);
                        input.value = '';
                        renderGroupChips(gIndex, 'blacklist');
                    }
                }
            }
            function removeGroupBlacklist(gIndex, idx) {
                groupsArr[gIndex].customBlacklist.splice(idx, 1);
                renderGroupChips(gIndex, 'blacklist');
            }

            function addGroupWhitelist(gIndex) {
                const input = document.getElementById(\`newGroupWl_\${gIndex}\`);
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!groupsArr[gIndex].customWhitelist.includes(finalId)) {
                        groupsArr[gIndex].customWhitelist.push(finalId);
                        input.value = '';
                        renderGroupChips(gIndex, 'whitelist');
                    }
                }
            }
            function removeGroupWhitelist(gIndex, idx) {
                groupsArr[gIndex].customWhitelist.splice(idx, 1);
                renderGroupChips(gIndex, 'whitelist');
            }

            renderBlacklist();
            renderWhitelist();
            renderDefaultWords();
            loadKnownGroups();

            setInterval(async () => {
                try {
                    let res = await fetch('/api/status?lang=' + currentLang);
                    let data = await res.json();
                    document.getElementById('status-text').innerHTML = data.status;
                    const detailEl = document.getElementById('status-text-detail');
                    if(detailEl) detailEl.innerHTML = data.status;
                    
                    const dot = document.getElementById('statusDot');
                    if(data.status.includes('متصل') || data.status.includes('Connected')) {
                        dot.className = 'status-dot online';
                        document.getElementById('logoutBtn').style.display = 'block';
                    } else if(data.status.includes('QR') || data.status.includes('انتظار') || data.status.includes('Waiting')) {
                        dot.className = 'status-dot waiting';
                        document.getElementById('logoutBtn').style.display = 'none';
                    } else {
                        dot.className = 'status-dot';
                        document.getElementById('logoutBtn').style.display = 'none';
                    }

                    const qrImg = document.getElementById('qr-image');
                    const qrPlaceholder = document.getElementById('qr-placeholder');
                    if(data.qr) {
                        qrImg.src = data.qr;
                        qrImg.style.display = 'block';
                        if(qrPlaceholder) qrPlaceholder.style.display = 'none';
                    } else {
                        qrImg.style.display = 'none';
                        if(qrPlaceholder) qrPlaceholder.style.display = 'block';
                    }
                } catch(e) {}
            }, 2000);

            async function saveConfig() {
                let finalGroupsObj = {};
                groupsArr.forEach(g => { 
                    if(g.id) { finalGroupsObj[g.id] = g; } 
                });

                const gSpamTypes = [];
                const gSpamLimits = {};
                metaTypes.forEach(t => {
                    const cb = document.getElementById('global_spam_check_' + t.id);
                    if(cb && cb.checked) gSpamTypes.push(t.id);
                    const lim = document.getElementById('global_spam_limit_' + t.id);
                    gSpamLimits[t.id] = parseInt(lim ? lim.value : 5) || 5;
                });

                let defAdmin = '';
                const defAdminEl = document.getElementById('defaultAdminGroup');
                if (defAdminEl) defAdmin = defAdminEl.value;

                const newConfig = {
                    enableAntiSpam: document.getElementById('enableAntiSpam').checked,
                    safeMode: document.getElementById('safeMode').checked,
                    spamDuplicateLimit: parseInt(document.getElementById('spamDuplicateLimit').value) || 3,
                    spamAction: document.getElementById('spamAction').value,
                    spamTypes: gSpamTypes,
                    spamLimits: gSpamLimits,
                    blockedTypes: getCheckedValues('globalBlockedTypes'),
                    blockedAction: document.getElementById('globalBlockedAction').value,
                    enableBlacklist: document.getElementById('enableBlacklist').checked,
                    enableWhitelist: document.getElementById('enableWhitelist').checked,
                    enableWordFilter: document.getElementById('enableWordFilter').checked,
                    enableAIFilter: document.getElementById('enableAIFilter').checked,
                    enableAIMedia: document.getElementById('enableAIMedia').checked,
                    autoAction: document.getElementById('autoAction').checked,
                    aiPrompt: document.getElementById('aiPromptText').value.trim(),
                    ollamaUrl: document.getElementById('ollamaUrl').value.trim(),
                    ollamaModel: document.getElementById('ollamaModel').value.trim(),
                    defaultAdminGroup: defAdmin,
                    defaultWords: defaultWordsArr,
                    groupsConfig: finalGroupsObj
                };
                
                const res = await fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newConfig)
                });
                
                if(res.ok) {
                    showToast(dict.save_success);
                    setTimeout(() => window.location.reload(), 800);
                } else showToast(dict.save_fail);
            }

            document.getElementById('configForm').onsubmit = async (e) => {
                e.preventDefault();
                await saveConfig();
            }
            
            function toggleTheme() {
                const isLight = document.documentElement.classList.toggle('light');
                document.getElementById('themeToggle').innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
                try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch(e) {}
            }

            (function() {
                try {
                    if (localStorage.getItem('theme') === 'light') {
                        document.documentElement.classList.add('light');
                        document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
                    } else {
                        document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon"></i>';
                    }
                } catch(e) {}
            })();
        </script>
    </body>
    </html>
    `;
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

// Safe Mode: random delay 10-60s to mimic human behaviour and avoid WhatsApp bot detection
async function safeDelay() {
    if (!config.safeMode) return;
    const ms = (Math.floor(Math.random() * 51) + 10) * 1000; // 10–60 seconds
    console.log(`[أمان] وضع آمن: تأخير ${ms / 1000} ثانية قبل الإجراء...`);
    await new Promise(r => setTimeout(r, ms));
};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async (qr) => {
    botStatus = '<i class="fas fa-spinner fa-spin"></i> بانتظار مسح رمز الاستجابة السريعة (QR Code)...';
    currentQR = await qrcode.toDataURL(qr);
});

client.on('ready', async () => {
    botStatus = '<i class="fas fa-check-circle" style="color:var(--accent);"></i> متصل وجاهز للعمل';
    currentQR = '';
    console.log('تم ربط حساب واتساب بنجاح!');
    try {
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup);
        console.log('[معلومة] جاري مزامنة ' + groups.length + ' مجموعة...');
        const insertGrp = db.prepare('INSERT OR REPLACE INTO whatsapp_groups (id, name) VALUES (?, ?)');
        const syncTx = db.transaction((chatList) => {
            for (const c of chatList) {
                if (c.isGroup) insertGrp.run(c.id._serialized, c.name);
            }
        });
        syncTx(chats);
        console.log('[معلومة] تمت مزامنة ' + groups.length + ' مجموعة بنجاح.');
    } catch (error) {
        console.error('[خطأ] فشل مزامنة المجموعات: ' + error.message);
    }
});

client.on('authenticated', () => {
    botStatus = '<i class="fas fa-sync fa-spin"></i> تم تسجيل الدخول بنجاح، جاري جلب البيانات...';
    currentQR = '';
});

client.on('disconnected', async (reason) => {
    botStatus = '<i class="fas fa-sign-out-alt"></i> تم تسجيل الخروج من الحساب...';
    currentQR = '';
    try { await client.destroy(); } catch (e) { }
    setTimeout(() => { client.initialize(); }, 3000);
});

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
                    if (data.response && data.response.includes('نعم')) {
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

client.initialize();