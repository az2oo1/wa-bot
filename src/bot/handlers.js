const { Poll, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { db, loadConfigFromDB, saveConfigToDB, syncTx } = require('../db/index.js');
const { client, addConnectionLog, initializeClientWithRetry, setBotStatus } = require('./client.js');

let config = loadConfigFromDB();

let isScreeningRunning = false;

async function safeGetChats(clientTarget = client, options = {}) {
    const maxRetries = options.maxRetries || 8;
    const initialDelay = typeof options.initialDelay === 'number' ? options.initialDelay : 3000;
    const retryDelayBase = options.retryDelayBase || 3000;

    if (initialDelay > 0) {
        await new Promise(r => setTimeout(r, initialDelay));
    }

    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (!clientTarget || !clientTarget.pupPage || clientTarget.pupPage.isClosed()) {
                throw new Error('صفحة المتصفح غير جاهزة أو مغلقة');
            }

            const isStoreReady = await clientTarget.pupPage.evaluate(() => {
                return typeof window !== 'undefined' && window.Store && (window.Store.Chat || window.Store.GroupMetadata);
            }).catch(() => false);

            if (!isStoreReady && attempt < maxRetries) {
                console.log(`[مزامنة المجموعات] بانتظار تجهيز WhatsApp Store (محاولة ${attempt}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, retryDelayBase * attempt));
                continue;
            }

            const chats = await clientTarget.getChats();
            if (Array.isArray(chats)) {
                return chats;
            }
            throw new Error('النتيجة المسترجعة ليست مصفوفة مجموعات صالحة');
        } catch (err) {
            lastErr = err;
            const errMsg = err ? (err.message || String(err)) : 'Unknown error';
            console.warn(`[مزامنة المجموعات] المحاولة ${attempt}/${maxRetries} لجلب المجموعات: ${errMsg}`);
            if (attempt < maxRetries) {
                const waitTime = retryDelayBase * attempt;
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }
    throw lastErr;
}

async function triggerGroupSync() {
    try {
        console.log('[معلومة] بدء مزامنة المجموعات من قاعدة البيانات و WhatsApp...');
        const chats = await safeGetChats(client);
        if (Array.isArray(chats)) {
            syncTx(chats);
            addConnectionLog('مزامنة مجموعات', `تم جلب ${chats.length} مجموعة`);
            addConnectionLog('مزامنة ناجحة', `متصل وجاهز - ${chats.length} مجموعة`);
        }
    } catch (error) {
        const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
        console.error('[خطأ مزامنة المجموعات]', errorMsg);
        addConnectionLog('خطأ في المزامنة', errorMsg);
        setTimeout(triggerGroupSync, 15000);
    }
}

function resolveLidJid(cl, rawJid) {
    return new Promise((resolve) => {
        if (!rawJid || typeof rawJid !== 'string') {
            return resolve({ cleanId: rawJid || '', unmasked: false });
        }
        if (!rawJid.includes('@lid')) {
            const cleanId = rawJid.replace(/:[0-9]+/, '');
            return resolve({ cleanId, unmasked: true });
        }
        const cleanId = rawJid.replace(/:[0-9]+/, '');
        resolve({ cleanId, unmasked: false });
    });
}

function getAdminMentionId(cleanId, rawId, unmasked) {
    if (unmasked && cleanId) return cleanId.replace(/:[0-9]+/, '');
    if (rawId) return rawId.replace(/:[0-9]+/, '');
    return cleanId ? cleanId.replace(/:[0-9]+/, '') : '';
}

function saveToBlacklist(cleanId, rawId, unmasked) {
    try {
        if (cleanId) {
            const cId = cleanId.replace(/:[0-9]+/, '');
            db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cId);
            if (cId.includes('@lid')) {
                db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cId.replace('@lid', '@c.us'));
            }
        }
        if (rawId && !unmasked) {
            const rId = rawId.replace(/:[0-9]+/, '');
            db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(rId);
        }
    } catch (e) { }
}

function applySmartMatch(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/(.)\1+/g, '$1')
        .toLowerCase()
        .trim();
}

function setupBotHandlers() {
    client.on('ready', async () => {
        addConnectionLog('جاهز', 'البوت جاهز الآن والعميل مصرح');
        setBotStatus('<i class="fas fa-check-circle"></i> متصل وجاهز للعمل', 'connected');
        addConnectionLog('متصل', 'جاهز للعمل (قبل مزامنة المجموعات)');

        try {
            console.log('[معلومة] بدء مزامنة المجموعات من قاعدة البيانات...');
            const chats = await safeGetChats(client);
            if (Array.isArray(chats)) {
                syncTx(chats);
                addConnectionLog('مزامنة مجموعات', `تم جلب ${chats.length} مجموعة`);
                addConnectionLog('مزامنة ناجحة', `متصل وجاهز - ${chats.length} مجموعة`);
            }
        } catch (error) {
            const errorMsg = error ? (error.message || error.toString()) : 'Unknown error';
            addConnectionLog('خطأ في المزامنة', errorMsg);
        }
    });

    client.on('disconnected', async (reason) => {
        const disconnectReason = reason || 'Unknown reason';
        addConnectionLog('قطع الاتصال', disconnectReason);
        setBotStatus('<i class="fas fa-sign-out-alt"></i> تم تسجيل الخروج من الحساب...', 'disconnected');

        try {
            await client.destroy();
        } catch (e) { }

        setTimeout(() => {
            initializeClientWithRetry();
        }, 3000);
    });

    client.on('group_update', async (notification) => {
        try {
            const chat = await notification.getChat();
            db.prepare('UPDATE whatsapp_groups SET name = ? WHERE id = ?').run(chat.name, chat.id._serialized);
        } catch (e) { }
    });

    client.on('call', (call) => {
        console.log('[معلومة] تنبيه مكالمة واردة:', {
            from: call.from,
            isGroup: call.isGroup,
            timestamp: new Date().toISOString()
        });
    });
}

module.exports = {
    setupBotHandlers,
    resolveLidJid,
    getAdminMentionId,
    saveToBlacklist,
    applySmartMatch
};
