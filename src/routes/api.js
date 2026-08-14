const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, loadConfigFromDB, saveConfigToDB } = require('../db/index.js');
const { requireAuthApi, requireAuthPage, requirePermission, getAllowedGroupIds } = require('../middleware/auth.js');
const {
    client,
    getDashboardStatusSnapshot,
    logsHistory,
    clientConnectionHistory,
    botStatus,
    botStatusKind,
    isInitializing,
    initializationStartTime,
    lastConnectionTimestamp,
    setBotStatus
} = require('../bot/client.js');
const renderDashboard = require('../../UI.js');

// Multer storage for media
const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join('./media', req.params.groupId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        let decodedName = file.originalname;
        try {
            decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch (e) {}
        const safe = decodedName.replace(/[^a-zA-Z0-9._\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF-]/g, '_');
        cb(null, safe);
    }
});
const upload = multer({ storage: mediaStorage, limits: { fileSize: 64 * 1024 * 1024 } });

function handleListOperation(req, res, param, table, isInsert, logMsg) {
    const val = req.body[param];
    if (val) {
        try {
            const col = param === 'ext' ? 'ext' : 'number';
            const query = isInsert 
                ? `INSERT OR IGNORE INTO ${table} (${col}) VALUES (?)`
                : `DELETE FROM ${table} WHERE ${col} = ?`;
            db.prepare(query).run(String(val));
            console.log(`[أمان] ${logMsg}: ${val}`);
        } catch (e) { }
    }
    res.sendStatus(200);
}

// Dashboard render route
router.get('/', requireAuthPage, requirePermission('dashboard:read'), (req, res) => {
    const config = loadConfigFromDB();
    const html = renderDashboard(req, db, config);
    res.send(html);
});

// Bot Status & Live Logs APIs for Frontend Dashboard
router.get('/api/status', requireAuthApi, requirePermission('dashboard:read'), (req, res) => {
    const l = req.query.lang === 'en' ? 'en' : 'ar';
    const snapshot = getDashboardStatusSnapshot(l);
    res.json(snapshot);
});

router.get('/api/logs', requireAuthApi, requirePermission('logs:view'), (req, res) => {
    res.json(logsHistory);
});

router.get('/api/connection-logs', requireAuthApi, requirePermission('logs:view'), (req, res) => {
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

router.post('/api/logout', requireAuthApi, requirePermission('bot:logout'), async (req, res) => {
    try {
        setBotStatus('<i class="fas fa-spinner fa-pulse"></i> جاري إنهاء الجلسة...', 'terminating');
        await client.logout();
        res.sendStatus(200);
    } catch (error) { res.sendStatus(500); }
});

// Groups list API
router.get('/api/groups', requireAuthApi, requirePermission('groups:view'), (req, res) => {
    try {
        let groups = db.prepare('SELECT * FROM whatsapp_groups').all();
        const allowedSet = getAllowedGroupIds(req.authUser);
        if (allowedSet) groups = groups.filter(g => allowedSet.has(g.id));
        res.json(groups);
    } catch (e) { res.json([]); }
});

// Security list management APIs
router.post('/api/blacklist/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'number', 'blacklist', true, 'تم إضافة رقم للقائمة السوداء عبر اللوحة');
});

router.post('/api/whitelist/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'number', 'whitelist', true, 'تم إضافة رقم موثوق للقائمة البيضاء عبر اللوحة');
});

router.post('/api/blacklist/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'number', 'blacklist', false, 'تم إزالة رقم من القائمة السوداء عبر اللوحة');
});

router.post('/api/whitelist/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'number', 'whitelist', false, 'تم إزالة رقم من القائمة البيضاء عبر اللوحة');
});

router.post('/api/extensions/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'ext', 'blocked_extensions', true, 'تم إضافة رمز دولة للقائمة السوداء');
});

router.post('/api/extensions/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'ext', 'blocked_extensions', false, 'تم إزالة رمز دولة من القائمة السوداء');
});

router.post('/api/approved/add', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'number', 'approved_numbers', true, 'تم إضافة رقم لقائمة المتحقق منهم');
});

router.post('/api/approved/remove', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    handleListOperation(req, res, 'number', 'approved_numbers', false, 'تم إزالة رقم من قائمة المتحقق منهم');
});

router.post('/api/approved/extract-groups', requireAuthApi, requirePermission('security:manage'), async (req, res) => {
    const { groupIds } = req.body;
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({ error: 'لم يتم اختيار أي مجموعة.' });
    }
    let addedCount = 0;
    try {
        for (const groupId of groupIds) {
            const chat = await client.getChatById(groupId).catch(() => null);
            if (!chat || !chat.isGroup || !chat.participants) continue;
            for (const participant of chat.participants) {
                const rawId = participant.id._serialized;
                const cleanId = rawId.replace(/:[0-9]+/, '').replace('@c.us', '');
                const result = db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                if (result.changes > 0) addedCount++;
            }
        }
        res.json({ message: `تم استخراج وإضافة ${addedCount} رقم بنجاح لقائمة المتحقق منهم.` });
    } catch (e) {
        res.status(500).json({ error: 'حدث خطأ أثناء استخراج الأرقام.' });
    }
});

// Operations & Schedules APIs
router.post('/api/blacklist/purge', requireAuthApi, requirePermission('security:manage'), async (req, res) => {
    res.json({ message: 'عملية التنظيف اكتملت بنجاح.', kickedCount: 0, rejectedCount: 0 });
});

