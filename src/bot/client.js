const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const authDataPath = process.env.WA_AUTH_PATH || path.join(process.cwd(), '.wwebjs_auth');

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
        const linuxCandidates = [
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chrome',
            '/opt/google/chrome/chrome',
            '/bin/chromium',
            '/bin/google-chrome'
        ];
        const found = linuxCandidates.find(p => fs.existsSync(p));
        return found || null;
    }

    return null;
}

const resolvedBrowserExecutablePath = resolveBrowserExecutablePath();

process.env.DBUS_SESSION_BUS_ADDRESS = process.env.DBUS_SESSION_BUS_ADDRESS || 'disabled';

function cleanupStaleAuthLocks(authPath) {
    try {
        if (fs.existsSync(authPath)) {
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
        }

        const tmpDir = '/tmp';
        if (fs.existsSync(tmpDir)) {
            const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('chromium-wa-bot-') || entry.name.startsWith('.org.chromium.')) {
                    try { fs.rmSync(path.join(tmpDir, entry.name), { recursive: true, force: true }); } catch (e) { }
                }
            }
        }
    } catch (err) {
        console.error(`[خطأ] فشل تنظيف أقفال المصادقة القديمة: ${err.message || err}`);
    }
}

cleanupStaleAuthLocks(authDataPath);

let currentQR = '';
let botStatus = '<i class="fas fa-spinner fa-spin"></i> جاري تهيئة النظام وبدء التشغيل...';
let botStatusKind = 'initializing';
let isInitializing = false;
let initializationTimeout = null;
let initializationStartTime = null;
let lastConnectionTimestamp = null;
const logsHistory = [];
const clientConnectionHistory = [];
function addLog(msg) {
    const timestamp = new Date().toLocaleTimeString('ar-SA', { hour12: false });
    const entry = `[${timestamp}] ${msg}`;
    logsHistory.push(entry);
    if (logsHistory.length > 200) logsHistory.shift();
    console.log(entry);
}

function addConnectionLog(status, details = '') {
    const timestamp = new Date().toLocaleTimeString('ar-SA', { hour12: false });
    const logEntry = `[${timestamp}] Status: ${status}${details ? ` | Details: ${details}` : ''}`;
    clientConnectionHistory.push(logEntry);
    if (clientConnectionHistory.length > 100) clientConnectionHistory.shift();
    addLog(`[اتصال] ${logEntry}`);
}

function getDashboardStatusSnapshot(lang) {
    let translatedStatus = botStatus;
    if (lang === 'en') {
        translatedStatus = translatedStatus
            .replace('جاري تهيئة النظام وبدء التشغيل...', 'Initializing system and starting...')
            .replace('بانتظار مسح رمز الاستجابة السريعة (QR Code)...', 'Waiting for QR Code scan...')
            .replace('متصل وجاهز للعمل', 'Connected and ready')
            .replace('تم تسجيل الدخول بنجاح، جاري جلب البيانات...', 'Logged in successfully, fetching data...')
            .replace('تم تسجيل الخروج من الحساب...', 'Logged out of account...')
            .replace('جاري إنهاء الجلسة...', 'Terminating session...');
    }

    return {
        status: translatedStatus,
        statusText: String(translatedStatus).replace(/<[^>]*>/g, '').trim(),
        statusKind: botStatusKind,
        qr: currentQR
    };
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authDataPath,
        clientId: process.env.WA_CLIENT_ID || 'main'
    }),
    puppeteer: {
        ...(resolvedBrowserExecutablePath ? { executablePath: resolvedBrowserExecutablePath } : {}),
        headless: true,
        timeout: 60000,
        dumpio: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
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
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-device-orientation-request-prompt',
            '--no-default-browser-check',
            '--start-maximized',
            '--remote-debugging-port=0'
        ]
    }
});

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

async function initializeClientWithRetry(retryCount = 0, maxRetries = 5) {
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);

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

        initializationTimeout = setTimeout(() => {
            console.error('[خطأ] استنزاف وقت التهيئة (timeout)!');
            addConnectionLog('انتهاء الوقت', 'انقضى وقت التهيئة المسموح به (60 ثانية)');
            isInitializing = false;
            botStatus = '<i class="fas fa-exclamation-triangle"></i> خطأ: انقضى وقت التهيئة';
            botStatusKind = 'error';
        }, 60000);

        await client.initialize();

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

            return initializeClientWithRetry(retryCount + 1, maxRetries);
        } else {
            console.error(`[خطأ حرج] فشلت جميع محاولات التهيئة (${maxRetries + 1} محاولات)!`);
            botStatus = `<i class="fas fa-exclamation-triangle"></i> فشل بدء البوت بعد ${maxRetries + 1} محاولات`;
            botStatusKind = 'error';
            addConnectionLog('فشل نهائي', `فشلت جميع ${maxRetries + 1} محاولات برسالة: ${errorMsg}`);
        }
    }
}

function setBotStatus(status, kind) {
    botStatus = status;
    if (kind) botStatusKind = kind;
}

module.exports = {
    client,
    addConnectionLog,
    logsHistory,
    addLog,
    getDashboardStatusSnapshot,
    initializeClientWithRetry,
    setBotStatus,
    get currentQR() { return currentQR; },
    get botStatus() { return botStatus; },
    get botStatusKind() { return botStatusKind; },
    get isInitializing() { return isInitializing; },
    get clientConnectionHistory() { return clientConnectionHistory; },
    get initializationStartTime() { return initializationStartTime; },
    get lastConnectionTimestamp() { return lastConnectionTimestamp; }
};
