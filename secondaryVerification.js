const nodemailer = require('nodemailer');
const { Poll } = require('whatsapp-web.js');

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_DEBUG = process.env.WA_VERIFICATION_DEBUG === 'true';
const pendingUserMethodPolls = new Map();
const pendingAdminPhotoPolls = new Map();

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

function resolveAdminGroupForVerification(config, groupId) {
    const groupConfig = config && config.groupsConfig ? config.groupsConfig[groupId] : null;
    const scopedAdmin = groupConfig && typeof groupConfig.adminGroup === 'string' ? groupConfig.adminGroup.trim() : '';
    const fallbackAdmin = typeof config.defaultAdminGroup === 'string' ? config.defaultAdminGroup.trim() : '';
    return scopedAdmin || fallbackAdmin || '';
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
        if (/approve|موافقة|قبول/.test(joined.toLowerCase())) return '1';
        if (/deny|رفض/.test(joined.toLowerCase())) return '2';
        if (/another|اخرى|أخرى|اعادة|إعادة/.test(joined.toLowerCase())) return '3';
    }
    return '';
}

async function sendMethodSelectionPoll(client, config, record, isAr) {
    const groupName = await resolveGroupName(client, record.group_id);
    const title = isAr
        ? `طلبت الانضمام إلى "${groupName}". إذا كنت ما زلت مهتماً اختر طريقة المتابعة:`
        : `You requested to join "${groupName}". If you are still interested, choose how to continue:`;
    const options = isAr
        ? [
            '1 - إرسال رمز تحقق إلى بريدك الطلابي',
            '2 - إرسال صورة من مقرراتك في البلاك بورد',
            '3 - طلب تواصل مباشر من المشرف',
            '4 - إلغاء الطلب'
        ]
        : [
            '1 - Send verification code to your student email',
            '2 - Send a screenshot of your courses in Blackboard',
            '3 - Request an admin to contact you',
            '4 - Cancel request'
        ];
    const poll = new Poll(title, options);
    const pollMsg = await client.sendMessage(record.requester_id, poll);
    pendingUserMethodPolls.set(pollMsg.id._serialized, {
        requesterId: record.requester_id,
        groupId: record.group_id
    });
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

            if (pendingUserMethodPolls.has(pollId)) {
                const ctx = pendingUserMethodPolls.get(pollId);
                const record = ctx ? findSessionByRequester(db, ctx.requesterId) : null;
                pendingUserMethodPolls.delete(pollId);
                if (!ctx || !record) return true;

                const isAr = config.secondaryVerificationLanguage === 'ar';
                const choice = getVoteSelectionNumber(vote);
                const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                const usePhoto = record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
                const domain = config.emailDomain || 'college.edu';
                const groupName = await resolveGroupName(client, record.group_id);

                if (choice === '1') {
                    if (!useEmail) {
                        await client.sendMessage(record.requester_id, isAr ? 'خيار البريد غير متاح حالياً. اختر خياراً آخر.' : 'Email option is not available right now. Please choose another option.');
                        await sendMethodSelectionPoll(client, config, record, isAr);
                        return true;
                    }
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_EMAIL_INPUT' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? `أرسل بريدك الطلابي الذي ينتهي بـ @${domain}، وأرسل 1 للعودة إلى القائمة السابقة.`
                        : `Send your student email ending with @${domain}, and send 1 to go back to the previous list.`);
                    return true;
                }

                if (choice === '2') {
                    if (!usePhoto) {
                        await client.sendMessage(record.requester_id, isAr ? 'خيار الصورة غير متاح حالياً. اختر خياراً آخر.' : 'Photo option is not available right now. Please choose another option.');
                        await sendMethodSelectionPoll(client, config, record, isAr);
                        return true;
                    }
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_PHOTO_UPLOAD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'التقط صورة واضحة لمقرراتك في البلاك بورد وأرسلها الآن، أو أرسل 1 للعودة إلى القائمة السابقة.'
                        : 'Take a clear screenshot of your Blackboard courses and send it now, or send 1 to go back to the previous list.');
                    return true;
                }

                if (choice === '3') {
                    const adminGroup = resolveAdminGroupForVerification(config, record.group_id);
                    if (adminGroup) {
                        await client.sendMessage(adminGroup, isAr
                            ? `طلب مساعدة: المستخدم @${normalizeVerificationId(record.requester_id).replace('@c.us', '')} يريد التواصل مع مشرف للانضمام إلى "${groupName}".`
                            : `Assistance request: user @${normalizeVerificationId(record.requester_id).replace('@c.us', '')} needs admin help to join "${groupName}".`, {
                            mentions: [record.requester_id]
                        });
                    }
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تم إرسال طلبك للمشرفين وسيتم التواصل معك. تم إغلاق عملية التحقق حالياً.'
                        : 'Your request has been sent to the admins and they will contact you. Verification is now closed.');
                    return true;
                }

                if (choice === '4') {
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'شكراً لوقتك. تم إلغاء العملية.'
                        : 'Thank you for your time. The process has been cancelled.');
                    return true;
                }

                await client.sendMessage(record.requester_id, isAr ? 'خيار غير واضح. سيتم إعادة إرسال القائمة.' : 'Invalid option. The menu will be sent again.');
                await sendMethodSelectionPoll(client, config, record, isAr);
                return true;
            }

            if (pendingAdminPhotoPolls.has(pollId)) {
                const ctx = pendingAdminPhotoPolls.get(pollId);
                const record = findSessionByRequester(db, ctx.requesterId);
                const isAr = config.secondaryVerificationLanguage === 'ar';
                const choice = getVoteSelectionNumber(vote);

                if (!record) {
                    pendingAdminPhotoPolls.delete(pollId);
                    return true;
                }

                const chatObj = await client.getChatById(record.group_id).catch(() => null);
                const cleanId = normalizeVerificationId(record.requester_id).replace('@c.us', '');

                if (choice === '1') {
                    if (chatObj) {
                        try { await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                    }
                    db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تمت الموافقة على طلبك بعد مراجعة الصورة. أهلاً بك!'
                        : 'Your request has been approved after photo review. Welcome!');
                    return true;
                }

                if (choice === '2') {
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_PHOTO_UPLOAD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'تم رفض الصورة. الأسباب المحتملة: 1) قد تكون مستخدمة من شخص آخر 2) ليست المطلوب 3) غير واضحة 4) سبب إضافي من المشرف. أرسل 1 للعودة للقائمة السابقة.'
                        : 'Your photo was declined. Possible reasons: 1) it may be used by another user 2) not what was requested 3) not clear 4) another admin reason. Send 1 to go back to the previous list.');
                    return true;
                }

                if (choice === '3') {
                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_PHOTO_UPLOAD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                    pendingAdminPhotoPolls.delete(pollId);
                    await client.sendMessage(record.requester_id, isAr
                        ? 'يرجى إرسال صورة أخرى أو أرسل 1 للعودة إلى القائمة السابقة.'
                        : 'Please send another screenshot, or send 1 to return to the previous list.');
                    return true;
                }

                return true;
            }

            return false;
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

            // PREVENT SPAM: match existing session by normalized requester id in the same group.
            // WhatsApp may alternate identifiers between @lid and @c.us for the same user.
            const normalizedIncomingId = normalizeVerificationId(rawRequesterId);
            const existingRecord = db.prepare('SELECT requester_id, group_id, created_at FROM secondary_verification WHERE group_id = ?').all(groupId)
                .find(row => normalizeVerificationId(row.requester_id) === normalizedIncomingId);
            if (existingRecord) {
                const ttlMs = getSessionTimeoutMs(config);
                const isExpired = !existingRecord.created_at || Date.now() - existingRecord.created_at > ttlMs;
                if (forceRestart || isExpired) {
                    debugLog('start replacing existing session', {
                        requesterId: rawRequesterId,
                        existingRequesterId: existingRecord.requester_id,
                        groupId,
                        forceRestart,
                        isExpired
                    });
                    db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(existingRecord.requester_id, groupId);
                } else {
                    debugLog('start blocked: active session exists', { requesterId: rawRequesterId, groupId });
                    return false; // Already sent them a message, waiting for their reply
                }
            }
            
            console.log(`[Verification] Starting for ${cleanUserId}`);
            
            const initialState = useKeyword ? 'PENDING_CUSTOM' : 'PENDING_METHOD';
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO secondary_verification 
                (requester_id, group_id, state, flow_type, require_email, require_photo, email, code, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, '', '', ?)
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
            if (useKeyword) {
                const baits = config.customMessageText ? config.customMessageText.split('||').map(s => s.trim()).filter(s => s) : [];
                if (baits.length > 0) {
                    initMsg = baits[Math.floor(Math.random() * baits.length)];
                } else {
                    initMsg = isAr ? 'أهلاً بك. يرجى الرد بكلمة الموافقة المخصصة لدينا.' : 'Welcome. Please reply with our custom approval word.';
                }
            } else {
                initMsg = isAr
                    ? 'تم قبول طلبك المبدئي. سنرسل لك قائمة خيارات التحقق الآن.'
                    : 'Your initial request was accepted. We will send you the verification options now.';
            }
            try {
                await client.sendMessage(rawRequesterId, initMsg);
                if (!useKeyword && (useEmail || usePhoto)) {
                    const seededRecord = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(rawRequesterId, groupId);
                    if (seededRecord) {
                        await sendMethodSelectionPoll(client, config, seededRecord, isAr);
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
            if (!record.created_at || now - record.created_at > ttlMs) {
                const chatObj = await client.getChatById(record.group_id).catch(() => null);
                if (chatObj) {
                    try { await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                }
                db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
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
                await msg.reply(config.secondaryVerificationLanguage === 'ar'
                    ? 'تم إيقاف عملية التحقق وإلغاء طلب الانضمام.'
                    : 'Verification process stopped and join request rejected.');
                debugLog('session stopped by stop code from requester', { requesterId: record.requester_id });
                return true;
            }

            try {
                const isAr = config.secondaryVerificationLanguage === 'ar';
                
                if (record.state === 'PENDING_CUSTOM') {
                    if (!isTextMessage) {
                        debugLog('pending custom ignored: non-text', { requesterId: record.requester_id, msgType: msg.type, hasMedia: Boolean(msg.hasMedia) });
                        return false;
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
                        debugLog('ban keyword matched', { requesterId: record.requester_id, flowType: record.flow_type || 'join' });
                        if (isTestFlow) {
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                            await msg.reply(isAr ? 'تم التقاط كلمة الرفض في وضع الاختبار. لن يتم الحظر في الاختبار.' : 'Ban keyword detected in test mode. No blacklist action is applied during tests.');
                            debugLog('test flow ban handled and session deleted', { requesterId: record.requester_id });
                            return true;
                        }
                        // Reject and ban
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = normalizeVerificationId(senderId).replace('@c.us', '');
                        if (chatObj) await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] });
                        
                        // Add to blacklist (ban)
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                        debugLog('ban applied and session deleted', { requesterId: record.requester_id });
                        // Make it a silent trap: no rejection notification
                        return true;
                    } else if (approveWs.some(w => smartText.includes(w))) {
                        wasHandled = true;
                        const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                        const usePhoto = record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
                        debugLog('approval keyword matched', { requesterId: record.requester_id, useEmail, usePhoto });

                        if (!useEmail && !usePhoto) {
                            // Keyword was the only verification needed
                            const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                            const cleanId = normalizeVerificationId(senderId).replace('@c.us', '');
                            const groupName = await resolveGroupName(client, groupToJoin);
                            if (chatObj) {
                                try {
                                    await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] });
                                } catch (e) {}
                            }
                            db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                            await msg.reply(isAr
                                ? `تمت الموافقة عليك للانضمام إلى "${groupName}" وإضافتك إلى قائمة المتحقق منهم.`
                                : `You have been approved to join "${groupName}" and added to the verified list.`);
                            debugLog('session completed after keyword only', { requesterId: record.requester_id });
                            return true;
                        }

                        // Move to next step
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(record.requester_id);
                        debugLog('state transition', { requesterId: record.requester_id, from: 'PENDING_CUSTOM', to: 'PENDING_METHOD', useEmail, usePhoto });
                        if (useEmail || usePhoto) {
                            const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                            if (refreshed) {
                                await sendMethodSelectionPoll(client, config, refreshed, isAr);
                            }
                        }
                    } else {
                        if (record.flow_type === 'test') {
                            const expectedWords = approveWs.filter(Boolean).join(', ');
                            await msg.reply(isAr
                                ? `الاختبار يعمل، لكن هذه الرسالة لم تطابق كلمات الموافقة الحالية. الكلمات المعتمدة: ${expectedWords || 'yes'}.`
                                : `The test is working, but this reply did not match the current approval keywords. Accepted words: ${expectedWords || 'yes'}.`);
                            return true;
                        }
                        // If the bait answer is wrong, reject and blacklist for join flow.
                        const chatObj = await client.getChatById(groupToJoin).catch(() => null);
                        const cleanId = normalizeVerificationId(senderId).replace('@c.us', '');
                        if (chatObj) {
                            try { await chatObj.rejectGroupMembershipRequests({ requesterIds: [record.requester_id] }); } catch (e) { }
                        }
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ? AND group_id = ?').run(record.requester_id, record.group_id);
                        return true;
                    }
                } else if (record.state === 'PENDING_METHOD') {
                    wasHandled = true;
                    const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                    const usePhoto = record.require_photo == null ? config.enablePhotoVerification : record.require_photo === 1;
                    const isTestFlow = record.flow_type === 'test';
                    debugLog('handling method step', { requesterId: record.requester_id, useEmail, usePhoto, hasMedia: Boolean(msg.hasMedia) });

                    const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                    if (refreshed) {
                        await sendMethodSelectionPoll(client, config, refreshed, isAr);
                    }
                } else if (record.state === 'PENDING_EMAIL_INPUT') {
                    if (!isTextMessage) return false;
                    wasHandled = true;
                    const useEmail = record.require_email == null ? config.enableEmailVerification : record.require_email === 1;
                    if (rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                        return true;
                    }
                    if (!useEmail) {
                        await msg.reply(isAr ? 'خيار البريد غير متاح حالياً.' : 'Email option is not available right now.');
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                        return true;
                    }
                    const domain = config.emailDomain || 'college.edu';
                    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    if (!emailMatch || !emailMatch[0].endsWith(`@${domain}`)) {
                        await msg.reply(isAr
                            ? `بريد خاطئ. يجب أن ينتهي بـ @${domain}. أعد المحاولة أو أرسل 1 للرجوع.`
                            : `Wrong email. It must end with @${domain}. Try again or send 1 to go back.`);
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
                            await msg.reply(isAr
                                ? 'تم إرسال رمز التحقق إلى بريدك. افحص البريد غير الهام إذا لم تجده، وأرسل 1 للرجوع للقائمة.'
                                : 'A verification code has been sent to your email. Check junk mail if needed, and send 1 to go back to the list.');
                        } catch (e) {
                            const isAuthError = e && (e.code === 'EAUTH' || e.responseCode === 535);
                            await msg.reply(isAr
                                ? (isAuthError
                                    ? 'تعذر إرسال البريد بسبب إعدادات SMTP. سنعيدك للقائمة السابقة.'
                                    : 'حدث خطأ أثناء إرسال البريد. سنعيدك للقائمة السابقة.')
                                : (isAuthError
                                    ? 'Could not send email due to SMTP settings. Returning you to the previous list.'
                                    : 'An error occurred while sending email. Returning you to the previous list.'));
                            db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', email = '', code = '' WHERE requester_id = ? AND group_id = ?")
                                .run(record.requester_id, record.group_id);
                            const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                            if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                        }
                    } else {
                        await msg.reply(isAr
                            ? 'إعدادات البريد غير مكتملة لدى المسؤول. سنعيدك للقائمة السابقة.'
                            : 'Email settings are not configured by admin. Returning you to the previous list.');
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', email = '', code = '' WHERE requester_id = ? AND group_id = ?")
                            .run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                    }
                } else if (record.state === 'PENDING_PHOTO_UPLOAD') {
                    wasHandled = true;
                    if (isTextMessage && rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ? AND group_id = ?").run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                        return true;
                    }
                    if (!msg.hasMedia) {
                        await msg.reply(isAr ? 'أرسل صورة واضحة من البلاك بورد، أو أرسل 1 للرجوع.' : 'Send a clear Blackboard screenshot, or send 1 to go back.');
                        return true;
                    }
                    const media = await msg.downloadMedia();
                    if (!media) {
                        await msg.reply(isAr ? 'تعذر قراءة الصورة. أعد المحاولة.' : 'Could not read the photo. Please try again.');
                        return true;
                    }

                    const adminGroup = resolveAdminGroupForVerification(config, record.group_id);
                    if (!adminGroup) {
                        await msg.reply(isAr ? 'مجموعة الإدارة غير مهيأة. أرسل 1 للرجوع.' : 'Admin group is not configured. Send 1 to go back.');
                        return true;
                    }

                    const groupName = await resolveGroupName(client, record.group_id);
                    const caption = isAr
                        ? `المستخدم @${normalizeVerificationId(record.requester_id).replace('@c.us', '')} طلب الانضمام إلى "${groupName}" وأرسل صورة من البلاك بورد.`
                        : `User @${normalizeVerificationId(record.requester_id).replace('@c.us', '')} requested to join "${groupName}" and sent a Blackboard screenshot.`;
                    await client.sendMessage(adminGroup, media, { caption, mentions: [record.requester_id] });

                    const adminPoll = new Poll(
                        isAr ? 'قرار الإدارة على الصورة:' : 'Admin decision for this screenshot:',
                        isAr
                            ? ['1 - موافقة', '2 - رفض', '3 - طلب صورة أخرى']
                            : ['1 - Approve', '2 - Deny', '3 - Ask for another photo']
                    );
                    const pollMsg = await client.sendMessage(adminGroup, adminPoll, { mentions: [record.requester_id] });
                    pendingAdminPhotoPolls.set(pollMsg.id._serialized, {
                        requesterId: record.requester_id,
                        groupId: record.group_id
                    });

                    db.prepare("UPDATE secondary_verification SET state = 'WAITING_ADMIN_PHOTO_REVIEW' WHERE requester_id = ? AND group_id = ?")
                        .run(record.requester_id, record.group_id);
                    await msg.reply(isAr ? 'تم إرسال الصورة للإدارة للمراجعة.' : 'Your screenshot was sent to admins for review.');
                    return true;
                } else if (record.state === 'WAITING_ADMIN_PHOTO_REVIEW') {
                    wasHandled = true;
                    if (isTextMessage && rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ? AND group_id = ?")
                            .run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                        return true;
                    }
                    await msg.reply(isAr
                        ? 'طلبك قيد مراجعة الإدارة حالياً. أرسل 1 للعودة إلى القائمة.'
                        : 'Your request is currently under admin review. Send 1 to return to the menu.');
                    return true;
                } else if (record.state === 'PENDING_CODE') {
                    if (!isTextMessage) return false;

                    wasHandled = true;
                    if (rawText === '1') {
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD', email = '', code = '' WHERE requester_id = ? AND group_id = ?")
                            .run(record.requester_id, record.group_id);
                        const refreshed = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(record.requester_id, record.group_id);
                        if (refreshed) await sendMethodSelectionPoll(client, config, refreshed, isAr);
                        return true;
                    }
                    if (rawText === record.code) {
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = normalizeVerificationId(senderId).replace('@c.us', '');
                        if (chatObj) {
                            await chatObj.approveGroupMembershipRequests({ requesterIds: [record.requester_id] });
                        }
                        
                        // Add to verified dataset (approved_numbers)
                        db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(record.requester_id);
                        await msg.reply(isAr ? 'تم التحقق بنجاح! تمت الموافقة عليك وإضافتك إلى قائمة المتحقق منهم.' : 'Verification successful! You have been approved and added to the verified list.');
                        debugLog('code accepted; session completed', { requesterId: record.requester_id });
                        return true;
                    } else {
                        debugLog('code rejected', { requesterId: record.requester_id, provided: rawText });
                        await msg.reply(isAr ? 'رمز غير صحيح. أعد المحاولة أو أرسل 1 للرجوع للقائمة.' : 'Incorrect code. Try again or send 1 to go back to the menu.');
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