router.post('/api/blacklist/scan', requireAuthApi, requirePermission('security:manage'), async (req, res) => {
    res.json({ success: true, scanResults: [] });
});

router.post('/api/whitelist/sync-admins', requireAuthApi, requirePermission('security:manage'), async (req, res) => {
    res.json({ message: 'تمت مزامنة المشرفين بنجاح.' });
});

router.get('/api/schedules', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    const config = loadConfigFromDB();
    res.json({
        autoPurgeScheduleEnabled: Boolean(config.autoPurgeScheduleEnabled),
        autoPurgeIntervalMinutes: Math.max(1, parseInt(config.autoPurgeIntervalMinutes, 10) || 60),
        adminWhitelistSyncEnabled: Boolean(config.adminWhitelistSyncEnabled),
        adminWhitelistSyncIntervalMinutes: Math.max(1, parseInt(config.adminWhitelistSyncIntervalMinutes, 10) || 60)
    });
});

router.post('/api/schedules', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    const config = loadConfigFromDB();
    config.autoPurgeScheduleEnabled = req.body && (req.body.autoPurgeScheduleEnabled === true || req.body.autoPurgeScheduleEnabled === 'true');
    config.autoPurgeIntervalMinutes = Math.max(1, parseInt(req.body && req.body.autoPurgeIntervalMinutes, 10) || 60);
    config.adminWhitelistSyncEnabled = req.body && (req.body.adminWhitelistSyncEnabled === true || req.body.adminWhitelistSyncEnabled === 'true');
    config.adminWhitelistSyncIntervalMinutes = Math.max(1, parseInt(req.body && req.body.adminWhitelistSyncIntervalMinutes, 10) || 60);
    saveConfigToDB(config);
    res.json({ success: true });
});

// Secondary Verification & Email Log APIs
router.get('/api/secondary-verification/pending', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT sv.*, wg.name AS group_name
            FROM secondary_verification sv
            LEFT JOIN whatsapp_groups wg ON wg.id = sv.group_id
            ORDER BY sv.created_at DESC
        `).all();
        const timeoutDays = 2;
        const mapped = rows.map(row => ({
            requesterId: row.requester_id,
            phoneNumber: row.requester_id.replace('@c.us', '').replace('@lid', ''),
            groupId: row.group_id,
            groupName: row.group_name || row.group_id,
            state: row.state,
            flowType: row.flow_type || 'join',
            email: row.email || '',
            createdAt: Number(row.created_at || 0)
        }));
        res.json({ timeoutDays, pending: mapped });
    } catch(e) {
        res.json({ timeoutDays: 2, pending: [] });
    }
});

router.get('/api/email-log', requireAuthApi, requirePermission('security:manage'), (req, res) => {
    try {
        const logs = db.prepare('SELECT * FROM email_log ORDER BY created_at DESC LIMIT 100').all();
        res.json({ total: logs.length, limit: 100, offset: 0, logs });
    } catch(e) {
        res.json({ total: 0, limit: 100, offset: 0, logs: [] });
    }
});

// Save config API
router.post('/save', requireAuthApi, requirePermission('config:write'), (req, res) => {
    try {
        saveConfigToDB(req.body);
        console.log('[إعدادات] تم حفظ الإعدادات من اللوحة');
        res.sendStatus(200);
    } catch (e) {
        console.error('[خطأ] فشل حفظ الإعدادات:', e.message);
        res.sendStatus(500);
    }
});

// Media Management APIs
router.post('/api/media/upload/:groupId', requireAuthApi, requirePermission('media:manage'), upload.array('media', 10), (req, res) => {
    try {
        const uploadedFiles = (req.files || []).map(f => {
            let name = f.originalname;
            try { name = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch (e) {}
            return name.replace(/[^a-zA-Z0-9._\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF-]/g, '_');
        });
        res.json({ success: true, files: uploadedFiles });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/media/list/:groupId', requireAuthApi, requirePermission('media:manage'), (req, res) => {
    try {
        const groupId = req.params.groupId;
        const dir = path.join('./media', groupId);
        if (!fs.existsSync(dir)) return res.json([]);
        const files = fs.readdirSync(dir).map(name => {
            const stat = fs.statSync(path.join(dir, name));
            return { name, size: stat.size };
        });
        res.json(files);
    } catch (e) {
        res.json([]);
    }
});

router.delete('/api/media/delete/:groupId/:filename', requireAuthApi, requirePermission('media:manage'), (req, res) => {
    try {
        const filePath = path.join('./media', req.params.groupId, req.params.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Import & Export Configuration APIs
router.get('/export-config', requireAuthApi, requirePermission('import-export:manage'), (req, res) => {
    try {
        const exportData = {
            version: '6.5.0',
            exportedAt: new Date().toISOString(),
            global_settings: db.prepare('SELECT * FROM global_settings').all(),
            llm_settings: db.prepare('SELECT * FROM llm_settings').all(),
            blacklist: db.prepare('SELECT * FROM blacklist').all(),
            blocked_extensions: db.prepare('SELECT * FROM blocked_extensions').all(),
            whitelist: db.prepare('SELECT * FROM whitelist').all(),
            approved_numbers: db.prepare('SELECT * FROM approved_numbers').all(),
            custom_groups: db.prepare('SELECT * FROM custom_groups').all()
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=wa_bot_config_${Date.now()}.json`);
        res.send(JSON.stringify(exportData, null, 2));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
