const nodemailer = require('nodemailer');
const { Poll } = require('whatsapp-web.js');

const VERIFICATION_DEBUG = process.env.WA_VERIFICATION_DEBUG === 'true';
const BAIT_REPEAT_COOLDOWN_MS = Math.max(0, parseInt(process.env.WA_BAIT_REPEAT_COOLDOWN_HOURS || '24', 10) * 60 * 60 * 1000);

function debugLog(msg, meta = {}) {
    if (VERIFICATION_DEBUG) console.log(`[SecondaryVerif] ${msg} ${JSON.stringify(meta)}`);
}

// Ensure clean numeric id
function normalizeId(value) {
    if (typeof value !== 'string' || !value) return '';
    let normalized = value.trim();
    normalized = normalized.replace(/:[0-9]+(?=@)/g, '');
    normalized = normalized.replace(/@lid/g, '');
    normalized = normalized.replace(/@c\.us/g, '');
    normalized = normalized.replace(/@s\.whatsapp\.net/g, '');
    return normalized.trim();
}

function toCanonical(value) {
    const raw = normalizeId(value);
    if (!raw) return '';
    return `${raw}@c.us`;
}

function addApprovedNumber(db, requesterId) {
    const numberKey = normalizeId(requesterId).replace(/\D/g, '');
    if (!numberKey) return;
    db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(numberKey);
}

function markBaitBypassed(db, requesterId) {
    const numberKey = normalizeId(requesterId).replace(/\D/g, '');
    if (!numberKey) return;
    try {
        db.prepare('CREATE TABLE IF NOT EXISTS bait_bypassed_users (number TEXT PRIMARY KEY, bypassed_at INTEGER)').run();
        db.prepare('INSERT OR IGNORE INTO bait_bypassed_users (number, bypassed_at) VALUES (?, ?)').run(numberKey, Date.now());
    } catch (e) {
        console.error('[markBaitBypassed] Error:', e.message);
    }
}

async function archiveChat(client, requesterId) {
    const canonicalId = toCanonical(requesterId);
    if (!canonicalId) return;
    try {
        const dmChat = await client.getChatById(canonicalId);
        if (dmChat && typeof dmChat.archive === 'function') await dmChat.archive();
    } catch (e) { }
}

function hasCooldown(db, requesterId) {
    if (!BAIT_REPEAT_COOLDOWN_MS) return false;
    const key = normalizeId(requesterId);
    const row = db.prepare('SELECT last_sent_at FROM secondary_verification_bait_log WHERE requester_key = ?').get(key);
    if (!row || !row.last_sent_at) return false;
    return Date.now() - Number(row.last_sent_at) < BAIT_REPEAT_COOLDOWN_MS;
}

function markBaitSent(db, requesterId) {
    const key = normalizeId(requesterId);
    if (!key) return;
    db.prepare(`
        INSERT INTO secondary_verification_bait_log (requester_key, last_sent_at, sent_count)
        VALUES (?, ?, 1)
        ON CONFLICT(requester_key) DO UPDATE SET
            last_sent_at = excluded.last_sent_at, sent_count = secondary_verification_bait_log.sent_count + 1
    `).run(key, Date.now());
}

