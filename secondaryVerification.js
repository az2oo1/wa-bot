const nodemailer = require('nodemailer');
const { Poll } = require('whatsapp-web.js');

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_DEBUG = process.env.WA_VERIFICATION_DEBUG === 'true';
const pendingUserMethodPolls = new Map();
const pendingAdminPhotoPolls = new Map();
const pendingAdminContactPolls = new Map();
const ADMIN_WAIT_STATES = new Set(['WAITING_ADMIN_PHOTO_REVIEW', 'WAITING_ADMIN_CONTACT_DECISION']);
const REENTRY_READY_STATES = new Set(['EXPIRED_WAITING_REENTRY']);
const BAIT_REPEAT_COOLDOWN_MS = Math.max(
    0,
    parseInt(process.env.WA_BAIT_REPEAT_COOLDOWN_HOURS || '24', 10) * 60 * 60 * 1000
);

function getSessionTimeoutMs(config) {
    const rawDays = parseFloat(config && config.secondaryVerificationTimeoutDays);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 2;
    return Math.round(days * 24 * 60 * 60 * 1000);
}

function debugLog(message, meta = {}) {
    if (!VERIFICATION_DEBUG) return;
    try {
        console.log(`[VerificationDebug] ${message} ${JSON.stringify(meta)}`);
    } catch (e) {
        console.log(`[VerificationDebug] ${message}`);
    }
}

function normalizeVerificationId(value) {
    if (typeof value !== 'string' || !value) return '';
    let normalized = value.replace(/:[0-9]+/, '');
    if (normalized.includes('@lid')) normalized = normalized.replace('@lid', '@c.us');
    return normalized;
}

function toRequesterKey(value) {
    return normalizeVerificationId(value).replace('@c.us', '').trim();
}

function hasRecentBait(db, requesterId) {
    if (!BAIT_REPEAT_COOLDOWN_MS) return false;
    const requesterKey = toRequesterKey(requesterId);
    if (!requesterKey) return false;
    const row = db.prepare('SELECT last_sent_at FROM secondary_verification_bait_log WHERE requester_key = ?').get(requesterKey);
    if (!row || !row.last_sent_at) return false;
    return Date.now() - Number(row.last_sent_at) < BAIT_REPEAT_COOLDOWN_MS;
}

function markBaitSent(db, requesterId) {
    const requesterKey = toRequesterKey(requesterId);
    if (!requesterKey) return;
    db.prepare(`
        INSERT INTO secondary_verification_bait_log (requester_key, last_sent_at, sent_count)
        VALUES (?, ?, 1)
        ON CONFLICT(requester_key) DO UPDATE SET
            last_sent_at = excluded.last_sent_at,
            sent_count = COALESCE(secondary_verification_bait_log.sent_count, 0) + 1
    `).run(requesterKey, Date.now());
}

function getVerificationIdCandidates(value) {
    const normalized = normalizeVerificationId(value);
    const candidates = [];
    for (const candidate of [value, normalized]) {
        if (typeof candidate === 'string' && candidate && !candidates.includes(candidate)) {
            candidates.push(candidate);
        }
    }
    if (normalized.endsWith('@c.us')) {
        const bareNumber = normalized.slice(0, -5);
        const lidCandidate = `${bareNumber}@lid`;
        if (!candidates.includes(lidCandidate)) candidates.push(lidCandidate);
    }
    return candidates;
}

function extractIncomingText(msg) {
    if (!msg || typeof msg !== 'object') return '';
    const directBody = typeof msg.body === 'string' ? msg.body : '';
    const caption = typeof msg.caption === 'string' ? msg.caption : '';
    const dataBody = msg._data && typeof msg._data.body === 'string' ? msg._data.body : '';
    const dataCaption = msg._data && typeof msg._data.caption === 'string' ? msg._data.caption : '';
    return [directBody, caption, dataBody, dataCaption].find(value => typeof value === 'string' && value.trim()) || '';
}

function isAdminWaitState(state) {
    return ADMIN_WAIT_STATES.has(String(state || '').trim());
}

function isUserTimeoutState(state) {
    return !isAdminWaitState(state) && !REENTRY_READY_STATES.has(String(state || '').trim());
}

function resolveAdminGroupForVerification(config, groupId) {
    const groupConfig = config && config.groupsConfig ? config.groupsConfig[groupId] : null;
    const scopedAdmin = groupConfig && typeof groupConfig.adminGroup === 'string' ? groupConfig.adminGroup.trim() : '';
    const fallbackAdmin = typeof config.defaultAdminGroup === 'string' ? config.defaultAdminGroup.trim() : '';
    return scopedAdmin || fallbackAdmin || '';
}

function getApprovalKeywords(config) {
    const keywords = String(config && config.approvalKeyword ? config.approvalKeyword : 'yes')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    return keywords.length > 0 ? keywords : ['yes'];
}

function buildBaitMessage(config, isAr) {
    const baits = config && config.customMessageText
        ? config.customMessageText.split('||').map(s => s.trim()).filter(Boolean)
        : [];
    if (baits.length > 0) {
        return baits[Math.floor(Math.random() * baits.length)];
    }
    return isAr
        ? 'أهلاً بك. لإكمال الطلب، يرجى الرد بكلمة الموافقة المعتمدة.'
        : 'Welcome. To continue your request, please reply with the approved keyword.';
}

function normalizeReplyLogKey(value) {
    return normalizeVerificationId(value).replace('@c.us', '').trim();
}

function upsertReplyLogSent(db, requesterId, groupId, state = '') {
    const requesterKey = normalizeReplyLogKey(requesterId);
    if (!requesterKey) return;
    const now = Date.now();
    db.prepare(`
        INSERT INTO secondary_verification_reply_log (
            requester_key, requester_id, group_id, bait_sent_at, replied_at, replied_text, reply_count, last_state, updated_at
        ) VALUES (?, ?, ?, ?, NULL, '', 0, ?, ?)
        ON CONFLICT(requester_key) DO UPDATE SET
            requester_id = excluded.requester_id,
            group_id = excluded.group_id,
            bait_sent_at = excluded.bait_sent_at,
            last_state = excluded.last_state,
            updated_at = excluded.updated_at
    `).run(requesterKey, normalizeVerificationId(requesterId), groupId || '', now, String(state || ''), now);
}

function upsertReplyLogReply(db, requesterId, groupId, text, state = '') {
    const requesterKey = normalizeReplyLogKey(requesterId);
    if (!requesterKey) return;
    const now = Date.now();
    db.prepare(`
        INSERT INTO secondary_verification_reply_log (
            requester_key, requester_id, group_id, bait_sent_at, replied_at, replied_text, reply_count, last_state, updated_at
        ) VALUES (?, ?, ?, 0, ?, ?, 1, ?, ?)
        ON CONFLICT(requester_key) DO UPDATE SET
            requester_id = excluded.requester_id,
            group_id = excluded.group_id,
            replied_at = excluded.replied_at,
            replied_text = excluded.replied_text,
            reply_count = COALESCE(secondary_verification_reply_log.reply_count, 0) + 1,
            last_state = excluded.last_state,
            updated_at = excluded.updated_at
    `).run(requesterKey, normalizeVerificationId(requesterId), groupId || '', now, text || '', String(state || ''), now);
}

