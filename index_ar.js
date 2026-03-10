const express = require('express');
const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Database = require('better-sqlite3'); 
const util = require('util'); 
const fs = require('fs'); 

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

// 🗄️ تهيئة قاعدة البيانات
const db = new Database('./bot_data.sqlite');
db.pragma('journal_mode = WAL'); 

db.exec(`
    CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS llm_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS blacklist (number TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS custom_groups (
        group_id TEXT PRIMARY KEY,
        admin_group TEXT,
        use_default_words INTEGER,
        enable_word_filter INTEGER,
        enable_ai_filter INTEGER,
        enable_ai_media INTEGER,
        auto_action INTEGER,
        enable_blacklist INTEGER,
        enable_anti_spam INTEGER,
        spam_duplicate_limit INTEGER,
        spam_flood_limit INTEGER,
        spam_action TEXT,
        enable_welcome_message INTEGER,
        welcome_message_text TEXT,
        custom_words TEXT
    );
`);

// 🔄 تحديث بنية الجداول لإضافة ميزة (تخصيص حدود كل نوع وسائط) تلقائياً
const colsToAdd = [
    'blocked_types TEXT',
    'blocked_action TEXT',
    'spam_types TEXT',
    'spam_limits TEXT'
];
colsToAdd.forEach(col => {
    try { db.exec(`ALTER TABLE custom_groups ADD COLUMN ${col}`); } catch(e){}
});

