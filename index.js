const express = require('express');
const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const configPath = './config.json';

// إنشاء الإعدادات الافتراضية إذا لم تكن موجودة
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
        defaultAdminGroup: '120363424446982803@g.us',
        defaultWords: ['ســكــلــيف', 'اجــازة مرضـــية', 'تـــقريــر', '🏥', 'معتـــمد', 'مرضية', 'عذر طبي', 'تقرير طبي', 'عذر', 'سكليف', 'صحتي', 'تكاليف'],
        groupsConfig: {
            '120363000000000001@g.us': {
                words: ['تسويق', 'إعلان', 'روابط'],
                adminGroup: '',
                useDefaultWords: true
            }
        }
    }, null, 4));
}

let config = JSON.parse(fs.readFileSync(configPath));
let currentQR = '';
let botStatus = 'جاري التهيئة والتشغيل...';

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar" data-theme="light">
    <head>
        <meta charset="UTF-8">
        <title>لوحة تحكم النظام</title>
        <style>
            /* متغيرات الألوان */
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
            }

            body { font-family: Tahoma, Arial; background: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; transition: background 0.3s, color 0.3s; }
            .container { max-width: 800px; margin: auto; background: var(--container-bg); padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); position: relative; transition: background 0.3s; }
            h1 { color: var(--text-heading); text-align: center; border-bottom: 2px solid var(--card-border); padding-bottom: 15px; }
            .status-box { text-align: center; padding: 20px; background: var(--status-bg); border-radius: 8px; margin-bottom: 25px; border: 1px solid var(--status-border); }
            .status-box h2 { margin: 0 0 10px 0; color: var(--status-text); font-size: 20px; }
            label { font-weight: bold; display: block; margin-top: 20px; color: var(--text-main); }
            input { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid var(--input-border); border-radius: 5px; box-sizing: border-box; font-size: 14px; background: var(--input-bg); color: var(--text-main); transition: 0.3s; }
            .flex-input { display: flex; gap: 10px; margin-top: 5px; }
            .flex-input input { margin-top: 0; }
            .add-btn { background: #25d366; color: white; border: none; padding: 0 20px; font-weight: bold; border-radius: 5px; cursor: pointer; white-space: nowrap; transition: 0.3s;}
            .add-btn:hover { background: #1ebe57; }
            .chip-container { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding: 10px; background: var(--input-bg); border-radius: 5px; min-height: 40px; border: 1px dashed var(--input-border); }
            .chip { background: var(--chip-bg); color: var(--chip-text); padding: 5px 12px; border-radius: 15px; font-size: 13px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--chip-border); }
            .chip span { cursor: pointer; color: #ff5252; font-weight: bold; font-size: 16px; }
            .chip span:hover { color: #d32f2f; }
            .group-card { background: var(--container-bg); border: 1px solid var(--card-border); padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: 0.3s; }
            .group-card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 10px; margin-bottom: 10px;}
            .remove-btn { background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
            .save-btn { background: #128c7e; color: white; border: none; padding: 15px; font-size: 18px; font-weight: bold; border-radius: 5px; cursor: pointer; margin-top: 30px; width: 100%; transition: 0.3s; }
            .save-btn:hover { background: #075e54; }
            .success { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; text-align: center; display: none; margin-top: 15px; border: 1px solid #c3e6cb; }
            .theme-toggle { position: absolute; top: 20px; left: 20px; background: none; border: none; font-size: 24px; cursor: pointer; padding: 5px; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transition: background 0.3s; }
            .theme-toggle:hover { background: rgba(128,128,128,0.2); }

            /* تصميم زر الـ Switch */
            .switch-container { display: flex; align-items: center; gap: 15px; margin-top: 15px; background: var(--input-bg); padding: 12px; border-radius: 5px; border: 1px solid var(--input-border); }
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; margin: 0; flex-shrink: 0; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: #25d366; }
            input:checked + .slider:before { transform: translateX(20px); }
        </style>
    </head>
    <body>
        <div class="container">
            <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" title="تبديل المظهر">🌙</button>

            <h1>⚙️ إعدادات الإشراف والحماية (واجهة مرئية)</h1>
            
            <div class="status-box">
                <h2>حالة الاتصال: <span id="status-text">${botStatus}</span></h2>
                <img id="qr-image" src="" style="display:none; max-width: 250px; margin: 15px auto 0; border: 10px solid white; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);" />
            </div>

            <form id="configForm">
                <div class="group-card" style="border-color: var(--text-heading);">
                    <h3 style="margin-top:0; color: var(--text-heading);">🔧 الإعدادات العامة (الافتراضية)</h3>
                    <label>معرف قروب الإدارة (لتلقي التنبيهات والتصويتات):</label>
                    <input type="text" id="defaultAdminGroup" value="${config.defaultAdminGroup}" dir="ltr" style="text-align: left;">

                    <label>قائمة الكلمات الممنوعة الافتراضية:</label>
                    <div class="flex-input">
                        <input type="text" id="newDefaultWord" placeholder="اكتب الكلمة الممنوعة هنا..." onkeypress="if(event.key === 'Enter') { event.preventDefault(); addDefaultWord(); }">
                        <button type="button" class="add-btn" onclick="addDefaultWord()">+ إضافة</button>
                    </div>
                    <div id="defaultWordsContainer" class="chip-container"></div>
                </div>

                <h3 style="margin-top: 30px; border-bottom: 2px solid var(--card-border); padding-bottom: 10px;">📋 تخصيص المجموعات المستقلة</h3>
                <div id="groupsContainer"></div>
                
                <button type="button" class="add-btn" style="width:100%; padding:15px; margin-top:15px; background:#0277bd;" onclick="addGroup()">+ إضافة قروب مخصص جديد</button>

                <button type="submit" class="save-btn">💾 حفظ وتطبيق التعديلات فوراً</button>
                <div id="msg" class="success">✅ تم الحفظ بنجاح! التعديلات تعمل الآن.</div>
            </form>
        </div>
        
        <script>
            // تفعيل الوضع الليلي
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

            let defaultWordsArr = ${JSON.stringify(config.defaultWords)};
            let groupsConfigObj = ${JSON.stringify(config.groupsConfig)};
            
            let groupsArr = Object.keys(groupsConfigObj).map(key => ({
                id: key,
                adminGroup: groupsConfigObj[key].adminGroup || '',
                words: groupsConfigObj[key].words || [],
                useDefaultWords: groupsConfigObj[key].useDefaultWords !== false // افتراضيا مفعل
            }));

            // دوال الكلمات الافتراضية
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

            // دوال المجموعات المخصصة
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
                            <h4 style="margin:0;">قروب مخصص #\${groupIndex + 1}</h4>
                            <button type="button" class="remove-btn" onclick="removeGroup(\${groupIndex})">حذف هذا القروب</button>
                        </div>
                        
                        <label>معرف القروب (الهدف):</label>
                        <input type="text" placeholder="مثال: 120363000@g.us" dir="ltr" style="text-align: left;" value="\${group.id}" onchange="updateGroupData(\${groupIndex}, 'id', this.value)">

                        <label>معرف قروب الإدارة (الخاص بهذا القروب فقط):</label>
                        <input type="text" placeholder="اختياري (إذا تركته فارغ سيستخدم الإدارة الافتراضية)" dir="ltr" style="text-align: left;" value="\${group.adminGroup}" onchange="updateGroupData(\${groupIndex}, 'adminGroup', this.value)">

                        <div class="switch-container">
                            <label class="switch">
                                <input type="checkbox" \${group.useDefaultWords ? 'checked' : ''} onchange="updateGroupToggle(\${groupIndex}, this.checked)">
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 14px; font-weight: bold;">تطبيق الكلمات الافتراضية (بالإضافة للكلمات الخاصة بالأسفل)</span>
                        </div>

                        <label>الكلمات الممنوعة الخاصة بهذا القروب:</label>
                        <div class="flex-input">
                            <input type="text" id="newGroupWord_\${groupIndex}" placeholder="كلمة ممنوعة للقروب..." onkeypress="if(event.key === 'Enter') { event.preventDefault(); addGroupWord(\${groupIndex}); }">
                            <button type="button" class="add-btn" onclick="addGroupWord(\${groupIndex})">+ إضافة</button>
                        </div>
                        <div class="chip-container">\${wordsHtml}</div>
                    </div>
                    \`;
                });
            }

            function addGroup() {
                groupsArr.push({ id: '', adminGroup: '', words: [], useDefaultWords: true });
                renderGroups();
            }

            function removeGroup(index) {
                if(confirm('هل أنت متأكد من حذف إعدادات هذا القروب؟')) {
                    groupsArr.splice(index, 1);
                    renderGroups();
                }
            }

            function updateGroupData(index, field, value) {
                groupsArr[index][field] = value.trim();
            }

            function updateGroupToggle(index, isChecked) {
                groupsArr[index].useDefaultWords = isChecked;
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

            renderDefaultWords();
            renderGroups();

            // الاتصال بالخادم
            setInterval(async () => {
                try {
                    let res = await fetch('/api/status');
                    let data = await res.json();
                    document.getElementById('status-text').innerText = data.status;
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
                            useDefaultWords: g.useDefaultWords
                        };
                    }
                });

                const newConfig = {
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

app.get('/api/status', (req, res) => {
    res.json({ qr: currentQR, status: botStatus });
});

app.post('/save', (req, res) => {
    config = req.body;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    res.sendStatus(200);
});

app.listen(3000, () => console.log('لوحة التحكم تعمل عبر المتصفح على المنفذ 3000'));


// --- نظام الواتساب الخلفي ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', async (qr) => {
    botStatus = 'بانتظار مسح الرمز المربع...';
    currentQR = await qrcode.toDataURL(qr);
    console.log('تم إنشاء الرمز المربع، افتح المتصفح لمسحه.');
});

client.on('ready', async () => {
    botStatus = 'متصل وجاهز للعمل ✅';
    currentQR = '';
    console.log('النظام متصل وجاهز للعمل!');
    
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
    botStatus = 'تم تسجيل الدخول، جاري التجهيز...';
    currentQR = '';
});

const pendingBans = new Map();

client.on('message', async msg => {
    try {
        const chat = await msg.getChat();

        if (chat.isGroup) {
            const authorId = msg.author || msg.from;
            const participant = chat.participants.find(p => p.id._serialized === authorId);
            const isSenderAdmin = participant ? (participant.isAdmin || participant.isSuperAdmin) : false;

            if (isSenderAdmin) return; 

            const groupId = chat.id._serialized;
            const groupConfig = config.groupsConfig[groupId];
            
            let forbiddenWords = [];
            let targetAdminGroup = config.defaultAdminGroup;

            // تحديد الكلمات بناءً على إعدادات القروب وزر الدمج
            if (groupConfig) {
                targetAdminGroup = groupConfig.adminGroup || config.defaultAdminGroup;
                
                if (groupConfig.useDefaultWords !== false) {
                    forbiddenWords = [...config.defaultWords];
                }
                
                if (groupConfig.words && groupConfig.words.length > 0) {
                    forbiddenWords = [...forbiddenWords, ...groupConfig.words];
                }
            } else {
                forbiddenWords = [...config.defaultWords];
            }

            // إذا كانت القائمة فارغة تماما (الزر مغلق ولا توجد كلمات خاصة)، يتم تخطي الفحص
            if (forbiddenWords.length === 0) return;

            const containsForbiddenWord = forbiddenWords.some(word => msg.body.includes(word));

            if (containsForbiddenWord) {
                const contact = await msg.getContact();
                let senderId = authorId;
                if (contact && contact.number) {
                    senderId = `${contact.number}@c.us`;
                }

                const messageContent = msg.body;
                await msg.delete(true); 
                
                const pollTitle = `🚨 رسالة محذوفة في "${chat.name}"\nالمرسل: @${senderId.split('@')[0]}\nالنص المحذوف:\n"${messageContent}"\n\nهل هذا الحساب آلي للإعلانات؟`;
                const poll = new Poll(pollTitle, ['نعم (طرد شامل)', 'لا']);
                
                const pollMsg = await client.sendMessage(targetAdminGroup, poll, { mentions: [senderId] });

                pendingBans.set(pollMsg.id._serialized, {
                    senderId: senderId,
                    pollMsg: pollMsg
                });
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
                                await new Promise(resolve => setTimeout(resolve, 1000)); 
                            } catch(e) { }
                        }
                    }
                }
                await data.pollMsg.reply('✅ *تم طرد الرقم بنجاح وإغلاق الطلب.*');

            } else if (selectedOption.includes('لا')) {
                await data.pollMsg.reply('🛑 *تم التجاهل بناء على التوجيه.*');
            }

            pendingBans.delete(pollId);
        }
    }
});

client.initialize();