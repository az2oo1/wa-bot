/**
 * test_verification.js
 * Run with:  node test_verification.js
 *
 * Tests every scenario that caused bugs:
 *   1. resolveLidJid — no double @c.us suffix
 *   2. startVerification — stores real phone, purges old LID-digit fakes
 *   3. handleIncomingMessage — session lookup finds real phone, self-heals corrupt entries
 *   4. State transitions — PENDING_EMAIL_INPUT, reopen (تابعه), EXPIRED_WAITING_REENTRY
 *   5. resolveSessionAction ban — no fake numbers in blacklist
 */

'use strict';

const Database = require('better-sqlite3');
const { initVerification } = require('./secondaryVerification');

// ── Colours ──────────────────────────────────────────────────────────────────
const G = '\x1b[32m✅'; const R = '\x1b[31m❌'; const Y = '\x1b[33m⚠️ '; const Z = '\x1b[0m';
let passed = 0, failed = 0;
function ok(label) { console.log(`${G} ${label}${Z}`); passed++; }
function fail(label, got, expected) {
    console.log(`${R} ${label}${Z}`);
    console.log(`   got:      ${JSON.stringify(got)}`);
    console.log(`   expected: ${JSON.stringify(expected)}`);
    failed++;
}
function section(title) { console.log(`\n\x1b[1m── ${title} ──\x1b[0m`); }

