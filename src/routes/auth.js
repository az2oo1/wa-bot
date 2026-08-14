const express = require('express');
const router = express.Router();
const { db } = require('../db/index.js');
const {
    SESSION_TTL_MS,
    REMEMBER_ME_TTL_MS,
    sanitizeUsername,
    hashPassword,
    verifyPassword,
    setSessionCookie,
    createSession,
    destroySession,
    getUserByUsername,
    isDefaultCredentialChangeRequired,
    setDefaultCredentialChangeRequired,
    shouldShowDefaultLoginHint,
    getAllowedGroupIds,
    requireAuthApi
} = require('../middleware/auth.js');

function nowIso() {
    return new Date().toISOString();
}

router.get('/login', (req, res) => {
    const lang = req.headers.cookie && req.headers.cookie.includes('bot_lang=en') ? 'en' : 'ar';
    const dir = lang === 'en' ? 'ltr' : 'rtl';
    const t = (ar, en) => lang === 'en' ? en : ar;
    const showDefaultHint = shouldShowDefaultLoginHint();
    const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${t('تسجيل الدخول', 'Sign In')}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root{--bg:#080c10;--card-bg:#131920;--card-border:#1e2830;--input-bg:#0a0f14;--input-border:#1e2830;--text:#dce8f5;--text-muted:#6b8099;--accent:#00c853;--accent-dim:rgba(0,200,83,.12);--red:#ff5252;--blue:#40c4ff}
        *{box-sizing:border-box} html,body{margin:0;padding:0}
        body{font-family:'IBM Plex Sans Arabic',sans-serif;background:radial-gradient(circle at 0 0,#0f1720 0,#080c10 45%,#070a0d 100%);color:var(--text);min-height:100vh;display:grid;place-items:center;padding:18px}
        .card{width:min(96vw,460px);background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
        .brand{display:flex;align-items:center;gap:12px;margin-bottom:12px}
        .brand .icon{width:80px;height:80px;border-radius:14px;background:transparent;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;box-shadow:none;overflow:hidden}
        .brand .icon img{width:100%;height:100%;object-fit:cover}
        h1{margin:0;font-size:25px}
        p{margin:4px 0 0;color:var(--text-muted)}
        label{display:block;margin:14px 0 6px;font-weight:700;color:var(--text-muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
        input{width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid var(--input-border);background:var(--input-bg);color:var(--text);font-family:inherit}
        input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
        .btn{margin-top:15px;width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid rgba(0,200,83,.45);background:var(--accent-dim);color:var(--accent);font-weight:700;cursor:pointer;font-size:15px;transition:all .2s}
        .btn:hover{transform:translateY(-1px);filter:none;box-shadow:none}
        .lang-row{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
        .lang-btn{border:1.5px solid rgba(64,196,255,.45);background:rgba(64,196,255,.1);color:var(--blue);padding:6px 10px;border-radius:10px;cursor:pointer;font-weight:700;transition:all .2s}
        .lang-btn:hover{transform:translateY(-1px);filter:none;box-shadow:none}
        .hint{margin-top:12px;color:#ffd68a;font-size:13px}
        .error{margin-top:8px;color:#ff9f9f;min-height:19px}
        .input-wrap{position:relative}
        .input-wrap input{padding-inline-end:48px}
        [dir="rtl"] .input-wrap input{padding-inline-end:14px;padding-inline-start:48px}
        .peek-btn{position:absolute;top:50%;transform:translateY(-50%);right:12px;background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px;line-height:1;border-radius:8px;transition:color .2s}
        .peek-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .peek-btn:hover{color:var(--accent)}
        [dir="rtl"] .peek-btn{left:12px;right:auto}
        .form-options{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
        .remember-toggle{display:inline-flex}
        .remember-toggle input{display:none}
        .remember-chip{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1.5px solid var(--card-border);background:var(--input-bg);color:var(--text-muted);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}
        .remember-toggle input:checked + .remember-chip{border-color:rgba(0,200,83,.45);background:var(--accent-dim);color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
        .remember-note{font-size:12px;color:var(--text-muted)}
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <div class="icon"><img src="/public/logo.png" alt="Bot Logo" onerror="this.style.display='none';document.querySelector('.brand .icon i')?.style.display='flex';"><i class="fas fa-robot" style="display:none"></i></div>
            <div>
                <h1>WA Bot</h1>
                <p>${t('تسجيل الدخول للوصول إلى لوحة التحكم', 'Sign in to access dashboard controls')}</p>
            </div>
        </div>
        <form id="loginForm">
            <label for="username">${t('اسم المستخدم', 'Username')}</label>
            <input id="username" name="username" autocomplete="username" required>
            <label for="password">${t('كلمة المرور', 'Password')}</label>
            <div class="input-wrap">
                <input id="password" name="password" type="password" autocomplete="current-password" required>
                <button type="button" class="peek-btn" id="passwordPeek" aria-label="${t('إظهار كلمة المرور', 'Show password')}" aria-pressed="false">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
            <div class="form-options">
                <label class="remember-toggle">
                    <input type="checkbox" id="rememberMe" name="rememberMe">
                    <span class="remember-chip"><i class="fas fa-lock"></i> ${t('إبقني مسجلاً للدخول', 'Keep me logged in')}</span>
                </label>
                <span class="remember-note">${t('تجنب استخدام هذا الخيار على الأجهزة المشتركة.', 'Avoid using this on shared devices.')}</span>
            </div>
            <button class="btn" type="submit">${t('تسجيل الدخول', 'Sign In')}</button>
            <div class="error" id="error"></div>
            ${showDefaultHint ? `<div class="hint">${t('بيانات الدخول الافتراضية أول مرة: admin / admin123', 'Default first login: admin / admin123')}</div>` : ''}
            <div class="lang-row">
                <span style="color:var(--text-muted);font-size:12px">${t('اللغة', 'Language')}</span>
                <button class="lang-btn" type="button" onclick="switchLanguage()">${lang === 'en' ? 'AR' : 'EN'}</button>
            </div>
        </form>
    </div>
    <script>
        const dict = {
            login_failed: '${t('فشل تسجيل الدخول', 'Login failed')}',
            show_password: '${t('إظهار كلمة المرور', 'Show password')}',
            hide_password: '${t('إخفاء كلمة المرور', 'Hide password')}'
        };
        const form = document.getElementById('loginForm');
        const err = document.getElementById('error');
        const passwordInput = document.getElementById('password');
        const peekBtn = document.getElementById('passwordPeek');
        const rememberInput = document.getElementById('rememberMe');

        if (peekBtn && passwordInput) {
            peekBtn.addEventListener('click', () => {
                const reveal = passwordInput.type === 'password';
                passwordInput.type = reveal ? 'text' : 'password';
                peekBtn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
                peekBtn.setAttribute('aria-label', reveal ? dict.hide_password : dict.show_password);
                peekBtn.innerHTML = reveal ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
                passwordInput.focus();
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            err.textContent = '';
            const payload = {
                username: document.getElementById('username').value,
                password: passwordInput ? passwordInput.value : '',
                rememberMe: rememberInput ? rememberInput.checked : false
            };
            const res = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: dict.login_failed }));
                err.textContent = data.error || dict.login_failed;
                return;
            }
            window.location.href = '/';
        });

        function switchLanguage() {
            const current = '${lang}';
            const next = current === 'en' ? 'ar' : 'en';
            document.cookie = 'bot_lang=' + next + '; path=/; max-age=31536000';
            location.reload();
        }
    </script>
</body>
</html>`;
    res.send(html);
});

router.post('/auth/login', (req, res) => {
    const username = sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = getUserByUsername(username);
    if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const rememberMe = req.body && (req.body.rememberMe === true || req.body.rememberMe === 'true');
    const ttlMs = rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
    const token = createSession(user.id, ttlMs);
    setSessionCookie(res, token, ttlMs);
    return res.json({ success: true, rememberMe, mustChangeCredentials: isDefaultCredentialChangeRequired(user.id) });
});

router.post('/auth/logout', requireAuthApi, (req, res) => {
    destroySession(req, res);
    return res.sendStatus(200);
});

router.get('/auth/me', requireAuthApi, (req, res) => {
    const allowedSet = getAllowedGroupIds(req.authUser);
    res.json({
        id: req.authUser.id,
        username: req.authUser.username,
        displayName: req.authUser.display_name,
        isSuperadmin: req.authUser.is_superadmin === 1,
        permissions: req.authPermissions,
        allowedGroupIds: allowedSet ? Array.from(allowedSet) : null,
        mustChangeCredentials: isDefaultCredentialChangeRequired(req.authUser.id)
    });
});

router.post('/auth/first-login-change', requireAuthApi, (req, res) => {
    if (!isDefaultCredentialChangeRequired(req.authUser.id)) {
        return res.status(400).json({ error: 'Credential change not required' });
    }

    const username = sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!username || username.length < 3 || !/^[a-z0-9._-]+$/.test(username)) {
        return res.status(400).json({ error: 'Username must be at least 3 chars and contain only a-z, 0-9, dot, underscore, hyphen' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 chars' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    const existing = db.prepare('SELECT id FROM app_users WHERE username = ?').get(username);
    if (existing && existing.id !== req.authUser.id) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const tx = db.transaction(() => {
        db.prepare('UPDATE app_users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?')
            .run(username, hashPassword(password), nowIso(), req.authUser.id);
        setDefaultCredentialChangeRequired(req.authUser.id, false);
    });
    tx();

    return res.json({ success: true });
});

module.exports = router;