function loadConfigFromDB() {
    let newConfig = {
        enableWordFilter: true, enableAIFilter: false, enableAIMedia: false, 
        autoAction: false, enableBlacklist: true, enableAntiSpam: false, 
        spamDuplicateLimit: 3, spamFloodLimit: 5, spamAction: 'poll',
        blockedTypes: [], blockedAction: 'delete', 
        spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
        // 🎛️ الحدود الافتراضية لكل نوع
        spamLimits: { text: 7, image: 3, video: 2, audio: 3, document: 3, sticker: 3 },
        defaultAdminGroup: '120363424446982803@g.us', defaultWords: [],
        aiPrompt: 'امنع أي رسالة تحتوي على إعلانات تجارية.',
        ollamaUrl: 'http://localhost:11434', ollamaModel: 'llava',
        groupsConfig: {}
    };

    const globals = db.prepare('SELECT * FROM global_settings').all();
    globals.forEach(row => {
        if (['defaultWords', 'blockedTypes', 'spamTypes', 'spamLimits'].includes(row.key)) newConfig[row.key] = JSON.parse(row.value);
        else if (['enableWordFilter', 'enableAIFilter', 'enableAIMedia', 'autoAction', 'enableBlacklist', 'enableAntiSpam'].includes(row.key)) {
            newConfig[row.key] = row.value === '1';
        } 
        else if (['spamDuplicateLimit', 'spamFloodLimit'].includes(row.key)) {
            newConfig[row.key] = parseInt(row.value, 10);
        }
        else newConfig[row.key] = row.value;
    });

    const llms = db.prepare('SELECT * FROM llm_settings').all();
    llms.forEach(row => { newConfig[row.key] = row.value; });

    const groups = db.prepare('SELECT * FROM custom_groups').all();
    groups.forEach(g => {
        newConfig.groupsConfig[g.group_id] = {
            adminGroup: g.admin_group,
            useDefaultWords: g.use_default_words === 1,
            enableWordFilter: g.enable_word_filter === 1,
            enableAIFilter: g.enable_ai_filter === 1,
            enableAIMedia: g.enable_ai_media === 1,
            autoAction: g.auto_action === 1,
            enableBlacklist: g.enable_blacklist === 1,
            enableAntiSpam: g.enable_anti_spam === 1,
            spamDuplicateLimit: g.spam_duplicate_limit,
            spamFloodLimit: g.spam_flood_limit, // متروك للتوافقية
            spamAction: g.spam_action,
            enableWelcomeMessage: g.enable_welcome_message === 1,
            welcomeMessageText: g.welcome_message_text,
            words: JSON.parse(g.custom_words || '[]'),
            blockedTypes: JSON.parse(g.blocked_types || '[]'),
            blockedAction: g.blocked_action || 'delete',
            spamTypes: JSON.parse(g.spam_types || '["text", "image", "video", "audio", "document", "sticker"]'),
            spamLimits: JSON.parse(g.spam_limits || '{"text":7,"image":3,"video":2,"audio":3,"document":3,"sticker":3}')
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
        setGlobal.run('enableAntiSpam', conf.enableAntiSpam ? '1' : '0');
        setGlobal.run('spamDuplicateLimit', conf.spamDuplicateLimit.toString());
        setGlobal.run('spamAction', conf.spamAction);
        setGlobal.run('blockedTypes', JSON.stringify(conf.blockedTypes));
        setGlobal.run('blockedAction', conf.blockedAction);
        setGlobal.run('spamTypes', JSON.stringify(conf.spamTypes));
        setGlobal.run('spamLimits', JSON.stringify(conf.spamLimits));
        setGlobal.run('defaultAdminGroup', conf.defaultAdminGroup);
        setGlobal.run('defaultWords', JSON.stringify(conf.defaultWords));

        const setLLM = db.prepare('INSERT OR REPLACE INTO llm_settings (key, value) VALUES (?, ?)');
        setLLM.run('aiPrompt', conf.aiPrompt);
        setLLM.run('ollamaUrl', conf.ollamaUrl);
        setLLM.run('ollamaModel', conf.ollamaModel);

        db.prepare('DELETE FROM custom_groups').run();
        const insertGroup = db.prepare(`
            INSERT INTO custom_groups (
                group_id, admin_group, use_default_words, enable_word_filter, enable_ai_filter, 
                enable_ai_media, auto_action, enable_blacklist, enable_anti_spam, spam_duplicate_limit, 
                spam_action, enable_welcome_message, welcome_message_text, custom_words,
                blocked_types, blocked_action, spam_types, spam_limits
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [gId, gData] of Object.entries(conf.groupsConfig)) {
            insertGroup.run(
                gId, gData.adminGroup, gData.useDefaultWords ? 1 : 0, gData.enableWordFilter ? 1 : 0,
                gData.enableAIFilter ? 1 : 0, gData.enableAIMedia ? 1 : 0, gData.autoAction ? 1 : 0,
                gData.enableBlacklist ? 1 : 0, gData.enableAntiSpam ? 1 : 0, gData.spamDuplicateLimit,
                gData.spamAction, gData.enableWelcomeMessage ? 1 : 0, 
                gData.welcomeMessageText, JSON.stringify(gData.words),
                JSON.stringify(gData.blockedTypes || []), gData.blockedAction || 'delete', 
                JSON.stringify(gData.spamTypes || []), JSON.stringify(gData.spamLimits || {})
            );
        }
    });
    saveTx();
}

const hasSettings = db.prepare('SELECT count(*) as count FROM global_settings').get();
if (hasSettings.count === 0) {
    saveConfigToDB(loadConfigFromDB()); 
}

let config = loadConfigFromDB();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let currentQR = '';
let botStatus = 'جاري تهيئة النظام وبدء التشغيل...';

const userTrackers = new Map();
const abortedMessages = new Set(); 
const spamMutedUsers = new Map(); 

// مصفوفة لأنواع الوسائط مع أسمائها لتوليد الواجهة
const mediaTypesMeta = [
    { id: 'text', icon: '📝', name: 'نصوص' },
    { id: 'image', icon: '🖼️', name: 'صور' },
    { id: 'video', icon: '🎥', name: 'فيديو' },
    { id: 'audio', icon: '🎵', name: 'صوتيات' },
    { id: 'document', icon: '📄', name: 'ملفات' },
    { id: 'sticker', icon: '👾', name: 'ملصقات' }
];

app.get('/', (req, res) => {
    const blacklistRows = db.prepare('SELECT number FROM blacklist').all();
    const blacklistArr = blacklistRows.map(r => r.number);

    const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة تحكم المشرف الآلي</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            :root {
                --bg: #080c10;
                --sidebar-bg: #0e1318;
                --card-bg: #131920;
                --card-border: #1e2830;
                --input-bg: #0a0f14;
                --input-border: #1e2830;
                --text: #dce8f5;
                --text-muted: #6b8099;
                --accent: #00e676;
                --accent-dim: rgba(0,230,118,0.10);
                --accent-hover: #00c853;
                --red: #ff5252;
                --red-dim: rgba(255,82,82,0.10);
                --orange: #ffab40;
                --orange-dim: rgba(255,171,64,0.10);
                --blue: #40c4ff;
                --blue-dim: rgba(64,196,255,0.10);
                --purple: #d18cff;
                --purple-dim: rgba(209,140,255,0.10);
                --modal-bg: rgba(0,0,0,0.80);
                --radius: 12px;
                --font: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
                font-size: 16px;
            }
            html { font-size: 16px; }
            body { font-family: var(--font); font-size: 1rem; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; line-height: 1.6; }

            /* ── Sidebar ── */
            .sidebar {
                width: 260px; min-height: 100vh; background: var(--sidebar-bg);
                border-left: 1px solid var(--card-border);
                display: flex; flex-direction: column;
                position: fixed; right: 0; top: 0; z-index: 100;
                transition: transform 0.3s;
            }
            .sidebar-logo {
                padding: 28px 22px 20px;
                border-bottom: 1px solid var(--card-border);
                display: flex; align-items: center; gap: 14px;
            }
            .logo-icon {
                width: 46px; height: 46px; border-radius: 14px;
                background: linear-gradient(135deg, #00e676, #00b0ff);
                display: flex; align-items: center; justify-content: center;
                font-size: 22px; flex-shrink: 0;
                box-shadow: 0 0 20px rgba(0,230,118,0.3);
            }
            .logo-text { font-size: 15px; font-weight: 700; color: var(--text); line-height: 1.3; }
            .logo-text small { display: block; font-weight: 400; color: var(--text-muted); font-size: 12px; margin-top: 2px; }

            .nav-section { padding: 18px 16px 8px; font-size: 10px; font-weight: 700; color: var(--text-muted); letter-spacing: 1.5px; text-transform: uppercase; }
            .nav-item {
                display: flex; align-items: center; gap: 12px;
                padding: 12px 18px; margin: 2px 10px; border-radius: 10px;
                cursor: pointer; color: var(--text-muted); font-size: 15px;
                transition: all 0.2s; border: none; background: none; width: calc(100% - 20px);
                text-align: right; font-family: var(--font);
            }
            .nav-item:hover { background: rgba(255,255,255,0.06); color: var(--text); }
            .nav-item.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; border: 1px solid rgba(0,230,118,0.2); }
            .nav-item .nav-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
            .nav-item .nav-badge {
                margin-right: auto; background: var(--red); color: #fff;
                font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; min-width: 22px; text-align: center;
            }

            .sidebar-footer { margin-top: auto; padding: 18px; border-top: 1px solid var(--card-border); display: flex; gap: 10px; }
            .sidebar-footer button {
                flex: 1; padding: 11px 8px; border-radius: 10px; border: 1px solid var(--card-border);
                background: var(--input-bg); color: var(--text-muted); cursor: pointer; font-size: 14px;
                transition: all 0.2s; font-family: var(--font); font-weight: 600;
            }
            .sidebar-footer button:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

            /* ── Main ── */
            .main { margin-right: 260px; flex: 1; display: flex; flex-direction: column; min-height: 100vh; min-width: 0; }

            .topbar {
                position: sticky; top: 0; z-index: 50;
                background: rgba(8,12,16,0.92); backdrop-filter: blur(16px);
                border-bottom: 1px solid var(--card-border);
                padding: 0 40px; height: 66px;
                display: flex; align-items: center; justify-content: space-between;
            }
            .topbar-title { font-size: 18px; font-weight: 700; color: var(--text); }
            .topbar-right { display: flex; align-items: center; gap: 14px; }
            .status-pill {
                display: flex; align-items: center; gap: 10px;
                background: var(--card-bg); border: 1px solid var(--card-border);
                padding: 8px 18px; border-radius: 24px; font-size: 14px; color: var(--text-muted);
            }
            .status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
            .status-dot.online { background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: pulse 2s infinite; }
            .status-dot.waiting { background: var(--orange); box-shadow: 0 0 8px var(--orange); }
            @keyframes pulse { 0%,100% { opacity:1; box-shadow: 0 0 10px var(--accent); } 50% { opacity:0.6; box-shadow: 0 0 4px var(--accent); } }

            /* ── Content pages ── */
            .page { display: none; padding: 32px 40px; width: 100%; max-width: 1400px; }
            .page.active { display: block; }

            .page-header { margin-bottom: 28px; }
            .page-header h2 { font-size: 26px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
            .page-header p { color: var(--text-muted); font-size: 15px; margin-top: 5px; }

            /* Cards */
            .card {
                background: var(--card-bg); border: 1px solid var(--card-border);
                border-radius: var(--radius); padding: 24px; margin-bottom: 20px;
            }
            .card-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--card-border);
            }
            .card-header h3 { font-size: 17px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px; }
            .card.danger { border-color: rgba(255,82,82,0.35); background: linear-gradient(180deg, rgba(255,82,82,0.04) 0%, var(--card-bg) 60%); }
            .card.warning { border-color: rgba(255,171,64,0.35); background: linear-gradient(180deg, rgba(255,171,64,0.04) 0%, var(--card-bg) 60%); }
            .card.info { border-color: rgba(64,196,255,0.35); background: linear-gradient(180deg, rgba(64,196,255,0.04) 0%, var(--card-bg) 60%); }
            .card.purple { border-color: rgba(209,140,255,0.35); background: linear-gradient(180deg, rgba(209,140,255,0.04) 0%, var(--card-bg) 60%); }
            .card.success { border-color: rgba(0,230,118,0.35); background: linear-gradient(180deg, rgba(0,230,118,0.04) 0%, var(--card-bg) 60%); }

            /* Form elements */
            label.field-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.8px; }
            input[type="text"], input[type="number"], textarea, select {
                width: 100%; padding: 12px 16px;
                background: var(--input-bg); border: 1.5px solid var(--input-border);
                border-radius: 10px; color: var(--text); font-size: 15px;
                font-family: var(--font); transition: border-color 0.2s, box-shadow 0.2s;
                outline: none;
            }
            input:focus, textarea:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,230,118,0.12); }
            textarea { resize: vertical; }
            select option { background: var(--card-bg); }

            .field-group { margin-bottom: 20px; }
            .field-row { display: flex; gap: 14px; }
            .field-row > * { flex: 1; }
            .input-with-btn { display: flex; gap: 10px; }
            .input-with-btn input { margin: 0; }

            /* Buttons */
            .btn {
                padding: 11px 22px; border-radius: 10px; border: none;
                font-size: 15px; font-weight: 700; cursor: pointer;
                font-family: var(--font); transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
                white-space: nowrap; letter-spacing: 0.2px;
            }
            .btn-primary { background: var(--accent); color: #000; }
            .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,230,118,0.4); }
            .btn-danger { background: var(--red); color: #fff; }
            .btn-danger:hover { background: #ff1744; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(255,82,82,0.4); }
            .btn-warning { background: var(--orange); color: #000; }
            .btn-warning:hover { background: #ff9100; transform: translateY(-1px); }
            .btn-ghost { background: transparent; border: 1.5px solid var(--card-border); color: var(--text-muted); }
            .btn-ghost:hover { border-color: var(--text); color: var(--text); }
            .btn-blue { background: var(--blue); color: #000; }
            .btn-blue:hover { transform: translateY(-1px); }
            .btn-sm { padding: 7px 14px; font-size: 13px; }
            .btn-full { width: 100%; justify-content: center; padding: 15px; font-size: 16px; }

            /* Toggle switch */
            .toggle-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 16px 18px; border-radius: 10px;
                background: rgba(255,255,255,0.03); border: 1.5px solid var(--card-border);
                margin-bottom: 12px; gap: 14px;
            }
            .toggle-row.danger { border-color: rgba(255,82,82,0.3); background: rgba(255,82,82,0.05); }
            .toggle-row.warning { border-color: rgba(255,171,64,0.3); background: rgba(255,171,64,0.05); }
            .toggle-row.blue { border-color: rgba(64,196,255,0.3); background: rgba(64,196,255,0.05); }
            .toggle-row.purple { border-color: rgba(209,140,255,0.3); background: rgba(209,140,255,0.05); }
            .toggle-row.pink { border-color: rgba(240,100,170,0.3); background: rgba(240,100,170,0.05); }
            .toggle-row.green { border-color: rgba(100,200,120,0.3); background: rgba(100,200,120,0.05); }
            .toggle-left { display: flex; align-items: center; gap: 16px; }
            .toggle-label { font-size: 15px; font-weight: 600; color: var(--text); }
            .toggle-label small { display: block; font-size: 12px; color: var(--text-muted); font-weight: 400; margin-top: 2px; }
            .toggle-label.danger { color: var(--red); }
            .toggle-label.warning { color: var(--orange); }
            .toggle-label.blue { color: var(--blue); }
            .toggle-label.purple { color: var(--purple); }
            .toggle-label.pink { color: #ff80ab; }
            .toggle-label.green { color: #69f0ae; }

            /* Switch */
            .switch { position: relative; display: inline-block; width: 50px; height: 28px; flex-shrink: 0; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; inset: 0; background: #1e2830; border: 1.5px solid #2a3a4a; transition: .3s; border-radius: 28px; }
            .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background: #4a5a6a; transition: .3s; border-radius: 50%; }
            input:checked + .slider { background: rgba(0,230,118,0.2); border-color: var(--accent); }
            input:checked + .slider:before { transform: translateX(22px); background: var(--accent); box-shadow: 0 0 8px rgba(0,230,118,0.6); }

            /* Chips */
            .chip-container {
                display: flex; flex-wrap: wrap; gap: 10px;
                padding: 14px; background: var(--input-bg); border-radius: 10px;
                min-height: 52px; border: 1.5px dashed var(--card-border); margin-top: 10px;
            }
            .chip {
                background: var(--accent-dim); color: var(--accent); padding: 6px 14px;
                border-radius: 20px; font-size: 14px; display: flex; align-items: center;
                gap: 8px; border: 1px solid rgba(0,230,118,0.3); font-weight: 500;
            }
            .chip.red-chip { background: var(--red-dim); color: var(--red); border-color: rgba(255,82,82,0.3); }
            .chip-remove { cursor: pointer; font-size: 16px; font-weight: 700; opacity: 0.6; line-height: 1; }
            .chip-remove:hover { opacity: 1; }

            /* Sub-settings panels */
            .sub-panel {
                background: rgba(0,0,0,0.2); border: 1.5px solid var(--card-border);
                border-radius: 10px; padding: 18px; margin-top: 12px;
            }
            .sub-panel.orange { border-color: rgba(255,171,64,0.3); }
            .sub-panel.red { border-color: rgba(255,82,82,0.3); }
            .sub-panel h4 { font-size: 14px; font-weight: 700; color: var(--text-muted); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.5px; }

            /* Checkboxes row */
            .cb-group { display: flex; gap: 10px; flex-wrap: wrap; }
            .cb-label {
                display: flex; align-items: center; gap: 8px; padding: 8px 14px;
                background: var(--card-bg); border: 1.5px solid var(--card-border);
                border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--text-muted);
                transition: all 0.2s; user-select: none;
            }
            .cb-label:hover { border-color: var(--accent); color: var(--text); }
            .cb-label input { accent-color: var(--accent); width: 16px; height: 16px; cursor: pointer; }

            /* Limit grid */
            .limit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
            .limit-item {
                display: flex; align-items: center; gap: 10px;
                background: var(--card-bg); padding: 10px 14px; border-radius: 9px;
                border: 1.5px solid var(--card-border);
            }
            .limit-item input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; cursor: pointer; flex-shrink: 0; }
            .limit-item span { font-size: 14px; flex: 1; color: var(--text); }
            .limit-item input[type="number"] { width: 60px; padding: 6px 8px; font-size: 14px; margin: 0; text-align: center; }

            /* Group card */
            .group-card {
                background: var(--card-bg); border: 1.5px solid var(--card-border);
                border-radius: 14px; margin-bottom: 16px; overflow: hidden;
                transition: border-color 0.2s;
            }
            .group-card:hover { border-color: rgba(64,196,255,0.3); }
            .group-card-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 16px 20px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--card-border);
            }
            .group-card-title { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px; }
            .group-card-body { padding: 20px; }
            .group-id-badge {
                font-family: monospace; font-size: 12px; color: var(--text-muted);
                background: var(--input-bg); padding: 3px 10px; border-radius: 6px;
                border: 1px solid var(--card-border);
            }

            /* QR section */
            .qr-wrap {
                display: flex; flex-direction: column; align-items: center; gap: 20px;
                padding: 36px; background: var(--input-bg); border-radius: 12px;
                border: 1.5px dashed var(--card-border);
            }
            #qr-image { max-width: 230px; border-radius: 12px; border: 10px solid #fff; box-shadow: 0 8px 30px rgba(0,0,0,0.5); display: none; }

            /* Toast */
            .toast {
                position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(24px);
                background: var(--accent); color: #000; padding: 13px 28px; border-radius: 40px;
                font-weight: 700; font-size: 15px; z-index: 9999;
                opacity: 0; transition: all 0.35s; pointer-events: none;
                box-shadow: 0 4px 20px rgba(0,230,118,0.5);
            }
            .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

            /* Modal */
            .modal { display: none; position: fixed; z-index: 1000; inset: 0; background: var(--modal-bg); backdrop-filter: blur(8px); align-items: center; justify-content: center; }
            .modal.open { display: flex; }
            .modal-content {
                background: var(--card-bg); border: 1.5px solid var(--card-border);
                border-radius: 16px; padding: 32px; width: 90%; max-width: 640px;
                box-shadow: 0 24px 80px rgba(0,0,0,0.7); animation: slideIn 0.25s ease;
                max-height: 90vh; overflow-y: auto;
            }
            .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
            .modal-header h3 { font-size: 20px; font-weight: 700; }
            .close-modal { background: none; border: none; color: var(--text-muted); font-size: 26px; cursor: pointer; padding: 4px; line-height: 1; }
            .close-modal:hover { color: var(--red); }
            @keyframes slideIn { from { transform: translateY(-24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

            /* Terminal */
            #terminalOutput {
                background: #000; color: #00ff88; font-family: 'Courier New', monospace;
                height: 400px; overflow-y: auto; padding: 16px; border-radius: 10px;
                font-size: 13px; direction: ltr; text-align: left; border: 1px solid #0a1a0a;
            }
            #terminalOutput div { margin-bottom: 5px; border-bottom: 1px solid #0a1a0a; padding-bottom: 5px; word-wrap: break-word; line-height: 1.6; }

            /* Two-column card grid for wide screens */
            .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
            .card-grid .card { margin-bottom: 0; }
            .card-grid-full { grid-column: 1 / -1; }
            @media (max-width: 1100px) { .card-grid { grid-template-columns: 1fr; } }

            /* Section divider */
            .section-sep { height: 1px; background: var(--card-border); margin: 20px 0; }

            /* Scrollbar */
            ::-webkit-scrollbar { width: 7px; }
            ::-webkit-scrollbar-track { background: var(--bg); }
            ::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 4px; }

            /* Mobile */
            .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99; }
            .hamburger { display: none; background: none; border: none; color: var(--text); font-size: 24px; cursor: pointer; padding: 4px; }

            @media (max-width: 768px) {
                .sidebar { transform: translateX(100%); }
                .sidebar.open { transform: translateX(0); }
                .sidebar-overlay.open { display: block; }
                .main { margin-right: 0; }
                .hamburger { display: block; }
                .page { padding: 18px; }
                .topbar { padding: 0 18px; }
                .limit-grid { grid-template-columns: 1fr; }
                .card-grid { grid-template-columns: 1fr; }
                .field-row { flex-direction: column; }
            }
        </style>
    </head>
    <body>
        <!-- Sidebar -->
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-logo">
                <div class="logo-icon">🤖</div>
                <div class="logo-text">المشرف الآلي <small>لوحة التحكم V6</small></div>
            </div>

            <div class="nav-section">الرئيسية</div>
            <button class="nav-item active" onclick="showPage('page-status', this)">
                <span class="nav-icon">📡</span> حالة الاتصال
            </button>
            <button class="nav-item" onclick="showPage('page-blacklist', this)">
                <span class="nav-icon">🚫</span> القائمة السوداء
                <span class="nav-badge" id="blacklist-count">0</span>
            </button>

            <div class="nav-section">الإعدادات</div>
            <button class="nav-item" onclick="showPage('page-general', this)">
                <span class="nav-icon">⚙️</span> الإعدادات العامة
            </button>
            <button class="nav-item" onclick="showPage('page-spam', this)">
                <span class="nav-icon">🛡️</span> مكافحة الإزعاج
            </button>
            <button class="nav-item" onclick="showPage('page-media', this)">
                <span class="nav-icon">🛑</span> فلتر الوسائط
            </button>
            <button class="nav-item" onclick="showPage('page-ai', this)">
                <span class="nav-icon">🧠</span> الذكاء الاصطناعي
            </button>
            <button class="nav-item" onclick="showPage('page-groups', this)">
                <span class="nav-icon">👥</span> المجموعات المخصصة
            </button>

            <div class="nav-section">أدوات</div>
            <button class="nav-item" onclick="openDebuggerModal()">
                <span class="nav-icon">🐞</span> سجل الأحداث
            </button>

            <div class="sidebar-footer">
                <button id="logoutBtn" onclick="logoutBot()" style="display:none; background: var(--red-dim); border-color: rgba(248,81,73,0.4); color: var(--red);">🚪 قطع الاتصال</button>
                <button onclick="saveConfig()" style="background: var(--accent-dim); border-color: rgba(0,230,118,0.4); color: var(--accent); font-weight:700;">💾 حفظ</button>
            </div>
        </nav>

        <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

        <!-- Main -->
        <div class="main">
            <div class="topbar">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="hamburger" onclick="toggleSidebar()">☰</button>
                    <span class="topbar-title" id="topbarTitle">حالة الاتصال</span>
                </div>
                <div class="topbar-right">
                    <div class="status-pill">
                        <div class="status-dot" id="statusDot"></div>
                        <span id="status-text">${botStatus}</span>
                    </div>
                </div>
            </div>

            <form id="configForm">

            <!-- PAGE: Status -->
            <div class="page active" id="page-status">
                <div class="page-header">
                    <h2>📡 حالة الاتصال بواتساب</h2>
                    <p>اربط حساب واتساب بمسح رمز QR أو راقب الاتصال الحالي</p>
                </div>
                <div class="card-grid">
                    <div class="card" style="grid-column: 1;">
                        <div class="card-header"><h3>📱 رمز QR</h3></div>
                        <div class="qr-wrap">
                            <img id="qr-image" src="" alt="QR Code" />
                            <div id="qr-placeholder" style="text-align:center; color: var(--text-muted); padding: 20px 0;">
                                <div style="font-size: 64px; margin-bottom: 16px;">📱</div>
                                <div style="font-size: 18px; font-weight: 700; color: var(--text);">في انتظار رمز QR...</div>
                                <div style="font-size: 14px; margin-top: 8px;">سيظهر الرمز هنا تلقائياً</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <div class="card success">
                            <div class="card-header"><h3 style="color:var(--accent);">📊 حالة النظام</h3></div>
                            <div style="font-size:16px; color:var(--text-muted); line-height:2.2;">
                                <div>🤖 <strong style="color:var(--text);">البوت:</strong> <span id="status-text-detail">${botStatus}</span></div>
                                <div>🗄️ <strong style="color:var(--text);">قاعدة البيانات:</strong> <span style="color:var(--accent);">متصلة ✓</span></div>
                                <div>🌐 <strong style="color:var(--text);">المنفذ:</strong> <span style="color:var(--accent);">3000 ✓</span></div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-header"><h3>🔗 مجموعة الإدارة الافتراضية</h3></div>
                            <div class="field-group">
                                <label class="field-label">معرّف المجموعة (لتلقي التنبيهات)</label>
                                <input type="text" id="defaultAdminGroup" value="${config.defaultAdminGroup}" dir="ltr" style="text-align:left; font-family: monospace; font-size:13px;">
                            </div>
                        </div>
                        <div class="card info">
                            <div class="card-header"><h3 style="color:var(--blue);">ℹ️ تعليمات الاستخدام</h3></div>
                            <div style="font-size:14px; color:var(--text-muted); line-height:2.2;">
                                <div>1️⃣ امسح رمز QR بهاتفك من واتساب</div>
                                <div>2️⃣ أضف البوت كمشرف في المجموعات</div>
                                <div>3️⃣ افتح صفحة الإعدادات وخصّص القواعد</div>
                                <div>4️⃣ اضغط <strong style="color:var(--accent);">💾 حفظ</strong> لتطبيق التغييرات</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE: Blacklist -->
            <div class="page" id="page-blacklist">
                <div class="page-header">
                    <h2>🚫 القائمة السوداء العالمية</h2>
                    <p>الأرقام المحظورة تُطرد فوراً من أي مجموعة يكون فيها البوت مشرفاً</p>
                </div>
                <div class="card-grid">
                    <div class="card danger">
                        <div class="card-header">
                            <h3 style="color:var(--red);">➕ إضافة رقم للحظر</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">يُحفظ فوراً في DB</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">رقم الهاتف (بدون +)</label>
                            <div class="input-with-btn">
                                <input type="text" id="newBlacklistNumber" placeholder="مثال: 966582014941" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlacklistNumber();}">
                                <button type="button" class="btn btn-danger" onclick="addBlacklistNumber()">+ حظر</button>
                            </div>
                        </div>
                        <label class="field-label">الأرقام المحظورة حالياً</label>
                        <div id="blacklistContainer" class="chip-container"></div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <div class="card">
                            <div class="toggle-row danger" style="margin-bottom:0;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" id="enableBlacklist" ${config.enableBlacklist ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="toggle-label danger">
                                        تفعيل نظام القائمة السوداء
                                        <small>طرد فوري عند محاولة الدخول أو الإضافة</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card warning">
                            <div class="card-header"><h3 style="color:var(--orange);">🧹 طرد رجعي شامل</h3></div>
                            <p style="font-size:14px; color:var(--text-muted); margin-bottom: 18px; line-height:1.8;">سيبحث البوت في جميع المجموعات التي هو فيها مشرف، ويطرد كل من في القائمة السوداء فوراً.</p>
                            <button type="button" id="purgeBtn" class="btn btn-warning btn-full" onclick="purgeBlacklisted()">
                                🧹 تنفيذ الطرد الشامل الآن
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE: General -->
            <div class="page" id="page-general">
                <div class="page-header">
                    <h2>⚙️ الإعدادات العامة</h2>
                    <p>تطبّق على جميع المجموعات التي لا تملك إعدادات مخصصة</p>
                </div>
                <div class="card-grid">
                    <div class="card">
                        <div class="card-header"><h3>🔤 فلتر الكلمات الممنوعة</h3></div>
                        <div class="toggle-row" style="margin-bottom:18px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWordFilter" ${config.enableWordFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">تفعيل فلتر الكلمات<small>حذف فوري عند رصد أي كلمة ممنوعة</small></div>
                            </div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">الكلمات الممنوعة الافتراضية</label>
                            <div class="input-with-btn">
                                <input type="text" id="newDefaultWord" placeholder="أدخل الكلمة الممنوعة..." onkeypress="if(event.key==='Enter'){event.preventDefault();addDefaultWord();}">
                                <button type="button" class="btn btn-primary" onclick="addDefaultWord()">+ إضافة</button>
                            </div>
                            <div id="defaultWordsContainer" class="chip-container"></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3>🚦 الإجراء التلقائي</h3></div>
                        <div class="toggle-row pink">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="autoAction" ${config.autoAction ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label pink">
                                    الحذف والإبلاغ المباشر
                                    <small>تخطي تصويت الإدارة عند رصد المخالفات</small>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:20px; padding:16px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2;">
                                <div>🔴 <strong style="color:var(--text);">مفعّل:</strong> حذف فوري + طرد تلقائي</div>
                                <div>🟡 <strong style="color:var(--text);">معطّل:</strong> حذف + تصويت للإدارة</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE: Spam -->
            <div class="page" id="page-spam">
                <div class="page-header">
                    <h2>🛡️ مكافحة الإزعاج</h2>
                    <p>Anti-Spam — رصد الرسائل المتكررة خلال نافذة 15 ثانية</p>
                </div>

                <div class="card warning" style="max-width:700px;">
                    <!-- Master toggle -->
                    <div class="toggle-row warning" style="margin-bottom:0; border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch">
                                <input type="checkbox" id="enableAntiSpam" ${config.enableAntiSpam ? 'checked' : ''}
                                    onchange="toggleSpamOptions(this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="toggle-label warning">
                                تفعيل نظام Anti-Spam
                                <small>مراقبة معدل إرسال كل مستخدم خلال نافذة 15 ثانية</small>
                            </div>
                        </div>
                    </div>

                    <!-- Collapsible options -->
                    <div id="spamOptionsPanel" style="
                        overflow: hidden;
                        max-height: ${config.enableAntiSpam ? '800px' : '0px'};
                        opacity: ${config.enableAntiSpam ? '1' : '0'};
                        transition: max-height 0.45s ease, opacity 0.35s ease, margin-top 0.35s ease;
                        margin-top: ${config.enableAntiSpam ? '20px' : '0px'};
                    ">
                        <div style="border-top: 1px dashed rgba(255,171,64,0.3); padding-top: 20px;">

                            <!-- Action + duplicate limit -->
                            <div class="field-row" style="margin-bottom:20px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">الإجراء عند الرصد</label>
                                    <select id="spamAction">
                                        <option value="poll" ${config.spamAction === 'poll' ? 'selected' : ''}>🗳️ تصويت للإدارة</option>
                                        <option value="auto" ${config.spamAction === 'auto' ? 'selected' : ''}>🔨 طرد تلقائي وحظر</option>
                                    </select>
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">حد تكرار نفس النص</label>
                                    <input type="number" id="spamDuplicateLimit" value="${config.spamDuplicateLimit}" min="2" max="15" placeholder="3">
                                </div>
                            </div>

                            <!-- Per-type limits -->
                            <label class="field-label" style="margin-bottom:12px;">⏱️ حدود كل نوع خلال 15 ثانية</label>
                            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">فعّل ✓ النوع المراد مراقبته، ثم حدد الحد الأقصى للرسائل المسموح بها</p>
                            <div class="limit-grid">
                                ${mediaTypesMeta.map(t => `
                                <div class="limit-item">
                                    <input type="checkbox" id="global_spam_check_${t.id}" value="${t.id}" ${config.spamTypes.includes(t.id) ? 'checked' : ''}>
                                    <span>${t.icon} ${t.name}</span>
                                    <input type="number" id="global_spam_limit_${t.id}" value="${config.spamLimits[t.id] || 5}" min="1">
                                </div>`).join('')}
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE: Media Filter -->
            <div class="page" id="page-media">
                <div class="page-header">
                    <h2>🛑 فلتر الوسائط</h2>
                    <p>منع قطعي لأنواع محددة — الحذف يحدث فوراً بغض النظر عن أي إعداد آخر</p>
                </div>
                <div class="card-grid">
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);">📁 اختر الأنواع الممنوعة</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom:18px;">أي رسالة من هذه الأنواع ستُحذف تلقائياً ودون استثناء.</p>
                        <div class="cb-group" id="globalBlockedTypes" style="gap:12px;">
                            ${mediaTypesMeta.map(t => `
                            <label class="cb-label" style="flex:1; min-width:120px; justify-content:center; padding:12px;">
                                <input type="checkbox" value="${t.id}" ${config.blockedTypes.includes(t.id) ? 'checked' : ''}> ${t.icon} ${t.name}
                            </label>`).join('')}
                        </div>
                    </div>
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);">⚡ الإجراء عند الرصد</h3></div>
                        <div class="field-group">
                            <label class="field-label">ماذا يفعل البوت عند إرسال نوع ممنوع؟</label>
                            <select id="globalBlockedAction" style="font-size:15px; padding:14px;">
                                <option value="delete" ${config.blockedAction === 'delete' ? 'selected' : ''}>🗑️ حذف الرسالة فقط (بصمت)</option>
                                <option value="poll" ${config.blockedAction === 'poll' ? 'selected' : ''}>🗳️ حذف + فتح تصويت للإدارة</option>
                                <option value="auto" ${config.blockedAction === 'auto' ? 'selected' : ''}>🔨 حذف + طرد تلقائي وحظر</option>
                            </select>
                        </div>
                        <div style="margin-top:16px; padding:16px; background:var(--red-dim); border-radius:10px; border:1px solid rgba(255,82,82,0.2);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2.2;">
                                <div>🗑️ <strong style="color:var(--text);">حذف فقط:</strong> صامت، لا يعلم المرسل</div>
                                <div>🗳️ <strong style="color:var(--text);">تصويت:</strong> تنبيه الإدارة لاتخاذ قرار</div>
                                <div>🔨 <strong style="color:var(--text);">طرد تلقائي:</strong> أقوى إجراء، حظر فوري</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE: AI -->
            <div class="page" id="page-ai">
                <div class="page-header">
                    <h2>🧠 المشرف الذكي (AI)</h2>
                    <p>تحليل المحتوى باستخدام نموذج Ollama LLM محلي</p>
                </div>
                <div class="card-grid">
                    <div class="card info">
                        <div class="card-header">
                            <h3 style="color:var(--blue);">🔌 تفعيل الذكاء الاصطناعي</h3>
                            <button type="button" class="btn btn-blue btn-sm" onclick="openOllamaModal()">⚙️ إعداد الخادم</button>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIFilter" ${config.enableAIFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label blue">تحليل النصوص بالـ AI<small>فحص كل رسالة نصية قبل السماح بها</small></div>
                            </div>
                        </div>
                        <div class="toggle-row purple">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIMedia" ${config.enableAIMedia ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label purple">تحليل الصور (Vision AI)<small>يتطلب نموذجاً يدعم Vision مثل llava</small></div>
                            </div>
                        </div>
                    </div>
                    <div class="card" id="aiPromptContainer">
                        <div class="card-header"><h3>📝 تعليمات الذكاء الاصطناعي</h3></div>
                        <div class="field-group">
                            <label class="field-label">صف المحتوى الممنوع للنموذج</label>
                            <textarea id="aiPromptText" rows="6" style="font-size:14px; line-height:1.8;">${config.aiPrompt}</textarea>
                        </div>
                        <div style="font-size:12px; color:var(--text-muted); padding:10px; background:var(--input-bg); border-radius:8px; border:1px solid var(--card-border);">
                            💡 مثال: "امنع أي رسالة تحتوي على إعلانات تجارية أو روابط مشبوهة أو محتوى مسيء"
                        </div>
                    </div>
                </div>
            </div>

            <!-- PAGE: Groups -->
            <div class="page" id="page-groups">
                <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2>👥 المجموعات المخصصة</h2>
                        <p>إعدادات مخصصة لكل مجموعة — تتجاوز الإعدادات العامة</p>
                    </div>
                    <button type="button" class="btn btn-blue" onclick="addGroup()">+ إضافة مجموعة</button>
                </div>
                <div id="groupsContainer"></div>
            </div>

            <!-- Save button (visible in all pages as floating) -->
            <div id="saveMsgToast" class="toast">✅ تم الحفظ في قاعدة البيانات بنجاح!</div>

            </form>
        </div><!-- /.main -->

        <!-- Modal: Ollama -->
        <div id="ollamaModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 style="color:var(--blue);">🔗 إعدادات خادم Ollama</h3>
                    <button class="close-modal" onclick="closeOllamaModal()">×</button>
                </div>
                <div class="field-group">
                    <label class="field-label">رابط الخادم (Endpoint URL)</label>
                    <input type="text" id="ollamaUrl" value="${config.ollamaUrl}" dir="ltr" style="text-align:left; font-family:monospace;">
                </div>
                <div class="field-group">
                    <label class="field-label">اسم النموذج</label>
                    <input type="text" id="ollamaModel" value="${config.ollamaModel}" dir="ltr" style="text-align:left; font-family:monospace;" placeholder="مثال: llava">
                    <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">للصور استخدم نموذج Vision مثل <code>llava</code></div>
                </div>
                <button type="button" class="btn btn-primary btn-full" onclick="closeOllamaModal()">حفظ وإغلاق</button>
            </div>
        </div>

        <!-- Modal: Debugger -->
        <div id="debuggerModal" class="modal">
            <div class="modal-content" style="max-width:800px; background:#0d1117; border-color:#21262d;">
                <div class="modal-header">
                    <h3 style="color:var(--accent); font-family:monospace;">⬛ سجل الأحداث المباشر</h3>
                    <button class="close-modal" onclick="closeDebuggerModal()">×</button>
                </div>
                <div id="terminalOutput"></div>
                <button type="button" class="btn btn-ghost btn-full" style="margin-top:14px;" onclick="closeDebuggerModal()">إغلاق</button>
            </div>
        </div>

        <script>
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
                        let styled = l.replace(/\\[خطأ\\]/g, '<span style="color:#ff3b30">[خطأ]</span>')
                                      .replace(/\\[معلومة\\]/g, '<span style="color:#4fc3f7">[معلومة]</span>')
                                      .replace(/\\[فحص\\]/g, '<span style="color:#ffeb3b">[فحص]</span>')
                                      .replace(/\\[أمان\\]/g, '<span style="color:#ff9800">[أمان]</span>')
                                      .replace(/\\[تنظيف\\]/g, '<span style="color:#9c27b0">[تنظيف]</span>');
                        return \`<div>\${styled}</div>\`;
                    }).join('');
                    
                    if (term.innerHTML !== html) {
                        term.innerHTML = html;
                        term.scrollTop = term.scrollHeight;
                    }
                } catch(e) {}
            }

            async function logoutBot() {
                if(confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من حساب واتساب؟ سيتم فصل البوت.')) {
                    document.getElementById('status-text').innerText = 'جاري تسجيل الخروج...';
                    document.getElementById('logoutBtn').style.display = 'none';
                    await fetch('/api/logout', { method: 'POST' });
                }
            }

            function toggleSpamOptions(enabled) {
                const panel = document.getElementById('spamOptionsPanel');
                if (enabled) {
                    panel.style.maxHeight = '800px';
                    panel.style.opacity = '1';
                    panel.style.marginTop = '20px';
                } else {
                    panel.style.maxHeight = '0px';
                    panel.style.opacity = '0';
                    panel.style.marginTop = '0px';
                }
            }

            // Navigation
            const pageTitles = {
                'page-status': 'حالة الاتصال',
                'page-blacklist': 'القائمة السوداء',
                'page-general': 'الإعدادات العامة',
                'page-spam': 'مكافحة الإزعاج',
                'page-media': 'فلتر الوسائط',
                'page-ai': 'الذكاء الاصطناعي',
                'page-groups': 'المجموعات المخصصة'
            };
            function showPage(pageId, btn) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById(pageId).classList.add('active');
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                if(btn) btn.classList.add('active');
                document.getElementById('topbarTitle').textContent = pageTitles[pageId] || '';
                closeSidebar();
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
                if(msg) t.textContent = msg;
                t.classList.add('show');
                setTimeout(() => t.classList.remove('show'), 3000);
            }

            // المتغيرات
            let defaultWordsArr = ${JSON.stringify(config.defaultWords)};
            let blacklistArr = ${JSON.stringify(blacklistArr)}; 
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
                enableAntiSpam: groupsConfigObj[key].enableAntiSpam || false,
                spamDuplicateLimit: groupsConfigObj[key].spamDuplicateLimit || 3,
                spamAction: groupsConfigObj[key].spamAction || 'poll',
                enableWelcomeMessage: groupsConfigObj[key].enableWelcomeMessage || false, 
                welcomeMessageText: groupsConfigObj[key].welcomeMessageText || 'مرحباً بك يا {user} في مجموعتنا!',
                blockedTypes: groupsConfigObj[key].blockedTypes || [],
                blockedAction: groupsConfigObj[key].blockedAction || 'delete',
                spamTypes: groupsConfigObj[key].spamTypes || ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                spamLimits: groupsConfigObj[key].spamLimits || {text:7, image:3, video:2, audio:3, document:3, sticker:3}
            }));

            // دوال مساعدة للواجهة
            function updateGroupArray(gIndex, arrName, val, isChecked) {
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

            // القائمة السوداء
            function renderBlacklist() {
                const container = document.getElementById('blacklistContainer');
                container.innerHTML = '';
                blacklistArr.forEach((number, index) => {
                    container.innerHTML += \`<div class="chip blacklist-chip">\${number} <span onclick="removeBlacklistNumber(\${index})">&times;</span></div>\`;
                });
            }

            async function addBlacklistNumber() {
                const input = document.getElementById('newBlacklistNumber');
                let rawValue = input.value;
                let justNumbers = rawValue.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!blacklistArr.includes(finalId)) {
                        blacklistArr.push(finalId);
                        renderBlacklist(); 
                        try {
                            await fetch('/api/blacklist/add', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({number: finalId})
                            });
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
                    await fetch('/api/blacklist/remove', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({number: numberToRemove})
                    });
                } catch(e) {}
            }

            async function purgeBlacklisted() {
                if(!confirm('⚠️ تحذير: هذا الخيار سيجعل البوت يبحث في جميع المجموعات، وسيطرد أي شخص موجود في القائمة السوداء فوراً. متأكد؟')) return;
                const btn = document.getElementById('purgeBtn');
                const originalText = btn.innerText;
                btn.innerText = '⏳ جاري المسح والطرد من المجموعات...';
                btn.disabled = true;
                try {
                    const res = await fetch('/api/blacklist/purge', { method: 'POST' });
                    const data = await res.json();
                    if(data.error) alert('❌ ' + data.error);
                    else alert('✅ ' + data.message);
                } catch(e) {
                    alert('حدث خطأ في الاتصال بالخادم.');
                }
                btn.innerText = originalText;
                btn.disabled = false;
            }

            // الفلتر التقليدي
            function renderDefaultWords() {
                const container = document.getElementById('defaultWordsContainer');
                container.innerHTML = '';
                defaultWordsArr.forEach((word, index) => {
                    container.innerHTML += \`<div class="chip">\${word} <span onclick="removeDefaultWord(\${index})">&times;</span></div>\`;
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

            // المجموعات
            function renderGroups() {
                const container = document.getElementById('groupsContainer');
                container.innerHTML = '';
                groupsArr.forEach((group, groupIndex) => {
                    let wordsHtml = group.words.map((word, wordIndex) => 
                        \`<div class="chip">\${word} <span onclick="removeGroupWord(\${groupIndex}, \${wordIndex})">&times;</span></div>\`
                    ).join('');

                    // توليد واجهة الأنواع الممنوعة
                    const blockedChecks = metaTypes.map(t => 
                        \`<label class="cb-label"><input type="checkbox" value="\${t.id}" \${group.blockedTypes.includes(t.id)?'checked':''} onchange="updateGroupArray(\${groupIndex}, 'blockedTypes', '\${t.id}', this.checked)"> \${t.icon} \${t.name}</label>\`
                    ).join('');

                    // توليد واجهة حدود الإزعاج
                    const spamLimitGrid = metaTypes.map(t => {
                        const isChecked = group.spamTypes.includes(t.id) ? 'checked' : '';
                        const limitVal = group.spamLimits[t.id] || 5;
                        return \`
                        <div class="limit-item">
                            <input type="checkbox" value="\${t.id}" \${isChecked} onchange="updateGroupArray(\${groupIndex}, 'spamTypes', '\${t.id}', this.checked)">
                            <span style="font-size:13px; width:70px;">\${t.icon} \${t.name}</span>
                            <input type="number" value="\${limitVal}" min="1" onchange="updateSpamLimit(\${groupIndex}, '\${t.id}', this.value)">
                        </div>\`;
                    }).join('');

                    container.innerHTML += \`
                    <div class="group-card">
                        <div class="group-card-header">
                            <div class="group-card-title">
                                <span>👥</span>
                                المجموعة \${groupIndex + 1}
                                \${group.id ? \`<span class="group-id-badge">\${group.id.split('@')[0].slice(-8)}...</span>\` : '<span style="color:var(--orange);font-size:12px;">معرّف غير محدد</span>'}
                            </div>
                            <button type="button" class="btn btn-danger btn-sm" onclick="removeGroup(\${groupIndex})">حذف</button>
                        </div>
                        <div class="group-card-body">

                            <div class="field-group">
                                <label class="field-label">معرّف المجموعة المستهدفة</label>
                                <input type="text" placeholder="مثال: 120363000000000000@g.us" dir="ltr" style="text-align:left;font-family:monospace;" value="\${group.id}" onchange="updateGroupData(\${groupIndex}, 'id', this.value)">
                            </div>
                            <div class="field-group">
                                <label class="field-label">مجموعة الإدارة المخصصة (اتركه فارغاً للعامة)</label>
                                <input type="text" dir="ltr" style="text-align:left;font-family:monospace;" value="\${group.adminGroup}" onchange="updateGroupData(\${groupIndex}, 'adminGroup', this.value)">
                            </div>

                            <!-- Blocked types -->
                            <div class="sub-panel red" style="margin-bottom:12px;">
                                <h4 style="color:var(--red);">🛑 الأنواع الممنوعة قطعياً</h4>
                                <div class="cb-group" style="margin-bottom:10px;">\${blockedChecks}</div>
                                <label class="field-label">إجراء المنع</label>
                                <select onchange="updateGroupData(\${groupIndex}, 'blockedAction', this.value)">
                                    <option value="delete" \${group.blockedAction === 'delete' ? 'selected' : ''}>حذف الرسالة فقط</option>
                                    <option value="poll" \${group.blockedAction === 'poll' ? 'selected' : ''}>حذف + تصويت للإدارة</option>
                                    <option value="auto" \${group.blockedAction === 'auto' ? 'selected' : ''}>حذف + طرد تلقائي</option>
                                </select>
                            </div>

                            <!-- Anti-Spam toggle + slide panel -->
                            <div class="toggle-row warning" style="margin-bottom:0; border-radius:\${group.enableAntiSpam ? '10px 10px 0 0' : '10px'};">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableAntiSpam ? 'checked' : ''} onchange="toggleGroupPanel(\${groupIndex}, 'spam', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">مكافحة الإزعاج (Anti-Spam)<small>رصد الرسائل المتكررة خلال 15 ثانية</small></div>
                                </div>
                            </div>
                            <div id="group_spam_panel_\${groupIndex}" style="
                                overflow:hidden;
                                max-height:\${group.enableAntiSpam ? '600px' : '0px'};
                                opacity:\${group.enableAntiSpam ? '1' : '0'};
                                transition:max-height 0.45s ease, opacity 0.35s ease, margin-bottom 0.35s ease;
                                margin-bottom:\${group.enableAntiSpam ? '12px' : '0px'};
                            ">
                                <div class="sub-panel orange" style="border-top:none; border-radius:0 0 10px 10px;">
                                    <h4 style="color:var(--orange);">⏱️ حدود كل نوع (15 ثانية)</h4>
                                    <div class="limit-grid">\${spamLimitGrid}</div>
                                    <div class="field-row" style="border-top:1px dashed rgba(255,171,64,0.3);padding-top:12px;margin-top:4px;">
                                        <div>
                                            <label class="field-label">تكرار النص</label>
                                            <input type="number" value="\${group.spamDuplicateLimit}" min="2" max="15" onchange="updateGroupData(\${groupIndex}, 'spamDuplicateLimit', parseInt(this.value))">
                                        </div>
                                        <div>
                                            <label class="field-label">الإجراء</label>
                                            <select onchange="updateGroupData(\${groupIndex}, 'spamAction', this.value)">
                                                <option value="poll" \${group.spamAction === 'poll' ? 'selected' : ''}>🗳️ تصويت للإدارة</option>
                                                <option value="auto" \${group.spamAction === 'auto' ? 'selected' : ''}>🔨 طرد تلقائي</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Welcome message toggle + slide panel -->
                            <div class="toggle-row green" style="margin-bottom:0; border-radius:\${group.enableWelcomeMessage ? '10px 10px 0 0' : '10px'};">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWelcomeMessage ? 'checked' : ''} onchange="toggleGroupPanel(\${groupIndex}, 'welcome', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">رسالة ترحيبية عند الانضمام<small>يُرسلها البوت لكل عضو جديد</small></div>
                                </div>
                            </div>
                            <div id="group_welcome_panel_\${groupIndex}" style="
                                overflow:hidden;
                                max-height:\${group.enableWelcomeMessage ? '200px' : '0px'};
                                opacity:\${group.enableWelcomeMessage ? '1' : '0'};
                                transition:max-height 0.45s ease, opacity 0.35s ease, margin-bottom 0.35s ease;
                                margin-bottom:\${group.enableWelcomeMessage ? '12px' : '0px'};
                            ">
                                <div class="sub-panel" style="border-top:none; border-radius:0 0 10px 10px; border-color:rgba(100,200,120,0.3);">
                                    <label class="field-label">نص الرسالة ({user} للمنشن)</label>
                                    <textarea rows="2" onchange="updateGroupData(\${groupIndex}, 'welcomeMessageText', this.value)">\${group.welcomeMessageText}</textarea>
                                </div>
                            </div>

                            <!-- Blacklist toggle (no sub-panel needed) -->
                            <div class="toggle-row danger" style="margin-bottom:12px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableBlacklist ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableBlacklist', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">تفعيل القائمة السوداء<small>طرد فوري لأي رقم محظور</small></div>
                                </div>
                            </div>

                            <!-- Word filter toggle + slide panel (includes useDefaultWords inside) -->
                            <div class="toggle-row warning" style="margin-bottom:0; border-radius:\${group.enableWordFilter ? '10px 10px 0 0' : '10px'};">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWordFilter ? 'checked' : ''} onchange="toggleGroupPanel(\${groupIndex}, 'words', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">فلتر الكلمات الممنوعة<small>حذف فوري عند رصد كلمة ممنوعة</small></div>
                                </div>
                            </div>
                            <div id="group_words_panel_\${groupIndex}" style="
                                overflow:hidden;
                                max-height:\${group.enableWordFilter ? '600px' : '0px'};
                                opacity:\${group.enableWordFilter ? '1' : '0'};
                                transition:max-height 0.45s ease, opacity 0.35s ease, margin-bottom 0.35s ease;
                                margin-bottom:\${group.enableWordFilter ? '12px' : '0px'};
                            ">
                                <div class="sub-panel orange" style="border-top:none; border-radius:0 0 10px 10px;">
                                    <!-- useDefaultWords nested inside word filter panel -->
                                    <div class="toggle-row" style="margin-bottom:14px; background:rgba(255,255,255,0.04); border-color:rgba(255,171,64,0.25);">
                                        <div class="toggle-left">
                                            <label class="switch"><input type="checkbox" \${group.useDefaultWords ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'useDefaultWords', this.checked)"><span class="slider"></span></label>
                                            <div class="toggle-label">تطبيق الكلمات العامة أيضاً<small>إضافة قائمة الكلمات العامة لهذه المجموعة</small></div>
                                        </div>
                                    </div>
                                    <label class="field-label">كلمات ممنوعة مخصصة لهذه المجموعة</label>
                                    <div class="input-with-btn" style="margin-bottom:10px;">
                                        <input type="text" id="newGroupWord_\${groupIndex}" placeholder="أدخل الكلمة..." onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWord(\${groupIndex});}">
                                        <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWord(\${groupIndex})">+ إضافة</button>
                                    </div>
                                    <div class="chip-container">\${wordsHtml}</div>
                                </div>
                            </div>

                            <!-- AI toggles -->
                            <div class="toggle-row blue" style="margin-bottom:12px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableAIFilter ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableAIFilter', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label blue">المشرف الذكي (AI) للنصوص</div>
                                </div>
                            </div>
                            <div class="toggle-row purple" style="margin-bottom:12px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableAIMedia ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableAIMedia', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label purple">تحليل الصور (Vision)</div>
                                </div>
                            </div>
                            <div class="toggle-row pink">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.autoAction ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'autoAction', this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label pink">الحذف المباشر (تخطي التصويت)</div>
                                </div>
                            </div>

                        </div>
                    </div>
                    \`;
                });
            }

            function addGroup() {
                groupsArr.push({ 
                    id: '', adminGroup: '', words: [], useDefaultWords: true, 
                    enableWordFilter: true, enableAIFilter: false, enableAIMedia: false, 
                    autoAction: false, enableBlacklist: true,
                    enableAntiSpam: false, spamDuplicateLimit: 3, spamAction: 'poll',
                    enableWelcomeMessage: false, welcomeMessageText: 'مرحباً بك يا {user} في مجموعتنا!',
                    blockedTypes: [], blockedAction: 'delete', 
                    spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                    spamLimits: {text:7, image:3, video:2, audio:3, document:3, sticker:3}
                });
                renderGroups();
            }

            function removeGroup(index) {
                if(confirm('هل أنت متأكد من رغبتك في حذف الإعدادات المخصصة لهذه المجموعة؟')) {
                    groupsArr.splice(index, 1);
                    renderGroups();
                }
            }

            function updateGroupData(index, field, value) { groupsArr[index][field] = value; }
            function updateGroupToggle(index, field, isChecked) { groupsArr[index][field] = isChecked; }

            function toggleGroupPanel(groupIndex, type, enabled) {
                const panelMap = { spam: 'spam', welcome: 'welcome', words: 'words' };
                const fieldMap = { spam: 'enableAntiSpam', welcome: 'enableWelcomeMessage', words: 'enableWordFilter' };
                const maxHeightMap = { spam: '600px', welcome: '200px', words: '600px' };

                groupsArr[groupIndex][fieldMap[type]] = enabled;

                const panel = document.getElementById(\`group_\${panelMap[type]}_panel_\${groupIndex}\`);
                const toggle = panel.previousElementSibling;
                if (!panel) return;

                if (enabled) {
                    panel.style.maxHeight = maxHeightMap[type];
                    panel.style.opacity = '1';
                    panel.style.marginBottom = '12px';
                    if (toggle) toggle.style.borderRadius = '10px 10px 0 0';
                } else {
                    panel.style.maxHeight = '0px';
                    panel.style.opacity = '0';
                    panel.style.marginBottom = '0px';
                    if (toggle) toggle.style.borderRadius = '10px';
                }
            }

            function addGroupWord(groupIndex) {
                const input = document.getElementById(\`newGroupWord_\${groupIndex}\`);
                const word = input.value.trim();
                if (word && !groupsArr[groupIndex].words.includes(word)) {
                    groupsArr[groupIndex].words.push(word);
                    renderGroups();
                }
            }

            function removeGroupWord(groupIndex, wordIndex) {
                groupsArr[groupIndex].words.splice(wordIndex, 1);
                renderGroups();
            }

            renderBlacklist();
            renderDefaultWords();
            renderGroups();

            setInterval(async () => {
                try {
                    let res = await fetch('/api/status');
                    let data = await res.json();
                    document.getElementById('status-text').innerText = data.status;
                    const detailEl = document.getElementById('status-text-detail');
                    if(detailEl) detailEl.innerText = data.status;
                    
                    const dot = document.getElementById('statusDot');
                    if(data.status.includes('متصل وجاهز')) {
                        dot.className = 'status-dot online';
                        document.getElementById('logoutBtn').style.display = 'block';
                    } else if(data.status.includes('QR') || data.status.includes('انتظار')) {
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
                groupsArr.forEach(g => { if(g.id) finalGroupsObj[g.id] = g; });

                const gSpamTypes = [];
                const gSpamLimits = {};
                metaTypes.forEach(t => {
                    const cb = document.getElementById('global_spam_check_' + t.id);
                    if(cb && cb.checked) gSpamTypes.push(t.id);
                    const lim = document.getElementById('global_spam_limit_' + t.id);
                    gSpamLimits[t.id] = parseInt(lim ? lim.value : 5) || 5;
                });

                const newConfig = {
                    enableAntiSpam: document.getElementById('enableAntiSpam').checked,
                    spamDuplicateLimit: parseInt(document.getElementById('spamDuplicateLimit').value) || 3,
                    spamAction: document.getElementById('spamAction').value,
                    spamTypes: gSpamTypes,
                    spamLimits: gSpamLimits,
                    blockedTypes: getCheckedValues('globalBlockedTypes'),
                    blockedAction: document.getElementById('globalBlockedAction').value,
                    enableBlacklist: document.getElementById('enableBlacklist').checked,
                    enableWordFilter: document.getElementById('enableWordFilter').checked,
                    enableAIFilter: document.getElementById('enableAIFilter').checked,
                    enableAIMedia: document.getElementById('enableAIMedia').checked,
                    autoAction: document.getElementById('autoAction').checked,
                    aiPrompt: document.getElementById('aiPromptText').value.trim(),
                    ollamaUrl: document.getElementById('ollamaUrl').value.trim(),
                    ollamaModel: document.getElementById('ollamaModel').value.trim(),
                    defaultAdminGroup: document.getElementById('defaultAdminGroup').value.trim(),
                    defaultWords: defaultWordsArr,
                    groupsConfig: finalGroupsObj
                };
                
                const res = await fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newConfig)
                });
                
                if(res.ok) showToast('✅ تم الحفظ في قاعدة البيانات بنجاح!');
                else showToast('❌ فشل الحفظ، تحقق من السيرفر');
            }

            document.getElementById('configForm').onsubmit = async (e) => {
                e.preventDefault();
                await saveConfig();
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// 🚀 API Endpoints
app.post('/api/blacklist/add', (req, res) => {
    if(req.body.number) {
        try {
            db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(req.body.number);
            console.log(`[أمان] تم إضافة رقم للقائمة السوداء عبر اللوحة: ${req.body.number}`);
        } catch(e) {}
    }
    res.sendStatus(200);
});

app.post('/api/blacklist/remove', (req, res) => {
    if(req.body.number) {
        try {
            db.prepare('DELETE FROM blacklist WHERE number = ?').run(req.body.number);
            console.log(`[أمان] تم إزالة رقم من القائمة السوداء عبر اللوحة: ${req.body.number}`);
        } catch(e) {}
    }
    res.sendStatus(200);
});

app.post('/api/blacklist/purge', async (req, res) => {
    if (!client.info || !client.info.wid) {
        return res.status(400).json({ error: 'البوت غير متصل حالياً، يرجى الانتظار.' });
    }

    try {
        console.log(`[تنظيف] بدأت عملية المسح الشامل للمجموعات...`);
        const blacklistRows = db.prepare('SELECT number FROM blacklist').all();
        const blacklistArr = blacklistRows.map(r => r.number);

        if (blacklistArr.length === 0) return res.json({ message: 'القائمة السوداء فارغة.' });

        const chats = await client.getChats();
        const botId = client.info.wid._serialized;
        let kickedCount = 0;

        for (const chat of chats) {
            if (chat.isGroup) {
                const botData = chat.participants.find(p => p.id._serialized === botId);
                const botIsAdmin = botData && (botData.isAdmin || botData.isSuperAdmin);

                if (botIsAdmin) {
                    const usersToKick = chat.participants
                        .map(p => p.id._serialized)
                        .filter(id => {
                            const cleanId = id.replace(/:[0-9]+/, ''); 
                            return blacklistArr.includes(cleanId) || blacklistArr.includes(id);
                        });

                    if (usersToKick.length > 0) {
                        try {
                            await chat.removeParticipants(usersToKick);
                            kickedCount += usersToKick.length;
                            console.log(`[أمان] 🧹 تم طرد ${usersToKick.length} محظورين من: ${chat.name}`);
                            await new Promise(resolve => setTimeout(resolve, 1500)); 
                        } catch (e) {}
                    }
                }
            }
        }
        console.log(`[تنظيف] انتهت عملية المسح. طرد ${kickedCount} شخص.`);
        res.json({ message: `تمت عملية المسح بنجاح! تم طرد (${kickedCount}) عضو محظور.` });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ في السيرفر أثناء عملية المسح.' });
    }
});

app.get('/api/status', (req, res) => res.json({ qr: currentQR, status: botStatus }));
app.get('/api/logs', (req, res) => res.json(logsHistory));

app.post('/api/logout', async (req, res) => {
    try {
        botStatus = 'جاري إنهاء الجلسة...';
        await client.logout();
        res.sendStatus(200);
    } catch (error) { res.sendStatus(500); }
});

app.post('/save', (req, res) => {
    try {
        saveConfigToDB(req.body);
        config = loadConfigFromDB(); 
        console.log('[فحص] 💾 تم حفظ الإعدادات بنجاح.');
        res.sendStatus(200);
    } catch(e) {
        console.error('[خطأ] تعذر الحفظ في قاعدة البيانات:', e.message);
        res.sendStatus(500);
    }
});

app.listen(3000, () => console.log('لوحة التحكم تعمل عبر المنفذ 3000...'));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async (qr) => {
    botStatus = 'بانتظار مسح رمز الاستجابة السريعة (QR Code)...';
    currentQR = await qrcode.toDataURL(qr);
});

client.on('ready', async () => {
    botStatus = 'متصل وجاهز للعمل ✅';
    currentQR = '';
    console.log('تم ربط حساب واتساب بنجاح!');
    
    try {
        const chats = await client.getChats();
        let groupsList = '--- قائمة المجموعات ---\n\n';
        chats.filter(c => c.isGroup).forEach(c => {
            groupsList += `الاسم: ${c.name}\nالمعرف: ${c.id._serialized}\n-----------------------\n`;
        });
        fs.writeFileSync('groups_list.txt', groupsList);
    } catch (error) {}
});

client.on('authenticated', () => {
    botStatus = 'تم تسجيل الدخول بنجاح، جاري جلب البيانات...';
    currentQR = '';
});

client.on('disconnected', async (reason) => {
    botStatus = 'تم تسجيل الخروج من الحساب...';
    currentQR = '';
    try { await client.destroy(); } catch(e) {}
    setTimeout(() => { client.initialize(); }, 3000);
});

const pendingBans = new Map();

client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const groupId = chat.id._serialized;
        const groupConfig = config.groupsConfig[groupId];
        
        let isBlacklistEnabledForGroup = config.enableBlacklist;
        if (groupConfig && typeof groupConfig.enableBlacklist !== 'undefined') {
            isBlacklistEnabledForGroup = groupConfig.enableBlacklist;
        }

        for (const participantId of notification.recipientIds) {
            let cleanJoinedId = participantId.replace(/:[0-9]+/, '');
            
            if (cleanJoinedId.includes('@lid')) {
                try {
                    const contact = await client.getContactById(participantId);
                    if (contact && contact.number) cleanJoinedId = `${contact.number}@c.us`;
                    else cleanJoinedId = cleanJoinedId.replace('@lid', '@c.us');
                } catch(e) { cleanJoinedId = cleanJoinedId.replace('@lid', '@c.us'); }
            }

            let isKicked = false;

            if (isBlacklistEnabledForGroup) {
                const isBanned = db.prepare('SELECT 1 FROM blacklist WHERE number = ?').get(cleanJoinedId);
                
                if (isBanned) {
                    console.log(`[أمان] 🛡️ محاولة دخول رقم محظور (${cleanJoinedId}). جاري الطرد...`);
                    isKicked = true;
                    
                    setTimeout(async () => {
                        try {
                            await chat.removeParticipants([participantId]);
                            const targetAdminGroup = groupConfig?.adminGroup || config.defaultAdminGroup;
                            const reportText = `🛡️ *حماية (قائمة سوداء)*\nحاول رقم محظور الدخول لمجموعة "${chat.name}" وتم طرده.\nالرقم: @${cleanJoinedId.split('@')[0]}`;
                            await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanJoinedId] });
                        } catch(err) {}
                    }, 2000);
                }
            }

            if (!isKicked && groupConfig && groupConfig.enableWelcomeMessage && groupConfig.welcomeMessageText) {
                setTimeout(async () => {
                    try {
                        const welcomeText = groupConfig.welcomeMessageText.replace(/{user}/g, `@${cleanJoinedId.split('@')[0]}`);
                        await client.sendMessage(groupId, welcomeText, { mentions: [cleanJoinedId] });
                    } catch (err) {}
                }, 3500); 
            }
        }
    } catch (error) {}
});

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
                } catch(e) { cleanAuthorId = cleanAuthorId.replace('@lid', '@c.us'); }
            }

            // 🎯 تحديد نوع الرسالة الداخلي
            let internalMsgType = 'text';
            if (msg.type === 'image') internalMsgType = 'image';
            else if (msg.type === 'video') internalMsgType = 'video';
            else if (msg.type === 'audio' || msg.type === 'ptt') internalMsgType = 'audio';
            else if (msg.type === 'document') internalMsgType = 'document';
            else if (msg.type === 'sticker') internalMsgType = 'sticker';

            const groupId = chat.id._serialized;
            const groupConfig = config.groupsConfig[groupId];
            
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
                targetAdminGroup = groupConfig.adminGroup || config.defaultAdminGroup;
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
                const isBanned = db.prepare('SELECT 1 FROM blacklist WHERE number = ?').get(cleanAuthorId);
                if (isBanned) {
                    console.log(`[أمان] 🛡️ رقم محظور أرسل رسالة. سيتم حذفه.`);
                    await msg.delete(true);
                    await chat.removeParticipants([rawAuthorId]);
                    return; 
                }
            }

            // 🛑 --- نظام المنع القطعي ---
            if (blockedTypes.includes(internalMsgType)) {
                console.log(`[أمان] 🛑 رصد نوع ممنوع قطعي (${internalMsgType}). يتم الحذف.`);
                try { await msg.delete(true); } catch(e){}
                
                if (blockedAction === 'auto') {
                    try {
                        await chat.removeParticipants([rawAuthorId]);
                        if (isBlacklistEnabled) db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanAuthorId);
                        const reportText = `🚨 *حظر تلقائي (نوع ممنوع)*\nأرسل العضو ملف (${internalMsgType}) في "${chat.name}" وتم طرده.\n👤 *المرسل:* @${cleanAuthorId.split('@')[0]}`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanAuthorId] });
                    } catch(e){}
                } else if (blockedAction === 'poll') {
                    const pollTitle = `🚨 إشعار بمخالفة في "${chat.name}"\nالمرسل: @${cleanAuthorId.split('@')[0]}\nالسبب: إرسال نوع ممنوع (${internalMsgType})\n\nهل ترغب في طرد الرقم${isBlacklistEnabled ? ' وإضافته للقائمة السوداء' : ''}؟`;
                    const poll = new Poll(pollTitle, isBlacklistEnabled ? ['نعم، طرد وحظر', 'لا'] : ['نعم، طرد', 'لا']);
                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [cleanAuthorId] });
                    pendingBans.set(pollMsg.id._serialized, { senderId: cleanAuthorId, pollMsg: pollMsg, isBlacklistEnabled: isBlacklistEnabled });
                }
                return; 
            }

            // 🛡️ --- نظام مكافحة الإزعاج المخصص (Anti-Spam) ---
            if (isAntiSpamEnabled) {
                const trackerKey = `${groupId}_${cleanAuthorId}`;
                
                if (spamMutedUsers.has(trackerKey)) {
                    if (Date.now() < spamMutedUsers.get(trackerKey)) {
                        try { await msg.delete(true); } catch(e) {}
                        return; 
                    } else {
                        spamMutedUsers.delete(trackerKey); 
                    }
                }

                if (!userTrackers.has(trackerKey)) userTrackers.set(trackerKey, []);
                let tracker = userTrackers.get(trackerKey);

                const now = Date.now();
                tracker.push({ text: msg.body, time: now, msgObj: msg, id: msgId, type: internalMsgType });

                tracker = tracker.filter(m => now - m.time < 15000); 
                userTrackers.set(trackerKey, tracker);

                let isSpamFlagged = false;
                let spamFlagReason = '';

                // فحص الحدود المخصصة لكل نوع
                if (spamTypes.includes(internalMsgType)) {
                    const typeCount = tracker.filter(m => m.type === internalMsgType).length;
                    const typeLimit = spamLimits[internalMsgType] || 5; 
                    if (typeCount >= typeLimit) {
                        isSpamFlagged = true;
                        const arNames = {text:'نصوص', image:'صور', video:'فيديو', audio:'صوتيات', document:'ملفات', sticker:'ملصقات'};
                        spamFlagReason = `إرسال (${arNames[internalMsgType] || internalMsgType}) بسرعة تتجاوز الحد المسموح (${typeLimit} خلال 15ث)`;
                    }
                }

                // فحص تكرار نفس النص
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
                    console.log(`[أمان] 🚨 تم رصد مزعج في (${chat.name}): ${spamFlagReason}`);
                    spamMutedUsers.set(trackerKey, Date.now() + 60000);

                    for (const m of tracker) abortedMessages.add(m.id);
                    
                    try { await msg.delete(true); } catch(e) {}

                    for (const m of tracker) {
                        if (m.id !== msgId) { 
                            try { 
                                await m.msgObj.delete(true); 
                                await new Promise(r => setTimeout(r, 500)); 
                            } catch(err) {}
                        }
                    }
                    
                    try {
                        const recentMsgs = await chat.fetchMessages({ limit: 15 });
                        for (const rMsg of recentMsgs) {
                            if ((rMsg.author || rMsg.from) === rawAuthorId) {
                                try { 
                                    await rMsg.delete(true); 
                                    await new Promise(r => setTimeout(r, 200)); 
                                } catch(e) {}
                            }
                        }
                    } catch(err) {}
                    
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
                        } catch(e) {}
                    } else {
                        const pollOptions = isBlacklistEnabled ? ['نعم، طرد وحظر', 'لا، اكتف بالحذف'] : ['نعم، طرد العضو', 'لا'];
                        const pollTitle = `🚨 إشعار إزعاج في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${spamFlagReason}\n\nهل ترغب في طرد الرقم${isBlacklistEnabled ? ' وإضافته للقائمة السوداء' : ''}؟`;
                        const poll = new Poll(pollTitle, pollOptions);
                        const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });
                        
                        pendingBans.set(pollMsg.id._serialized, {
                            senderId: senderId,
                            pollMsg: pollMsg,
                            isBlacklistEnabled: isBlacklistEnabled
                        });
                    }
                    return; 
                }
            }

            console.log(`[فحص] متابعة رسالة في (${chat.name}) | كلمات(${isWordFilterEnabled})، ذكي(${isAIFilterEnabled})`);

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
                            } catch (err) {}
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
                    
                    if (abortedMessages.has(msgId)) {
                        abortedMessages.delete(msgId); 
                        return; 
                    }

                    const data = await response.json();
                    if (data.response && data.response.includes('نعم')) {
                        isViolating = true;
                        violationReason = 'تم التصنيف كمخالفة عبر الذكاء الاصطناعي';
                    }
                } catch (error) {}
            }

            if (isViolating) {
                const contact = await msg.getContact();
                let senderId = cleanAuthorId; 
                if (contact && contact.number) senderId = `${contact.number}@c.us`;

                const messageContent = msg.body || '[مرفق وسائط]';
                await msg.delete(true); 

                if (isAutoActionEnabled) {
                    try {
                        await chat.removeParticipants([rawAuthorId]);
                        if (isBlacklistEnabled) db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(senderId);

                        const reportText = `🚨 *تقرير إجراء وحظر تلقائي*\nتم مسح محتوى مخالف وطرد العضو من "${chat.name}".\n\n👤 *المرسل:* @${senderId.split('@')[0]}\n📋 *السبب:* ${violationReason}\n📝 *النص الممسوح:*\n"${messageContent}"`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [senderId] });
                    } catch(e) {}
                } else {
                    const pollOptions = isBlacklistEnabled ? ['نعم، طرد وحظر', 'لا، اكتف بالحذف'] : ['نعم، طرد', 'لا'];
                    const pollTitle = `🚨 إشعار بمحتوى مخالف في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${violationReason}\nالنص:\n"${messageContent}"\n\nهل ترغب في طرده؟`;
                    const poll = new Poll(pollTitle, pollOptions);
                    
                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });
                    pendingBans.set(pollMsg.id._serialized, { senderId: senderId, pollMsg: pollMsg, isBlacklistEnabled: isBlacklistEnabled });
                }
            }
        }
    } catch (error) {}
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
                    try { db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(userToBan); } catch(e) {}
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
                            } catch(e) { }
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
