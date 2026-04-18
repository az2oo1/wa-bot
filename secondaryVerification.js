const nodemailer = require('nodemailer');

function initVerification(client, db, config, chat) {
    return {
        // Triggered after bio check is passed
        startVerification: async (rawRequesterId, cleanUserId, groupId) => {
            if (!config.enableSecondaryVerification) return false;
            const useKeyword = config.enableKeywordVerification;
            const useEmail = config.enableEmailVerification;
            const usePhoto = config.enablePhotoVerification;
            if (!useKeyword && !useEmail && !usePhoto) return false;
            
            console.log(`[Verification] Starting for ${cleanUserId}`);
            
            const initialState = useKeyword ? 'PENDING_CUSTOM' : 'PENDING_METHOD';
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO secondary_verification 
                (requester_id, group_id, state, email, code, created_at) 
                VALUES (?, ?, ?, '', '', ?)
            `);
            insertStmt.run(rawRequesterId, groupId, initialState, Date.now());

            // Send initial custom message or method prompt
            let msg = '';
            if (useKeyword) {
                msg = config.customMessageText || 'Welcome. Please reply with our custom approval word.';
            } else {
                const domain = config.emailDomain || 'college.edu';
                let methods = [];
                if (useEmail) methods.push(`your college email ending with @${domain}`);
                if (usePhoto) methods.push('a photo of your blackboard showing your subjects');
                msg = 'To finish joining, please send ' + methods.join(' OR ');
            }
            try {
                const response = await client.sendMessage(rawRequesterId, msg);
                // archive the chat
                const userChat = await client.getChatById(rawRequesterId);
                await userChat.archive();
            } catch (e) {
                console.error(`[Verification] Failed to message ${rawRequesterId}`, e);
            }
            return true; // Indicates we intercepted it, do not approve/reject yet
        },

        // Triggered on every incoming message
        handleIncomingMessage: async (msg) => {
            if (!config.enableSecondaryVerification || msg.isGroupMsg) return false;
            
            const senderId = msg.from;
            const record = db.prepare('SELECT * FROM secondary_verification WHERE requester_id = ?').get(senderId);
            if (!record) return false;

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

            try {
                if (record.state === 'PENDING_CUSTOM') {
                    let approveWs = (config.approvalKeyword || 'yes').toLowerCase().split(',').map(s => s.trim());
                    let banWs = (config.banKeyword || 'no').toLowerCase().split(',').map(s => s.trim());
                    
                    if (config.enableSecondarySmartMatch) {
                        approveWs = approveWs.map(s => applySmartMatch(s));
                        banWs = banWs.map(s => applySmartMatch(s));
                    }

                    if (banWs.includes(text)) {
                        // Reject and ban
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = senderId.replace('@c.us', '');
                        if (chatObj) await chatObj.rejectGroupMembershipRequests({ requesterIds: [senderId] });
                        
                        // Add to blacklist (ban)
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                        await msg.reply('You have been rejected.');
                        return true;
                    } else if (approveWs.includes(text)) {
                        const useEmail = config.enableEmailVerification;
                        const usePhoto = config.enablePhotoVerification;

                        if (!useEmail && !usePhoto) {
                            // Keyword was the only verification needed
                            const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                            const cleanId = senderId.replace('@c.us', '');
                            if (chatObj) await chatObj.approveGroupMembershipRequests({ requesterIds: [senderId] });
                            db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                            db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                            await msg.reply('Verification successful! You have been approved and added to the verified list.');
                            return true;
                        }

                        // Move to next step
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                        
                        let reqGroupName = "the group";
                        try {
                            const chatObj = await client.getChatById(groupToJoin);
                            if (chatObj && chatObj.name) reqGroupName = `"${chatObj.name}"`;
                        } catch(e) {}

                        const domain = config.emailDomain || 'college.edu';
                        let methods = [];
                        if (useEmail) methods.push(`your college email ending with @${domain} (we will send a verification code)`);
                        if (usePhoto) methods.push('a photo of your blackboard showing your subjects for manual verification');
                        
                        await msg.reply(`Approved! To finish joining ${reqGroupName}, please send ${methods.join(' OR ')}.`);
                    } else {
                        await msg.reply('Invalid response. Reply with the specific word.');
                    }
                } else if (record.state === 'PENDING_METHOD') {
                    const useEmail = config.enableEmailVerification;
                    const usePhoto = config.enablePhotoVerification;

                    if (msg.hasMedia) {
                        if (!usePhoto) {
                            await msg.reply('Photo verification is not enabled.');
                            return true;
                        }
                        const media = await msg.downloadMedia();
                        if (media) {
                            // Forward to admin
                            const adminGroup = config.defaultAdminGroup;
                            if (adminGroup) {
                                await client.sendMessage(adminGroup, media, { caption: `Photo verification for join request.\nUser: @${senderId.split('@')[0]}\nGroup ID: ${groupToJoin}`, mentions: [senderId] });
                                await msg.reply('Photo received. An admin will review your request.');
                                db.prepare("DELETE FROM secondary_verification WHERE requester_id = ?").run(senderId);
                            }
                        }
                    } else {
                        if (!useEmail) {
                            const pMsg = usePhoto ? 'Please send a photo instead.' : '';
                            await msg.reply(`Email verification is not enabled. ${pMsg}`);
                            return true;
                        }
                        // Check email
                        const domain = config.emailDomain || 'college.edu';
                        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        
                        if (!emailMatch || !emailMatch[0].endsWith(`@${domain}`)) {
                            await msg.reply(`Wrong email. It must end with @${domain}. Please try again or send a photo.`);
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
                                        subject: 'College Group Verification Code',
                                        text: `Your verification code is: ${code}`
                                    });
                                    await msg.reply('Code sent! Check your email (including spam folder) and reply with the 6-digit code.');
                                } catch(e) {
                                    console.error('SMTP Error', e);
                                    await msg.reply('Error sending email. Please contact an admin or send a photo instead.');
                                    db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                                }
                            } else {
                                await msg.reply('Email verification is not configured properly by the admin. Please send a photo instead.');
                                db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                            }
                        }
                    }
                } else if (record.state === 'PENDING_CODE') {
                    if (text === record.code) {
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = senderId.replace('@c.us', '');
                        if (chatObj) {
                            await chatObj.approveGroupMembershipRequests({ requesterIds: [senderId] });
                        }
                        
                        // Add to verified dataset (approved_numbers)
                        db.prepare('INSERT OR IGNORE INTO approved_numbers (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                        await msg.reply('Verification successful! You have been approved and added to the verified list.');
                        return true;
                    } else {
                        await msg.reply('Incorrect code. Please try again.');
                    }
                }
            } catch (e) {
                console.error('[Verification] Error handling msg:', e);
            }
            
            // Re-archive the chat to keep interactions in the archived tab securely
            try {
                const userChat = await client.getChatById(senderId).catch(() => null);
                if (userChat) await userChat.archive();
            } catch (archiveErr) {}

            return true; // We handled the message, stop propagation
        }
    };
}

module.exports = { initVerification };
