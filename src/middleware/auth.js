const crypto = require('crypto');
const { db } = require('../db');

const SESSION_COOKIE_NAME = 'wa_bot_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessionStore = new Map();

const DEFAULT_PERMISSION_GROUPS = [
    {
        name: 'Viewer',
        description: 'Read-only dashboard access',
        permissions: ['dashboard:read', 'groups:view', 'logs:view']
    },
    {
        name: 'Group Manager',
        description: 'Manage scoped groups and media',
        permissions: ['dashboard:read', 'groups:view', 'groups:manage-scoped', 'config:write-scoped', 'media:manage', 'logs:view']
    },
    {
        name: 'Security Manager',
        description: 'Manage security lists and anti-abuse actions',
        permissions: ['dashboard:read', 'groups:view', 'security:manage', 'logs:view']
    },
    {
        name: 'Operator',
        description: 'Daily operations with import/export and bot actions',
        permissions: ['dashboard:read', 'groups:view', 'config:write', 'security:manage', 'media:manage', 'import-export:manage', 'bot:logout', 'logs:view', 'users:manage']
    }
];

function nowIso() {
    return new Date().toISOString();
}

function sanitizeUsername(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
}

function parseJsonArray(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function normalizePermissionGroupName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizePermissionList(values) {
    if (!Array.isArray(values)) return [];
    const cleaned = values
        .map(v => String(v || '').trim())
        .filter(Boolean);
    return Array.from(new Set(cleaned));
}

function hashPassword(password, saltHex) {
    const salt = saltHex || crypto.randomBytes(16).toString('hex');
    const digest = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
    const [salt, savedDigestHex] = storedHash.split(':');
    const actualDigestHex = crypto.scryptSync(password, salt, 64).toString('hex');
    const savedDigest = Buffer.from(savedDigestHex, 'hex');
    const actualDigest = Buffer.from(actualDigestHex, 'hex');
    if (savedDigest.length !== actualDigest.length) return false;
    return crypto.timingSafeEqual(savedDigest, actualDigest);
}

function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    return header.split(';').reduce((acc, segment) => {
        const idx = segment.indexOf('=');
        if (idx === -1) return acc;
        const key = decodeURIComponent(segment.slice(0, idx).trim());
        const val = decodeURIComponent(segment.slice(idx + 1).trim());
        acc[key] = val;
        return acc;
    }, {});
}

function setSessionCookie(res, token, ttlMs = SESSION_TTL_MS) {
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSeconds = Math.max(1, Math.floor((ttlMs || SESSION_TTL_MS) / 1000));
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessionStore.entries()) {
        if (!session || session.expiresAt <= now) {
            sessionStore.delete(token);
        }
    }
}

setInterval(cleanupExpiredSessions, 15 * 60 * 1000).unref();

function ensureDefaultPermissionGroups() {
    const upsert = db.prepare(`
        INSERT INTO permission_groups (name, description, permissions)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            description = excluded.description,
            permissions = excluded.permissions
    `);
    for (const group of DEFAULT_PERMISSION_GROUPS) {
        upsert.run(group.name, group.description, JSON.stringify(group.permissions));
    }
}

function ensureBootstrapAdmin() {
    const count = db.prepare('SELECT COUNT(*) AS count FROM app_users').get().count;
    if (count > 0) return;

    const username = 'admin';
    const password = 'admin123';
    const timestamp = nowIso();
    const insertUser = db.prepare(`
        INSERT INTO app_users (username, password_hash, display_name, is_active, is_superadmin, created_at, updated_at)
        VALUES (?, ?, ?, 1, 1, ?, ?)
    `);
    const info = insertUser.run(username, hashPassword(password), 'System Admin', timestamp, timestamp);
    db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)')
        .run(Number(info.lastInsertRowid), 'must_change_credentials', '1');
    console.log('[Auth] Created bootstrap superadmin user: admin / admin123 (change immediately).');
}

function getUserByUsername(username) {
    return db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);
}

function getUserById(userId) {
    return db.prepare('SELECT * FROM app_users WHERE id = ?').get(userId);
}

function isDefaultCredentialChangeRequired(userId) {
    const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, 'must_change_credentials');
    return Boolean(row && row.value === '1');
}

function setDefaultCredentialChangeRequired(userId, required) {
    if (required) {
        db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)')
            .run(userId, 'must_change_credentials', '1');
        return;
    }
    db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, 'must_change_credentials');
}

function shouldShowDefaultLoginHint() {
    const row = db.prepare("SELECT COUNT(*) AS count FROM user_settings WHERE key = 'must_change_credentials' AND value = '1'").get();
    return row && row.count > 0;
}

