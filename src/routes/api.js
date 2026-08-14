const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, loadConfigFromDB, saveConfigToDB } = require('../db');
const { requireAuthApi, requireAuthPage, requirePermission, getAllowedGroupIds } = require('../middleware/auth');
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
