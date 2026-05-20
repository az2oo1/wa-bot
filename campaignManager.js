const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

let gDb, gConfig, gSendMetaMessage;

// Store interval IDs for auto-scan campaigns
const autoScanTimers = new Map();

function initCampaigns(app, db, config, sendMetaMessage, upload) {
    gDb = db;
    gConfig = config;
    gSendMetaMessage = sendMetaMessage;

    // --- API ROUTES ---

    // 1. Upload Excel and return headers
    app.post('/api/campaigns/upload-excel', upload.single('excelFile'), (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
            
            const filePath = req.file.path;
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            // Extract headers (first row)
            const headers = [];
            const range = xlsx.utils.decode_range(sheet['!ref']);
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell = sheet[xlsx.utils.encode_cell({c: C, r: range.s.r})];
                if (cell && cell.v) headers.push(cell.v.toString());
            }

            res.json({ success: true, headers, filePath });
        } catch (e) {
            console.error('[Campaign] Excel Upload Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // 2. List all campaigns
    app.get('/api/campaigns', (req, res) => {
        try {
            const campaigns = gDb.prepare('SELECT * FROM campaigns ORDER BY id DESC').all().map(c => ({
                ...c,
                header_vars: JSON.parse(c.header_vars || '[]'),
                body_vars: JSON.parse(c.body_vars || '[]'),
                capabilities: JSON.parse(c.capabilities || '[]'),
                excel_headers: JSON.parse(c.excel_headers || '[]'),
                sent_ids: JSON.parse(c.sent_ids || '[]')
            }));
            res.json({ success: true, campaigns });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Create Campaign
    app.post('/api/campaigns', (req, res) => {
        try {
            const data = req.body;
            const stmt = gDb.prepare(`
                INSERT INTO campaigns (
                    name, template_name, template_language, phone_col,
                    header_vars, body_vars, capabilities, excel_path, excel_headers,
                    scan_interval_ms, last_scanned_at, sent_ids, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Check if auto_scan capability exists
            const autoScanCap = (data.capabilities || []).find(c => c.type === 'auto_scan');
            let intervalMs = null;
            if (autoScanCap) {
                const intervals = { 'daily': 86400000, '2days': 172800000, 'weekly': 604800000, 'monthly': 2592000000 };
                intervalMs = intervals[autoScanCap.interval] || 86400000;
            }

            const info = stmt.run(
                data.name, data.template_name, data.template_language, data.phone_col,
                JSON.stringify(data.header_vars || []),
                JSON.stringify(data.body_vars || []),
                JSON.stringify(data.capabilities || []),
                data.excel_path,
                JSON.stringify(data.excel_headers || []),
                intervalMs,
                null, // last_scanned_at
                '[]', // sent_ids
                'active',
                Date.now()
            );

            if (intervalMs) {
                scheduleCampaign(info.lastInsertRowid, intervalMs);
            }

            res.json({ success: true, id: info.lastInsertRowid });
        } catch (e) {
            console.error('[Campaign] Create Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // 4. Delete Campaign
    app.delete('/api/campaigns/:id', (req, res) => {
        try {
            const id = req.params.id;
            clearCampaignSchedule(id);
            gDb.prepare('DELETE FROM campaign_logs WHERE campaign_id = ?').run(id);
            gDb.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 5. Run Campaign (Manual)
    app.post('/api/campaigns/:id/run', async (req, res) => {
        try {
            const id = req.params.id;
            res.json({ success: true, message: 'Campaign started in background' });
            
            // Run asynchronously
            await executeCampaign(id);
        } catch (e) {
            console.error('[Campaign] Run Error:', e);
        }
    });

    // 6. Get Logs
    app.get('/api/campaigns/:id/logs', (req, res) => {
        try {
            const id = req.params.id;
            const logs = gDb.prepare('SELECT * FROM campaign_logs WHERE campaign_id = ? ORDER BY id DESC LIMIT 500').all();
            res.json({ success: true, logs });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Initialize all existing schedules on startup
    initSchedules();
}

function initSchedules() {
    const campaigns = gDb.prepare("SELECT id, scan_interval_ms FROM campaigns WHERE status = 'active' AND scan_interval_ms IS NOT NULL").all();
    for (const c of campaigns) {
        scheduleCampaign(c.id, c.scan_interval_ms);
    }
}

function scheduleCampaign(campaignId, intervalMs) {
    clearCampaignSchedule(campaignId);
    console.log(`[Campaign] Scheduling campaign ${campaignId} to run every ${intervalMs}ms`);
    const timer = setInterval(async () => {
        console.log(`[Campaign] Auto-running campaign ${campaignId}`);
        await executeCampaign(campaignId);
    }, intervalMs);
    autoScanTimers.set(campaignId, timer);
}

function clearCampaignSchedule(campaignId) {
    if (autoScanTimers.has(campaignId)) {
        clearInterval(autoScanTimers.get(campaignId));
        autoScanTimers.delete(campaignId);
    }
}

function normalizePhone(phoneRaw) {
    let p = String(phoneRaw || '').replace(/[\s\-\+\(\)]/g, '');
    if (!p) return null;
    if (p.startsWith('0')) {
        const countryCode = gConfig.webhookCountryCode || '966';
        p = countryCode + p.substring(1);
    } else if (p.length < 10) {
         // rough check, maybe local without 0
        const countryCode = gConfig.webhookCountryCode || '966';
        p = countryCode + p;
    }
    return p;
}

// Calculate days difference (positive = future, negative = past)
function getDaysDiff(targetDateRaw) {
    if (!targetDateRaw) return null;
    
    // Excel dates can be numeric (days since 1900) or strings
    let targetDate;
    if (typeof targetDateRaw === 'number') {
        targetDate = new Date(Math.round((targetDateRaw - 25569) * 86400 * 1000));
    } else {
        targetDate = new Date(targetDateRaw);
    }

    if (isNaN(targetDate.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const diffMs = targetDate.getTime() - today.getTime();
    return Math.round(diffMs / 86400000);
}

async function executeCampaign(campaignId) {
    try {
        const campaignRaw = gDb.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
        if (!campaignRaw) return;

        const campaign = {
            ...campaignRaw,
            header_vars: JSON.parse(campaignRaw.header_vars || '[]'),
            body_vars: JSON.parse(campaignRaw.body_vars || '[]'),
            capabilities: JSON.parse(campaignRaw.capabilities || '[]'),
            sent_ids: JSON.parse(campaignRaw.sent_ids || '[]')
        };

        if (!fs.existsSync(campaign.excel_path)) {
            console.error(`[Campaign] Excel file missing: ${campaign.excel_path}`);
            return;
        }

        const workbook = xlsx.readFile(campaign.excel_path);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        const newSentIds = new Set(campaign.sent_ids);
        let sentCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const phoneRaw = row[campaign.phone_col];
            const phone = normalizePhone(phoneRaw);

            if (!phone) continue;

            // Generate a unique ID for this row/event to prevent duplicates
            // We use phone + values of header/body mapped columns to detect if data changed
            let rowHashData = phone;
            campaign.header_vars.forEach(v => rowHashData += '|' + (row[v.col] || ''));
            campaign.body_vars.forEach(v => {
                if (v.col !== '[Days Left]') {
                    rowHashData += '|' + (row[v.col] || '');
                }
            });

            // Evaluate Capabilities
            let shouldSend = true;
            let dynamicVars = {};

            for (const cap of campaign.capabilities) {
                if (cap.type === 'days_reminder') {
                    const daysDiff = getDaysDiff(row[cap.dateCol]);
                    if (daysDiff === null) {
                        shouldSend = false;
                        break;
                    }
                    
                    const targetDays = parseInt(cap.days, 10);
                    // If direction is 'before', targetDate should be +targetDays from today (daysDiff === targetDays)
                    // If direction is 'after', targetDate should be -targetDays from today (daysDiff === -targetDays)
                    const expectedDiff = cap.direction === 'before' ? targetDays : -targetDays;
                    
                    if (daysDiff !== expectedDiff) {
                        shouldSend = false;
                        break;
                    }

                    // Include the target date in the hash so it only sends once for that date
                    rowHashData += '|reminder_' + cap.dateCol + '_' + daysDiff;
                } else if (cap.type === 'days_left_var') {
                    const daysDiff = getDaysDiff(row[cap.dateCol]);
                    dynamicVars[`${cap.varSection}_${cap.varNum}`] = daysDiff !== null ? Math.max(0, daysDiff).toString() : '0';
                    // We also include this dynamic var in hash
                    rowHashData += '|dl_' + daysDiff;
                }
            }

            if (!shouldSend) continue;

            // Simple hash
            const crypto = require('crypto');
            const rowId = crypto.createHash('md5').update(rowHashData).digest('hex');

            if (newSentIds.has(rowId)) {
                continue; // Already sent this exact payload to this phone
            }

            // Build Template Payload
            const headerComponents = campaign.header_vars.map(v => {
                let val = v.col === '[Days Left]' ? dynamicVars[`header_${v.varNum}`] : row[v.col];
                return { type: "text", text: String(val || '') };
            });

            const bodyComponents = campaign.body_vars.map(v => {
                let val = v.col === '[Days Left]' ? dynamicVars[`body_${v.varNum}`] : row[v.col];
                return { type: "text", text: String(val || '') };
            });

            const components = [];
            if (headerComponents.length > 0) {
                components.push({ type: "header", parameters: headerComponents });
            }
            if (bodyComponents.length > 0) {
                components.push({ type: "body", parameters: bodyComponents });
            }

            // Send
            try {
                const url = \`https://graph.facebook.com/v17.0/\${gConfig.metaPhoneId}/messages\`;
                const payload = {
                    messaging_product: "whatsapp",
                    to: phone,
                    type: "template",
                    template: {
                        name: campaign.template_name,
                        language: { code: campaign.template_language || 'ar' },
                        components: components
                    }
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        "Authorization": \`Bearer \${gConfig.metaAccessToken}\`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    newSentIds.add(rowId);
                    gDb.prepare('INSERT INTO campaign_logs (campaign_id, phone, row_data, status, error, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
                       .run(campaignId, phone, JSON.stringify(row), 'sent', null, Date.now());
                    sentCount++;
                } else {
                    const errTxt = await response.text();
                    gDb.prepare('INSERT INTO campaign_logs (campaign_id, phone, row_data, status, error, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
                       .run(campaignId, phone, JSON.stringify(row), 'failed', errTxt, Date.now());
                }

            } catch (err) {
                gDb.prepare('INSERT INTO campaign_logs (campaign_id, phone, row_data, status, error, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
                   .run(campaignId, phone, JSON.stringify(row), 'failed', err.message, Date.now());
            }

            // Rate limit intentionally to avoid Meta API throttling
            await new Promise(res => setTimeout(res, 200));
        }

        // Update campaign
        gDb.prepare('UPDATE campaigns SET sent_ids = ?, last_scanned_at = ? WHERE id = ?')
           .run(JSON.stringify(Array.from(newSentIds)), Date.now(), campaignId);

        console.log(\`[Campaign] Finished execution for \${campaign.name}. Sent: \${sentCount}\`);

    } catch (e) {
        console.error('[Campaign] Execution Error:', e);
    }
}

module.exports = {
    initCampaigns
};