function ensureLegacyBootstrapCredentialChangeFlag() {
    const adminUser = getUserByUsername('admin');
    if (!adminUser) return;
    if (isDefaultCredentialChangeRequired(adminUser.id)) return;
    if (verifyPassword('admin123', adminUser.password_hash)) {
        setDefaultCredentialChangeRequired(adminUser.id, true);
        console.log('[Auth] Marked legacy bootstrap admin account to require credential change.');
    }
}

function getEffectivePermissions(user) {
    if (!user || user.is_active !== 1) return [];
    if (user.is_superadmin === 1) return ['*'];

    const rows = db.prepare(`
        SELECT pg.permissions
        FROM user_permission_groups upg
        JOIN permission_groups pg ON pg.id = upg.permission_group_id
        WHERE upg.user_id = ?
    `).all(user.id);

    const merged = new Set();
    rows.forEach(r => parseJsonArray(r.permissions).forEach(p => merged.add(String(p))));
    return Array.from(merged);
}

function hasPermission(user, permission) {
    const permissions = getEffectivePermissions(user);
    return permissions.includes('*') || permissions.includes(permission);
}

function getAllowedGroupIds(user) {
    if (!user || user.is_superadmin === 1) return null;
    const rows = db.prepare('SELECT wa_group_id FROM user_group_access WHERE user_id = ?').all(user.id);
    return new Set(rows.map(r => r.wa_group_id));
}

function createSession(userId, ttlMs = SESSION_TTL_MS) {
    const token = crypto.randomBytes(32).toString('hex');
    const effectiveTtl = Math.max(1, Number(ttlMs) || SESSION_TTL_MS);
    sessionStore.set(token, { userId, ttlMs: effectiveTtl, expiresAt: Date.now() + effectiveTtl });
    return token;
}

function destroySession(req, res) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) sessionStore.delete(token);
    clearSessionCookie(res);
}

function requireAuthApi(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token || !sessionStore.has(token)) return res.status(401).json({ error: 'Unauthorized' });

    const session = sessionStore.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Session expired' });
    }

    const user = getUserById(session.userId);
    if (!user || user.is_active !== 1) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.status(401).json({ error: 'User inactive or not found' });
    }

    const ttlMs = session.ttlMs || SESSION_TTL_MS;
    session.ttlMs = ttlMs;
    session.expiresAt = Date.now() + ttlMs;
    req.authUser = user;
    req.authPermissions = getEffectivePermissions(user);
    next();
}

function requireAuthPage(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token || !sessionStore.has(token)) return res.redirect('/login');

    const session = sessionStore.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.redirect('/login');
    }

    const user = getUserById(session.userId);
    if (!user || user.is_active !== 1) {
        sessionStore.delete(token);
        clearSessionCookie(res);
        return res.redirect('/login');
    }

    const ttlMs = session.ttlMs || SESSION_TTL_MS;
    session.ttlMs = ttlMs;
    session.expiresAt = Date.now() + ttlMs;
    req.authUser = user;
    req.authPermissions = getEffectivePermissions(user);
    next();
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' });
        if (hasPermission(req.authUser, permission)) return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}

function normalizeUserAccessPayload(payload) {
    const permissionGroupIds = Array.isArray(payload.permissionGroupIds) ? payload.permissionGroupIds.map(n => parseInt(n, 10)).filter(Number.isFinite) : [];
    const allowedGroupIds = Array.isArray(payload.allowedGroupIds) ? payload.allowedGroupIds.map(g => String(g)) : [];
    const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
    return { permissionGroupIds, allowedGroupIds, settings };
}

// Run auth bootstrap setups
ensureDefaultPermissionGroups();
ensureBootstrapAdmin();
ensureLegacyBootstrapCredentialChangeFlag();

module.exports = {
    SESSION_COOKIE_NAME,
    SESSION_TTL_MS,
    REMEMBER_ME_TTL_MS,
    sanitizeUsername,
    parseJsonArray,
    normalizePermissionGroupName,
    normalizePermissionList,
    hashPassword,
    verifyPassword,
    parseCookies,
    setSessionCookie,
    clearSessionCookie,
    getUserByUsername,
    getUserById,
    isDefaultCredentialChangeRequired,
    setDefaultCredentialChangeRequired,
    shouldShowDefaultLoginHint,
    getEffectivePermissions,
    hasPermission,
    getAllowedGroupIds,
    createSession,
    destroySession,
    requireAuthApi,
    requireAuthPage,
    requirePermission,
    normalizeUserAccessPayload
};