function upsertReplyLogNoReply(db, requesterId, groupId, state = '') {
    const requesterKey = normalizeReplyLogKey(requesterId);
    if (!requesterKey) return;
    const now = Date.now();
    db.prepare(`
        INSERT INTO secondary_verification_reply_log (
            requester_key, requester_id, group_id, bait_sent_at, replied_at, replied_text, reply_count, last_state, updated_at
        ) VALUES (?, ?, ?, 0, NULL, '', 0, ?, ?)
        ON CONFLICT(requester_key) DO UPDATE SET
            requester_id = excluded.requester_id,
            group_id = excluded.group_id,
            last_state = excluded.last_state,
            updated_at = excluded.updated_at
    `).run(requesterKey, normalizeVerificationId(requesterId), groupId || '', String(state || ''), now);
}

function logEmail(db, requesterId, groupId, email, status, errorCode = '', errorMessage = '') {
    const requesterKey = normalizeReplyLogKey(requesterId);
    if (!requesterKey) return;
    const now = Date.now();
    const sentAt = status === 'sent' ? now : null;
    db.prepare(`
        INSERT INTO email_log (
            requester_key, requester_id, group_id, email, status, error_code, error_message, sent_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(requesterKey, normalizeVerificationId(requesterId), groupId || '', email || '', status, errorCode || '', errorMessage || '', sentAt, now);
}

async function resolveGroupName(client, groupId) {
    try {
        const chatObj = await client.getChatById(groupId);
        if (chatObj && chatObj.name) return chatObj.name;
    } catch (e) { }
    return groupId;
}

function getVoteSelectionNumber(vote) {
    const options = Array.isArray(vote && vote.selectedOptions) ? vote.selectedOptions : [];
    for (const option of options) {
        const localId = option && typeof option === 'object' ? option.localId : '';
        const name = option && typeof option === 'object'
            ? (typeof option.name === 'string' ? option.name : '')
            : (typeof option === 'string' ? option : '');
        const joined = `${name} ${localId}`.trim();
        const match = joined.match(/(^|\D)([1-4])(\D|$)/);
        if (match) return match[2];
        const normalized = joined.toLowerCase();

        // User method-selection poll options (Arabic/English)
        if (/verification code|student email|بريد|رمز تحقق/.test(normalized)) return '1';
        if (/screenshot|blackboard|صورة|بلاك بورد/.test(normalized)) return '2';
        if (/direct contact|admin help|contact from an admin|تواصل مباشر|المشرف/.test(normalized)) return '3';
        if (/cancel this request|cancel|إلغاء|الغاء/.test(normalized)) return '4';

        // Admin decision poll/reply options
        if (/approve|موافقة|قبول/.test(normalized)) return '1';
        if (/deny|رفض/.test(normalized)) return '2';
        if (/another|اخرى|أخرى|اعادة|إعادة/.test(normalized)) return '3';
        if (/cancel|إلغاء|الغاء/.test(normalized)) return '4';
        if (/ban|حظر/.test(normalized)) return '4';
    }
    return '';
}

function getMethodSelectionAction(vote) {
    const optionNumber = getVoteSelectionNumber(vote);
    if (optionNumber === '1') return 'email';
    if (optionNumber === '2') return 'photo';
    if (optionNumber === '3') return 'contact';
    if (optionNumber === '4') return 'cancel';
    return 'unknown';
}

async function sendMethodSelectionPoll(client, db, config, record, isAr) {
    if (record && record.user_method_poll_id) {
        return record.user_method_poll_id;
    }
    const useEmail = record && record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
    const usePhoto = record && record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
    if (!useEmail && !usePhoto) {
        return '';
    }
    const groupName = await resolveGroupName(client, record.group_id);
    const title = isAr
        ? `مرحباً بك. طلبت الانضمام إلى "${groupName}". اختر الطريقة الأنسب لإكمال التحقق:`
        : `Welcome. You requested to join "${groupName}". Please choose how you want to continue verification:`;
    const options = [];
    if (useEmail) {
        options.push(isAr
            ? 'إرسال رمز تحقق إلى بريدك الجامعي'
            : 'Send a verification code to your student email');
    }
    if (usePhoto) {
        options.push(isAr
            ? 'إرسال صورة مقرراتك من البلاك بورد'
            : 'Send a screenshot of your Blackboard courses');
    }
    options.push(isAr
        ? 'طلب تواصل مباشر من المشرف'
        : 'Request direct contact from an admin');
    options.push(isAr
        ? 'إلغاء الطلب حالياً'
        : 'Cancel this request for now');
    const poll = new Poll(title, options);
    const pollMsg = await client.sendMessage(record.requester_id, poll);
    db.prepare(`
        UPDATE secondary_verification
        SET user_method_poll_id = ?
        WHERE requester_id = ? AND group_id = ?
    `).run(pollMsg.id._serialized, record.requester_id, record.group_id);
    pendingUserMethodPolls.set(pollMsg.id._serialized, {
        requesterId: record.requester_id,
        groupId: record.group_id
    });
    return pollMsg.id._serialized;
}

function findSessionByRequester(db, requesterId) {
    const normalizedRequesterId = normalizeVerificationId(requesterId);
    return db.prepare('SELECT * FROM secondary_verification').all()
        .find(row => normalizeVerificationId(row.requester_id) === normalizedRequesterId) || null;
}

function initVerification(client, db, config, chat) {
    return {
        handleVoteUpdate: async (vote) => {
            const pollId = vote && vote.parentMessage && vote.parentMessage.id ? vote.parentMessage.id._serialized : '';
            if (!pollId) return false;

            const dbMethodRecord = db.prepare('SELECT * FROM secondary_verification WHERE user_method_poll_id = ? LIMIT 1').get(pollId);
            const dbContactRecord = db.prepare("SELECT * FROM secondary_verification WHERE admin_poll_msg_id = ? AND state = 'WAITING_ADMIN_CONTACT_DECISION' LIMIT 1").get(pollId);
            const dbPhotoRecord = db.prepare("SELECT * FROM secondary_verification WHERE admin_poll_msg_id = ? AND state = 'WAITING_ADMIN_PHOTO_REVIEW' LIMIT 1").get(pollId);

            if (pendingUserMethodPolls.has(pollId) || dbMethodRecord) {
                const ctx = pendingUserMethodPolls.get(pollId);
                const record = ctx ? findSessionByRequester(db, ctx.requesterId) : dbMethodRecord;
                pendingUserMethodPolls.delete(pollId);
                    if (!record) return true;

                const isAr = config.secondaryVerificationLanguage === 'ar';
                const choice = getMethodSelectionAction(vote);
                const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                const usePhoto = record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
                const domain = config.emailDomain || 'college.edu';
                const groupName = await resolveGroupName(client, record.group_id);

                if (choice === 'email') {
                    if (!useEmail) {
                        await client.sendMessage(record.requester_id, isAr ? 'خيار البريد غير متاح حالياً. اختر خياراً آخر من القائمة.' : 'Email verification is not available right now. Please choose another option from the menu.');
                        await sendMethodSelectionPoll(client, db, config, record, isAr);
                        return true;
                    }
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_EMAIL_INPUT', user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? `أرسل بريدك الجامعي الذي ينتهي بـ @${domain}. وإذا رغبت بالرجوع للقائمة، أرسل الرقم 1.`
                        : `Please send your student email ending with @${domain}. If you want to return to the menu, send 1.`);
                    return true;
                }

                if (choice === 'photo') {
                    if (!usePhoto) {
                        await client.sendMessage(record.requester_id, isAr ? 'خيار الصورة غير متاح حالياً. اختر خياراً آخر من القائمة.' : 'Photo verification is not available right now. Please choose another option from the menu.');
                        await sendMethodSelectionPoll(client, db, config, record, isAr);
                        return true;
                    }
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_PHOTO_UPLOAD', user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'يرجى إرسال صورة واضحة لمقرراتك من البلاك بورد الآن. وللرجوع إلى القائمة، أرسل الرقم 1.'
                        : 'Please send a clear screenshot of your Blackboard courses now. To go back to the menu, send 1.');
                    return true;
                }

                if (choice === 'contact') {
                    const adminGroup = resolveAdminGroupForVerification(config, record.group_id);
                    if (adminGroup) {
                        const requesterHandle = toRequesterKey(record.requester_id);
                        const contactPoll = new Poll(
                            isAr
                                ? `طلب تواصل مباشر من @${requesterHandle} للانضمام إلى "${groupName}". اختر قرار الإدارة:`
                                : `Direct-contact request from @${requesterHandle} to join "${groupName}". Choose admin decision:`,
                            isAr
                                ? ['1 - موافقة', '2 - رفض', '3 - حظر']
                                : ['1 - Approve', '2 - Reject', '3 - Ban']
                        );
                        const pollMsg = await client.sendMessage(adminGroup, contactPoll, { mentions: [record.requester_id] });
                        pendingAdminContactPolls.set(pollMsg.id._serialized, {
                            requesterId: record.requester_id,
                            groupId: record.group_id
                        });

                        db.prepare(`
                            UPDATE secondary_verification
                            SET state = 'WAITING_ADMIN_CONTACT_DECISION', user_method_poll_id = '', admin_group_id = ?, admin_decision_msg_id = ?, admin_poll_msg_id = ?, admin_last_reminder_at = 0
                            WHERE requester_id = ? AND group_id = ?
                        `).run(adminGroup, pollMsg.id._serialized, pollMsg.id._serialized, record.requester_id, record.group_id);

                        await client.sendMessage(record.requester_id, isAr
                            ? 'تم إرسال طلبك إلى المشرفين. سيبقى طلبك معلقاً حتى يراجع المشرفون حالتك.'
                            : 'Your request has been sent to the admins. It will remain pending until an admin reviews your case.');
                        return true;
                    }
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تعذر إرسال طلبك للإدارة لأن مجموعة المشرفين غير مهيأة. حاول لاحقاً.'
                        : 'Could not send your request to admins because the admin group is not configured. Please try again later.');
                    return true;
                }

                if (choice === 'cancel') {
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'شكراً لوقتك. تم إلغاء الطلب بنجاح.'
                        : 'Thank you for your time. Your request has been cancelled successfully.');
                    return true;
                }

                await client.sendMessage(record.requester_id, isAr ? 'لم أفهم الخيار. سأعيد إرسال القائمة مرة أخرى.' : 'I could not understand that option. I will resend the menu.');
                db.prepare("UPDATE secondary_verification SET user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                await sendMethodSelectionPoll(client, db, config, record, isAr);
                return true;
            }

            if (pendingAdminContactPolls.has(pollId) || dbContactRecord) {
                const ctx = pendingAdminContactPolls.get(pollId);
                const record = ctx ? findSessionByRequester(db, ctx.requesterId) : dbContactRecord;
                const isAr = config.secondaryVerificationLanguage === 'ar';
                const choice = getVoteSelectionNumber(vote);

                if (!record) {
                    pendingAdminContactPolls.delete(pollId);
                    return true;
                }

                const joinChat = await client.getChatById(record.group_id).catch(() => null);
                const cleanId = toRequesterKey(record.requester_id);

                if (choice === '1') {
                    if (joinChat) {
                        try { await joinChat.approveGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminContactPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تمت الموافقة على طلبك من قبل الإدارة. أهلاً وسهلاً بك.'
                        : 'Your request was approved by the admin team. Welcome.');
                    return true;
                }

                if (choice === '2') {
                    if (joinChat) {
                        try { await joinChat.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminContactPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تم رفض طلب الانضمام من قبل الإدارة.'
                        : 'Your join request was rejected by the admin team.');
                    return true;
                }

                if (choice === '3') {
                    if (joinChat) {
                        try { await joinChat.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminContactPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تم رفض الطلب وإضافة الرقم إلى القائمة السوداء.'
                        : 'Your request was rejected and your number was added to the blacklist.');
                    return true;
                }

                return true;
            }

            if (pendingAdminPhotoPolls.has(pollId) || dbPhotoRecord) {
                const ctx = pendingAdminPhotoPolls.get(pollId);
                const record = ctx ? findSessionByRequester(db, ctx.requesterId) : dbPhotoRecord;
                const isAr = config.secondaryVerificationLanguage === 'ar';
                const choice = getVoteSelectionNumber(vote);

                if (!record) {
                    pendingAdminPhotoPolls.delete(pollId);
                    return true;
                }

                const chatObj = await client.getChatById(record.group_id).catch(() => null);
                const cleanId = toRequesterKey(record.requester_id);

                if (choice === '1') {
                    if (chatObj) {
                        try { await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تمت الموافقة على طلبك بعد مراجعة الصورة. أهلاً وسهلاً بك.'
                        : 'Your request has been approved after photo review. You are welcome to join.');
                    return true;
                }

                if (choice === '2') {
                    const chatForReject = await client.getChatById(record.group_id).catch(() => null);
                    if (chatForReject) {
                        try { await chatForReject.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تم رفض طلبك بعد مراجعة الصورة. يمكنك التقديم مرة أخرى لاحقاً.'
                        : 'Your request was rejected after reviewing the screenshot. You may apply again later.');
                    return true;
                }

                if (choice === '3') {
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_PHOTO_UPLOAD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'يرجى إرسال صورة أوضح، أو أرسل 1 للعودة إلى القائمة.'
                        : 'Please send a clearer screenshot, or send 1 to return to the menu.');
                    return true;
                }

                if (choice === '4') {
                    const chatForBan = await client.getChatById(record.group_id).catch(() => null);
                    if (chatForBan) {
                        try { await chatForBan.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تم رفض الطلب وإضافة الرقم إلى القائمة السوداء.'
                        : 'Your request was rejected and your number was added to the blacklist.');
                    return true;
                }

                return true;
            }

            return false;
        },

        handleAdminDecisionReply: async (msg) => {
            try {
                if (!msg || !msg.isGroupMsg || !msg.hasQuotedMsg) return false;

                const body = extractIncomingText(msg).trim().toLowerCase();
                if (!body) return false;

                let action = '';
                if (/approve|aprove|موافقة|قبول/.test(body)) action = 'approve';
                else if (/reject|rejict|deny|رفض/.test(body)) action = 'reject';
                else if (/ban|حظر/.test(body)) action = 'ban';
                if (!action) return false;

                const quoted = await msg.getQuotedMessage().catch(() => null);
                const quotedId = quoted && quoted.id ? quoted.id._serialized : '';
                if (!quotedId) return false;

                const row = db.prepare(`
                    SELECT * FROM secondary_verification
                    WHERE admin_decision_msg_id = ?
                      AND state IN ('WAITING_ADMIN_PHOTO_REVIEW', 'WAITING_ADMIN_CONTACT_DECISION')
                    LIMIT 1
                `).get(quotedId);
                if (!row) return false;

                const groupChat = await msg.getChat().catch(() => null);
                const actorId = normalizeVerificationId(msg.author || msg.from || '');
                if (!groupChat || !groupChat.isGroup || !actorId) return false;
                const actor = Array.isArray(groupChat.participants)
                    ? groupChat.participants.find(p => normalizeVerificationId(p.id && p.id._serialized) === actorId)
                    : null;
                const isActorAdmin = Boolean(actor && (actor.isAdmin || actor.isSuperAdmin));
                if (!isActorAdmin) {
                    await msg.reply(config.secondaryVerificationLanguage === 'ar'
                        ? 'هذا القرار متاح للمشرفين فقط.'
                        : 'This action is available to admins only.');
                    return true;
                }

                const isAr = config.secondaryVerificationLanguage === 'ar';
                const requesterId = row.requester_id;
                const cleanId = toRequesterKey(requesterId);
                const joinChat = await client.getChatById(row.group_id).catch(() => null);

                if (action === 'approve') {
                    if (joinChat) {
                        try { await joinChat.approveGroupMembershipRequests({ requesterIds: [requesterId] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(row.requester_id, row.group_id);
                    await client.sendMessage(requesterId, isAr
                        ? 'تمت الموافقة على طلبك من قبل الإدارة. أهلاً وسهلاً بك.'
                        : 'Your request has been approved by the admins. Welcome.');
                    await msg.reply(isAr ? 'تم تنفيذ الموافقة بنجاح.' : 'Approval has been applied successfully.');
                    return true;
                }

                if (action === 'reject') {
                    if (joinChat) {
                        try { await joinChat.rejectGroupMembershipRequests({ requesterIds: [requesterId] }); } catch (e) { }
                    }
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(row.requester_id, row.group_id);
                    await client.sendMessage(requesterId, isAr
                        ? 'تم رفض طلب الانضمام من قبل الإدارة.'
                        : 'Your join request was rejected by the admins.');
                    await msg.reply(isAr ? 'تم تنفيذ الرفض بنجاح.' : 'Rejection has been applied successfully.');
                    return true;
                }

                if (action === 'ban') {
                    if (joinChat) {
                        try { await joinChat.rejectGroupMembershipRequests({ requesterIds: [requesterId] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(row.requester_id, row.group_id);
                    await client.sendMessage(requesterId, isAr
                        ? 'تم رفض الطلب وإضافة الرقم إلى القائمة السوداء.'
                        : 'Your request was rejected and your number was added to the blacklist.');
                    await msg.reply(isAr ? 'تم تنفيذ الحظر بنجاح.' : 'Ban has been applied successfully.');
                    return true;
                }

                return false;
            } catch (e) {
                debugLog('admin decision reply error', { error: e && e.message ? e.message : String(e) });
                return false;
            }
        },

        sendAdminDecisionReminders: async () => {
            try {
                const reminderIntervalMs = 6 * 60 * 60 * 1000;
                const now = Date.now();
                const rows = db.prepare(`
                    SELECT requester_id, group_id, state, admin_group_id, admin_decision_msg_id, admin_last_reminder_at
                    FROM secondary_verification
                    WHERE state IN ('WAITING_ADMIN_PHOTO_REVIEW', 'WAITING_ADMIN_CONTACT_DECISION')
                      AND admin_group_id IS NOT NULL
                      AND admin_group_id != ''
                      AND admin_decision_msg_id IS NOT NULL
                      AND admin_decision_msg_id != ''
                `).all();

                for (const row of rows) {
                    const lastReminderAt = Number(row.admin_last_reminder_at || 0);
                    if (lastReminderAt > 0 && now - lastReminderAt < reminderIntervalMs) continue;

                    const isAr = config.secondaryVerificationLanguage === 'ar';
                    const reminderText = row.state === 'WAITING_ADMIN_CONTACT_DECISION'
                        ? (isAr
                            ? 'تذكير: يوجد طلب تواصل مباشر بانتظار قرار الإدارة. يرجى التصويت أو الرد: موافقة / رفض / حظر.'
                            : 'Reminder: a direct-contact request is pending admin decision. Please vote or reply: approve / reject / ban.')
                        : (isAr
                            ? 'تذكير: توجد صورة تحقق بانتظار قرار الإدارة. يرجى التصويت أو الرد: موافقة / رفض / حظر.'
                            : 'Reminder: a verification screenshot is pending admin decision. Please vote or reply: approve / reject / ban.');

                    try {
                        await client.sendMessage(row.admin_group_id, reminderText, { quotedMessageId: row.admin_decision_msg_id });
                    } catch (e) {
                        await client.sendMessage(row.admin_group_id, reminderText).catch(() => { });
                    }

                    db.prepare(`
                        UPDATE secondary_verification
                        SET admin_last_reminder_at = ?
                        WHERE requester_id = ? AND group_id = ?
                    `).run(now, row.requester_id, row.group_id);
                }
            } catch (e) {
                debugLog('admin reminders error', { error: e && e.message ? e.message : String(e) });
            }
        },

        // Triggered after bio check is passed
        startVerification: async (rawRequesterId, cleanUserId, groupId, options = {}) => {
            if (!config.enableSecondaryVerification) {
                debugLog('start blocked: feature disabled', { requesterId: rawRequesterId, groupId });
                return false;
            }
            
            // Check if feature applies to this group
            const normalizeGroupId = (value) => String(value || '').trim();
            const normalizedGroupId = normalizeGroupId(groupId);
            const enabledGroups = Array.isArray(config.secondaryVerificationGroups)
                ? config.secondaryVerificationGroups.map(normalizeGroupId).filter(Boolean)
                : [];
            if (enabledGroups.length === 0) {
                debugLog('start blocked: no selected groups', { requesterId: rawRequesterId, groupId });
                return false;
            }
            if (!enabledGroups.includes(normalizedGroupId)) {
                debugLog('start blocked: group not selected', { requesterId: rawRequesterId, groupId, selectedGroups: enabledGroups });
                return false;
            }

            const useKeyword = config.enableKeywordVerification;
            const useEmail = config.enableEmailVerification;
            const usePhoto = config.enablePhotoVerification;
            if (!useKeyword && !useEmail && !usePhoto) {
                debugLog('start blocked: no methods enabled', { requesterId: rawRequesterId, groupId });
                return false;
            }

            const flowType = options.flowType === 'test' ? 'test' : 'join';
            const forceRestart = Boolean(options.forceRestart);
            let skipKeywordForNewGroup = false;

            if (!forceRestart && flowType !== 'test' && hasRecentBait(db, rawRequesterId)) {
                debugLog('start blocked: bait cooldown active', { requesterId: rawRequesterId, groupId, cooldownMs: BAIT_REPEAT_COOLDOWN_MS });
                return false;
            }

            // Only one active verification session per requester across all groups.
            // WhatsApp may alternate identifiers between @lid and @c.us for the same user.
            const normalizedIncomingId = normalizeVerificationId(rawRequesterId);
            const existingRecord = db.prepare('SELECT requester_id, group_id, created_at, state FROM secondary_verification').all()
                .find(row => normalizeVerificationId(row.requester_id) === normalizedIncomingId);
            if (existingRecord) {
                const ttlMs = getSessionTimeoutMs(config);
                const isSameGroup = String(existingRecord.group_id || '') === String(groupId || '');
                const isExpired = !existingRecord.created_at || Date.now() - existingRecord.created_at > ttlMs;
                const isStillInBait = String(existingRecord.state || '') === 'PENDING_CUSTOM';

                if (!isSameGroup && isStillInBait && !forceRestart) {
                    const isAr = config.secondaryVerificationLanguage === 'ar';
                    await client.sendMessage(rawRequesterId, isAr
                        ? 'ما زلت في خطوة كلمة التحقق للسابق. هل يمكنك الرد على الرسالة السابقة أولاً؟'
                        : 'You are still on the previous bait/keyword step. Can you reply to the previous verification message first?');
                    await client.sendMessage(rawRequesterId, buildBaitMessage(config, isAr));
                    debugLog('start blocked: still in bait for another group', {
                        requesterId: rawRequesterId,
                        requestedGroupId: groupId,
                        existingGroupId: existingRecord.group_id
                    });
                    return false;
                }

                if (!isSameGroup && !isStillInBait) {
                    // User already passed bait in another group, so switch to new group and start from method poll.
                    skipKeywordForNewGroup = true;
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?')
                        .run(existingRecord.requester_id, existingRecord.group_id);
                    debugLog('start switching group after bait passed', {
                        requesterId: rawRequesterId,
                        fromGroupId: existingRecord.group_id,
                        toGroupId: groupId,
                        previousState: existingRecord.state
                    });
                } else if (isSameGroup && (forceRestart || isExpired)) {
                    debugLog('start replacing existing session', {
                        requesterId: rawRequesterId,
                        existingRequesterId: existingRecord.requester_id,
                        groupId,
                        forceRestart,
                        isExpired
                    });
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(existingRecord.requester_id, groupId);
                } else {
                    debugLog('start blocked: active session exists in another group', {
                        requesterId: rawRequesterId,
                        requestedGroupId: groupId,
                        existingGroupId: existingRecord.group_id,
                        existingState: existingRecord.state
                    });
                    return false; // Already sent them a message, waiting for their reply
                }
            }
            
            console.log(`[Verification] Starting for ${cleanUserId}`);
            
            const initialState = (useKeyword && !skipKeywordForNewGroup) ? 'PENDING_CUSTOM' : 'PENDING_METHOD';
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO secondary_verification 
                (requester_id, group_id, state, flow_type, require_email, require_photo, user_method_poll_id, email, code, created_at, admin_poll_msg_id)
                VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?, '')
            `);
            insertStmt.run(rawRequesterId, groupId, initialState, flowType, useEmail ? 1 : 0, usePhoto ? 1 : 0, Date.now());
            debugLog('session started', {
                requesterId: rawRequesterId,
                groupId,
                initialState,
                flowType,
                useKeyword,
                useEmail,
                usePhoto
            });

            const isAr = config.secondaryVerificationLanguage === 'ar';
            // Send initial custom message or method prompt
            let initMsg = '';
            if (useKeyword && !skipKeywordForNewGroup) {
                initMsg = buildBaitMessage(config, isAr);
            } else {
                initMsg = isAr
                    ? 'تم قبول طلبك مبدئياً. سأرسل لك الآن قائمة خيارات التحقق.'
                    : 'Your request was accepted initially. I will now send you the verification options.';
            }
            try {
                await client.sendMessage(rawRequesterId, initMsg);
                if (flowType !== 'test') {
                    markBaitSent(db, rawRequesterId);
                    upsertReplyLogSent(db, rawRequesterId, groupId, initialState);
                }
                if (initialState === 'PENDING_METHOD') {
                    const seededRecord = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(rawRequesterId, groupId);
                    if (seededRecord) {
                        const methodsEnabled = (seededRecord.require_email === 1) || (seededRecord.require_photo === 1);
                        if (!methodsEnabled) {
                            const chatObj = await client.getChatById(groupId).catch(() => null);
                            const cleanId = toRequesterKey(rawRequesterId);
                            if (chatObj) {
                                try { await chatObj.approveGroupMembershipRequests({ requesterIds: [rawRequesterId] }); } catch (e) { }
                            }
                            db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(rawRequesterId, groupId);
                            const groupName = await resolveGroupName(client, groupId);
                            await client.sendMessage(rawRequesterId, isAr
                                ? `تمت الموافقة على انضمامك إلى "${groupName}"، وتمت إضافتك إلى قائمة المتحقق منهم.`
                                : `You have been approved to join "${groupName}" and added to the verified list.`);
                        } else {
                            await sendMethodSelectionPoll(client, db, config, seededRecord, isAr);
                        }
                    }
                }
                debugLog('initial message sent', { requesterId: rawRequesterId, groupId, initialState });
            } catch (e) {
                console.error(`[Verification] Failed to message ${rawRequesterId}`, e);
                debugLog('initial message failed', { requesterId: rawRequesterId, groupId, error: e && e.message ? e.message : String(e) });
            }
            return true; // Indicates we intercepted it, do not approve/reject yet
        },

        // Triggered on every incoming message
        handleIncomingMessage: async (msg) => {
            if (!config.enableSecondaryVerification || msg.isGroupMsg) return false;

            const ignoredMessageTypes = new Set(['revoked', 'ciphertext', 'e2e_notification', 'notification_template', 'gp2', 'protocol']);
            if (ignoredMessageTypes.has(msg.type)) return false;

            const isTextMessage = msg.type === 'chat' || msg.type === 'text';
            
            const senderId = msg.from;
            const normalizedSenderId = normalizeVerificationId(senderId);
            const senderCandidates = new Set(getVerificationIdCandidates(senderId));
            const incomingText = extractIncomingText(msg);
            let record = null;
            for (const row of db.prepare('SELECT * FROM secondary_verification').all()) {
                const rowId = row && row.requester_id ? row.requester_id : '';
                const normalizedRowId = normalizeVerificationId(rowId);
                if (senderCandidates.has(rowId) || senderCandidates.has(normalizedRowId) || normalizedRowId === normalizedSenderId) {
                    record = row;
                    break;
                }
            }
            if (!record) {
                debugLog('incoming ignored: no active session', { senderId, msgType: msg.type });
                return false;
            }

            debugLog('incoming matched session', {
                senderId,
                requesterId: record.requester_id,
                state: record.state,
                flowType: record.flow_type || 'join',
                msgType: msg.type,
                hasMedia: Boolean(msg.hasMedia),
                hasQuotedMsg: Boolean(msg.hasQuotedMsg),
                textPreview: typeof incomingText === 'string' ? incomingText.slice(0, 120) : ''
            });

            const now = Date.now();
            const ttlMs = getSessionTimeoutMs(config);
            if (isUserTimeoutState(record.state) && (!record.created_at || now - record.created_at > ttlMs)) {
                const chatObj = await client.getChatById(record.group_id).catch(() => null);
                if (chatObj) {
                    try { await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                }
                db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                upsertReplyLogNoReply(db, record.requester_id, record.group_id, `expired:${record.state}`);
                debugLog('session expired and deleted', { requesterId: record.requester_id, state: record.state, ttlMs });
                return false;
            }

            // Helper for smart match
            const applySmartMatch = (str) => {
                if (typeof str !== 'string') return str;
                let res = str.replace(/[!@#$%^&*()_+=\-\[\]{}:;"'<>,.?\/\\|~`]/g, '');
                res = res.replace(/[\u064B-\u0652\u0640\u0670]/g, '');
                res = res.replace(/[أإآ]/g, 'ا');
                return res;
            };

            const rawText = incomingText.trim().toLowerCase();
            const smartText = config.enableSecondarySmartMatch ? applySmartMatch(rawText) : rawText;
            const stopCode = String(config.secondaryVerificationStopCode || '').trim().toLowerCase();
            
            const groupToJoin = record.group_id;
            let wasHandled = false;

            if (stopCode && rawText === stopCode) {
                const chatObj = await client.getChatById(groupToJoin).catch(() => null);
                if (chatObj) {
                    try { await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                }
                db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                upsertReplyLogNoReply(db, record.requester_id, record.group_id, 'stopped');
                await msg.reply(config.secondaryVerificationLanguage === 'ar'
                    ? 'تم إيقاف جلسة التحقق وإلغاء طلب الانضمام.'
                    : 'Your verification session has been stopped and the join request was cancelled.');
                debugLog('session stopped by stop code from requester', { requesterId: record.requester_id });
                return true;
            }

            try {
                const isAr = config.secondaryVerificationLanguage === 'ar';
                const approvalKeywords = getApprovalKeywords(config);
                const approvalKeywordMatch = (() => {
                    if (!isTextMessage) return false;
                    const normalizedKeywords = config.enableSecondarySmartMatch
                        ? approvalKeywords.map(value => applySmartMatch(value.toLowerCase()))
                        : approvalKeywords.map(value => value.toLowerCase());
                    return normalizedKeywords.some(keyword => keyword && smartText.includes(keyword));
                })();

                if (record.state === 'EXPIRED_WAITING_REENTRY') {
                    if (!isTextMessage) return false;

                    if (!approvalKeywordMatch) {
                        const keywordHint = approvalKeywords.join(' / ');
                        await msg.reply(isAr
                            ? `انتهت فترة التحقق. إذا أردت إعادة التحقق، أرسل كلمة: ${keywordHint}`
                            : `Your verification window has expired. If you want to authenticate again, send: ${keywordHint}`);
                        return true;
                    }

                    const useKeyword = config.enableKeywordVerification;
                    const useEmail = config.enableEmailVerification;
                    const usePhoto = config.enablePhotoVerification;
                    const initialState = useKeyword ? 'PENDING_CUSTOM' : 'PENDING_METHOD';
                    db.prepare(`
                        UPDATE secondary_verification
                        SET state = ?, flow_type = COALESCE(flow_type, 'join'), require_email = ?, require_photo = ?, email = '', code = '', created_at = ?
                        WHERE requester_id = ? AND group_id = ?
                    `).run(initialState, useEmail ? 1 : 0, usePhoto ? 1 : 0, Date.now(), record.requester_id, record.group_id);

                    const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                    const initMsg = useKeyword
                        ? buildBaitMessage(config, isAr)
                        : (isAr
                            ? 'تمت إعادة تفعيل التحقق. سأرسل لك الآن قائمة خيارات التحقق.'
                            : 'Verification has been reactivated. I will now send you the verification options.');

                    try {
                        await client.sendMessage(record.requester_id, initMsg);
                        if (!useKeyword && (useEmail || usePhoto) && refreshed) {
                            await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        }
                    } catch (e) {
                        debugLog('expired reentry message failed', { requesterId: record.requester_id, error: e && e.message ? e.message : String(e) });
                    }
                    return true;
                }
                
                if (record.state === 'PENDING_CUSTOM') {
                    if (!isTextMessage) {
                        debugLog('pending custom ignored: non-text', { requesterId: record.requester_id, msgType: msg.type, hasMedia: Boolean(msg.hasMedia) });
                        return false;
                    }

                    // If the user lost/deleted chat history, a question-mark ping resends the bait safely.
                    const resendBaitRequest = ['?', '؟', '؟؟'].includes(rawText);
                    if (resendBaitRequest) {
                        await msg.reply(buildBaitMessage(config, isAr));
                        debugLog('bait resent on user request', { requesterId: record.requester_id, triggerText: rawText });
                        return true;
                    }

                    let approveWs = (config.approvalKeyword || 'yes').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
                    let banWs = (config.banKeyword || 'no').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
                    if (approveWs.length === 0) approveWs = ['yes'];
                    if (banWs.length === 0) banWs = ['no'];
                    const isTestFlow = record.flow_type === 'test';
                    
                    if (config.enableSecondarySmartMatch) {
                        approveWs = approveWs.map(s => applySmartMatch(s));
                        banWs = banWs.map(s => applySmartMatch(s));
                    }

                    if (banWs.some(w => smartText.includes(w))) {
                        wasHandled = true;
                        upsertReplyLogReply(db, record.requester_id, record.group_id, incomingText, record.state);
                        debugLog('ban keyword matched', { requesterId: record.requester_id, flowType: record.flow_type || 'join' });
                        if (isTestFlow) {
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                            upsertReplyLogNoReply(db, record.requester_id, record.group_id, 'test_ban');
                            await msg.reply(isAr ? 'تم التقاط كلمة الرفض في وضع الاختبار. لن يتم تنفيذ الحظر أثناء الاختبار.' : 'Ban keyword detected in test mode. No blacklist action is applied during tests.');
                            debugLog('test flow ban handled and session deleted', { requesterId: record.requester_id });
                            return true;
                        }
                        // Reject and ban
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = toRequesterKey(record.requester_id);
                        if (chatObj) await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] });
                        
                        // Add to blacklist (ban)
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                                                upsertReplyLogNoReply(db, record.requester_id, record.group_id, 'wrong_bait');
                        debugLog('ban applied and session deleted', { requesterId: record.requester_id });
                        // Make it a silent trap: no rejection notification
                        return true;
                    } else if (approveWs.some(w => smartText.includes(w))) {
                        wasHandled = true;
                                                upsertReplyLogReply(db, record.requester_id, record.group_id, incomingText, record.state);
                        const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                        const usePhoto = record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
                        debugLog('approval keyword matched', { requesterId: record.requester_id, useEmail, usePhoto });

                        if (!useEmail && !usePhoto) {
                            // Keyword was the only verification needed
                            const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                            const cleanId = toRequesterKey(record.requester_id);
                            const groupName = await resolveGroupName(client, groupToJoin);
                            if (chatObj) {
                                try {
                                    await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] });
                                } catch (e) {}
                            }
                            db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                            upsertReplyLogNoReply(db, record.requester_id, record.group_id, 'approved_keyword_only');
                            await msg.reply(isAr
                                ? `تمت الموافقة على انضمامك إلى "${groupName}"، وتمت إضافتك إلى قائمة المتحقق منهم.`
                                : `You have been approved to join "${groupName}" and added to the verified list.`);
                            debugLog('session completed after keyword only', { requesterId: record.requester_id });
                            return true;
                        }

                        // Move to next step
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '' WHERE requester_id = ?").run(record.requester_id);
                        debugLog('state transition', { requesterId: record.requester_id, from: 'PENDING_CUSTOM', to: 'PENDING_METHOD', useEmail, usePhoto });
                        if (useEmail || usePhoto) {
                            const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                            if (refreshed) {
                                await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                            }
                        }
                    } else {
                        if (record.flow_type === 'test') {
                            const expectedWords = approveWs.filter(Boolean).join(', ');
                            await msg.reply(isAr
                                ? `الاختبار يعمل، لكن رسالتك لم تطابق كلمات الموافقة الحالية. الكلمات المعتمدة الآن: ${expectedWords || 'yes'}.`
                                : `The test is working, but your reply did not match the current approval keywords. Current accepted words: ${expectedWords || 'yes'}.`);
                            return true;
                        }
                        // If the bait answer is wrong, reject and blacklist for join flow.
                        const chatObj = await client.getChatById(groupToJoin).catch(() => null);
                        const cleanId = toRequesterKey(record.requester_id);
                        if (chatObj) {
                            try { await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                        }
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                        upsertReplyLogNoReply(db, record.requester_id, record.group_id, 'wrong_bait');
                        return true;
                    }
                } else if (record.state === 'PENDING_METHOD') {
                    wasHandled = true;
                    const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                    const usePhoto = record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
                    if (!useEmail && !usePhoto) {
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = toRequesterKey(record.requester_id);
                        const groupName = await resolveGroupName(client, groupToJoin);
                        if (chatObj) {
                            try {
                                await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] });
                            } catch (e) { }
                        }
                        db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                        upsertReplyLogNoReply(db, record.requester_id, record.group_id, 'auto_approved_no_methods');
                        await msg.reply(isAr
                            ? `تمت الموافقة على انضمامك إلى "${groupName}"، وتمت إضافتك إلى قائمة المتحقق منهم.`
                            : `You have been approved to join "${groupName}" and added to the verified list.`);
                        return true;
                    }
                    const menuHints = isAr
                        ? ['1', 'قائمة', 'القائمة', 'خيارات']
                        : ['1', 'menu', 'options', 'help'];
                    const wantsMenu = isTextMessage && menuHints.some(word => rawText === word || rawText.includes(word));
                    if (wantsMenu || !record.user_method_poll_id) {
                        upsertReplyLogReply(db, record.requester_id, record.group_id, incomingText, record.state);
                        if (record.user_method_poll_id) {
                            db.prepare("UPDATE secondary_verification SET user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?")
                                .run(record.requester_id, record.group_id);
                        }
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) {
                            await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        }
                    } else {
                        await msg.reply(isAr
                            ? 'يرجى اختيار إحدى خيارات الاستطلاع السابق. لإعادة إرسال القائمة أرسل 1.'
                            : 'Please choose one of the options in the previous poll. Send 1 to resend the menu.');
                    }
                } else if (record.state === 'PENDING_EMAIL_INPUT') {
                    if (!isTextMessage) return false;
                    wasHandled = true;
                    const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                    if (rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        return true;
                    }
                    if (!useEmail) {
                        await msg.reply(isAr ? 'خيار البريد غير متاح حالياً. سأعيدك إلى القائمة.' : 'Email verification is not available right now. I will return you to the menu.');
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        return true;
                    }
                    const domain = config.emailDomain || 'college.edu';
                    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    if (!emailMatch || !emailMatch[0].endsWith(`@${domain}`)) {
                        await msg.reply(isAr
                            ? `صيغة البريد غير صحيحة. يجب أن ينتهي البريد بـ @${domain}. حاول مرة أخرى أو أرسل 1 للرجوع.`
                            : `That email is not valid for verification. It must end with @${domain}. Try again or send 1 to go back.`);
                        return true;
                    }

                    const userEmail = emailMatch[0];
                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_CODE', email = ?, code = ? WHERE requester_id = ? AND group_id = ?")
                        .run(userEmail, code, record.requester_id, record.group_id);

                    if (config.outlookEmail && config.outlookPassword) {
                        const transporter = nodemailer.createTransport({
                            host: 'smtp-mail.outlook.com',
                            port: 587,
                            secure: false,
                            auth: {
                                user: config.outlookEmail,
                                pass: config.outlookPassword
                            },
                            tls: {
                                minVersion: 'TLSv1.2'
                            }
                        });

                        try {
                            await transporter.sendMail({
                                from: config.outlookEmail,
                                to: userEmail,
                                subject: isAr ? 'رمز التحقق لمجموعة الجامعة' : 'College Group Verification Code',
                                text: isAr ? `رمز التحقق الخاص بك هو: ${code}` : `Your verification code is: ${code}`
                            });
                            logEmail(db, record.requester_id, record.group_id, userEmail, 'sent');
                            await msg.reply(isAr
                                ? 'تم إرسال رمز التحقق إلى بريدك. إن لم تجده، افحص البريد غير الهام. وللرجوع للقائمة أرسل 1.'
                                : 'A verification code has been sent to your email. If you cannot find it, please check junk mail. Send 1 to return to the menu.');
                        } catch (e) {
                            const isAuthError = e && (e.code === 'EAUTH' || e.responseCode === 535);
                            const errorCode = e && e.code ? String(e.code) : (e && e.responseCode ? String(e.responseCode) : 'UNKNOWN_ERROR');
                            const errorMessage = e && e.message ? String(e.message) : String(e);
                            logEmail(db, record.requester_id, record.group_id, userEmail, 'failed', errorCode, errorMessage);
                            await msg.reply(isAr
                                ? (isAuthError
                                    ? 'تعذر إرسال البريد بسبب إعدادات SMTP. سنعيدك للقائمة السابقة.'
                                    : 'حدث خطأ أثناء إرسال البريد. سنعيدك إلى القائمة السابقة.')
                                : (isAuthError
                                    ? 'Could not send email due to SMTP settings. Returning you to the previous list.'
                                    : 'An error occurred while sending the email. Returning you to the previous list.'));
                            db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '', email = '', code = '' WHERE requester_id = ? AND group_id = ?")
                                .run(record.requester_id, record.group_id);
                            const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                            if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        }
                    } else {
                        logEmail(db, record.requester_id, record.group_id, userEmail, 'failed', 'NO_SMTP_CONFIG', 'Email settings not configured');
                        await msg.reply(isAr
                            ? 'إعدادات البريد غير مكتملة لدى الإدارة. سنعيدك إلى القائمة السابقة.'
                            : 'Email settings are not configured by the admin. Returning you to the previous menu.');
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '', email = '', code = '' WHERE requester_id = ? AND group_id = ?")
                            .run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                    }
                } else if (record.state === 'PENDING_PHOTO_UPLOAD') {
                    wasHandled = true;
                    if (isTextMessage && rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        return true;
                    }
                    if (!msg.hasMedia) {
                        await msg.reply(isAr ? 'يرجى إرسال صورة واضحة من البلاك بورد، أو أرسل 1 للرجوع إلى القائمة.' : 'Please send a clear Blackboard screenshot, or send 1 to return to the menu.');
                        return true;
                    }
                    const media = await msg.downloadMedia();
                    if (!media) {
                        await msg.reply(isAr ? 'تعذر قراءة الصورة. يرجى إعادة الإرسال.' : 'Could not read the image. Please resend it.');
                        return true;
                    }

                    const adminGroup = resolveAdminGroupForVerification(config, record.group_id);
                    if (!adminGroup) {
                        await msg.reply(isAr ? 'مجموعة الإدارة غير مهيأة حالياً. أرسل 1 للرجوع إلى القائمة.' : 'The admin group is not configured right now. Send 1 to return to the menu.');
                        return true;
                    }

                    const groupName = await resolveGroupName(client, record.group_id);
                    const caption = isAr
                        ? `المستخدم @${toRequesterKey(record.requester_id)} طلب الانضمام إلى "${groupName}" وأرسل صورة من البلاك بورد.`
                        : `User @${toRequesterKey(record.requester_id)} requested to join "${groupName}" and sent a Blackboard screenshot.`;
                    const mediaMsg = await client.sendMessage(adminGroup, media, { caption, mentions: [record.requester_id] });

                    const decisionMsg = await client.sendMessage(adminGroup, isAr
                        ? 'يرجى الرد على هذه الرسالة بكلمة: موافقة أو رفض أو حظر. ويمكنك أيضاً التصويت من الاستطلاع أدناه.'
                        : 'Please reply to this message with: approve, reject, or ban. You can also vote using the poll below.', {
                        quotedMessageId: mediaMsg.id._serialized
                    }).catch(async () => {
                        return client.sendMessage(adminGroup, isAr
                            ? 'تعليمات القرار: اكتب موافقة أو رفض أو حظر مع الرد على رسالة الصورة.'
                            : 'Decision instruction: reply with approve, reject, or ban to the screenshot message.');
                    });

                    const adminPoll = new Poll(
                        isAr ? 'قرار الإدارة على الصورة:' : 'Admin decision for this screenshot:',
                        isAr
                            ? ['1 - موافقة', '2 - رفض', '3 - طلب صورة أخرى', '4 - حظر']
                            : ['1 - Approve', '2 - Deny', '3 - Ask for another photo', '4 - Ban']
                    );
                    const pollMsg = await client.sendMessage(adminGroup, adminPoll, { mentions: [record.requester_id] });
                    pendingAdminPhotoPolls.set(pollMsg.id._serialized, {
                        requesterId: record.requester_id,
                        groupId: record.group_id
                    });

                    db.prepare(`
                        UPDATE secondary_verification
                        SET state = 'WAITING_ADMIN_PHOTO_REVIEW', admin_group_id = ?, admin_decision_msg_id = ?, admin_poll_msg_id = ?, admin_last_reminder_at = 0
                        WHERE requester_id = ? AND group_id = ?
                    `).run(adminGroup, decisionMsg && decisionMsg.id ? decisionMsg.id._serialized : '', pollMsg.id._serialized, record.requester_id, record.group_id);
                    await msg.reply(isAr ? 'تم إرسال الصورة للإدارة للمراجعة.' : 'Your screenshot was sent to admins for review.');
                    return true;
                } else if (record.state === 'WAITING_ADMIN_PHOTO_REVIEW') {
                    wasHandled = true;
                    if (isTextMessage && rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '' WHERE requester_id = ? AND group_id = ?")
                            .run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        return true;
                    }
                    await msg.reply(isAr
                        ? 'طلبك قيد المراجعة لدى الإدارة حالياً. للعودة إلى القائمة أرسل 1.'
                        : 'Your request is currently under admin review. Send 1 to return to the menu.');
                    return true;
                } else if (record.state === 'PENDING_CODE') {
                    if (!isTextMessage) return false;

                    wasHandled = true;
                    if (rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', user_method_poll_id = '', email = '', code = '' WHERE requester_id = ? AND group_id = ?")
                            .run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, db, config, refreshed, isAr);
                        return true;
                    }
                    if (rawText === record.code) {
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = toRequesterKey(record.requester_id);
                        if (chatObj) {
                            await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] });
                        }
                        
                        // Add to verified dataset (approved_numbers)
                        db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                        await msg.reply(isAr ? 'تم التحقق بنجاح. تمت الموافقة على طلبك وإضافتك إلى قائمة المتحقق منهم.' : 'Verification successful. Your request has been approved and you were added to the verified list.');
                        debugLog('code accepted; session completed', { requesterId: record.requester_id });
                        return true;
                    } else {
                        debugLog('code rejected', { requesterId: record.requester_id, provided: rawText });
                        await msg.reply(isAr ? 'رمز التحقق غير صحيح. حاول مرة أخرى أو أرسل 1 للرجوع إلى القائمة.' : 'That verification code is incorrect. Please try again, or send 1 to return to the menu.');
                    }
                }
            } catch (e) {
                console.error('[Verification] Error handling msg:', e);
                debugLog('handler exception', { requesterId: record && record.requester_id ? record.requester_id : senderId, error: e && e.message ? e.message : String(e) });
            }

            return wasHandled;
        }
    };
}

module.exports = { initVerification };