// ── In-memory DB + schema ────────────────────────────────────────────────────
function createTestDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE IF NOT EXISTS secondary_verification (
            requester_id TEXT PRIMARY KEY, group_id TEXT, state TEXT,
            flow_type TEXT DEFAULT 'join', require_email INTEGER DEFAULT 0,
            require_photo INTEGER DEFAULT 0, email TEXT DEFAULT '',
            code TEXT DEFAULT '', user_method_poll_id TEXT DEFAULT '',
            admin_group_id TEXT DEFAULT '', admin_poll_msg_id TEXT DEFAULT '',
            admin_decision_msg_id TEXT DEFAULT '', admin_last_reminder_at INTEGER,
            bypassed INTEGER DEFAULT 0, wait_started_at INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS secondary_verification_reply_log (
            requester_key TEXT PRIMARY KEY, requester_id TEXT, group_id TEXT,
            bait_sent_at INTEGER, replied_at INTEGER, replied_text TEXT,
            reply_count INTEGER DEFAULT 0, last_state TEXT, updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS secondary_verification_bait_log (
            requester_key TEXT PRIMARY KEY, last_sent_at INTEGER, sent_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS bait_bypassed_users (
            number TEXT PRIMARY KEY, bypassed_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS approved_numbers (number TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS blacklist (number TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS email_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT, requester_key TEXT, requester_id TEXT,
            group_id TEXT, email TEXT, status TEXT, error_code TEXT, error_message TEXT,
            sent_at INTEGER, created_at INTEGER
        );
    `);
    return db;
}

// ── Mock client ──────────────────────────────────────────────────────────────
function mockClient(opts = {}) {
    return {
        getContactLidAndPhone: opts.getContactLidAndPhone || (async (ids) => {
            // Default: resolves 79616396017785@lid → 966511031358@c.us
            return ids.map(id => {
                if (id.includes('79616396017785')) return { lid: id, pn: '966511031358@c.us' };
                if (id.includes('267018804707396')) return { lid: id, pn: '966539292258@c.us' };
                return { lid: id, pn: undefined };
            });
        }),
        getContactById: opts.getContactById || (async (id) => {
            if (id.includes('79616396017785')) return { number: '966511031358', id: { user: '966511031358' } };
            if (id.includes('267018804707396')) return { number: '966539292258', id: { user: '966539292258' } };
            return null;
        }),
        getChatById: opts.getChatById || (async () => ({
            name: 'Test Group',
            approveGroupMembershipRequests: async () => {},
            rejectGroupMembershipRequests: async () => {},
        })),
        sendMessage: opts.sendMessage || (async () => ({ id: { _serialized: 'msg_' + Date.now() } })),
    };
}

// ── Mock message ─────────────────────────────────────────────────────────────
function mockMsg(from, body, opts = {}) {
    return {
        from,
        fromMe: false,
        isGroupMsg: false,
        type: 'chat',
        body,
        hasMedia: opts.hasMedia || false,
        hasQuotedMsg: opts.hasQuotedMsg || false,
        _data: { from, body },
        reply: async (text) => { mockMsg._lastReply = text; return {}; },
        getChat: async () => ({ isGroup: false }),
        getQuotedMessage: async () => opts.quotedMsg || null,
    };
}

// ── Base config ───────────────────────────────────────────────────────────────
function baseConfig(overrides = {}) {
    return {
        enableSecondaryVerification: true,
        secondaryVerificationGroups: ['group1@g.us'],
        enableEmailVerification: true,
        enablePhotoVerification: false,
        enableKeywordVerification: false,
        secondaryVerificationLanguage: 'ar',
        emailDomain: 'edu.sa',
        secondaryVerificationTimeoutDays: 2,
        secondaryVerificationStopCode: 'STOP',
        secondaryVerificationReopenCode: 'reopen',
        enableSecondarySmartMatch: true,
        outlookEmail: 'test@test.com',
        outlookPassword: 'pass',
        ...overrides,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — resolveLidJid
// ═════════════════════════════════════════════════════════════════════════════
section('resolveLidJid — no double @c.us suffix');

async function testResolveLidJid() {
    // We need to access resolveLidJid directly — it's not exported, so we test it
    // indirectly via startVerification storing the right ID.
    const db = createTestDb();
    const config = baseConfig();
    const client = mockClient();
    const v = initVerification(client, db, config);

    // Start verification with a @lid requester
    const rawLid = '79616396017785:10@lid';
    const cleanResolved = '966511031358@c.us'; // what index.js would pass after its own resolveLidJid

    await v.startVerification(rawLid, cleanResolved, 'group1@g.us');
    const session = db.prepare('SELECT requester_id FROM secondary_verification').get();

    if (!session) {
        fail('Session should be created', null, 'row in DB');
        return;
    }

    // Must be real phone — NOT "79616396017785@c.us" or "79616396017785@c.us@c.us"
    const id = session.requester_id;
    if (id === '966511031358@c.us') {
        ok(`Stored real phone: ${id}`);
    } else if (id.includes('79616396017785')) {
        fail('Stored fake LID-digit number instead of real phone', id, '966511031358@c.us');
    } else if (id.includes('@c.us@c.us')) {
        fail('Double @c.us suffix bug still present', id, '966511031358@c.us');
    } else {
        fail('Stored unexpected ID', id, '966511031358@c.us');
    }

    db.close();
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — Duplicate session purge
// ═════════════════════════════════════════════════════════════════════════════
section('startVerification — purges old LID-digit fake before inserting real phone');

async function testDuplicatePurge() {
    const db = createTestDb();
    const config = baseConfig();
    const client = mockClient();
    const v = initVerification(client, db, config);

    // Simulate old broken code: manually insert the fake LID-digit session
    db.prepare(`INSERT INTO secondary_verification
        (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('79616396017785@c.us', 'group1@g.us', 'PENDING_METHOD', 'join', 1, 0, Date.now()-60000, Date.now()-60000);

    const beforeCount = db.prepare('SELECT COUNT(*) as n FROM secondary_verification').get().n;
    if (beforeCount === 1) ok('Pre-condition: old fake session exists in DB');
    else fail('Pre-condition failed', beforeCount, 1);

    // Now startVerification comes in with the real phone (as index.js would send it)
    const rawLid = '79616396017785:10@lid';
    const realPhone = '966511031358@c.us';
    await v.startVerification(rawLid, realPhone, 'group1@g.us');

    const sessions = db.prepare('SELECT requester_id FROM secondary_verification').all();

    if (sessions.length === 1) {
        ok(`Only one session in DB after startVerification`);
    } else {
        fail('Duplicate sessions still exist', sessions.length, 1);
        sessions.forEach(s => console.log('   session:', s.requester_id));
    }

    const fake = sessions.find(s => s.requester_id === '79616396017785@c.us');
    const real = sessions.find(s => s.requester_id === '966511031358@c.us');
    if (fake) fail('Old fake LID-digit session still exists', '79616396017785@c.us', 'deleted');
    else ok('Old fake LID-digit session was deleted');
    if (real) ok(`Real phone session exists: ${real.requester_id}`);
    else fail('Real phone session not found', null, '966511031358@c.us');

    db.close();
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — handleIncomingMessage session lookup
// ═════════════════════════════════════════════════════════════════════════════
section('handleIncomingMessage — finds session by real phone');

async function testSessionLookupRealPhone() {
    const db = createTestDb();
    const config = baseConfig({ enableKeywordVerification: true, approvalKeyword: 'تابع', banKeyword: 'لا' });
    const client = mockClient();
    const v = initVerification(client, db, config);

    // Manually insert a correctly stored session (real phone)
    db.prepare(`INSERT INTO secondary_verification
        (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('966511031358@c.us', 'group1@g.us', 'PENDING_EMAIL_INPUT', 'join', 1, 0, Date.now()-1000, Date.now()-1000);

    // Simulate user sending their email
    const msg = mockMsg('966511031358@c.us', 'student@edu.sa');

    // Mock email sending to avoid real SMTP
    let emailSent = false;
    const nodemailer = require('nodemailer');
    const origCreate = nodemailer.createTransport.bind(nodemailer);
    nodemailer.createTransport = () => ({
        sendMail: async () => { emailSent = true; return {}; }
    });

    const handled = await v.handleIncomingMessage(msg);
    nodemailer.createTransport = origCreate;

    if (handled === true) ok('Message handled (session found by real phone)');
    else fail('Message not handled — session lookup failed', handled, true);

    const session = db.prepare('SELECT state FROM secondary_verification WHERE requester_id = ?').get('966511031358@c.us');
    if (session && session.state === 'PENDING_CODE') ok('State advanced to PENDING_CODE after valid email');
    else fail('State not advanced', session && session.state, 'PENDING_CODE');

    db.close();
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — Self-healing: session stored as @lid gets fixed in-place
// ═════════════════════════════════════════════════════════════════════════════
section('handleIncomingMessage — self-heals @lid session when real phone sends message');

async function testSelfHealLidSession() {
    const db = createTestDb();
    const config = baseConfig();
    const client = mockClient();
    const v = initVerification(client, db, config);

    // Insert session stored with @lid (edge case: someone manually inserted it)
    db.prepare(`INSERT INTO secondary_verification
        (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('79616396017785@lid', 'group1@g.us', 'PENDING_METHOD', 'join', 1, 0, Date.now()-1000, Date.now()-1000);

    // User's real phone sends message
    const msg = mockMsg('966511031358@c.us', '1');
    const handled = await v.handleIncomingMessage(msg);

    if (handled === true) ok('Message handled after self-heal');
    else fail('Self-heal failed, message not handled', handled, true);

    // The session should now be stored under real phone
    const healed = db.prepare("SELECT requester_id FROM secondary_verification WHERE requester_id = '966511031358@c.us'").get();
    const old = db.prepare("SELECT requester_id FROM secondary_verification WHERE requester_id = '79616396017785@lid'").get();
    if (healed) ok('Session rewritten to real phone in DB');
    else fail('Session not rewritten to real phone', null, '966511031358@c.us in DB');
    if (!old) ok('Old @lid session removed from DB');
    else fail('@lid session still exists', old.requester_id, 'deleted');

    db.close();
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 5b — Reopen keyword: real WhatsApp Unicode variants
// ═════════════════════════════════════════════════════════════════════════════
section('EXPIRED_WAITING_REENTRY — real WhatsApp Unicode edge cases');

async function testReopenUnicode() {
    // These are what WhatsApp actually sends in the wild
    const edgeCases = [
        { label: 'RTL mark + متابعة',           text: '\u200Fمتابعة' },
        { label: 'متابعة with tashkeel (diacritic)', text: 'مُتابعة' },
        { label: 'متابعة + trailing RTL mark',   text: 'متابعة\u200F' },
        { label: 'ZWNJ between letters',          text: 'متاب\u200Cعة' },
        { label: 'BOM prefix',                    text: '\uFEFFمتابعة' },
        { label: 'mixed invisible + diacritic',   text: '\u200Fمُتابعة\u200F' },
        { label: 'تابعة (different spelling)',    text: 'تابعة' },
        { label: 'متابعه (ه not ة)',              text: 'متابعه' },
    ];

    for (const { label, text } of edgeCases) {
        const db = createTestDb();
        const config = baseConfig();
        const client = mockClient();
        const v = initVerification(client, db, config);

        db.prepare(`INSERT INTO secondary_verification
            (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run('966511031358@c.us', 'group1@g.us', 'EXPIRED_WAITING_REENTRY', 'join', 1, 0, Date.now()-1000, Date.now()-1000);

        const msg = mockMsg('966511031358@c.us', text);
        const handled = await v.handleIncomingMessage(msg);
        const session = db.prepare('SELECT state FROM secondary_verification WHERE requester_id = ?').get('966511031358@c.us');

        if (handled && session && session.state === 'PENDING_METHOD') {
            ok(`${label} → reopened`);
        } else {
            fail(`${label} did NOT reopen`, { handled, state: session?.state }, { handled: true, state: 'PENDING_METHOD' });
        }
        db.close();
    }
}

section('EXPIRED_WAITING_REENTRY — all Arabic reopen variants work');

async function testReopenKeywords() {
    const keywords = ['تابعه', 'تابعة', 'متابعه', 'متابعة', 'reopen', '1', 'continue'];

    for (const kw of keywords) {
        const db = createTestDb();
        const config = baseConfig();
        const client = mockClient();
        const v = initVerification(client, db, config);

        db.prepare(`INSERT INTO secondary_verification
            (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run('966511031358@c.us', 'group1@g.us', 'EXPIRED_WAITING_REENTRY', 'join', 1, 0, Date.now()-1000, Date.now()-1000);

        const msg = mockMsg('966511031358@c.us', kw);
        const handled = await v.handleIncomingMessage(msg);
        const session = db.prepare('SELECT state FROM secondary_verification WHERE requester_id = ?').get('966511031358@c.us');

        if (handled && session && session.state === 'PENDING_METHOD') {
            ok(`Reopen keyword "${kw}" → state moved to PENDING_METHOD`);
        } else {
            fail(`Reopen keyword "${kw}" did NOT reopen session`, { handled, state: session?.state }, { handled: true, state: 'PENDING_METHOD' });
        }
        db.close();
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 6 — resolveSessionAction ban: no fake numbers in blacklist
// ═════════════════════════════════════════════════════════════════════════════
section('resolveSessionAction ban — only real phone in blacklist');

async function testBanNoFake() {
    const db = createTestDb();
    const config = baseConfig({ enableKeywordVerification: true, banKeyword: 'لا', approvalKeyword: 'نعم' });
    const client = mockClient();
    const v = initVerification(client, db, config);

    // Session stored with real phone (post-fix behaviour)
    db.prepare(`INSERT INTO secondary_verification
        (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('966511031358@c.us', 'group1@g.us', 'PENDING_CUSTOM', 'join', 1, 0, Date.now()-1000, Date.now()-1000);

    const msg = mockMsg('966511031358@c.us', 'لا');
    await v.handleIncomingMessage(msg);

    const blacklist = db.prepare('SELECT number FROM blacklist').all().map(r => r.number);
    console.log('   Blacklist entries:', blacklist);

    const hasReal = blacklist.includes('966511031358@c.us');
    const hasFake = blacklist.some(n => n.includes('79616396017785') || n.includes('@lid'));

    if (hasReal) ok('Real phone added to blacklist');
    else fail('Real phone NOT in blacklist', blacklist, ['966511031358@c.us']);
    if (!hasFake) ok('No fake LID-digit numbers in blacklist');
    else fail('Fake LID-digit number found in blacklist', blacklist.filter(n=>n.includes('79616396017785')||n.includes('@lid')), []);

    db.close();
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 7 — The exact scenario that caused the bug (end-to-end)
// ═════════════════════════════════════════════════════════════════════════════
section('Full scenario: @lid join → duplicate → fix → email reply works');

async function testFullScenario() {
    const db = createTestDb();
    const config = baseConfig();
    const client = mockClient();
    const v = initVerification(client, db, config);

    // Step 1: Simulate old broken startVerification that stored fake LID-digit number
    const fakeId = '79616396017785@c.us';
    db.prepare(`INSERT INTO secondary_verification
        (requester_id, group_id, state, flow_type, require_email, require_photo, created_at, wait_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(fakeId, 'group1@g.us', 'PENDING_METHOD', 'join', 1, 0, Date.now()-120000, Date.now()-120000);
    ok('Step 1: Old fake LID-digit session in DB');

    // Step 2: New startVerification called with real phone (as fixed code would do)
    const rawLid = '79616396017785:10@lid';
    const realPhone = '966511031358@c.us';
    await v.startVerification(rawLid, realPhone, 'group1@g.us');

    const sessions = db.prepare('SELECT requester_id FROM secondary_verification').all();
    if (sessions.length === 1 && sessions[0].requester_id === realPhone) {
        ok('Step 2: Duplicate purged, one session with real phone');
    } else {
        fail('Step 2: Duplicate NOT purged', sessions.map(s=>s.requester_id), [realPhone]);
    }

    // Step 3: Set state to PENDING_EMAIL_INPUT so we can test email reply
    db.prepare("UPDATE secondary_verification SET state='PENDING_EMAIL_INPUT' WHERE requester_id=?").run(realPhone);

    // Step 4: User sends their email from their real phone number
    const nodemailer = require('nodemailer');
    const origCreate = nodemailer.createTransport.bind(nodemailer);
    nodemailer.createTransport = () => ({ sendMail: async () => ({}) });

    const emailMsg = mockMsg(realPhone, 'student@edu.sa');
    const emailHandled = await v.handleIncomingMessage(emailMsg);
    nodemailer.createTransport = origCreate;

    if (emailHandled) ok('Step 3: Email message handled correctly');
    else fail('Step 3: Email message NOT handled — session lookup failed', emailHandled, true);

    const afterEmail = db.prepare('SELECT state FROM secondary_verification WHERE requester_id=?').get(realPhone);
    if (afterEmail && afterEmail.state === 'PENDING_CODE') {
        ok('Step 4: State → PENDING_CODE after email sent');
    } else {
        fail('Step 4: State not PENDING_CODE', afterEmail?.state, 'PENDING_CODE');
    }

    // Step 5: User sends correct code
    const codeRow = db.prepare('SELECT code FROM secondary_verification WHERE requester_id=?').get(realPhone);
    const codeMsg = mockMsg(realPhone, codeRow?.code || '000000');
    await v.handleIncomingMessage(codeMsg);

    const approved = db.prepare('SELECT number FROM approved_numbers').all();
    if (approved.some(r => r.number.includes('966511031358'))) {
        ok('Step 5: User approved after correct code');
    } else {
        fail('Step 5: User NOT in approved_numbers', approved, 'entry with 966511031358');
    }

    db.close();
}

// ═════════════════════════════════════════════════════════════════════════════
//  RUN ALL
// ═════════════════════════════════════════════════════════════════════════════
(async () => {
    try {
        await testResolveLidJid();
        await testDuplicatePurge();
        await testSessionLookupRealPhone();
        await testSelfHealLidSession();
        await testReopenUnicode();
        await testReopenKeywords();
        await testBanNoFake();
        await testFullScenario();
    } catch (e) {
        console.error('\n\x1b[31mUNCAUGHT ERROR:\x1b[0m', e);
        failed++;
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`\x1b[1m Results: ${G} ${passed} passed${Z}  ${failed > 0 ? R : '\x1b[32m✅'} ${failed} failed${Z}`);
    if (failed > 0) process.exit(1);
})();
