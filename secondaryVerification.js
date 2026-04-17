const nodemailer = require('nodemailer');

function initVerification(client, db, config, chat) {
    return {
        // Triggered after bio check is passed
        startVerification: async (rawRequesterId, cleanUserId, groupId) => {
            if (!config.enableSecondaryVerification) return false;
            
            console.log(`[Verification] Starting for ${cleanUserId}`);
            
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO secondary_verification 
                (requester_id, group_id, state, email, code, created_at) 
                VALUES (?, ?, 'PENDING_CUSTOM', '', '', ?)
            `);
            insertStmt.run(rawRequesterId, groupId, Date.now());

            // Send initial custom message
            const msg = config.customMessageText || 'Welcome. Please reply with our custom approval word.';
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

            const text = (msg.body || '').trim().toLowerCase();
            const groupToJoin = record.group_id;

            try {
                if (record.state === 'PENDING_CUSTOM') {
                    const approveW = (config.approvalKeyword || 'yes').toLowerCase();
                    const banW = (config.banKeyword || 'no').toLowerCase();

                    if (text === banW) {
                        // Reject and ban
                        const chatObj = await client.getChatById(groupToJoin).catch(()=>null);
                        const cleanId = senderId.replace('@c.us', '');
                        if (chatObj) await chatObj.rejectGroupMembershipRequests({ requesterIds: [senderId] });
                        
                        // Add to blacklist (ban)
                        db.prepare('INSERT OR IGNORE INTO blacklist (number) VALUES (?)').run(cleanId);
                        
                        db.prepare('DELETE FROM secondary_verification WHERE requester_id = ?').run(senderId);
                        await msg.reply('You have been rejected.');
                        return true;
                    }

                    if (text === approveW) {
                        // Move to next step
                        db.prepare("UPDATE secondary_verification SET state = 'PENDING_METHOD' WHERE requester_id = ?").run(senderId);
                        
                        let reqGroupName = "the group";
                        try {
                            const chatObj = await client.getChatById(groupToJoin);
                            if (chatObj && chatObj.name) reqGroupName = `"${chatObj.name}"`;
                        } catch(e) {}

                        const domain = config.emailDomain || 'college.edu';
                        await msg.reply(`Approved! To finish joining ${reqGroupName}, please send your college email ending with @${domain} (we will send a verification code), OR send a photo of your blackboard showing your subjects for manual verification.`);
                    } else {
                        await msg.reply('Invalid response. Reply with the specific word.');
                    }
                } else if (record.state === 'PENDING_METHOD') {
                    if (msg.hasMedia) {
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
                        
                        // Add to verified dataset (whitelist)
                        db.prepare('INSERT OR IGNORE INTO whitelist (number) VALUES (?)').run(cleanId);
                        
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
