const express = require('express');
const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const util = require('util'); 

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

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const configPath = './config.json';

if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
        enableWordFilter: true,
        enableAIFilter: false,
        enableAIMedia: false, 
        autoAction: false, 
        enableBlacklist: true, 
        aiPrompt: 'امنع أي رسالة تحتوي على إعلانات تجارية، أو ترويج لبيع إجازات مرضية وتقارير طبية.',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llava', 
        defaultAdminGroup: '120363424446982803@g.us',
        defaultWords: ['ســكــلــيف', 'اجــازة مرضـــية', 'تـــقريــر', '🏥', 'معتـــمد', 'مرضية', 'عذر طبي', 'تقرير طبي', 'عذر', 'سكليف', 'صحتي', 'تكاليف'],
        blacklist: [], 
        groupsConfig: {}
    }, null, 4));
}

let config = JSON.parse(fs.readFileSync(configPath));

if (typeof config.enableWordFilter === 'undefined') config.enableWordFilter = true;
if (typeof config.enableAIFilter === 'undefined') config.enableAIFilter = false;
if (typeof config.enableAIMedia === 'undefined') config.enableAIMedia = false;
if (typeof config.autoAction === 'undefined') config.autoAction = false;
if (typeof config.enableBlacklist === 'undefined') config.enableBlacklist = true;
if (typeof config.aiPrompt === 'undefined') config.aiPrompt = 'امنع أي رسالة تحتوي على إعلانات تجارية، أو ترويج لبيع إجازات مرضية وتقارير طبية.';
if (typeof config.ollamaUrl === 'undefined') config.ollamaUrl = 'http://localhost:11434';
if (typeof config.ollamaModel === 'undefined') config.ollamaModel = 'llava';
if (typeof config.blacklist === 'undefined') config.blacklist = [];

