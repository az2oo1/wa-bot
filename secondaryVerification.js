const nodemailer = require('nodemailer');

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

function initVerification(client, db, config, chat) {
    return {
        // Triggered after bio check is passed
        startVerification: async (rawRequesterId, cleanUserId, groupId, options = {}) => {
            if (!config.enableSecondaryVerification) return false;
            
            // Check if feature applies to this group
            const enabledGroups = config.secondaryVerificationGroups || [];
            if (enabledGroups.length > 0 && !enabledGroups.includes(groupId)) return false;

            const useKeyword = config.enableKeywordVerification;
            const useEmail = config.enableEmailVerification;
            const usePhoto = config.enablePhotoVerification;
            if (!useKeyword && !useEmail && !usePhoto) return false;

            const flowType = options.flowType === 'test' ? 'test' : 'join';

            // PREVENT SPAM: Check if this user already has an active verification process
            const existingRecord = db.prepare('SELECT 1 FROM secondary_verification WHERE requester_id = ? AND group_id = ?').get(rawRequesterId, groupId);
            if (existingRecord) {
                return false; // Already sent them a message, waiting for their reply
            }
            
            console.log(`[Verification] Starting for ${cleanUserId}`);
            
            const initialState = useKeyword ? 'PENDING_CUSTOM' : 'PENDING_METHOD';
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO secondary_verification 
                (requester_id, group_id, state, flow_type, email, code, created_at) 
                VALUES (?, ?, ?, ?, '', '', ?)
            `);
            insertStmt.run(rawRequesterId, groupId, initialState, flowType, Date.now());

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
                const domain = config.emailDomain || 'college.edu';
                let methods = [];
                if (useEmail) methods.push(isAr ? `بريدك الجامعي الذي ينتهي بـ @${domain}` : `your college email ending with @${domain}`);
                if (usePhoto) methods.push(isAr ? 'صورة للجدول الدراسي من البلاك بورد' : 'a photo of your blackboard showing your subjects');
                initMsg = (isAr ? 'لإكمال الانضمام، يرجى إرسال ' : 'To finish joining, please send ') + methods.join(' ' + (isAr ? 'أو' : 'OR') + ' ');
            }
            try {
                const response = await client.sendMessage(rawRequesterId, initMsg);
            } catch (e) {
                console.error(`[Verification] Failed to message ${rawRequesterId}`, e);
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
            const record = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ?').get(senderId);
            if (!record) return false;

            const now = Date.now();
            const rawTtlSec = parseInt(config.secondaryVerificationDelay, 10);
            const ttlMs = Number.isFinite(rawTtlSec) && rawTtlSec > 0 ? rawTtlSec * 1000 : DEFAULT_SESSION_TTL_MS;
            if (!record.created_at || now - record.created_at > ttlMs) {
                db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
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

            let text = (msg.body || '').trim().toLowerCase();
            if (config.enableSecondarySmartMatch) {
                text = applySmartMatch(text);
            }
            
            const groupToJoin = record.group_id;
            let wasHandled = false;

            try {
                const isAr = config.secondaryVerificationLanguage === 'ar';
                
                if (record.state === 'PENDING_CUSTOM') {
                    if (!isTextMessage) return false;

                    let approveWs = (config.approvalKeyword || 'yes').toLowerCase().split(',').map(s => s.trim());
                    let banWs = (config.banKeyword || 'no').toLowerCase().split(',').map(s => s.trim());
                    
                    if (config.enableSecondarySmartMatch) {
                        approveWs = approveWs.map(s => applySmartMatch(s));
                        banWs = banWs.map(s => applySmartMatch(s));
                    }

                    if (banWs.some(w => text.includes(w))) {
                        wasHandled = true;
                        // Reject and ban
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = senderId.replace('@c.us', '');
                        if (chatObj) await chatObj.rejectGroupMembershipRequests({ requesterIds: [senderId] });
                        
                        // Add to blacklist (ban)
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                        // Make it a silent trap: no rejection notification
                        return true;
                    } else if (approveWs.some(w => text.includes(w))) {
                        wasHandled = true;
                        const useEmail = config.enableEmailVerification;
                        const usePhoto = config.enablePhotoVerification;
                        const isTestFlow = record.flow_type === 'test';

                        if (isTestFlow || (!useEmail && !usePhoto)) {
                            // Keyword was the only verification needed
                            const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                            const cleanId = senderId.replace('@c.us', '');
                            if (chatObj) {
                                try {
                                    await chatObj.approveGroupMembershipRequests({ requesterIds: [senderId] });
                                } catch (e) {}
                            }
                            db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                            await msg.reply(isAr ? 'تم التحقق بنجاح! انتهى اختبار التحقق الثنائي وتمت الموافقة عليك.' : 'Verification successful! The secondary verification test is complete and you have been approved.');
                            return true;
                        }

                        // Move to next step
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                        
                        let reqGroupName = isAr ? "المجموعة" : "the group";
                        try {
                            const chatObj = await client.getChatById(groupToJoin);
                            if (chatObj && chatObj.name) reqGroupName = `"${chatObj.name}"`;
                        } catch(e) {}

                        const domain = config.emailDomain || 'college.edu';
                        let methods = [];
                        if (useEmail) methods.push(isAr ? `بريدك الجامعي الذي ينتهي بـ @${domain} (سنرسل لك رمز تحقق)` : `your college email ending with @${domain} (we will send a verification code)`);
                        if (usePhoto) methods.push(isAr ? 'صورة للجدول الدراسي من البلاك بورد للمراجعة اليدوية' : 'a photo of your blackboard showing your subjects for manual verification');
                        
                        await msg.reply(isAr ? `مقبول! لإكمال الانضمام لـ ${reqGroupName}، يرجى إرسال ${methods.join(' أو ')}.` : `Approved! To finish joining ${reqGroupName}, please send ${methods.join(' OR ')}.`);
                    } else {
                        // Ignore unrelated texts without hijacking all private messages.
                        return false;
                    }
                } else if (record.state === 'PENDING_METHOD') {
                    wasHandled = true;
                    const useEmail = config.enableEmailVerification;
                    const usePhoto = config.enablePhotoVerification;

                    if (msg.hasMedia) {
                        if (!usePhoto) {
                            await msg.reply(isAr ? 'التحقق بالصور غير مفعل.' : 'Photo verification is not enabled.');
                            return true;
                        }
                        const media = await msg.downloadMedia();
                        if (media) {
                            // Forward to admin
                            const adminGroup = config.defaultAdminGroup;
                            if (adminGroup) {
                                await client.sendMessage(adminGroup, media, { caption: (isAr ? `تحقق بالصورة لطلب انضمام.\nالمستخدم: @${senderId.split('@')[0]}\nالمعرف: ${groupToJoin}` : `Photo verification for join request.\nUser: @${senderId.split('@')[0]}\nGroup ID: ${groupToJoin}`), mentions: [senderId] });
                                await msg.reply(isAr ? 'تم استلام الصورة. سيقوم أحد المشرفين بمراجعة طلبك.' : 'Photo received. An admin will review your request.');
                                db.prepare("DELETE FROM secondary_verification WHERE requester_id = ?").run(senderId);
                            }
                        }
                    } else {
                        if (!isTextMessage) return false;

                        if (!useEmail) {
                            const pMsg = usePhoto ? (isAr ? 'يرجى إرسال صورة بدلاً من ذلك.' : 'Please send a photo instead.') : '';
                            await msg.reply(isAr ? `التحقق بالبريد غير مفعل. ${pMsg}` : `Email verification is not enabled. ${pMsg}`);
                            return true;
                        }
                        // Check email
                        const domain = config.emailDomain || 'college.edu';
                        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        
                        if (!emailMatch || !emailMatch[0].endsWith(`@${domain}`)) {
                            await msg.reply(isAr ? `بريد خاطئ. يجب أن ينتهي بـ @${domain}. يرجى المحاولة أو إرسال صورة.` : `Wrong email. It must end with @${domain}. Please try again or send a photo.`);
                        } else {
                            const userEmail = emailMatch[0];
                            const code = Math.floor(100000 + Math.random() * 900000).toString();
                            
                            db.prepare("UPDATE secondary_verification SET state = 'PENDING_CODE', email = ?, code = ? WHERE requester_id = ?").run(userEmail, code, senderId);

                            // Send email via Outlook
                            if (config.outlookEmail && config.outlookPassword) {
                                let transporter = nodemailer.createTransport({
                                    host: 'smtp-mail.outlook.com',
                                    port: 587,
                                    secure: false, 
                                    auth: {
                                        user: config.outlookEmail,
                                        pass: config.outlookPassword
                                    },
                                    tls: {
                                        ciphers: 'SSLv3'
                                    }
                                });

                                try {
                                    await transporter.sendMail({
                                        from: config.outlookEmail,
                                        to: userEmail,
                                        subject: isAr ? 'رمز التحقق لمجموعة الجامعة' : 'College Group Verification Code',
                                        text: isAr ? `رمز التحقق الخاص بك هو: ${code}` : `Your verification code is: ${code}`
                                    });
                                    await msg.reply(isAr ? 'تم إرسال الرمز! تحقق من بريدك (والمجلد غير الهام) ورد بالرمز المكون من 6 أرقام.' : 'Code sent! Check your email (including spam folder) and reply with the 6-digit code.');
                                } catch(e) {
                                    console.error('SMTP Error', e);
                                    await msg.reply(isAr ? 'خطأ في إرسال البريد. يرجى التواصل مع الإدارة أو إرسال صورة بدلاً من ذلك.' : 'Error sending email. Please contact an admin or send a photo instead.');
                                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                                }
                            } else {
                                await msg.reply(isAr ? 'التحقق بالبريد غير مكون بشكل صحيح من قبل المسؤول. يرجى إرسال صورة بدلاً من ذلك.' : 'Email verification is not configured properly by the admin. Please send a photo instead.');
                                db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                            }
                        }
                    }
                } else if (record.state === 'PENDING_CODE') {
                    if (!isTextMessage) return false;

                    wasHandled = true;
                    if (text === record.code) {
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = senderId.replace('@c.us', '');
                        if (chatObj) {
                            await chatObj.approveGroupMembershipRequests({ requesterIds: [senderId] });
                        }
                        
                        // Add to verified dataset (approved_numbers)
                        db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                        await msg.reply(isAr ? 'تم التحقق بنجاح! تمت الموافقة عليك وإضافتك إلى قائمة المتحقق منهم.' : 'Verification successful! You have been approved and added to the verified list.');
                        return true;
                    } else {
                        await msg.reply(isAr ? 'رمز غير صحيح. يرجى المحاولة مرة أخرى.' : 'Incorrect code. Please try again.');
                    }
                }
            } catch (e) {
                console.error('[Verification] Error handling msg:', e);
            }

            return wasHandled;
        }
    };
}

module.exports = { initVerification };