function logEmail(db, requesterId, groupId, email, status, errorCode='', errorMessage='') {
    const key = normalizeId(requesterId);
    if (!key) return;
    const now = Date.now();
    db.prepare(`
        INSERT INTO email_log (requester_key, requester_id, group_id, email, status, error_code, error_message, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(key, toCanonical(requesterId), groupId||'', email||'', status, errorCode, errorMessage, status==='sent'?now:null, now);
}

function upsertReplyLog(db, requesterId, groupId, mode, text='', state='') {
    const key = normalizeId(requesterId);
    if (!key) return;
    const now = Date.now();
    if (mode === 'sent') {
        db.prepare(`INSERT INTO secondary_verification_reply_log (requester_key, requester_id, group_id, bait_sent_at, replied_text, reply_count, last_state, updated_at) VALUES (?, ?, ?, ?, '', 0, ?, ?) ON CONFLICT(requester_key) DO UPDATE SET requester_id=excluded.requester_id, group_id=excluded.group_id, bait_sent_at=excluded.bait_sent_at, replied_text='', reply_count=0, last_state=excluded.last_state, updated_at=excluded.updated_at`).run(key, toCanonical(requesterId), groupId||'', now, state, now);
    } else if (mode === 'reply') {
        db.prepare(`INSERT INTO secondary_verification_reply_log (requester_key, requester_id, group_id, bait_sent_at, replied_at, replied_text, reply_count, last_state, updated_at) VALUES (?, ?, ?, 0, ?, ?, 1, ?, ?) ON CONFLICT(requester_key) DO UPDATE SET requester_id=excluded.requester_id, group_id=excluded.group_id, replied_at=excluded.replied_at, replied_text=excluded.replied_text, reply_count=reply_count+1, last_state=excluded.last_state, updated_at=excluded.updated_at`).run(key, toCanonical(requesterId), groupId||'', now, text, state, now);
    } else if (mode === 'no_reply') {
        db.prepare(`INSERT INTO secondary_verification_reply_log (requester_key, requester_id, group_id, bait_sent_at, replied_text, reply_count, last_state, updated_at) VALUES (?, ?, ?, 0, '', 0, ?, ?) ON CONFLICT(requester_key) DO UPDATE SET requester_id=excluded.requester_id, group_id=excluded.group_id, last_state=excluded.last_state, updated_at=excluded.updated_at`).run(key, toCanonical(requesterId), groupId||'', state, now);
    }
}

async function resolveGroupName(client, groupId) {
    try { const chat = await client.getChatById(groupId); if (chat && chat.name) return chat.name; } catch(e){}
    return groupId;
}

function getAdminGroupFor(config, groupId) {
    const groupConfig = config && config.groupsConfig && config.groupsConfig[groupId];
    const scoped = groupConfig && groupConfig.adminGroup ? groupConfig.adminGroup.trim() : '';
    const def = config.defaultAdminGroup ? config.defaultAdminGroup.trim() : '';
    return scoped || def || '';
}

function extractText(msg) {
    if (!msg) return '';
    if (typeof msg.body === 'string' && msg.body.trim()) return msg.body;
    if (typeof msg.caption === 'string' && msg.caption.trim()) return msg.caption;
    if (msg._data) {
        if (typeof msg._data.body === 'string' && msg._data.body.trim()) return msg._data.body;
        if (typeof msg._data.caption === 'string' && msg._data.caption.trim()) return msg._data.caption;
    }
    return '';
}

function keywordMatches(text, keywords, smartMatch) {
    const needle = (str) => {
        let s = String(str||'').toLowerCase().trim();
        if (smartMatch) {
            s = s.replace(/[!@#$%^&*()_+=\-\[\]{}:;"'<>,.?\/\\|~`]/g, '');
            s = s.replace(/[\u064B-\u0652\u0640\u0670]/g, '');
            s = s.replace(/[أإآ]/g, 'ا');
        }
        return s;
    };
    const t = needle(text);
    if (!t) return false;
    for (const kw of (Array.isArray(keywords)?keywords:[])) {
        const k = needle(kw);
        if (k && (t === k || t.includes(k))) return true;
    }
    return false;
}

async function resolveSessionAction(action, client, db, session) {
    const canon = toCanonical(session.requester_id);
    const key = normalizeId(session.requester_id);
    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(session.requester_id);
    
    // Always archive on completion to keep inbox clean
    await archiveChat(client, canon);

    if (action === 'approve') {
        const cg = await client.getChatById(session.group_id).catch(()=>null);
        if (cg && cg.approveGroupMembershipRequests) try { await cg.approveGroupMembershipRequests({ requesterIds: [canon] }); } catch(e){}
        addApprovedNumber(db, canon);
        upsertReplyLog(db, canon, session.group_id, 'no_reply', '', 'approved');
    } else if (action === 'reject') {
        const cg = await client.getChatById(session.group_id).catch(()=>null);
        if (cg && cg.rejectGroupMembershipRequests) try { await cg.rejectGroupMembershipRequests({ requesterIds: [canon] }); } catch(e){}
        upsertReplyLog(db, canon, session.group_id, 'no_reply', '', 'rejected');
    } else if (action === 'ban') {
        const cg = await client.getChatById(session.group_id).catch(()=>null);
        if (cg && cg.rejectGroupMembershipRequests) try { await cg.rejectGroupMembershipRequests({ requesterIds: [canon] }); } catch(e){}
        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(key);
        upsertReplyLog(db, canon, session.group_id, 'no_reply', '', 'banned');
    }
}

