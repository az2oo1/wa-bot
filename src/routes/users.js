const express = require('express');
const router = express.Router();
const { db } = require('../db/index.js');
const {
    sanitizeUsername,
    hashPassword,
    parseJsonArray,
    normalizePermissionGroupName,
    normalizePermissionList,
    normalizeUserAccessPayload,
    getUserById,
    requireAuthApi,
    requirePermission
} = require('../middleware/auth.js');

function nowIso() {
    return new Date().toISOString();
}

// Permission Groups APIs
router.get('/api/access/permission-groups', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const rows = db.prepare('SELECT id, name, description, permissions FROM permission_groups ORDER BY name').all();
    const data = rows.map(r => ({ ...r, permissions: parseJsonArray(r.permissions) }));
    res.json(data);
});

router.post('/api/access/permission-groups/create', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const name = normalizePermissionGroupName(req.body.name);
    const description = String(req.body.description || '').trim();
    const permissions = normalizePermissionList(req.body.permissions);
    if (!name || permissions.length === 0) return res.status(400).json({ error: 'Invalid permission group payload' });

    try {
        const existing = db.prepare('SELECT id FROM permission_groups WHERE lower(name) = lower(?)').get(name);
        if (existing) return res.status(409).json({ error: 'Permission group name already exists' });

        db.prepare('INSERT INTO permission_groups (name, description, permissions) VALUES (?, ?, ?)')
            .run(name, description, JSON.stringify(permissions));
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/api/access/permission-groups/update', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const id = parseInt(req.body.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const name = normalizePermissionGroupName(req.body.name);
    const description = String(req.body.description || '').trim();
    const permissions = normalizePermissionList(req.body.permissions);
    if (!name || permissions.length === 0) return res.status(400).json({ error: 'Invalid permission group payload' });

    try {
        const current = db.prepare('SELECT id FROM permission_groups WHERE id = ?').get(id);
        if (!current) return res.status(404).json({ error: 'Permission group not found' });

        const duplicate = db.prepare('SELECT id FROM permission_groups WHERE lower(name) = lower(?) AND id <> ?').get(name, id);
        if (duplicate) return res.status(409).json({ error: 'Permission group name already exists' });

        db.prepare('UPDATE permission_groups SET name = ?, description = ?, permissions = ? WHERE id = ?')
            .run(name, description, JSON.stringify(permissions), id);
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/api/access/permission-groups/delete', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const id = parseInt(req.body.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    try {
        const tx = db.transaction(() => {
            db.prepare('DELETE FROM user_permission_groups WHERE permission_group_id = ?').run(id);
            const info = db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id);
            if (!info || info.changes === 0) {
                throw new Error('Permission group not found');
            }
        });
        tx();
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// App Users CRUD APIs
router.get('/api/users', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const users = db.prepare('SELECT id, username, display_name, is_active, is_superadmin, created_at, updated_at FROM app_users ORDER BY id ASC').all();
    const rows = db.prepare(`
        SELECT upg.user_id, pg.id AS group_id, pg.name
        FROM user_permission_groups upg
        JOIN permission_groups pg ON pg.id = upg.permission_group_id
    `).all();
    const groupAccess = db.prepare('SELECT user_id, wa_group_id FROM user_group_access').all();

    const byUserGroups = new Map();
    rows.forEach(r => {
        if (!byUserGroups.has(r.user_id)) byUserGroups.set(r.user_id, []);
        byUserGroups.get(r.user_id).push({ id: r.group_id, name: r.name });
    });

    const byUserWaAccess = new Map();
    groupAccess.forEach(r => {
        if (!byUserWaAccess.has(r.user_id)) byUserWaAccess.set(r.user_id, []);
        byUserWaAccess.get(r.user_id).push(r.wa_group_id);
    });

    res.json(users.map(u => ({
        ...u,
        permissionGroups: byUserGroups.get(u.id) || [],
        allowedGroupIds: byUserWaAccess.get(u.id) || []
    })));
});

router.post('/api/users/create', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const username = sanitizeUsername(req.body.username);
    const displayName = String(req.body.displayName || '').trim();
    const password = String(req.body.password || '');
    const isSuperadmin = req.body.isSuperadmin ? 1 : 0;

    if (!username || !displayName || password.length < 8) {
        return res.status(400).json({ error: 'username/displayName required and password must be at least 8 chars' });
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
        return res.status(400).json({ error: 'username can contain only a-z, 0-9, dot, underscore, hyphen' });
    }

    try {
        const timestamp = nowIso();
        db.prepare(`
            INSERT INTO app_users (username, password_hash, display_name, is_active, is_superadmin, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)
        `).run(username, hashPassword(password), displayName, isSuperadmin, timestamp, timestamp);
        res.sendStatus(200);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/api/users/update', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.body.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const params = [];

    if (typeof req.body.displayName === 'string') {
        updates.push('display_name = ?');
        params.push(req.body.displayName.trim());
    }
    if (typeof req.body.isActive !== 'undefined') {
        updates.push('is_active = ?');
        params.push(req.body.isActive ? 1 : 0);
    }
    if (typeof req.body.isSuperadmin !== 'undefined') {
        updates.push('is_superadmin = ?');
        params.push(req.body.isSuperadmin ? 1 : 0);
    }
    if (typeof req.body.password === 'string' && req.body.password.length > 0) {
        if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 chars' });
        updates.push('password_hash = ?');
        params.push(hashPassword(req.body.password));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid updates' });

    updates.push('updated_at = ?');
    params.push(nowIso());
    params.push(userId);

    db.prepare(`UPDATE app_users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.sendStatus(200);
});

router.post('/api/users/delete', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.body.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });
    if (req.authUser.id === userId) return res.status(400).json({ error: 'You cannot delete your own account' });

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM user_permission_groups WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_group_access WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM app_users WHERE id = ?').run(userId);
    });

    tx();
    res.sendStatus(200);
});

router.get('/api/users/:userId/access', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const permissionGroups = db.prepare(`
        SELECT pg.id, pg.name
        FROM user_permission_groups upg
        JOIN permission_groups pg ON pg.id = upg.permission_group_id
        WHERE upg.user_id = ?
    `).all(userId);

    const allowedGroupIds = db.prepare('SELECT wa_group_id FROM user_group_access WHERE user_id = ?').all(userId).map(r => r.wa_group_id);
    const settingsRows = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
    const settings = {};
    settingsRows.forEach(r => {
        settings[r.key] = r.value;
    });

    res.json({
        userId,
        permissionGroupIds: permissionGroups.map(g => g.id),
        allowedGroupIds,
        settings
    });
});

router.post('/api/users/:userId/access', requireAuthApi, requirePermission('users:manage'), (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const payload = normalizeUserAccessPayload(req.body || {});

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM user_permission_groups WHERE user_id = ?').run(userId);
        const insertPermission = db.prepare('INSERT OR IGNORE INTO user_permission_groups (user_id, permission_group_id) VALUES (?, ?)');
        payload.permissionGroupIds.forEach(groupId => insertPermission.run(userId, groupId));

        db.prepare('DELETE FROM user_group_access WHERE user_id = ?').run(userId);
        const insertGroup = db.prepare('INSERT OR IGNORE INTO user_group_access (user_id, wa_group_id) VALUES (?, ?)');
        payload.allowedGroupIds.forEach(waGroupId => insertGroup.run(userId, waGroupId));

        db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
        const insertSetting = db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');
        Object.entries(payload.settings).forEach(([key, value]) => {
            insertSetting.run(userId, String(key), typeof value === 'string' ? value : JSON.stringify(value));
        });

        db.prepare('UPDATE app_users SET updated_at = ? WHERE id = ?').run(nowIso(), userId);
    });

    tx();
    res.sendStatus(200);
});

module.exports = router;