let currentQR = '';
let botStatus = 'جاري تهيئة النظام وبدء التشغيل...';

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar" data-theme="light">
    <head>
        <meta charset="UTF-8">
        <title>لوحة تحكم المشرف الآلي</title>
        <style>
            :root {
                --bg-color: #f0f2f5;
                --container-bg: #ffffff;
                --text-main: #333333;
                --text-heading: #075e54;
                --input-bg: #ffffff;
                --input-border: #cccccc;
                --card-border: #dddddd;
                --chip-bg: #dcf8c6;
                --chip-text: #075e54;
                --chip-border: #b2e289;
                --status-bg: #e1f5fe;
                --status-border: #b3e5fc;
                --status-text: #0277bd;
                --modal-bg: rgba(0,0,0,0.5);
            }

            [data-theme="dark"] {
                --bg-color: #121212;
                --container-bg: #1e1e1e;
                --text-main: #e4e6eb;
                --text-heading: #25d366;
                --input-bg: #3a3b3c;
                --input-border: #555555;
                --card-border: #3a3b3c;
                --chip-bg: #2a3942;
                --chip-text: #e4e6eb;
                --chip-border: #111b21;
                --status-bg: #112a34;
                --status-border: #0b1a20;
                --status-text: #4fc3f7;
                --modal-bg: rgba(0,0,0,0.7);
            }

            body { font-family: Tahoma, Arial; background: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; transition: background 0.3s, color 0.3s; }
            .container { max-width: 800px; margin: auto; background: var(--container-bg); padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); position: relative; transition: background 0.3s; }
            h1 { color: var(--text-heading); text-align: center; border-bottom: 2px solid var(--card-border); padding-bottom: 15px; }
            .status-box { text-align: center; padding: 20px; background: var(--status-bg); border-radius: 8px; margin-bottom: 25px; border: 1px solid var(--status-border); }
            .status-box h2 { margin: 0 0 10px 0; color: var(--status-text); font-size: 20px; }
            label { font-weight: bold; display: block; margin-top: 20px; color: var(--text-main); }
            input, textarea { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid var(--input-border); border-radius: 5px; box-sizing: border-box; font-size: 14px; background: var(--input-bg); color: var(--text-main); transition: 0.3s; }
            textarea { resize: vertical; }
            .flex-input { display: flex; gap: 10px; margin-top: 5px; }
            .flex-input input { margin-top: 0; }
            .add-btn { background: #25d366; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; white-space: nowrap; transition: 0.3s;}
            .add-btn:hover { background: #1ebe57; }
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
            <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" title="تبديل المظهر (فاتح/داكن)">🌙</button>

            <h1>⚙️ إعدادات المشرف الآلي (لوحة التحكم)</h1>
            
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
                    <h3 style="margin-top:0; color: #d32f2f;">🚫 القائمة السوداء العالمية (الطرد التلقائي)</h3>
                    <p style="font-size: 13px; color: #666; margin-top: -5px;">أي رقم يتم إضافته هنا سيتم طرده تلقائياً بمجرد محاولته دخول أي مجموعة مفعل فيها الخيار.</p>
                    
                    <label style="color: #d32f2f;">أرقام المخالفين (اكتب الرقم مباشرة وسيتم تجهيزه تلقائياً):</label>
                    <div class="flex-input">
                        <input type="text" id="newBlacklistNumber" placeholder="مثال: 966582014941" onkeypress="if(event.key === 'Enter') { event.preventDefault(); addBlacklistNumber(); }">
                        <button type="button" class="add-btn" style="background: #d32f2f;" onclick="addBlacklistNumber()">+ إضافة حظر</button>
                    </div>
                    <div id="blacklistContainer" class="chip-container"></div>
                </div>

                <div class="group-card" style="border-color: var(--text-heading);">
                    <h3 style="margin-top:0; color: var(--text-heading);">🔧 الإعدادات العامة (تُطبق على جميع المجموعات)</h3>
                    
                    <div class="switch-container" style="border-color: #d32f2f; background: rgba(211, 47, 47, 0.05);">
                        <div class="switch-inner">
                            <label class="switch">
                                <input type="checkbox" id="enableBlacklist" ${config.enableBlacklist ? 'checked' : ''}>
                                <span class="slider" style="background-color: #ccc;"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold; color: #d32f2f;">تفعيل نظام القائمة السوداء للمجموعات العامة (منع الدخول والإضافة التلقائية)</span>
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
                            <span style="font-size: 14px; font-weight: bold; color: #e91e63;">تفعيل الحذف والإبلاغ المباشر (تخطي تصويت الإدارة)</span>
                        </div>
                    </div>

                    <div id="aiPromptContainer" style="margin-top: 15px; padding: 15px; background: var(--status-bg); border-radius: 8px; border: 1px dashed var(--status-text);">
                        <label style="margin-top:0; color: var(--status-text);">تعليمات الذكاء الاصطناعي (وصف المحتوى الممنوع):</label>
                        <textarea id="aiPromptText" rows="3" placeholder="مثال: قم بمنع أي رسالة تروج للخدمات...">${config.aiPrompt}</textarea>
                    </div>

                    <label style="border-top: 1px solid var(--card-border); padding-top: 15px;">معرّف (ID) مجموعة الإدارة (لتلقي التنبيهات):</label>
                    <input type="text" id="defaultAdminGroup" value="${config.defaultAdminGroup}" dir="ltr" style="text-align: left;">

                    <label>الكلمات الممنوعة:</label>
                    <div class="flex-input">
                        <input type="text" id="newDefaultWord" placeholder="أدخل الكلمة الممنوعة هنا..." onkeypress="if(event.key === 'Enter') { event.preventDefault(); addDefaultWord(); }">
                        <button type="button" class="add-btn" onclick="addDefaultWord()">+ إضافة كلمة</button>
                    </div>
                    <div id="defaultWordsContainer" class="chip-container"></div>
                </div>

                <h3 style="margin-top: 30px; border-bottom: 2px solid var(--card-border); padding-bottom: 10px;">📋 إعدادات المجموعات المخصصة (استثناءات)</h3>
                <div id="groupsContainer"></div>
                
                <button type="button" class="add-btn" style="width:100%; padding:15px; margin-top:15px; background:#0277bd;" onclick="addGroup()">+ إضافة إعدادات لمجموعة جديدة</button>

                <button type="submit" class="save-btn">💾 حفظ الإعدادات وتطبيقها فوراً</button>
                <div id="msg" class="success">✅ تم حفظ الإعدادات بنجاح، وهي قيد العمل الآن.</div>
            </form>
        </div>

        <div id="ollamaModal" class="modal">
            <div class="modal-content">
                <span class="close-modal" onclick="closeOllamaModal()">&times;</span>
                <h3 style="margin-top: 0; color: var(--status-text); border-bottom: 1px solid var(--card-border); padding-bottom: 10px;">🔗 إعدادات ربط محرك الذكاء الاصطناعي (Ollama)</h3>
                <label>رابط الخادم (Endpoint URL):</label>
                <input type="text" id="ollamaUrl" value="${config.ollamaUrl}" dir="ltr" style="text-align: left;">
                <label>اسم النموذج (يجب أن يكون نموذج Vision إذا أردت تحليل الصور، مثل llava):</label>
                <input type="text" id="ollamaModel" value="${config.ollamaModel}" dir="ltr" style="text-align: left;">
                <button type="button" class="add-btn" style="width: 100%; margin-top: 20px; padding: 12px; background: var(--status-text);" onclick="closeOllamaModal()">حفظ وإغلاق</button>
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
                                      .replace(/\\[أمان\\]/g, '<span style="color:#ff9800">[أمان]</span>');
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

            let defaultWordsArr = ${JSON.stringify(config.defaultWords)};
            let blacklistArr = ${JSON.stringify(config.blacklist)}; 
            let groupsConfigObj = ${JSON.stringify(config.groupsConfig)};
            
            let groupsArr = Object.keys(groupsConfigObj).map(key => ({
                id: key,
                adminGroup: groupsConfigObj[key].adminGroup || '',
                words: groupsConfigObj[key].words || [],
                useDefaultWords: groupsConfigObj[key].useDefaultWords !== false,
                enableWordFilter: groupsConfigObj[key].enableWordFilter !== false,
                enableAIFilter: groupsConfigObj[key].enableAIFilter || false,
                enableAIMedia: groupsConfigObj[key].enableAIMedia || false,
                autoAction: groupsConfigObj[key].autoAction || false,
                enableBlacklist: groupsConfigObj[key].enableBlacklist !== false 
            }));

            function renderBlacklist() {
                const container = document.getElementById('blacklistContainer');
                container.innerHTML = '';
                blacklistArr.forEach((number, index) => {
                    container.innerHTML += \`<div class="chip blacklist-chip">\${number} <span onclick="removeBlacklistNumber(\${index})">&times;</span></div>\`;
                });
            }

            function addBlacklistNumber() {
                const input = document.getElementById('newBlacklistNumber');
                let rawValue = input.value;
                let justNumbers = rawValue.replace(/\\D/g, '');
                
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!blacklistArr.includes(finalId)) {
                        blacklistArr.push(finalId);
                    }
                }
                
                input.value = '';
                renderBlacklist();
            }

            function removeBlacklistNumber(index) {
                blacklistArr.splice(index, 1);
                renderBlacklist();
            }

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

            function renderGroups() {
                const container = document.getElementById('groupsContainer');
                container.innerHTML = '';
                groupsArr.forEach((group, groupIndex) => {
                    let wordsHtml = group.words.map((word, wordIndex) => 
                        \`<div class="chip">\${word} <span onclick="removeGroupWord(\${groupIndex}, \${wordIndex})">&times;</span></div>\`
                    ).join('');

                    container.innerHTML += \`
                    <div class="group-card">
                        <div class="group-card-header">
                            <h4 style="margin:0;">إعدادات المجموعة رقم \${groupIndex + 1}</h4>
                            <button type="button" class="remove-btn" onclick="removeGroup(\${groupIndex})">حذف إعدادات هذه المجموعة</button>
                        </div>
                        
                        <label>معرّف (ID) المجموعة المستهدفة:</label>
                        <input type="text" placeholder="مثال: 120363000000000000@g.us" dir="ltr" style="text-align: left;" value="\${group.id}" onchange="updateGroupData(\${groupIndex}, 'id', this.value)">

                        <label>معرّف مجموعة الإدارة (لتلقي تنبيهات هذه المجموعة فقط):</label>
                        <input type="text" placeholder="(اتركه فارغاً لاستخدام مجموعة الإدارة العامة)" dir="ltr" style="text-align: left;" value="\${group.adminGroup}" onchange="updateGroupData(\${groupIndex}, 'adminGroup', this.value)">

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
                                <span style="font-size: 14px; font-weight: bold;">تطبيق الكلمات الممنوعة العامة بالإضافة لكلمات هذه المجموعة</span>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #ff9800; background: rgba(255, 152, 0, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.enableWordFilter ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'enableWordFilter', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #ff9800;">تفعيل الفلتر التقليدي (الكلمات الممنوعة) لهذه المجموعة</span>
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
                                <span style="font-size: 14px; font-weight: bold; color: #9c27b0;">تفعيل تحليل الصور للمشرف الذكي في هذه المجموعة</span>
                            </div>
                        </div>

                        <div class="switch-container" style="border-color: #e91e63; background: rgba(233, 30, 99, 0.05);">
                            <div class="switch-inner">
                                <label class="switch">
                                    <input type="checkbox" \${group.autoAction ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, 'autoAction', this.checked)">
                                    <span class="slider" style="background-color: #ccc;"></span>
                                </label>
                                <span style="font-size: 14px; font-weight: bold; color: #e91e63;">تفعيل الحذف والإبلاغ المباشر (تخطي تصويت الإدارة) لهذه المجموعة</span>
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
                groupsArr.push({ id: '', adminGroup: '', words: [], useDefaultWords: true, enableWordFilter: true, enableAIFilter: false, enableAIMedia: false, autoAction: false, enableBlacklist: true });
                renderGroups();
            }

            function removeGroup(index) {
                if(confirm('هل أنت متأكد من رغبتك في حذف الإعدادات المخصصة لهذه المجموعة؟')) {
                    groupsArr.splice(index, 1);
                    renderGroups();
                }
            }

            function updateGroupData(index, field, value) {
                groupsArr[index][field] = value.trim();
            }

            function updateGroupToggle(index, field, isChecked) {
                groupsArr[index][field] = isChecked;
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
                        finalGroupsObj[g.id] = {
                            adminGroup: g.adminGroup,
                            words: g.words,
                            useDefaultWords: g.useDefaultWords,
                            enableWordFilter: g.enableWordFilter,
                            enableAIFilter: g.enableAIFilter,
                            enableAIMedia: g.enableAIMedia,
                            autoAction: g.autoAction,
                            enableBlacklist: g.enableBlacklist 
                        };
                    }
                });

                const newConfig = {
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
                    blacklist: blacklistArr, 
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

app.get('/api/status', (req, res) => res.json({ qr: currentQR, status: botStatus }));
app.get('/api/logs', (req, res) => res.json(logsHistory));

app.post('/api/logout', async (req, res) => {
    try {
        botStatus = 'جاري إنهاء الجلسة...';
        await client.logout();
        res.sendStatus(200);
    } catch (error) {
        console.error('حدث خطأ أثناء إنهاء الجلسة:', error);
        res.sendStatus(500);
    }
});

app.post('/save', (req, res) => {
    config = req.body;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log('[فحص] 💾 تم حفظ إعدادات النظام بنجاح.');
    res.sendStatus(200);
});

app.listen(3000, () => console.log('لوحة التحكم تعمل الآن عبر المنفذ 3000...'));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', async (qr) => {
    botStatus = 'بانتظار مسح رمز الاستجابة السريعة (QR Code)...';
    currentQR = await qrcode.toDataURL(qr);
    console.log('تم إنشاء رمز الدخول. يرجى فتح لوحة التحكم في المتصفح لمسحه.');
});

client.on('ready', async () => {
    botStatus = 'متصل وجاهز للعمل ✅';
    currentQR = '';
    console.log('تم ربط حساب واتساب بنجاح، البوت يعمل الآن!');
    
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
    console.log('تم قطع الاتصال بالخادم الداخلي:', reason);
    botStatus = 'تم تسجيل الخروج من الحساب. جاري إعادة تشغيل النظام...';
    currentQR = '';
    
    try {
        await client.destroy();
    } catch(e) {}
    
    setTimeout(() => {
        client.initialize();
    }, 3000);
});

const pendingBans = new Map();

client.on('group_join', async (notification) => {
    try {
        console.log(`[معلومة] 🔔 حدث انضمام جديد في مجموعة: ${notification.chatId}`);
        
        if (!config.blacklist || config.blacklist.length === 0) return;
        
        const chat = await notification.getChat();
        const groupId = chat.id._serialized;
        const groupConfig = config.groupsConfig[groupId];
        
        let isBlacklistEnabledForGroup = config.enableBlacklist;
        if (groupConfig && typeof groupConfig.enableBlacklist !== 'undefined') {
            isBlacklistEnabledForGroup = groupConfig.enableBlacklist;
        }

        if (!isBlacklistEnabledForGroup) return;

        for (const participantId of notification.recipientIds) {
            let cleanJoinedId = participantId.replace(/:[0-9]+/, '');
            
            // 🧹 حل مشكلة معرّفات @lid (Local ID) التي تصدرها واتساب
            if (cleanJoinedId.includes('@lid')) {
                try {
                    const contact = await client.getContactById(participantId);
                    if (contact && contact.number) {
                        cleanJoinedId = `${contact.number}@c.us`;
                    } else {
                        cleanJoinedId = cleanJoinedId.replace('@lid', '@c.us');
                    }
                } catch(e) {
                    cleanJoinedId = cleanJoinedId.replace('@lid', '@c.us');
                }
            }

            console.log(`[فحص] فحص الرقم المنضم: ${cleanJoinedId}`);

            if (config.blacklist.includes(cleanJoinedId)) {
                console.log(`[أمان] 🛡️ تنبيه: محاولة دخول من رقم محظور (${cleanJoinedId}) في مجموعة (${chat.name}). جاري الطرد...`);
                
                // ⏱️ تأخير تكتيكي (ثانيتين) لتجنب مشكلة Race Condition في خوادم واتساب
                setTimeout(async () => {
                    try {
                        await chat.removeParticipants([participantId]);
                        console.log(`[أمان] ✅ تم طرد الرقم المحظور بنجاح من مساحة: ${chat.name}`);
                        
                        const targetAdminGroup = groupConfig?.adminGroup || config.defaultAdminGroup;
                        const reportText = `🛡️ *تنبيه حماية (القائمة السوداء)*\nحاول رقم محظور مسبقاً الدخول (عبر رابط أو إضافة) إلى مجموعة "${chat.name}" وتم طرده فوراً.\n\nالرقم المحظور: @${cleanJoinedId.split('@')[0]}`;
                        
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [cleanJoinedId] });
                    } catch(err) {
                        console.error('[خطأ] فشل الطرد الفعلي بعد الانضمام:', err.message);
                    }
                }, 2000);
            }
        }
    } catch (error) {
        console.error('[خطأ] حدث خطأ في نظام المراقبة عند الانضمام:', error.message);
    }
});

client.on('message', async msg => {
    try {
        const chat = await msg.getChat();

        if (chat.isGroup) {
            if (msg.fromMe) return;

            const rawAuthorId = msg.author || msg.from;
            let cleanAuthorId = rawAuthorId.replace(/:[0-9]+/, '');

            // 🧹 حل مشكلة معرّفات @lid عند إرسال رسالة
            if (cleanAuthorId.includes('@lid')) {
                try {
                    const contact = await msg.getContact();
                    if (contact && contact.number) {
                        cleanAuthorId = `${contact.number}@c.us`;
                    } else {
                        cleanAuthorId = cleanAuthorId.replace('@lid', '@c.us');
                    }
                } catch(e) {
                    cleanAuthorId = cleanAuthorId.replace('@lid', '@c.us');
                }
            }

            const groupId = chat.id._serialized;
            const groupConfig = config.groupsConfig[groupId];
            
            let forbiddenWords = [];
            let targetAdminGroup = config.defaultAdminGroup;
            let isWordFilterEnabledForThisGroup = config.enableWordFilter;
            let isAIFilterEnabledForThisGroup = config.enableAIFilter; 
            let isAIMediaEnabledForThisGroup = config.enableAIMedia; 
            let isAutoActionEnabledForThisGroup = config.autoAction; 
            let isBlacklistEnabledForThisGroup = config.enableBlacklist; 

            if (groupConfig) {
                targetAdminGroup = groupConfig.adminGroup || config.defaultAdminGroup;
                
                if (typeof groupConfig.enableWordFilter !== 'undefined') isWordFilterEnabledForThisGroup = groupConfig.enableWordFilter;
                if (typeof groupConfig.enableAIFilter !== 'undefined') isAIFilterEnabledForThisGroup = groupConfig.enableAIFilter;
                if (typeof groupConfig.enableAIMedia !== 'undefined') isAIMediaEnabledForThisGroup = groupConfig.enableAIMedia;
                if (typeof groupConfig.autoAction !== 'undefined') isAutoActionEnabledForThisGroup = groupConfig.autoAction;
                if (typeof groupConfig.enableBlacklist !== 'undefined') isBlacklistEnabledForThisGroup = groupConfig.enableBlacklist;
                
                if (groupConfig.useDefaultWords !== false) forbiddenWords = [...config.defaultWords];
                if (groupConfig.words && groupConfig.words.length > 0) forbiddenWords = [...forbiddenWords, ...groupConfig.words];
            } else {
                forbiddenWords = [...config.defaultWords];
            }

            if (isBlacklistEnabledForThisGroup && config.blacklist && config.blacklist.includes(cleanAuthorId)) {
                console.log(`[أمان] 🛡️ رقم محظور أرسل رسالة في مجموعة مفعل فيها الحماية. سيتم حذفه وطرده.`);
                await msg.delete(true);
                await chat.removeParticipants([rawAuthorId]);
                return; 
            }

            console.log(`[فحص] متابعة رسالة في (${chat.name}) | كلمات(${isWordFilterEnabledForThisGroup})، ذكي(${isAIFilterEnabledForThisGroup})، تلقائي(${isAutoActionEnabledForThisGroup})`);

            let isViolating = false;
            let violationReason = '';

            const isMediaContent = msg.hasMedia || msg.type === 'image' || msg.type === 'video' || msg.type === 'audio' || msg.type === 'ptt' || msg.type === 'sticker' || msg.type === 'document';

            if (isWordFilterEnabledForThisGroup && forbiddenWords.length > 0 && msg.body) {
                const matchedWord = forbiddenWords.find(word => msg.body.includes(word));
                if (matchedWord) {
                    isViolating = true;
                    violationReason = `تطابق تام مع الكلمة المحظورة: [${matchedWord}]`;
                    console.log(`[فحص] تم اكتشاف مخالفة صريحة للكلمات.`);
                }
            }

            let canSendToAI = false;
            let base64Image = null;

            if (!isViolating && isAIFilterEnabledForThisGroup) {
                if (!isMediaContent) {
                    if (msg.body && msg.body.trim().length > 0) canSendToAI = true;
                } else {
                    if (isAIMediaEnabledForThisGroup) {
                        canSendToAI = true;
                        if (msg.type === 'image') {
                            try {
                                console.log(`[معلومة] جاري تحميل الصورة لإرسالها لمحرك الرؤية (Vision)...`);
                                const media = await msg.downloadMedia();
                                if (media && media.data) {
                                    base64Image = media.data;
                                }
                            } catch (err) {
                                console.error('[خطأ] فشل تحميل المرفق للتحليل:', err.message);
                            }
                        }
                    } else if (msg.body && msg.body.trim().length > 0) {
                        canSendToAI = true;
                        console.log(`[فحص] تحليل الصور معطل، سيتم فحص النص المرافق للملف فقط.`);
                    } else {
                        console.log(`[فحص] تم تخطي الرسالة (مرفق بدون نص، وخيار تحليل الصور معطل).`);
                    }
                }
            }

            if (canSendToAI) {
                console.log(`[فحص] يتم الآن عرض المحتوى على المشرف الذكي للتقييم...`);
                try {
                    const msgText = msg.body || '[صورة بدون نص مرفق]';
                    const aiPromptText = `أنت مشرف مجموعة صارم. تعليماتك هي: ${config.aiPrompt}\n\nبناء على التعليمات، هل هذا المحتوى (النص أو الصورة) يعتبر مخالف؟ أجب بكلمة "نعم" أو "لا" فقط وبدون أي إضافات.\nالمحتوى: "${msgText}"`;
                    
                    const payload = {
                        model: config.ollamaModel,
                        prompt: aiPromptText,
                        stream: false
                    };

                    if (base64Image) {
                        payload.images = [base64Image];
                    }

                    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    const data = await response.json();
                    console.log(`[فحص] الرد الوارد من المشرف الذكي: ${data.response}`);
                    
                    if (data.response && data.response.includes('نعم')) {
                        isViolating = true;
                        violationReason = 'تم التصنيف كمخالفة عبر التحليل الذكي (AI)';
                    }
                } catch (error) {
                    console.error('[خطأ] فشل في تمرير المحتوى إلى المعالج المستقل:', error.message);
                }
            }

            if (isViolating) {
                const contact = await msg.getContact();
                let senderId = cleanAuthorId; 
                if (contact && contact.number) {
                    senderId = `${contact.number}@c.us`;
                }

                const messageContent = msg.body || '[مرفق وسائط]';
                await msg.delete(true); 
                console.log(`[فحص] تم إزالة المحتوى المخالف بنجاح.`);

                if (isAutoActionEnabledForThisGroup) {
                    try {
                        await chat.removeParticipants([rawAuthorId]);
                        
                        if (isBlacklistEnabledForThisGroup && !config.blacklist.includes(senderId)) {
                            config.blacklist.push(senderId);
                            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                            console.log(`[أمان] 🚫 تم إدراج الرقم في القائمة السوداء تلقائياً.`);
                        }

                        const reportText = `🚨 *تقرير إجراء وحظر تلقائي*\nتم مسح محتوى مخالف وطرد العضو من مجموعة "${chat.name}"${isBlacklistEnabledForThisGroup ? ' وإدراجه في القائمة السوداء' : ''}.\n\n👤 *المرسل:* @${senderId.split('@')[0]}\n📋 *سبب الإزالة:* ${violationReason}\n📝 *النص الممسوح:*\n"${messageContent}"`;
                        await client.sendMessage(targetAdminGroup, reportText, { mentions: [senderId] });

                    } catch(e) {
                        console.error('[خطأ] تعذر الطرد التلقائي:', e.message);
                    }

                } else {
                    const pollOptions = isBlacklistEnabledForThisGroup ? ['نعم، طرد وحظر (للقائمة السوداء)', 'لا، اكتف بالحذف'] : ['نعم، طرد العضو', 'لا، اكتف بالحذف'];
                    
                    const pollTitle = `🚨 إشعار بوجود محتوى مخالف في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالسبب: ${violationReason}\nالنص:\n"${messageContent}"\n\nهل ترغب في طرد هذا الرقم${isBlacklistEnabledForThisGroup ? ' وإضافته للقائمة السوداء' : ''}؟`;
                    const poll = new Poll(pollTitle, pollOptions);
                    
                    const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });

                    pendingBans.set(pollMsg.id._serialized, {
                        senderId: senderId,
                        pollMsg: pollMsg,
                        isBlacklistEnabled: isBlacklistEnabledForThisGroup
                    });
                    console.log(`[فحص] تم فتح بطاقة تصويت لمجموعة الإدارة.`);
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

            console.log(`[فحص] تم استلام قرار التدخل البشري: ${selectedOption}`);

            if (selectedOption.includes('نعم')) {
                if (data.isBlacklistEnabled && !config.blacklist.includes(userToBan)) {
                    config.blacklist.push(userToBan);
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                    console.log(`[أمان] 🚫 تم إضافة الرقم ${userToBan} إلى القائمة السوداء.`);
                }

                const botId = client.info.wid._serialized;
                const chats = await client.getChats();
                
                for (const chat of chats) {
                    if (chat.isGroup) {
                        let botIsAdmin = false;
                        const botData = chat.participants.find(p => p.id._serialized === botId);
                        if (botData) botIsAdmin = botData.isAdmin || botData.isSuperAdmin;

                        if (botIsAdmin) {
                            try {
                                await chat.removeParticipants([userToBan]);
                                console.log(`[فحص] تم تنفيذ الإبعاد في مساحة: ${chat.name}`);
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