async function sendMethodPoll(client, db, config, session) {
    const isAr = config.secondaryVerificationLanguage === 'ar';
    const hasEmail = Boolean(session.require_email);
    const hasPhoto = Boolean(session.require_photo);
    if (!hasEmail && !hasPhoto) return; // Wait, should we send contact option too if no email/photo? Yes, we always add contact.
    
    // Automatically flag this user so they bypass Keyword Bait in all future timeout/group-join loops
    markBaitBypassed(db, session.requester_id);

    const gName = await resolveGroupName(client, session.group_id);
    const title = isAr ? `مرحباً بك. طلبت الانضمام إلى "${gName}". اختر الطريقة الأنسب لإكمال التحقق:` : `Welcome. You requested to join "${gName}". Please choose how you want to continue verification:`;
    const opts = [];
    if (hasEmail) opts.push(isAr ? 'إرسال رمز تحقق إلى بريدك الجامعي' : 'Send a verification code to your student email');
    if (hasPhoto) opts.push(isAr ? 'إرسال صورة مقرراتك من البلاك بورد' : 'Send a screenshot of your Blackboard courses');
    opts.push(isAr ? 'طلب تواصل مباشر من المشرف' : 'Request direct contact from an admin');
    opts.push(isAr ? 'إلغاء الطلب حالياً' : 'Cancel this request for now');
    
    const poll = new Poll(title, opts);
    const pollMsg = await client.sendMessage(toCanonical(session.requester_id), poll);
    await archiveChat(client, session.requester_id);
    
    db.prepare("UPDATE secondary_verification SET user_method_poll_id = ?, wait_started_at = ? WHERE requester_id = ? AND group_id = ?")
      .run(pollMsg.id._serialized, Date.now(), session.requester_id, session.group_id);
}

function parseMethodVote(voteArr) {
    const v = Array.isArray(voteArr) ? voteArr[0] : null;
    const name = ((v && typeof v === 'object' ? (v.name||'') : String(v||''))).toLowerCase();
    // Match purely by text content - never by position ID, since options shift based on enabled methods
    if (/code|email|بريد|رمز تحقق/.test(name)) return 'email';
    if (/screenshot|photo|صورة|بلاك بورد/.test(name)) return 'photo';
    if (/contact|admin|مشرف|تواصل|تواصل مباشر/.test(name)) return 'contact';
    if (/cancel|إلغاء|الغاء/.test(name)) return 'cancel';
    return null;
}

function parseAdminVote(voteArr) {
    const v = Array.isArray(voteArr) ? voteArr[0] : null;
    const name = ((v && typeof v === 'object' ? (v.name||'') : String(v||''))).toLowerCase();
    // Match by text only - supports both Arabic and English poll options
    if (/approve|موافقة|قبول|موافق/.test(name)) return 'approve';
    if (/deny|reject|رفض/.test(name)) return 'reject';
    if (/another|أخرى|اخرى|صورة أخرى|طلب صورة/.test(name)) return 'retry';
    if (/ban|حظر|cancel|إلغاء/.test(name)) return 'ban';
    return null;
}

