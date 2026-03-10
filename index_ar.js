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
    <html dir="rtl" lang="ar" data-theme="light">
    <head>
        <meta charset="UTF-8">
        <title>لوحة تحكم المشرف الآلي</title>
        <style>
            :root {
                --bg-color: #f0f2f5; --container-bg: #ffffff; --text-main: #333333; --text-heading: #075e54;
                --input-bg: #ffffff; --input-border: #cccccc; --card-border: #dddddd; --chip-bg: #dcf8c6;
                --chip-text: #075e54; --chip-border: #b2e289; --status-bg: #e1f5fe; --status-border: #b3e5fc;
                --status-text: #0277bd; --modal-bg: rgba(0,0,0,0.5);
            }
            [data-theme="dark"] {
                --bg-color: #121212; --container-bg: #1e1e1e; --text-main: #e4e6eb; --text-heading: #25d366;
                --input-bg: #3a3b3c; --input-border: #555555; --card-border: #3a3b3c; --chip-bg: #2a3942;
                --chip-text: #e4e6eb; --chip-border: #111b21; --status-bg: #112a34; --status-border: #0b1a20;
                --status-text: #4fc3f7; --modal-bg: rgba(0,0,0,0.7);
            }
            body { font-family: Tahoma, Arial; background: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; transition: 0.3s; }
            .container { max-width: 800px; margin: auto; background: var(--container-bg); padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); position: relative; }
            h1 { color: var(--text-heading); text-align: center; border-bottom: 2px solid var(--card-border); padding-bottom: 15px; }
            .status-box { text-align: center; padding: 20px; background: var(--status-bg); border-radius: 8px; margin-bottom: 25px; border: 1px solid var(--status-border); }
            .status-box h2 { margin: 0 0 10px 0; color: var(--status-text); font-size: 20px; }
            label { font-weight: bold; display: block; margin-top: 20px; color: var(--text-main); }
            input, textarea, select { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid var(--input-border); border-radius: 5px; box-sizing: border-box; font-size: 14px; background: var(--input-bg); color: var(--text-main); transition: 0.3s; }
            textarea { resize: vertical; }
            .flex-input { display: flex; gap: 10px; margin-top: 5px; }
            .flex-input input { margin-top: 0; }
            .add-btn { background: #25d366; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; white-space: nowrap; transition: 0.3s;}
            .add-btn:hover { background: #1ebe57; }
            .purge-btn { background: #ff9800; color: white; border: none; padding: 12px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; transition: 0.3s; width: 100%; margin-top: 15px; font-size: 15px;}
            .purge-btn:hover { background: #e68a00; }
            .chip-container { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding: 10px; background: var(--input-bg); border-radius: 5px; min-height: 40px; border: 1px dashed var(--input-border); }
            .chip { background: var(--chip-bg); color: var(--chip-text); padding: 5px 12px; border-radius: 15px; font-size: 13px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--chip-border); }
            .chip.blacklist-chip { background: #ffebee; color: #c62828; border-color: #ffcdd2; }
            .chip span { cursor: pointer; color: #ff5252; font-weight: bold; font-size: 16px; }
            .chip span:hover { color: #d32f2f; }
            .group-card { background: var(--container-bg); border: 1px solid var(--card-border); padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: 0.3s; }
            .group-card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 10px; margin-bottom: 10px;}
            .remove-btn { background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
            .logout-btn { background: #ff3b30; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; margin-top: 15px; display: none; transition: 0.3s; }
            .logout-btn:hover { background: #d32f2f; }
            .debug-btn { background: #333; color: #0f0; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; margin-top: 15px; font-family: monospace; transition: 0.3s; }
            .debug-btn:hover { background: #000; }
            .save-btn { background: #128c7e; color: white; border: none; padding: 15px; font-size: 18px; font-weight: bold; border-radius: 5px; cursor: pointer; margin-top: 30px; width: 100%; transition: 0.3s; }
            .save-btn:hover { background: #075e54; }
            .success { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; text-align: center; display: none; margin-top: 15px; border: 1px solid #c3e6cb; }
            .theme-toggle { position: absolute; top: 20px; left: 20px; background: none; border: none; font-size: 24px; cursor: pointer; padding: 5px; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transition: background 0.3s; }
            .theme-toggle:hover { background: rgba(128,128,128,0.2); }
            .switch-container { display: flex; align-items: center; gap: 15px; margin-top: 15px; background: var(--input-bg); padding: 12px; border-radius: 5px; border: 1px solid var(--input-border); justify-content: space-between; }
            .switch-inner { display: flex; align-items: center; gap: 15px; }
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; margin: 0; flex-shrink: 0; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: #25d366; }
            input:checked + .slider:before { transform: translateX(20px); }
            .spam-settings, .media-settings { background: rgba(255, 152, 0, 0.05); padding: 15px; border: 1px solid #ff9800; border-radius: 8px; margin-top: 10px; }
            .media-settings { border-color: #f44336; background: rgba(244, 67, 54, 0.05); }
            
            .cb-group { display: flex; gap: 15px; flex-wrap: wrap; margin-top: 8px; font-size: 14px;}
            .cb-group label { margin: 0; font-weight: normal; cursor: pointer; display: flex; align-items: center; gap: 5px; }
            .limit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
            .limit-item { display: flex; align-items: center; gap: 8px; background: var(--container-bg); padding: 6px 10px; border-radius: 5px; border: 1px solid var(--card-border); }
            .limit-item input[type="number"] { width: 60px; padding: 4px; margin: 0; text-align: center;}

            .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: var(--modal-bg); backdrop-filter: blur(3px); }
            .modal-content { background-color: var(--container-bg); margin: 5% auto; padding: 25px; border: 1px solid var(--card-border); width: 90%; max-width: 600px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); animation: slideIn 0.3s; }
            .close-modal { color: #aaa; float: left; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 20px; }
            .close-modal:hover { color: #ff4444; }
            @keyframes slideIn { from { transform: translateY(-30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

            #terminalOutput { background: #000; color: #0f0; font-family: monospace; height: 400px; overflow-y: scroll; padding: 15px; border-radius: 5px; font-size: 13px; direction: ltr; text-align: left; margin-top: 15px; border: 1px solid #333; }
            #terminalOutput div { margin-bottom: 5px; border-bottom: 1px dashed #222; padding-bottom: 5px; word-wrap: break-word; }
        </style>
    </head>
    <body>
        <div class="container">
            <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" title="تبديل المظهر">🌙</button>

            <h1>⚙️ إعدادات المشرف الآلي (V4)</h1>
            
            <div class="status-box">
                <h2>حالة الربط مع واتساب: <span id="status-text">${botStatus}</span></h2>
                <img id="qr-image" src="" style="display:none; max-width: 250px; margin: 15px auto 0; border: 10px solid white; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);" />
                
                <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: center;">
                    <button type="button" id="logoutBtn" class="logout-btn" onclick="logoutBot()">🚪 فصل الحساب (تسجيل خروج)</button>
                    <button type="button" class="debug-btn" onclick="openDebuggerModal()">🐞 سجل الأحداث (Debugger)</button>
                </div>
            </div>

            <form id="configForm">
                
                <div class="group-card" style="border-color: #f44336; background: rgba(244, 67, 54, 0.02);">
                    <h3 style="margin-top:0; color: #d32f2f;">🚫 القائمة السوداء العالمية (Database)</h3>
                    <p style="font-size: 13px; color: #666; margin-top: -5px;">يتم حفظ الأرقام هنا لحظياً ومباشرة في قاعدة البيانات.</p>
                    
                    <label style="color: #d32f2f;">أرقام المخالفين (اكتب الرقم مباشرة):</label>
                    <div class="flex-input">
                        <input type="text" id="newBlacklistNumber" placeholder="مثال: 966582014941" onkeypress="if(event.key === 'Enter') { event.preventDefault(); addBlacklistNumber(); }">
                        <button type="button" class="add-btn" style="background: #d32f2f;" onclick="addBlacklistNumber()">+ إضافة حظر مباشر</button>
                    </div>
                    <div id="blacklistContainer" class="chip-container"></div>
                    
                    <button type="button" id="purgeBtn" class="purge-btn" onclick="purgeBlacklisted()">🧹 طرد جميع المحظورين من كافة المجموعات الآن (تطبيق رجعي)</button>
                </div>

                <div class="group-card" style="border-color: var(--text-heading);">
                    <h3 style="margin-top:0; color: var(--text-heading);">🔧 الإعدادات العامة (تطبق على المجموعات غير المخصصة)</h3>
                    
                    <div class="switch-container" style="border-color: #d32f2f; background: rgba(211, 47, 47, 0.05);">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="enableBlacklist" ${config.enableBlacklist ? 'checked' : ''}>
                                <span class="slider" style="background-color: #ccc;"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold; color: #d32f2f;">تفعيل نظام القائمة السوداء للمجموعات العامة (طرد من الدخول والإضافة)</span>
                        </div>
                    </div>

                    <div class="media-settings">
                        <h4 style="margin: 0 0 10px 0; color: #d32f2f;">🛑 المنع القطعي لأنواع الملفات (حذف فوري دائماً):</h4>
                        <div class="cb-group" id="globalBlockedTypes">
                            ${mediaTypesMeta.map(t => `<label><input type="checkbox" value="${t.id}" ${config.blockedTypes.includes(t.id) ? 'checked' : ''}> ${t.icon} ${t.name}</label>`).join('')}
                        </div>
                        <label style="font-size: 13px; margin-top: 10px;">الإجراء عند إرسال نوع ممنوع:</label>
                        <select id="globalBlockedAction" style="padding: 5px;">
                            <option value="delete" ${config.blockedAction === 'delete' ? 'selected' : ''}>حذف الرسالة فقط (بصمت)</option>
                            <option value="poll" ${config.blockedAction === 'poll' ? 'selected' : ''}>حذف + فتح تصويت للإدارة</option>
                            <option value="auto" ${config.blockedAction === 'auto' ? 'selected' : ''}>حذف + طرد تلقائي وحظر</option>
                        </select>
                    </div>

                    <div class="switch-container" style="border-color: #ff9800; margin-top: 15px;">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="enableAntiSpam" ${config.enableAntiSpam ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold; color: #ff9800;">تفعيل الحماية من الإزعاج السريع (Anti-Spam)</span>
                        </div>
                    </div>
                    <div class="spam-settings">
                        <h4 style="margin: 0 0 10px 0; color: #ff9800;">تحديد حدود الإزعاج لكل نوع (خلال 15 ثانية):</h4>
                        <p style="font-size:12px; margin-top:-5px; color:var(--text-main);">حدد (صح) ليتم مراقبة النوع، ثم ضع الحد الأقصى المسموح به.</p>
                        
                        <div class="limit-grid">
                            ${mediaTypesMeta.map(t => `
                            <div class="limit-item">
                                <input type="checkbox" id="global_spam_check_${t.id}" value="${t.id}" ${config.spamTypes.includes(t.id) ? 'checked' : ''}>
                                <span style="font-size:13px; width:70px;">${t.icon} ${t.name}</span>
                                <input type="number" id="global_spam_limit_${t.id}" value="${config.spamLimits[t.id] || 5}" min="1">
                            </div>
                            `).join('')}
                        </div>

                        <div style="display:flex; gap: 15px; border-top: 1px dashed #ff9800; padding-top: 15px;">
                            <div style="flex:1;">
                                <label style="font-size: 13px; margin-top:0;">حد تكرار نفس النص (نسخ لصق):</label>
                                <input type="number" id="spamDuplicateLimit" value="${config.spamDuplicateLimit}" min="2" max="15">
                            </div>
                            <div style="flex:1;">
                                <label style="font-size: 13px; margin-top:0;">الإجراء عند الرصد (الحذف مؤكد):</label>
                                <select id="spamAction" style="padding: 5px;">
                                    <option value="poll" ${config.spamAction === 'poll' ? 'selected' : ''}>تصويت للإدارة</option>
                                    <option value="auto" ${config.spamAction === 'auto' ? 'selected' : ''}>طرد تلقائي وحظر</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="switch-container">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="enableWordFilter" ${config.enableWordFilter ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold;">تفعيل فلتر الكلمات الممنوعة</span>
                        </div>
                    </div>

                    <div class="switch-container" style="border-color: var(--status-text);">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="enableAIFilter" ${config.enableAIFilter ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold; color: var(--status-text);">تفعيل المشرف الذكي (AI) للنصوص</span>
                        </div>
                        <button type="button" class="add-btn" style="background: #0277bd; padding: 8px 15px;" onclick="openOllamaModal()">⚙️ إعدادات خادم AI</button>
                    </div>

                    <div class="switch-container" style="border-color: #9c27b0; background: rgba(156, 39, 176, 0.05);">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="enableAIMedia" ${config.enableAIMedia ? 'checked' : ''}>
                                <span class="slider" style="background-color: #ccc;"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold; color: #9c27b0;">تفعيل تحليل الصور للمشرف الذكي (يتطلب نموذج Vision)</span>
                        </div>
                    </div>

                    <div class="switch-container" style="border-color: #e91e63; background: rgba(233, 30, 99, 0.05);">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="autoAction" ${config.autoAction ? 'checked' : ''}>
                                <span class="slider" style="background-color: #ccc;"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold; color: #e91e63;">تفعيل الحذف والإبلاغ المباشر للمخالفات الأخرى</span>
                        </div>
                    </div>

                    <div id="aiPromptContainer" style="margin-top: 15px; padding: 15px; background: var(--status-bg); border-radius: 8px; border: 1px dashed var(--status-text);">
                        <label style="margin-top:0; color: var(--status-text);">تعليمات الذكاء الاصطناعي (وصف المحتوى الممنوع):</label>
                        <textarea id="aiPromptText" rows="3">${config.aiPrompt}</textarea>
                    </div>

                    <label style="border-top: 1px solid var(--card-border); padding-top: 15px;">معرّف (ID) مجموعة الإدارة (لتلقي التنبيهات):</label>
                    <input type="text" id="defaultAdminGroup" value="${config.defaultAdminGroup}" dir="ltr" style="text-align: left;">

                    <label>الكلمات الممنوعة الافتراضية:</label>
                    <div class="flex-input">
                        <input type="text" id="newDefaultWord" placeholder="أدخل الكلمة الممنوعة هنا..." onkeypress="if(event.key === 'Enter') { event.preventDefault(); addDefaultWord(); }">
                        <button type="button" class="add-btn" onclick="addDefaultWord()">+ إضافة كلمة</button>
                    </div>
                    <div id="defaultWordsContainer" class="chip-container"></div>
                </div>

                <h3 style="margin-top: 30px; border-bottom: 2px solid var(--card-border); padding-bottom: 10px;">📋 المجموعات المخصصة (جدول Custom Groups)</h3>
                <div id="groupsContainer"></div>
                
                <button type="button" class="add-btn" style="width:100%; padding:15px; margin-top:15px; background:#0277bd;" onclick="addGroup()">+ إضافة إعدادات لمجموعة جديدة</button>

                <button type="submit" class="save-btn">💾 تطبيق وحفظ في الجداول (Commit to Database)</button>
                <div id="msg" class="success">✅ تم تحديث جميع الجداول بنجاح.</div>
            </form>
        </div>

        <div id="ollamaModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="closeOllamaModal()">&times;</span>
                <h3 style="margin-top: 0; color: var(--status-text); border-bottom: 1px solid var(--card-border); padding-bottom: 10px;">🔗 إعدادات محرك الذكاء الاصطناعي (جدول LLM)</h3>
                <label>رابط الخادم (Endpoint URL):</label>
                <input type="text" id="ollamaUrl" value="${config.ollamaUrl}" dir="ltr" style="text-align: left;">
                <label>اسم النموذج (يجب أن يكون نموذج Vision إذا أردت تحليل الصور، مثل llava):</label>
                <input type="text" id="ollamaModel" value="${config.ollamaModel}" dir="ltr" style="text-align: left;">
                <button type="button" class="add-btn" style="width: 100%; margin-top: 20px; padding: 12px; background: var(--status-text);" onclick="closeOllamaModal()">إغلاق</button>
            </div>
        </div>

        <div id="debuggerModal" class="modal">
            <div class="modal-content" style="max-width: 800px; background: #1e1e1e; border-color: #333;">
                <span class="close-modal" style="color: #fff;" onclick="closeDebuggerModal()">&times;</span>
                <h3 style="margin-top: 0; color: #25d366; border-bottom: 1px solid #333; padding-bottom: 10px;">🐞 سجل الأحداث المباشر (Live Debugger)</h3>
                <div id="terminalOutput"></div>
                <button type="button" class="add-btn" style="width: 100%; margin-top: 20px; padding: 12px; background: #333; color: #fff;" onclick="closeDebuggerModal()">إغلاق السجل</button>
            </div>
        </div>
        
        <script>
            const themeBtn = document.getElementById('themeToggle');
            const currentTheme = localStorage.getItem('theme') || 'light';
            if (currentTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeBtn.textContent = '☀️';
            }

            function toggleTheme() {
                let theme = document.documentElement.getAttribute('data-theme');
                if (theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'light');
                    localStorage.setItem('theme', 'light');
                    themeBtn.textContent = '🌙';
                } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                    themeBtn.textContent = '☀️';
                }
            }

            function openOllamaModal() { document.getElementById('ollamaModal').style.display = 'block'; }
            function closeOllamaModal() { document.getElementById('ollamaModal').style.display = 'none'; }
            
            let debuggerInterval;
            function openDebuggerModal() { 
                document.getElementById('debuggerModal').style.display = 'block'; 
                fetchLogs();
                debuggerInterval = setInterval(fetchLogs, 1500); 
            }
            function closeDebuggerModal() { 
                document.getElementById('debuggerModal').style.display = 'none'; 
                clearInterval(debuggerInterval);
            }

            window.onclick = function(event) {
                if (event.target == document.getElementById('ollamaModal')) closeOllamaModal();
                if (event.target == document.getElementById('debuggerModal')) closeDebuggerModal();
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
                        \`<label><input type="checkbox" value="\${t.id}" \${group.blockedTypes.includes(t.id)?'checked':''} onchange="updateGroupArray(\${groupIndex}, 'blockedTypes', '\${t.id}', this.checked)"> \${t.icon} \${t.name}</label>\`
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
                            <h4 style="margin:0;">إعدادات المجموعة رقم \${groupIndex + 1}</h4>
                            <button type="button" class="remove-btn" onclick="removeGroup(\${groupIndex})">حذف هذه المجموعة</button>
                        </div>
                        
                        <label>معرّف (ID) المجموعة المستهدفة:</label>
                        <input type="text" placeholder="مثال: 120363000000000000@g.us" dir="ltr" style="text-align: left;" value="\${group.id}" onchange="updateGroupData(\${groupIndex}, 'id', this.value)">

                        <label>معرّف مجموعة الإدارة (لتلقي تنبيهات هذه المجموعة فقط):</label>
                        <input type="text" placeholder="(اتركه فارغاً لاستخدام مجموعة الإدارة العامة)" dir="ltr" style="text-align: left;" value="\${group.adminGroup}" onchange="updateGroupData(\${groupIndex}, 'adminGroup', this.value)">

                        <div class="media-settings">
                            <h4 style="margin: 0 0 10px 0; color: #d32f2f;">🛑 المنع القطعي لأنواع الملفات لهذه المجموعة:</h4>
                            <div class="cb-group">\${blockedChecks}</div>
                            <label style="font-size: 13px; margin-top: 10px;">الإجراء عند الرصد:</label>
                            <select style="padding: 5px;" onchange="updateGroupData(\${groupIndex}, 'blockedAction', this.value)">
                                <option value="delete" \${group.blockedAction === 'delete' ? 'selected' : ''}>حذف الرسالة فقط</option>
                                <option value="poll" \${group.blockedAction === 'poll' ? 'selected' : ''}>حذف + تصويت للإدارة</option>
                                <option value="auto" \${group.blockedAction === 'auto' ? 'selected' : ''}>حذف + طرد تلقائي</option>
                            </select>
                        </div>

                        <div class="switch-container" style="border-color: #ff9800; background: rgba(255, 152, 0, 0.05); margin-top: 15px;">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableAntiSpam ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableAntiSpam', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #ff9800;">تفعيل الحماية من الإزعاج السريع (Anti-Spam)</span>
                            </div>
                        </div>
                        
                        <div class="spam-settings">
                            <h4 style="margin: 0 0 10px 0; color: #ff9800;">حدود الإزعاج لكل نوع (خلال 15 ثانية):</h4>
                            <div class="limit-grid">\${spamLimitGrid}</div>
                            
                            <div style="display:flex; gap: 15px; border-top: 1px dashed #ff9800; padding-top: 15px;">
                                <div style="flex:1;">
                                    <label style="font-size: 13px; margin-top:0;">تكرار نفس النص:</label>
                                    <input type="number" value="\${group.spamDuplicateLimit}" min="2" max="15" onchange="updateGroupData(\${groupIndex}, 'spamDuplicateLimit', parseInt(this.value))">
                                </div>
                                <div style="flex:1;">
                                    <label style="font-size: 13px; margin-top:0;">الإجراء عند الرصد:</label>
                                    <select style="padding: 5px;" onchange="updateGroupData(\${groupIndex}, 'spamAction', this.value)">
                                        <option value="poll" \${group.spamAction === 'poll' ? 'selected' : ''}>تصويت للإدارة</option>
                                        <option value="auto" \${group.spamAction === 'auto' ? 'selected' : ''}>طرد تلقائي</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #4caf50; background: rgba(76, 175, 80, 0.05); margin-top: 15px;">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableWelcomeMessage ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableWelcomeMessage', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #4caf50;">تفعيل رسالة ترحيبية عند الانضمام</span>
                            </div>
                        </div>
                        <div style="margin-top: 10px; padding: 10px; background: var(--input-bg); border-radius: 5px; border: 1px dashed #4caf50;">
                            <label style="margin-top:0; color: #4caf50; font-size: 13px;">نص الرسالة (استخدم {user} للمنشن):</label>
                            <textarea rows="2" onchange="updateGroupData(\${groupIndex}, 'welcomeMessageText', this.value)">\${group.welcomeMessageText}</textarea>
                        </div>

                        <div class="switch-container" style="border-color: #d32f2f; background: rgba(211, 47, 47, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableBlacklist ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableBlacklist', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #d32f2f;">تفعيل نظام القائمة السوداء لهذه المجموعة</span>
                            </div>
                        </div>

                        <div class="switch-container">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.useDefaultWords ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'useDefaultWords', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold;">تطبيق الكلمات الممنوعة العامة بالإضافة لكلمات المجموعة</span>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #ff9800; background: rgba(255, 152, 0, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableWordFilter ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableWordFilter', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #ff9800;">تفعيل الفلتر التقليدي (الكلمات الممنوعة)</span>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #0277bd; background: rgba(2, 119, 189, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableAIFilter ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableAIFilter', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #0277bd;">تفعيل المشرف الذكي (AI) لهذه المجموعة</span>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #9c27b0; background: rgba(156, 39, 176, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableAIMedia ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableAIMedia', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #9c27b0;">تفعيل تحليل الصور للمشرف الذكي (Vision)</span>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #e91e63; background: rgba(233, 30, 99, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.autoAction ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'autoAction', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #e91e63;">تفعيل الحذف المباشر (تخطي تصويت الإدارة) للمخالفات الأخرى</span>
                            </div>
                        </div>

                        <label>الكلمات الممنوعة المخصصة لهذه المجموعة فقط:</label>
                        <div class="flex-input">
                            <input type="text" id="newGroupWord_\${groupIndex}" placeholder="أدخل الكلمة..." onkeypress="if(event.key === 'Enter') { event.preventDefault(); addGroupWord(\${groupIndex}); }">
                            <button type="button" class="add-btn" onclick="addGroupWord(\${groupIndex})">+ إضافة كلمة</button>
                        </div>
                        <div class="chip-container">\${wordsHtml}</div>
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
                    
                    if(data.status.includes('متصل وجاهز')) {
                        document.getElementById('logoutBtn').style.display = 'inline-block';
                    } else {
                        document.getElementById('logoutBtn').style.display = 'none';
                    }

                    if(data.qr) {
                        document.getElementById('qr-image').src = data.qr;
                        document.getElementById('qr-image').style.display = 'block';
                    } else {
                        document.getElementById('qr-image').style.display = 'none';
                    }
                } catch(e) {}
            }, 2000);

            document.getElementById('configForm').onsubmit = async (e) => {
                e.preventDefault();
                
                let finalGroupsObj = {};
                groupsArr.forEach(g => {
                    if(g.id) {
                        finalGroupsObj[g.id] = g;
                    }
                });

                // تجميع الإعدادات العامة للسبام
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
                
                if(res.ok) {
                    document.getElementById('msg').style.display = 'block';
                    setTimeout(() => document.getElementById('msg').style.display = 'none', 4000);
                }
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