function initVerification(client, db, config) {
    return {
        startVerification: async (rawRequesterId, cleanUserId, groupId, options = {}) => {
            const reqCanon = toCanonical(rawRequesterId);
            const reqKey = normalizeId(rawRequesterId);
            try {
                if (!config.enableSecondaryVerification) { console.log('[startVerification] failed: disabled'); return false; }
                
                const isTest = options.flowType === 'test';
                
                const groupList = Array.isArray(config.secondaryVerificationGroups) ? config.secondaryVerificationGroups : [];
                if (!groupList.includes(groupId)) { console.log('[startVerification] failed: group not in list', groupId, groupList); return false; }
                
                const isEmail = config.enableEmailVerification;
                const isPhoto = config.enablePhotoVerification;
                let isKw = config.enableKeywordVerification;
                
                const cleanKey = normalizeId(cleanUserId).replace(/\D/g, '');
                const hasBypassedRecord = isKw ? db.prepare('SELECT 1 FROM bait_bypassed_users WHERE number = ?').get(cleanKey) : null;
                const hasBypassed = !!hasBypassedRecord;
                if (hasBypassed) isKw = false;
                if (!isEmail && !isPhoto && !isKw) { console.log('[startVerification] failed: no methods'); return false; }
                
                if (!isTest && !options.forceRestart && hasCooldown(db, reqKey)) { console.log('[startVerification] failed: has cooldown'); return false; }
                
                const existing = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ?').get(reqCanon);
                if (existing) {
                    if (isTest && existing.flow_type !== 'test') { console.log('[startVerification] failed: overlaps with real session'); return false; }
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(existing.requester_id);
                    // Also wipe trailing reply logs so the dashboard doesn't show ghost interaction timestamps!
                    db.prepare('DELETE FROM secondary_verification_reply_log WHERE requester_id = ?').run(existing.requester_id);
                }
                
                const state = isKw ? 'PENDING_CUSTOM' : 'PENDING_METHOD';
                db.prepare(`
                    INSERT INTO secondary_verification 
                    (requester_id, group_id, state, flow_type, require_email, require_photo, user_method_poll_id, created_at, wait_started_at)
                    VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
                `).run(reqCanon, groupId, state, isTest ? 'test' : 'join', isEmail?1:0, isPhoto?1:0, Date.now(), Date.now());
                
                const isAr = config.secondaryVerificationLanguage === 'ar';
                if (isKw) {
                    const baits = (config.customMessageText||'').split('||').map(s=>s.trim()).filter(Boolean);
                    const bait = baits.length ? baits[Math.floor(Math.random()*baits.length)] : (isAr ? 'لإكمال الطلب يرجى الرد بكلمة الموافقة.' : 'To continue, reply with the approved keyword.');
                    await client.sendMessage(reqCanon, bait);
                    await archiveChat(client, reqCanon);
                    upsertReplyLog(db, reqCanon, groupId, 'sent', '', 'PENDING_CUSTOM');
                    if (!isTest) markBaitSent(db, reqCanon);
                } else {
                    let msgText = isAr ? 'تم قبول طلبك مبدئياً. سأرسل لك الآن قائمة خيارات التحقق.' : 'Your request was accepted initially. I will now send you the verification options.';
                    if (hasBypassed) {
                         const gName = await resolveGroupName(client, groupId);
                         msgText = isAr ? `مرحباً مجدداً. لقد لاحظنا طلبك للانضمام إلى "${gName}" وسنتابع من حيث توقفت. يرجى إكمال عملية التحقق الخاصة بك:` : `Welcome back. We noticed your request to join "${gName}" and will continue from where you left off. Please complete your verification:`;
                    }
                    await client.sendMessage(reqCanon, msgText);
                    await archiveChat(client, reqCanon);
                    upsertReplyLog(db, reqCanon, groupId, 'sent', '', 'PENDING_METHOD');
                    if (!isEmail && !isPhoto) {
                        await resolveSessionAction('approve', client, db, {requester_id: reqCanon, group_id: groupId});
                        await client.sendMessage(reqCanon, isAr ? 'تمت الموافقة عليك.' : 'You have been approved.');
                    } else {
                        const sess = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ?').get(reqCanon);
                        if (sess) await sendMethodPoll(client, db, config, sess);
                    }
                }
                return true;
            } catch (err) {
                console.error('[startVerification] Dispatch Failed. Number invalid/unreachable:', reqCanon, err.message);
                
                // If we couldn't message them because the number is fake/broken, immediately purge them
                db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(reqCanon);
                
                // Reject their WhatsApp request entirely to clean them out of the system
                if (!isTest) {
                    const chatObj = await client.getChatById(groupId).catch(() => null);
                    if (chatObj && chatObj.rejectGroupMembershipRequests) {
                        try { await chatObj.rejectGroupMembershipRequests({ requesterIds: [rawRequesterId] }); } catch (e) { }
                    }
                }
                return false;
            }
        },

        handleIncomingMessage: async (msg) => {
            if (!config.enableSecondaryVerification || msg.isGroupMsg) return false;
            if (msg.fromMe) return false; // Never process outgoing messages as incoming verification replies
            
            let fromData = String(msg._data && msg._data.from ? msg._data.from : (msg.from || ''));
            if (fromData.endsWith('@g.us')) return false;

            // Resolve @lid Ghost IDs to real phone numbers
            if (fromData.includes('@lid')) {
                try {
                    const contact = await client.getContactById(fromData);
                    if (contact && contact.number) {
                        fromData = `${contact.number}@c.us`;
                        console.log('[VRF-LOOKUP] Resolved @lid to real number:', fromData);
                    } else {
                        fromData = fromData.replace('@lid', '@c.us');
                    }
                } catch (e) {
                    fromData = fromData.replace('@lid', '@c.us');
                }
            }
            
            const senderKey = normalizeId(fromData);
            const sessionRows = db.prepare('SELECT * FROM secondary_verification').all();
            console.log('[VRF-LOOKUP] Sender key:', senderKey, '| Active sessions:', sessionRows.map(r => normalizeId(r.requester_id)));
            const session = sessionRows.find(r => normalizeId(r.requester_id) === senderKey);
            if (!session) {
                console.log('[VRF-LOOKUP] ❗ No session found. Sender not in verification list.');
                return false;
            }
            
            console.log('[VRF-LOOKUP] ✅ Session matched! state:', session.state, '| text:', extractText(msg).substring(0, 40));
            archiveChat(client, session.requester_id).catch(()=>{});

            const text = extractText(msg);
            const isText = text.trim().length > 0;
            const isAr = config.secondaryVerificationLanguage === 'ar';
            
            // Timeout Check
            const timeoutDays = Math.max(1, config.secondaryVerificationTimeoutDays || 2);
            if (Date.now() - session.created_at > timeoutDays * 24 * 3600 * 1000) {
                await resolveSessionAction('reject', client, db, session);
                return false;
            }

            // Stop code Check
            const stop = String(config.secondaryVerificationStopCode || '').trim();
            if (stop && stop.toLowerCase() === text.trim().toLowerCase()) {
                await resolveSessionAction('reject', client, db, session);
                await msg.reply(isAr ? 'تم إيقاف التحقق وإلغاء الطلب.' : 'Verification stopped and request cancelled.');
                return true;
            }

            const state = session.state;
            const smart = Boolean(config.enableSecondarySmartMatch);
            const isTest = session.flow_type === 'test';

            if (state === 'EXPIRED_WAITING_REENTRY') {
                const rt = text.trim().toLowerCase();
                const reopenCode = (config.secondaryVerificationReopenCode || '').trim().toLowerCase();
                if (isText && (rt === reopenCode || rt === 'reopen' || rt === 'متابعة' || rt === 'متابعه' || rt === 'continue' || rt === '1')) {
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', wait_started_at = ? WHERE requester_id = ?").run(Date.now(), session.requester_id);
                    await msg.reply(isAr ? 'تمت إعادة فتح التحقق.' : 'Verification reopened.');
                    const s2 = db.prepare('SELECT * FROM secondary_verification WHERE requester_id=?').get(session.requester_id);
                    if (s2 && (s2.require_email || s2.require_photo)) await sendMethodPoll(client, db, config, s2);
                    else await msg.reply(isAr ? 'لا توجد خيارات للتحقق.' : 'No options available.');
                }
                return true;
            }

            if (state === 'PENDING_CUSTOM') {
                if (!isText) return false;
                upsertReplyLog(db, senderKey, session.group_id, 'reply', text, state);
                
                const defaultBans = ['no', 'لا', 'رفض', '2', 'deny', 'cancel', 'إلغاء'];
                const defaultAys = ['yes', 'نعم', 'موافقة', 'موافق', '1', 'approve'];
                let bans = config.banKeyword ? config.banKeyword.split(/[,،]+/).map(s=>s.trim()).filter(Boolean) : defaultBans;
                let ays = config.approvalKeyword ? config.approvalKeyword.split(/[,،]+/).map(s=>s.trim()).filter(Boolean) : defaultAys;
                
                if (keywordMatches(text, bans, smart)) {
                    if (isTest) {
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id=?').run(session.requester_id);
                        await archiveChat(client, session.requester_id);
                        await msg.reply(isAr ? 'تم إلغاء الطلب.' : 'The request was cancelled.');
                    } else {
                        await resolveSessionAction('ban', client, db, session);
                    }
                    return true;
                }
                if (keywordMatches(text, ays, smart)) {
                    if (!isTest) markBaitBypassed(db, session.requester_id);
                    if (!session.require_email && !session.require_photo) {
                        await resolveSessionAction('approve', client, db, session);
                        await msg.reply(isAr ? 'تمت الموافقة على انضمامك.' : 'You have been approved to join.');
                    } else {
                        db.prepare("UPDATE secondary_verification SET state='PENDING_METHOD' WHERE requester_id=?").run(session.requester_id);
                        const s2 = db.prepare('SELECT * FROM secondary_verification WHERE requester_id=?').get(session.requester_id);
                        if (s2) await sendMethodPoll(client, db, config, s2);
                    }
                    return true;
                }
                
                if (isTest) await msg.reply(isAr ? 'رد غير صحيح.' : 'Incorrect reply.');
                else {
                    await resolveSessionAction('ban', client, db, session);
                }
                return true;
            }

            if (state === 'PENDING_METHOD') {
                const bans = (config.banKeyword||'no').split(',').map(s=>s.trim()).filter(Boolean);
                if (isTest && isText && keywordMatches(text, bans, smart)) {
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id=?').run(session.requester_id);
                    await archiveChat(client, session.requester_id);
                    await msg.reply(isAr ? 'تم إلغاء الطلب.' : 'The request was cancelled.');
                    return true;
                }
                if (isText && (text.includes('1') || text.includes('menu') || text.includes('قائمة'))) {
                    db.prepare("UPDATE secondary_verification SET user_method_poll_id='' WHERE requester_id=?").run(session.requester_id);
                    await sendMethodPoll(client, db, config, session);
                } else await msg.reply(isAr ? 'اختر من الاستطلاع السابق، أو أرسل 1 لإعادته.' : 'Choose from poll or send 1 to resend.');
                return true;
            }

            if (state === 'PENDING_EMAIL_INPUT') {
                if (!isText) return false;
                if (text.trim() === '1') {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_METHOD', email='', code='', user_method_poll_id='', wait_started_at=0 WHERE requester_id=?").run(session.requester_id);
                    await sendMethodPoll(client, db, config, db.prepare('SELECT * FROM secondary_verification WHERE requester_id=?').get(session.requester_id));
                    return true;
                }
                const dom = (config.emailDomain || 'college.edu').trim();
                const em = text.trim();
                if (!em.endsWith(`@${dom}`) || !em.includes('@')) {
                    await msg.reply(isAr ? `يجب أن ينتهي البريد بـ @${dom}` : `Email must end with @${dom}`);
                    return true;
                }
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                db.prepare("UPDATE secondary_verification SET state='PENDING_CODE', email=?, code=? WHERE requester_id=?").run(em, code, session.requester_id);

                if (config.outlookEmail && config.outlookPassword) {
                    const trans = nodemailer.createTransport({ host: 'smtp-mail.outlook.com', port: 587, secure: false, auth: { user: config.outlookEmail, pass: config.outlookPassword }, tls: { minVersion: 'TLSv1.2' } });
                    try {
                        await trans.sendMail({ from: config.outlookEmail, to: em, subject: isAr?'التحقق':'Verification', text: (isAr?'الرمز: ':'Code: ') + code });
                        logEmail(db, senderKey, session.group_id, em, 'sent');
                        await msg.reply(isAr ? 'تم إرسال الرمز للبريد. اكتب الرمز هنا، أو 1 للرجوع.' : 'Code sent. Type code here or 1 to return.');
                    } catch (e) {
                        logEmail(db, senderKey, session.group_id, em, 'failed', e.code||'', e.message||'');
                        await msg.reply(isAr ? 'مشكلة في الإرسال. استعمل طريقة أخرى (أرسل 1 للرجوع).' : 'Send failed. Use another method (Send 1).');
                        db.prepare("UPDATE secondary_verification SET state='PENDING_METHOD', email='', code='' WHERE requester_id=?").run(session.requester_id);
                    }
                } else await msg.reply(isAr ? 'إعدادات البريد غير صحيحة.' : 'SMTP not configured.');
                return true;
            }

            if (state === 'PENDING_CODE') {
                if (!isText) return false;
                if (text.trim() === '1') {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_METHOD', email='', code='' WHERE requester_id=?").run(session.requester_id);
                    await sendMethodPoll(client, db, config, db.prepare('SELECT * FROM secondary_verification WHERE requester_id=?').get(session.requester_id));
                    return true;
                }
                if (text.trim() === session.code) {
                    await resolveSessionAction('approve', client, db, session);
                    await msg.reply(isAr ? 'رمز صحيح. تمت الموافقة.' : 'Correct code. Approved.');
                } else await msg.reply(isAr ? 'رمز خاطئ.' : 'Wrong code.');
                return true;
            }

            if (state === 'PENDING_PHOTO_UPLOAD') {
                if (isText && text.trim() === '1') {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_METHOD' WHERE requester_id=?").run(session.requester_id);
                    await sendMethodPoll(client, db, config, db.prepare('SELECT * FROM secondary_verification WHERE requester_id=?').get(session.requester_id));
                    return true;
                }
                if (!msg.hasMedia) {
                    await msg.reply(isAr ? 'أرسل صورة أو 1 للرجوع.' : 'Send image or 1 to return.');
                    return true;
                }
                const m = await msg.downloadMedia();
                if (!m) return true;
                const admin = getAdminGroupFor(config, session.group_id);
                if (!admin) {
                    await msg.reply(isAr ? 'مجموعة مشرفين غير محددة.' : 'No admin group found.');
                    return true;
                }
                const dm = await client.sendMessage(admin, m, { caption: isAr ? `صورة من @${senderKey}` : `Photo from @${senderKey}` });
                const photoOpts = isAr
                    ? ['1 موافقة', '2 رفض', '3 طلب صورة أخرى', '4 حظر']
                    : ['1 Approve', '2 Reject', '3 Another Photo', '4 Ban'];
                const poll = new Poll(isAr ? 'قرار الصورة' : 'Photo decision', photoOpts);
                const pm = await client.sendMessage(admin, poll);
                db.prepare("UPDATE secondary_verification SET state='WAITING_ADMIN_PHOTO_REVIEW', admin_group_id=?, admin_decision_msg_id=?, admin_poll_msg_id=? WHERE requester_id=?")
                  .run(admin, dm.id._serialized, pm.id._serialized, session.requester_id);
                await msg.reply(isAr ? 'حُولت للمشرفين.' : 'Forwarded to admins.');
                return true;
            }

            if (state.startsWith('WAITING_')) {
                if (isText && text.trim() === '1') {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_METHOD' WHERE requester_id=?").run(session.requester_id);
                    await sendMethodPoll(client, db, config, db.prepare('SELECT * FROM secondary_verification WHERE requester_id=?').get(session.requester_id));
                    return true;
                }
                await msg.reply(isAr ? 'قيد مراجعة المشرفين. للرجوع أرسل 1' : 'Waiting for admins. Send 1 to return.');
                return true;
            }

            return false;
        },

        handleVoteUpdate: async (vote) => {
            const pollId = vote && vote.parentMessage && vote.parentMessage.id ? vote.parentMessage.id._serialized : '';
            if (!pollId) return false;
            
            // User Method Poll
            const uSess = db.prepare('SELECT * FROM secondary_verification WHERE user_method_poll_id = ?').get(pollId);
            if (uSess) {
                const choice = parseMethodVote(vote.selectedOptions);
                const isAr = config.secondaryVerificationLanguage === 'ar';
                if (choice === 'email' && uSess.require_email) {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_EMAIL_INPUT' WHERE requester_id=?").run(uSess.requester_id);
                    await client.sendMessage(toCanonical(uSess.requester_id), isAr ? 'أرسل بريدك الجامعي (@' + (config.emailDomain||'.edu') + ')' : 'Send your student email.');
                } else if (choice === 'photo' && uSess.require_photo) {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_PHOTO_UPLOAD' WHERE requester_id=?").run(uSess.requester_id);
                    await client.sendMessage(toCanonical(uSess.requester_id), isAr ? 'أرسل الصورة.' : 'Send screenshot.');
                } else if (choice === 'contact') {
                    const adm = getAdminGroupFor(config, uSess.group_id);
                    if (adm) {
                        const pollTitle = isAr
                            ? `طلب تواصل مباشر من @${normalizeId(uSess.requester_id)}`
                            : `Contact request from @${normalizeId(uSess.requester_id)}`;
                        const pollOpts = isAr
                            ? ['1 موافقة', '2 رفض', '3 حظر']
                            : ['1 Approve', '2 Reject', '3 Ban'];
                        const rp = await client.sendMessage(adm, new Poll(pollTitle, pollOpts));
                        db.prepare("UPDATE secondary_verification SET state='WAITING_ADMIN_CONTACT_DECISION', admin_group_id=?, admin_poll_msg_id=? WHERE requester_id=?").run(adm, rp.id._serialized, uSess.requester_id);
                        await client.sendMessage(toCanonical(uSess.requester_id), isAr ? 'تم إرسال طلبك إلى المشرفين. يرجى الانتظار.' : 'Your request has been forwarded to admins. Please wait.');
                    } else {
                        await client.sendMessage(toCanonical(uSess.requester_id), isAr ? 'لا يوجد مجموعة إدارة للاستقبال.' : 'No admin group available.');
                    }
                } else if (choice === 'cancel') {
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id=?').run(uSess.requester_id);
                    await client.sendMessage(toCanonical(uSess.requester_id), isAr ? 'تم الإلغاء.' : 'Cancelled.');
                }
                return true;
            }

            // Admin Decision Poll
            const aSess = db.prepare('SELECT * FROM secondary_verification WHERE admin_poll_msg_id = ?').get(pollId);
            if (aSess) {
                const choice = parseAdminVote(vote.selectedOptions);
                const isAr = config.secondaryVerificationLanguage === 'ar';
                if (!choice) return true;
                
                if (choice === 'approve') {
                    await resolveSessionAction('approve', client, db, aSess);
                    await client.sendMessage(toCanonical(aSess.requester_id), isAr ? 'موُفِق عليك.' : 'Approved.');
                } else if (choice === 'reject') {
                    await resolveSessionAction('reject', client, db, aSess);
                    await client.sendMessage(toCanonical(aSess.requester_id), isAr ? 'رُفضت.' : 'Rejected.');
                } else if (choice === 'ban') {
                    await resolveSessionAction('ban', client, db, aSess);
                    await client.sendMessage(toCanonical(aSess.requester_id), isAr ? 'حُظرت.' : 'Banned.');
                } else if (choice === 'retry' && aSess.state === 'WAITING_ADMIN_PHOTO_REVIEW') {
                    db.prepare("UPDATE secondary_verification SET state='PENDING_PHOTO_UPLOAD' WHERE requester_id=?").run(aSess.requester_id);
                    await client.sendMessage(toCanonical(aSess.requester_id), isAr ? 'أرسل صورة أخرى.' : 'Send another photo.');
                }
                return true;
            }
            return false;
        },

        handleAdminDecisionReply: async (msg) => {
            if (!msg.isGroupMsg || !msg.hasQuotedMsg) return false;
            const text = extractText(msg).toLowerCase();
            let act = '';
            if (/approve|موافقة|قبول/.test(text)) act = 'approve';
            else if (/reject|deny|رفض/.test(text)) act = 'reject';
            else if (/ban|حظر/.test(text)) act = 'ban';
            if (!act) return false;

            const q = await msg.getQuotedMessage().catch(()=>null);
            if (!q) return false;
            
            const session = db.prepare("SELECT * FROM secondary_verification WHERE admin_decision_msg_id=? AND state LIKE 'WAITING_ADMIN_%'").get(q.id._serialized);
            if (!session) return false;

            const cg = await msg.getChat().catch(()=>null);
            const user = cg && cg.participants ? cg.participants.find(p=>normalizeId(p.id._serialized)===normalizeId(msg.author||msg.from)) : null;
            if (!(user && (user.isAdmin || user.isSuperAdmin))) {
                await msg.reply('Admins only.'); return true;
            }

            await resolveSessionAction(act, client, db, session);
            await msg.reply('Done.');
            const isAr = config.secondaryVerificationLanguage === 'ar';
            if (act==='approve') await client.sendMessage(toCanonical(session.requester_id), isAr ? 'موُفِق عليك.' : 'Approved.');
            if (act==='reject') await client.sendMessage(toCanonical(session.requester_id), isAr ? 'رُفضت.' : 'Rejected.');
            if (act==='ban') await client.sendMessage(toCanonical(session.requester_id), isAr ? 'حُظرت.' : 'Banned.');
            return true;
        },

        sendAdminDecisionReminders: async () => {
            try {
                const now = Date.now();
                const diffMs = 6 * 3600 * 1000;
                const rows = db.prepare("SELECT * FROM secondary_verification WHERE state LIKE 'WAITING_ADMIN_%'").all();
                for (const r of rows) {
                    if (r.admin_last_reminder_at && (now - r.admin_last_reminder_at < diffMs)) continue;
                    try {
                        const m = r.state === 'WAITING_ADMIN_PHOTO_REVIEW' ? 'Reminder: Pending Photo' : 'Reminder: Pending Contact';
                        if (r.admin_decision_msg_id) await client.sendMessage(r.admin_group_id, m, {quotedMessageId: r.admin_decision_msg_id});
                        else await client.sendMessage(r.admin_group_id, m);
                    } catch(e) {}
                    db.prepare("UPDATE secondary_verification SET admin_last_reminder_at=? WHERE requester_id=?").run(now, r.requester_id);
                }
            } catch(e) {}
        }
    };
}

module.exports = { initVerification };
