module.exports = function renderDashboard(req, db, config, runtimeStatus = {}) {
    let lang = 'ar';
    if (req.headers.cookie && req.headers.cookie.includes('bot_lang=en')) lang = 'en';
    const currentLang = lang;
    const t = (ar, en) => lang === 'en' ? en : ar;
    const dir = lang === 'en' ? 'ltr' : 'rtl';
    const escapeHtml = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const getStatusIconClass = (kind) => {
        if (kind === 'connected') return 'fas fa-check-circle';
        if (kind === 'waiting_qr') return 'fas fa-qrcode';
        if (kind === 'syncing' || kind === 'initializing' || kind === 'retrying' || kind === 'terminating') return 'fas fa-spinner fa-spin';
        if (kind === 'error') return 'fas fa-exclamation-triangle';
        if (kind === 'disconnected') return 'fas fa-sign-out-alt';
        return 'fas fa-info-circle';
    };
    const getStatusDotClass = (kind) => {
        if (kind === 'connected') return 'status-dot online';
        if (kind === 'waiting_qr') return 'status-dot waiting';
        return 'status-dot';
    };
    const initialStatusKind = runtimeStatus.statusKind || 'initializing';
    const initialStatusText = escapeHtml(
        runtimeStatus.statusText || (lang === 'en' ? 'Initializing system...' : 'جاري تهيئة النظام وبدء التشغيل...')
    );
    const initialStatusIconClass = getStatusIconClass(initialStatusKind);
    const initialStatusDotClass = getStatusDotClass(initialStatusKind);
    const initialLogoutDisplay = initialStatusKind === 'connected' ? 'block' : 'none';
    const mediaTypesMeta = [
        { id: 'text', icon: '<i class="fas fa-file-alt"></i>', name: t('نصوص', 'Text') },
        { id: 'image', icon: '<i class="fas fa-image"></i>', name: t('صور', 'Images') },
        { id: 'video', icon: '<i class="fas fa-video"></i>', name: t('فيديو', 'Videos') },
        { id: 'audio', icon: '<i class="fas fa-music"></i>', name: t('صوتيات', 'Audio') },
        { id: 'document', icon: '<i class="fas fa-file"></i>', name: t('ملفات', 'Documents') },
        { id: 'sticker', icon: '<i class="fas fa-smile"></i>', name: t('ملصقات', 'Stickers') }
    ];
    const blacklistArr = db.prepare('SELECT number FROM blacklist').all().map(r => r.number);
    const blockedExtensionsArr = db.prepare('SELECT ext FROM blocked_extensions').all().map(r => r.ext);
    const whitelistArr = db.prepare('SELECT number FROM whitelist').all().map(r => r.number);
    const approvedArr = db.prepare('SELECT number FROM approved_numbers').all().map(r => r.number);
    const groupsConfigObj = config.groupsConfig || {};
    
    let wsGroups = [];
    try {
        wsGroups = db.prepare('SELECT id, name FROM whatsapp_groups').all();
    } catch(e) {}
    
    const groupsArr = Object.keys(groupsConfigObj).map(key => {
        const wsGroup = wsGroups.find(g => g.id === key);
        let name = wsGroup && wsGroup.name ? wsGroup.name : (groupsConfigObj[key].name || key);
        if (name === key && key.endsWith('@g.us')) {
            name = t('مجموعة', 'Group') + ' (' + key.substring(0, 10) + '...)';
        }
        return { id: key, name };
    });

    return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${t('لوحة تحكم المشرف الآلي', 'Auto Mod Dashboard')}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><link rel="stylesheet" href="/css/style.css">
    </head>
    <body>
        
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-logo">
                <div class="logo-icon"><img src="/public/logo.png?v=2" alt="${t('شعار البوت', 'Bot Logo')}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;display:block;" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='public/logo.png?v=2';return;}this.style.display='none';this.nextElementSibling.style.display='flex';"><i class="fas fa-robot" style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:22px;color:#fff;"></i></div>
                <div class="logo-text">${t('المشرف الآلي', 'Auto Mod')} <small>${t('لوحة التحكم V.6.6', 'Dashboard V6.6')}</small></div>
            </div>

            <div class="sidebar-nav-scroll">
                <div class="nav-section">${t('الرئيسية', 'Main')}</div>
                <button class="nav-item active" onclick="showPage('page-status', this)">
                    <span class="nav-icon"><i class="fas fa-satellite-dish"></i></span> ${t('حالة الاتصال', 'Connection Status')}
                </button>
                <button class="nav-item" onclick="showPage('page-blacklist', this)">
                    <span class="nav-icon"><i class="fas fa-users-slash"></i></span> ${t('إدارة الأرقام', 'Manage Numbers')}
                    <span class="nav-badge" id="blacklist-count">0</span>
                </button>

                <div class="nav-section">${t('الإعدادات', 'Settings')}</div>
                <button class="nav-item" onclick="showPage('page-general', this)">
                    <span class="nav-icon"><i class="fas fa-cog"></i></span> ${t('الإعدادات العامة', 'General Settings')}
                </button>
                <button class="nav-item" onclick="showPage('page-missed-call', this)">
                    <span class="nav-icon"><i class="fas fa-satellite-dish"></i></span> ${t('المكالمات الفائتة', 'Missed Calls')}
                </button>
                <button class="nav-item" onclick="showPage('page-spam', this)">
                    <span class="nav-icon"><i class="fas fa-shield-alt"></i></span> ${t('مكافحة الإزعاج', 'Anti-Spam')}
                </button>
                <button class="nav-item" onclick="showPage('page-media', this)">
                    <span class="nav-icon"><i class="fas fa-filter"></i></span> ${t('فلتر الوسائط', 'Media Filter')}
                </button>
                <button class="nav-item" onclick="showPage('page-ai', this)">
                    <span class="nav-icon"><i class="fas fa-brain"></i></span> ${t('الذكاء الاصطناعي', 'AI Moderator')}
                </button>
                <button class="nav-item" onclick="showPage('page-global-qa', this)">
                    <span class="nav-icon"><i class="fas fa-comments"></i></span> ${t('الأسئلة العامة', 'Global Q&A')}
                </button>
                <button class="nav-item" onclick="showPage('page-groups', this)">
                    <span class="nav-icon"><i class="fas fa-users-cog"></i></span> ${t('المجموعات المخصصة', 'Custom Groups')}
                </button>

                <div class="nav-section">${t('أدوات', 'Tools')}</div>
                <button class="nav-item" onclick="openDebuggerModal()">
                    <span class="nav-icon"><i class="fas fa-bug"></i></span> ${t('سجل الأحداث', 'Event Logs')}
                </button>
                <button class="nav-item" onclick="showPage('page-import-export', this)">
                    <span class="nav-icon"><i class="fas fa-exchange-alt"></i></span> ${t('استيراد/تصدير', 'Import/Export')}
                </button>
                <button class="nav-item" onclick="showPage('page-archive', this)">
                    <span class="nav-icon"><i class="fas fa-box-archive"></i></span> ${t('الأرشيف', 'Archive')}
                </button>
                <button class="nav-item" onclick="showPage('page-users', this)">
                    <span class="nav-icon"><i class="fas fa-user-shield"></i></span> ${t('إدارة المستخدمين', 'User Management')}
                </button>
                <button class="nav-item" onclick="showPage('page-about', this)">
                    <span class="nav-icon"><i class="fas fa-info-circle"></i></span> ${t('حول', 'About')}
                </button>
            </div>

            <div class="sidebar-footer">
                <button id="signOutBtn" data-variant="danger" onclick="signOutSession()"><i class="fas fa-right-from-bracket"></i> ${t('تسجيل الخروج', 'Sign Out')}</button>
                <button data-variant="primary" onclick="saveConfig()"><i class="fas fa-save"></i> ${t('حفظ', 'Save')}</button>
            </div>
        </nav>

        <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

        <div class="main">
            <div class="topbar">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="hamburger" onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
                    <span class="topbar-title" id="topbarTitle">${t('حالة الاتصال', 'Connection Status')}</span>
                </div>
                <div class="topbar-right">
                    
                    <div style="display: flex; align-items: center; gap: 6px; background: var(--input-bg); padding: 4px 10px; border-radius: 20px; border: 1.5px solid var(--card-border);">
                        <span style="font-size: 11px; font-weight: 700; color: ${lang === 'ar' ? 'var(--accent)' : 'var(--text-muted)'}; transition: color 0.3s;">AR</span>
                        <label class="switch" style="width: 36px; height: 20px;">
                            <input type="checkbox" id="langToggle" onchange="switchLanguage(this)" ${lang === 'en' ? 'checked' : ''}>
                            <span class="slider lang-slider" style="border-radius: 20px;"></span>
                        </label>
                        <span style="font-size: 11px; font-weight: 700; color: ${lang === 'en' ? 'var(--accent)' : 'var(--text-muted)'}; transition: color 0.3s;">EN</span>
                    </div>

                    <div class="status-pill">
                        <div class="${initialStatusDotClass}" id="statusDot"></div>
                        <span id="status-text"><i id="status-text-icon" class="${initialStatusIconClass}"></i> <span id="status-text-label">${initialStatusText}</span></span>
                    </div>
                </div>
            </div>

            <form id="configForm">

            <div class="page active" id="page-status">
                <div class="page-header">
                    <h2><i class="fas fa-wifi"></i> ${t('حالة الاتصال بواتساب', 'WhatsApp Connection Status')}</h2>
                    <p>${t('اربط حساب واتساب بمسح رمز QR أو راقب الاتصال الحالي', 'Link WhatsApp account by scanning the QR code or monitor connection')}</p>
                </div>
                <div class="card-grid">
                    <div class="card" style="grid-column: 1;">
                        <div class="card-header"><h3><i class="fas fa-qrcode"></i> ${t('رمز QR', 'QR Code')}</h3></div>
                        <div class="qr-wrap">
                            <img id="qr-image" src="" alt="QR Code" />
                            <div id="qr-placeholder" style="text-align:center; color: var(--text-muted); padding: 20px 0;">
                                <div style="font-size: 64px; margin-bottom: 16px;"><i class="fas fa-mobile-alt"></i></div>
                                <div style="font-size: 18px; font-weight: 700; color: var(--text);">${t('في انتظار رمز QR...', 'Waiting for QR code...')}</div>
                                <div style="font-size: 14px; margin-top: 8px;">${t('سيظهر الرمز هنا تلقائياً', 'Code will appear here automatically')}</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <div class="card success">
                            <div class="card-header"><h3 style="color:var(--accent);"><i class="fas fa-chart-line"></i> ${t('حالة النظام', 'System Status')}</h3></div>
                            <div style="font-size:16px; color:var(--text-muted); line-height:2.2;">
                                <div><i class="fas fa-robot"></i> <strong style="color:var(--text);">${t('البوت:', 'Bot:')}</strong> <span id="status-text-detail" style="color:var(--accent);">...</span> <i id="status-text-detail-check" class="fas fa-check" style="color:var(--accent);display:none;"></i></div>
                                <div><i class="fas fa-database"></i> <strong style="color:var(--text);">${t('قاعدة البيانات:', 'Database:')}</strong> <span style="color:var(--accent);">${t('متصلة', 'Connected')} <i class="fas fa-check"></i></span></div>
                                <div><i class="fas fa-globe"></i> <strong style="color:var(--text);">${t('المنفذ:', 'Port:')}</strong> <span style="color:var(--accent);">3000 <i class="fas fa-check"></i></span></div>
                            </div>
                            <div style="margin-top:14px; padding-top:14px; border-top:1px dashed var(--card-border);">
                                <button id="logoutBtn" type="button" class="btn btn-danger" onclick="logoutBot()" style="display:none;"><i class="fas fa-link-slash"></i> ${t('قطع اتصال واتساب', 'Disconnect WhatsApp')}</button>
                                <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">${t('هذا الخيار يفصل جلسة واتساب فقط وليس حساب لوحة التحكم', 'This disconnects only the WhatsApp session, not your dashboard account')}</div>
                            </div>
                        </div>
                        <div class="card info">
                            <div class="card-header"><h3 style="color:var(--blue);"><i class="fas fa-info-circle"></i> ${t('تعليمات الاستخدام', 'Instructions')}</h3></div>
                            <div style="font-size:14px; color:var(--text-muted); line-height:2.2;">
                                <div><span class="step-badge">1</span> ${t('امسح رمز QR بهاتفك من واتساب', 'Scan QR code with your phone')}</div>
                                <div><span class="step-badge">2</span> ${t('أضف البوت كمشرف في المجموعات', 'Add bot as group admin')}</div>
                                <div><span class="step-badge">3</span> ${t('افتح صفحة الإعدادات وخصّص القواعد', 'Customize rules in settings')}</div>
                                <div><span class="step-badge">4</span> ${t('اضغط على حفظ لتطبيق التغييرات', 'Click Save to apply changes')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-blacklist">
                <div class="page-header">
                    <h2><i class="fas fa-shield-alt"></i> ${t('إدارة الأرقام (حظر وتوثيق)', 'Number Management (Ban & VIP)')}</h2>
                    <p>${t('أضف الأرقام المحظورة (طرد فوري) أو الموثوقة (تخطي الفلاتر)', 'Add banned numbers (instant kick) or trusted VIPs (bypass filters)')}</p>
                </div>
                
                <div class="card-grid blacklist-grid">
                    <div class="blacklist-column">
                    <div class="card danger blacklist-main-card">
                        <div class="card-header">
                            <h3 style="color:var(--red);"><i class="fas fa-user-plus"></i> ${t('القائمة السوداء (حظر)', 'Blacklist (Banned)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">${t('طرد فوري', 'Instant Kick')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newBlacklistNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlacklistNumber();}">
                                <button type="button" class="btn btn-danger" onclick="addBlacklistNumber()"><i class="fas fa-ban"></i> ${t('حظر', 'Ban')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام المحظورة حالياً', 'Currently Banned Numbers')}</label>
                        <div id="blacklistContainer" class="chip-container"></div>
                        
                        <div class="toggle-row danger" style="margin-top:20px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableBlacklist" ${config.enableBlacklist ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label danger">
                                    ${t('تفعيل نظام القائمة السوداء', 'Enable Blacklist System')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card warning purge-card">
                        <div class="card-header"><h3 style="color:var(--orange);"><i class="fas fa-broom"></i> ${t('طرد رجعي شامل', 'Global Purge')}</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom: 18px; line-height:1.8;">${t('سيبحث البوت في جميع المجموعات التي هو فيها مشرف، ويطرد كل من في القائمة السوداء فوراً.', 'Bot will scan all managed groups and kick anyone in the blacklist immediately.')}</p>
                        <button type="button" id="purgeBtn" class="btn btn-warning" style="width:100%; justify-content:center; padding:15px; font-size:16px;" onclick="purgeBlacklisted()">
                            <i class="fas fa-gavel"></i> ${t('تنفيذ الطرد الشامل الآن', 'Execute Global Purge Now')}
                        </button>
                        <button type="button" id="scanBtn" class="btn btn-primary" style="width:100%; justify-content:center; padding:15px; font-size:16px; margin-top: 10px;" onclick="scanGroupsForFlags()">
                            <i class="fas fa-search"></i> ${t('فحص تشخيصي للمجموعات', 'Run Group Diagnostic Scan')}
                        </button>
                    </div>

                    <div class="card warning purge-card">
                        <div class="card-header"><h3 style="color:var(--orange);"><i class="fas fa-clock"></i> ${t('جدولة الطرد الشامل', 'Auto-Purge Schedule')}</h3></div>
                        <div class="field-row" style="align-items:end; margin-bottom:10px;">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label">${t('الفاصل بالدقائق', 'Interval (minutes)')}</label>
                                <input type="number" id="autoPurgeIntervalMinutes" min="1" step="1" value="60">
                            </div>
                            <button type="button" id="saveAutoPurgeScheduleBtn" class="btn btn-warning" onclick="saveAutoPurgeSchedule()" style="height:44px;">
                                <i class="fas fa-save"></i> ${t('حفظ', 'Save')}
                            </button>
                        </div>
                        <div class="toggle-row warning" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="autoPurgeScheduleEnabled"><span class="slider"></span></label>
                                <div class="toggle-label warning">${t('تفعيل الجدولة التلقائية', 'Enable automatic schedule')}</div>
                            </div>
                        </div>
                        <button type="button" id="runAutoPurgeScheduleBtn" class="btn btn-warning" style="width:100%; justify-content:center;" onclick="runAutoPurgeNow()">
                            <i class="fas fa-play"></i> ${t('تشغيل الطرد الآن', 'Run Auto-Purge Now')}
                        </button>
                    </div>
                    </div>

                    <div class="blacklist-column">
                    <div class="card danger blocked-ext-card">
                        <div class="card-header">
                            <h3 style="color:var(--red);"><i class="fas fa-globe"></i> ${t('رموز الدول المحظورة', 'Blocked Extensions')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">${t('حظر دول كاملة', 'Ban Entire Countries')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رمز الدولة (بدون +)', 'Country Code (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="number" id="newBlockedExtension" placeholder="Ex: 1, 91" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlockedExtension();}">
                                <button type="button" class="btn btn-danger" onclick="addBlockedExtension()"><i class="fas fa-ban"></i> ${t('حظر', 'Ban')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('رموز الدول المحظورة حالياً', 'Currently Blocked Extensions')}</label>
                        <div id="blockedExtensionsContainer" class="chip-container"></div>
                    </div>

                    <div class="card success whitelist-card">
                        <div class="card-header">
                            <h3 style="color:var(--accent);"><i class="fas fa-star"></i> ${t('القائمة البيضاء (VIP)', 'Whitelist (VIP)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--accent-dim); padding:4px 10px; border-radius:20px;">${t('تخطي جميع القيود', 'Bypasses all rules')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newWhitelistNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addWhitelistNumber();}">
                                <button type="button" class="btn btn-primary" onclick="addWhitelistNumber()"><i class="fas fa-check"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام الموثوقة حالياً', 'Currently Trusted Numbers')}</label>
                        <div id="whitelistContainer" class="chip-container"></div>

                        <div class="toggle-row green" style="margin-top:20px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWhitelist" ${config.enableWhitelist ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label green">
                                    ${t('تفعيل نظام القائمة البيضاء', 'Enable Whitelist System')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card" style="border:1px solid var(--card-border);">
                        <div class="card-header">
                            <h3 style="color:var(--text);"><i class="fas fa-user-check"></i> ${t('الأرقام الموثوقة - التحقق', 'Approved Numbers (Verified)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--input-bg); padding:4px 10px; border-radius:20px;">${t('حسابات تم التحقق منها', 'Passed Verification')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newApprovedNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addApprovedNumber();}">
                                <button type="button" class="btn btn-primary" onclick="addApprovedNumber()"><i class="fas fa-check"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام المتحقق منها حالياً', 'Currently Approved Numbers')}</label>
                        <div id="approvedContainer" class="chip-container"></div>

                        <div class="field-group" style="background: rgba(0,0,0,0.1); border-radius: 8px; padding: 15px; margin-top: 20px; border: 1.5px solid var(--card-border);">
                            <label class="field-label">${t('استخراج واعتماد الأرقام من مجموعات معينة', 'Extract & Approve Members from Groups')}</label>
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${t('قم باختيار المجموعات وسيتم سحب أرقام جميع المتواجدين فيها واعتمادهم مباشرة فورياً', 'Select groups to extract and automatically approve all participants inside them.')}</p>
                            
                            <div style="max-height: 180px; overflow-y: auto; background: var(--input-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                                ${groupsArr.map(g => `
                                    <label class="cb-label" style="justify-content: flex-start; padding: 8px 12px; border-color: var(--card-border);">
                                        <input type="checkbox" value="${g.id}" class="extract-group-cb">
                                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-inline-start:8px;">${(g.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')}</span>
                                    </label>
                                `).join('')}
                            </div>
                            
                            <button type="button" class="btn btn-warning" style="margin-top: 15px; width: 100%; justify-content: center; font-size: 14px;" onclick="extractApprovedNumbersFromGroups(this)">
                                <i class="fas fa-download"></i> ${t('استخراج واعتماد الأرقام المحددة', 'Extract & Approve Selected Groups')}
                            </button>
                        </div>
                    </div>

                    <div class="card info" style="border-color:rgba(64,196,255,0.4);">
                        <div class="card-header"><h3 style="color:var(--blue);"><i class="fas fa-user-shield"></i> ${t('مزامنة مشرفي المجموعات', 'Admin Whitelist Sync')}</h3></div>
                        <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px; line-height:1.8;">${t('يضيف جميع مشرفي المجموعات (التي يديرها البوت) إلى القائمة البيضاء تلقائياً.', 'Automatically adds admins from bot-managed groups to the whitelist.')}</p>
                        <div class="field-row" style="align-items:end; margin-bottom:10px;">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label">${t('الفاصل بالدقائق', 'Interval (minutes)')}</label>
                                <input type="number" id="adminWhitelistSyncIntervalMinutes" min="1" step="1" value="60">
                            </div>
                            <button type="button" id="saveAdminWhitelistSyncScheduleBtn" class="btn btn-blue" onclick="saveAdminWhitelistSyncSchedule()" style="height:44px;">
                                <i class="fas fa-save"></i> ${t('حفظ', 'Save')}
                            </button>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="adminWhitelistSyncEnabled"><span class="slider"></span></label>
                                <div class="toggle-label blue">${t('تفعيل الجدولة التلقائية', 'Enable automatic schedule')}</div>
                            </div>
                        </div>
                        <button type="button" id="runAdminWhitelistSyncBtn" class="btn btn-blue" style="width:100%; justify-content:center;" onclick="runAdminWhitelistSyncNow()">
                            <i class="fas fa-play"></i> ${t('تشغيل المزامنة الآن', 'Run Sync Now')}
                        </button>
                    </div>
                    </div>



                </div>
            </div>

            <div class="page" id="page-general">
                <div class="page-header">
                    <h2><i class="fas fa-cog"></i> ${t('الإعدادات العامة', 'General Settings')}</h2>
                    <p>${t('تطبّق على جميع المجموعات التي لا تملك إعدادات مخصصة', 'Applies to all groups without custom settings')}</p>
                </div>

                <div class="card-grid general-top-grid">
                    <div class="card general-top-card" style="margin-bottom:0;">
                        <div class="card-header"><h3><i class="fas fa-users"></i> ${t('مجموعة الإدارة الافتراضية', 'Default Admin Group')}</h3></div>
                        <div class="field-group" id="defaultAdminGroupContainer">
                            <label class="field-label">${t('اختر المجموعة لتلقي التنبيهات', 'Select Group for Alerts')}</label>
                        </div>
                    </div>

                    <div class="card general-top-card" style="margin-bottom:0; border-color:rgba(100,220,150,0.35); background:linear-gradient(160deg,rgba(100,220,150,0.05) 0,var(--card-bg) 58%); position:relative; overflow:hidden;">
                    <style>
                        @keyframes safePulse {
                            0%,100% { box-shadow: 0 0 0 0 rgba(100,220,150,0.55); }
                            50%      { box-shadow: 0 0 0 8px rgba(100,220,150,0); }
                        }
                        .general-top-grid { align-items: stretch; margin-bottom: 20px; }
                        .general-top-card { display: flex; flex-direction: column; }
                        .general-top-card .field-group { margin-bottom: 0; }
                        #defaultWordsContainer { max-height: 160px; gap: 8px; }
                        #defaultWordsContainer .chip { padding: 5px 10px; font-size: 13px; }
                        #safeMode + .slider { transition: background 0.35s ease, box-shadow 0.35s ease !important; }
                        #safeMode:not(:checked) + .slider { animation: safePulse 1.8s ease-in-out infinite; }
                    </style>

                    <div style="display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,rgba(255,171,64,0.16),rgba(255,171,64,0.03));border:1px solid rgba(255,171,64,0.35);border-radius:10px;padding:10px 14px;margin-bottom:14px;">
                        <i class="fas fa-exclamation-triangle" style="color:var(--orange);font-size:18px;flex-shrink:0;"></i>
                        <div>
                            <strong style="color:#ffd08a;font-size:14px;">${t('يُنصح بشدة بتفعيله', '⚠️ Strongly Recommended')}</strong>
                            <div style="font-size:12px;color:var(--text);opacity:.88;margin-top:2px;">${t('تشغيل البوت بدون هذا الوضع يزيد من احتمالية حظر حسابك من واتساب', 'Running the bot without Safe Mode significantly increases the risk of your WhatsApp account being banned')}</div>
                        </div>
                    </div>

                    <div class="card-header" style="padding-bottom:14px;">
                        <h3 style="color:#64dc96;"><i class="fas fa-user-shield"></i> ${t('الوضع الآمن (Safe Mode)', 'Safe Mode')}</h3>
                        <span style="font-size:12px; background:rgba(100,220,150,0.15); color:#64dc96; border:1px solid rgba(100,220,150,0.4); padding:3px 12px; border-radius:20px; font-weight:700;">${t('حماية من الحظر', 'Anti-Ban')}</span>
                    </div>
                    <div class="toggle-row" style="border-color:rgba(100,220,150,0.35); background:rgba(100,220,150,0.07); margin-bottom:16px; padding:14px 18px; border-radius:12px;">
                        <div class="toggle-left" style="gap:16px;">
                            <label class="switch" style="flex-shrink:0;"><input type="checkbox" id="safeMode" ${config.safeMode ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="toggle-label" style="color:#64dc96;">
                                ${t('تفعيل الوضع الآمن', 'Enable Safe Mode')}
                                <small>${t('تأخير عشوائي 10–60 ثانية قبل كل إجراء لتجنب كشف البوت', 'Random 10–60s delay before each action to avoid bot detection')}</small>
                            </div>
                        </div>
                        ${config.safeMode
            ? `<span style="font-size:12px;background:rgba(100,220,150,0.15);color:#64dc96;border:1px solid rgba(100,220,150,0.3);padding:3px 10px;border-radius:20px;font-weight:700;"><i class="fas fa-check"></i> ${t('مفعّل', 'Active')}</span>`
            : `<span style="font-size:12px;background:rgba(255,82,82,0.12);color:var(--red);border:1px solid rgba(255,82,82,0.3);padding:3px 10px;border-radius:20px;font-weight:700;"><i class="fas fa-times"></i> ${t('معطّل', 'Off')}</span>`
        }
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); line-height:1.9; padding:11px 12px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                        <div style="margin-bottom:6px;"><i class="fas fa-times-circle" style="color:var(--red);"></i> <strong style="color:var(--text);">${t('إيقاف:', 'Off:')}</strong> ${t('إجراءات فورية — أسرع ولكن تُعرّض حسابك للحظر', 'Instant actions — faster but risks getting your account banned')}</div>
                        <div style="margin-bottom:6px;"><i class="fas fa-shield-alt" style="color:#64dc96;"></i> <strong style="color:var(--text);">${t('تشغيل:', 'On:')}</strong> ${t('تأخير عشوائي 10–60 ث — يحاكي سلوك الإنسان ويقلل خطر الحظر بشكل كبير', 'Random 10–60s delay — mimics human behaviour, greatly reduces ban risk')}</div>
                        <div><i class="fas fa-info-circle" style="color:var(--blue);"></i> <strong style="color:var(--text);">${t('يؤثر على:', 'Covers:')}</strong> ${t('الطرد، الحذف، التصويت، الإبلاغ، رسائل الترحيب', 'Kicks, deletes, polls, reports, welcome messages')}</div>
                    </div>
                </div>

                </div>

                <div class="card-grid">
                    <!-- Verification Card -->
                    <div class="card info">
                        <div class="card-header">
                            <h3><i class="fas fa-shield-alt"></i> ${t('التحقق الثنائي', 'Secondary Verification')}</h3>
                            <label class="switch"><input type="checkbox" id="enableSecondaryVerification" ${config.enableSecondaryVerification ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:10px;">${t('تفعيل الميزات الثلاث للتحقق بشكل منفصل', 'Enable the three features for verification separately')}</div>

                        <div class="field-group" style="background: rgba(0,0,0,0.1); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                            <label class="field-label">${t('لغة رسائل البوت', 'Bot Reply Language')}</label>
                            <select id="secondaryVerificationLanguage" class="form-control" style="width:100%;margin-bottom:10px;">
                                <option value="en" ${config.secondaryVerificationLanguage === 'en' ? 'selected' : ''}>English</option>
                                <option value="ar" ${config.secondaryVerificationLanguage === 'ar' ? 'selected' : ''}>العربية (Arabic)</option>
                            </select>
                            
                            <label class="field-label">${t('المجموعات المطبقة عليها الطريقة', 'Groups Using This Verification')}</label>
                            <div id="secondaryVerificationGroupsContainer" style="max-height: 180px; overflow-y: auto; background: var(--input-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                                ${groupsArr.map(g => `
                                    <label class="cb-label" style="justify-content: flex-start; padding: 8px 12px; border-color: var(--card-border);">
                                        <input type="checkbox" value="${g.id}" class="sec-verification-grp-cb" ${(config.secondaryVerificationGroups || []).includes(g.id) ? 'checked' : ''}>
                                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-inline-start:8px;">${(g.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')}</span>
                                    </label>
                                `).join('')}
                            </div>
                            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${t('اختر المجموعات التي تريد تطبيق النظام عليها (اذا لم تحدد شيئاً فلن يعمل على أي مجموعة)', 'Select groups to apply the system to (if empty, it will not run on any group)')}</div>
                        </div>

                        <div class="field-group" style="background: rgba(0,0,0,0.1); border-radius: 6px; padding: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <label class="field-label" style="margin: 0;">${t('تأخير الإرسال لمنع الحظر (ثواني - مثلاً 3600 لانتظار ساعة)', 'DM Delay to prevent ban (secs - e.g. 3600 for 1 hr)')}</label>
                            <input type="number" id="secondaryVerificationDelay" class="form-control" value="${config.secondaryVerificationDelay !== undefined ? config.secondaryVerificationDelay : 3600}" min="1" max="86400" style="width: 80px;">
                        </div>

                        <div class="field-row" style="margin-bottom:12px;">
                            <div class="field-group" style="margin-bottom:0; background: rgba(0,0,0,0.1); border-radius: 6px; padding: 12px;">
                                <label class="field-label">${t('مهلة الرد التلقائي (أيام)', 'Auto-reject timeout (days)')}</label>
                                <input type="number" id="secondaryVerificationTimeoutDays" class="form-control" value="${config.secondaryVerificationTimeoutDays !== undefined ? config.secondaryVerificationTimeoutDays : 2}" min="1" max="30">
                            </div>
                            <div class="field-group" style="margin-bottom:0; background: rgba(0,0,0,0.1); border-radius: 6px; padding: 12px;">
                                <label class="field-label">${t('كود إيقاف التحقق', 'Stop Verification Code')}</label>
                                <input type="text" id="secondaryVerificationStopCode" class="form-control" value="${(config.secondaryVerificationStopCode || '').replace(/"/g, '&quot;')}" placeholder="${t('مثال: STOP123', 'Example: STOP123')}">
                            </div>
                        </div>

                        <div class="sub-panel" style="margin-top:0; margin-bottom:12px; border-color:rgba(64,196,255,0.3);">
                            <h4><i class="fas fa-flask"></i> ${t('اختبار التحقق الثنائي', 'Secondary Verification Test')}</h4>
                            <div class="field-row" style="margin-bottom:10px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('رقم للاختبار', 'Test Number')}</label>
                                    <input type="text" id="secondaryVerificationTestNumber" placeholder="${t('مثال: 9665XXXXXXXX', 'Example: 9665123456')}">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('المجموعة (اختياري)', 'Group (Optional)')}</label>
                                    <select id="secondaryVerificationTestGroup" class="form-control">
                                        <option value="">${t('اختيار تلقائي من المجموعات المحددة', 'Auto-select from selected groups')}</option>
                                        ${(groupsArr.filter(g => (config.secondaryVerificationGroups || []).includes(g.id))).map(g => `<option value="${g.id}">${(g.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            <button type="button" class="btn btn-blue btn-sm" id="secondaryVerificationTestBtn" onclick="runSecondaryVerificationTest()">
                                <i class="fas fa-paper-plane"></i> ${t('تنفيذ الاختبار', 'Run Test')}
                            </button>
                            <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.6;">
                                ${t('يرسل نفس رسالة التحقق لهذا الرقم في الخاص بدون انتظار طلب انضمام جديد.', 'Sends the same verification DM flow to this number without waiting for a new join request.')}
                            </div>
                        </div>

                        <div class="toggle-row" style="margin-bottom:10px; background: rgba(0,0,0,0.1); padding: 8px; border-radius: 6px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableKeywordVerification" ${config.enableKeywordVerification ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل الكلمات الافتتاحية للموافقة/الرفض', 'Enable Welcome Message & Keywords')}</div>
                            </div>
                        </div>

                        <div class="toggle-row" style="margin-bottom:10px; background: rgba(0,0,0,0.1); padding: 8px; border-radius: 6px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableEmailVerification" ${config.enableEmailVerification ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل البريد الجامعي', 'Enable Email Verification')}</div>
                            </div>
                        </div>

                        <div class="toggle-row" style="margin-bottom:10px; background: rgba(0,0,0,0.1); padding: 8px; border-radius: 6px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enablePhotoVerification" ${config.enablePhotoVerification ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل التحقق بالصورة', 'Enable Photo Verification')}</div>
                            </div>
                        </div>

                        <div class="toggle-row" style="margin-bottom:15px; background: rgba(0,0,0,0.1); padding: 8px; border-radius: 6px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableSecondarySmartMatch" ${config.enableSecondarySmartMatch ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل الذكاء اللفظي للكلمات', 'Enable Smart Match for Keywords')}</div>
                            </div>
                        </div>

                        <div class="field-group">
                            <label class="field-label">${t('رسالة الترحيب المخصصة / التنبيهات العشوائية', 'Custom Welcome Messages / Random Baits')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newCustomMessage" placeholder="${t('أدخل رسالة ترحيب...', 'Enter a welcome message...')} (Message 1)" onkeypress="if(event.key==='Enter'){event.preventDefault();addCustomMessage();}">
                                <button type="button" class="btn btn-primary" onclick="addCustomMessage()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                            <div id="customMessagesContainer" class="chip-container" style="flex-direction: column; gap: 8px;"></div>
                        </div>
                        <div class="field-row" style="margin-bottom:15px;">
                            <div class="field-group">
                                <label class="field-label">${t('كلمات الموافقة', 'Approval Keywords')}</label>
                                <div class="input-with-btn">
                                    <input type="text" id="newApprovalWord" placeholder="${t('أدخل كلمة الموافقة...', 'Enter approval word...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addApprovalWord();}">
                                    <button type="button" class="btn btn-primary" onclick="addApprovalWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                                </div>
                                <div id="approvalWordsContainer" class="chip-container"></div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('كلمات الرفض', 'Ban Keywords')}</label>
                                <div class="input-with-btn">
                                    <input type="text" id="newBanWord" placeholder="${t('أدخل كلمة الرفض...', 'Enter ban word...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addBanWord();}">
                                    <button type="button" class="btn btn-primary" onclick="addBanWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                                </div>
                                <div id="banWordsContainer" class="chip-container"></div>
                            </div>
                        </div>
                        <div class="field-row" style="margin-bottom:15px;">
                            <div class="field-group">
                                <label class="field-label">${t('نطاقات البريد المسموحة (مفصولة بفاصلة)', 'Allowed Email Domains (comma separated)')}</label>
                                <input type="text" id="emailDomain" value="${config.emailDomain || 'college.edu'}" placeholder="college.edu, gmail.com, hotmail.com">
                            </div>
                        </div>
                        <div class="sub-panel" style="margin-top:10px;">
                            <h4><i class="fas fa-envelope"></i> ${t('إعدادات خادم البريد (SMTP)', 'Email Server Settings (SMTP)')}</h4>
                            <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">${t('يدعم أي مزود مثل Gmail, Outlook, iCloud. (كلمة المرور قد تتطلب App Password)', 'Supports any provider like Gmail, Outlook, iCloud. (Password may require an App Password)')}</p>
                            <div class="field-row" style="margin-bottom:10px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('خادم SMTP', 'SMTP Host')}</label>
                                    <input type="text" id="smtpHost" value="${config.smtpHost || 'smtp-mail.outlook.com'}" placeholder="smtp.gmail.com">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('منفذ SMTP', 'SMTP Port')}</label>
                                    <input type="number" id="smtpPort" value="${config.smtpPort || 587}" placeholder="587">
                                </div>
                            </div>
                            <div class="field-row">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('البريد الإلكتروني', 'Sender Email')}</label>
                                    <input type="text" id="outlookEmail" value="${config.outlookEmail || ''}" placeholder="your-email@gmail.com">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('كلمة المرور أو App Password', 'Password / App Password')}</label>
                                    <input type="password" id="outlookPassword" value="${config.outlookPassword || ''}" placeholder="App Password">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-filter"></i> ${t('فلتر الكلمات الممنوعة', 'Forbidden Word Filter')}</h3></div>
                        <div class="toggle-row" style="margin-bottom:18px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWordFilter" ${config.enableWordFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل فلتر الكلمات', 'Enable Word Filter')}<small>${t('حذف فوري عند رصد أي كلمة ممنوعة', 'Instant delete on detecting forbidden words')}</small></div>
                            </div>
                        </div>
                        <div class="toggle-row" style="margin-bottom:18px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWordFilterSmartMatch" ${config.enableWordFilterSmartMatch ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل الذكاء اللفظي لمعالجة الرسائل الواردة', 'Enable Smart Match for Incoming Messages')}<small>${t('يُنظّف رسائل المستخدم من التشكيل والزخرفة قبل مقارنتها بالكلمات الممنوعة', 'Cleans incoming messages from diacritics and decorations before checking forbidden words')}</small></div>
                            </div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('الكلمات الممنوعة الافتراضية', 'Default Forbidden Words')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newDefaultWord" placeholder="${t('أدخل الكلمة الممنوعة...', 'Enter forbidden word...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addDefaultWord();}">
                                <button type="button" class="btn btn-primary" onclick="addDefaultWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                            <div id="defaultWordsContainer" class="chip-container"></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-bolt"></i> ${t('الإجراء التلقائي', 'Automatic Action')}</h3></div>
                        <div class="toggle-row pink">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="autoAction" ${config.autoAction ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label pink">
                                    ${t('الحذف والإبلاغ المباشر', 'Direct Delete & Report')}
                                    <small>${t('تخطي تصويت الإدارة عند رصد المخالفات', 'Skip admin poll upon detecting violations')}</small>
                                </div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-top:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableJoinProfileScreening" ${config.enableJoinProfileScreening ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label blue">
                                    ${t('فحص الملف الشخصي عند الانضمام', 'Join Profile Screening')}
                                    <small>${t('يفحص الاسم/النبذة للطلبات والأعضاء الجدد باستخدام فلتر الكلمات وAI عند تفعيلهما', 'Checks name/bio for join requests and new members using Word Filter and AI when enabled')}</small>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:20px; padding:16px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2;">
                                <div><i class="fas fa-robot"></i> <strong style="color:var(--text);">${t('البوت:', 'Bot:')}</strong> <span id="status-text-detail" style="color:var(--accent);">${initialStatusText}</span> <i id="status-text-detail-check" class="fas fa-check" style="color:var(--accent);display:${initialStatusKind === 'connected' ? 'inline-block' : 'none'};"></i></div>
                                <div><i class="fas fa-circle text-warning" style="color:var(--orange); font-size: 10px; margin-inline-end: 5px;"></i> <strong style="color:var(--text);">${t('معطّل:', 'Disabled:')}</strong> ${t('حذف + تصويت للإدارة', 'Delete + admin poll')}</div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>

            <div class="page" id="page-missed-call">
                <div class="card-grid">
                    <!-- Webhook Integrations -->
                    <div class="card success">
                        <div class="card-header">
                            <h3 style="color:var(--accent);"><i class="fas fa-satellite-dish"></i> ${t('الرد التلقائي على المكالمات (Webhook)', 'SIM Missed Call Auto-Reply')}</h3>
                        </div>
                        <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;line-height:1.8;">${t('يرسل رسالة واتساب تلقائية لأي رقم اتصل بشريحتك ولم ترد عليه. (يتطلب تطبيق MacroDroid على هاتفك)', 'Sends an auto-reply WhatsApp message to anyone who calls your SIM card and you miss it. (Requires MacroDroid app)')}</p>
                        
                        <div class="field-group" style="margin-bottom: 20px; border-bottom: 1px solid var(--card-border); padding-bottom: 20px;">
                            <label class="field-label">${t('رمز الدولة الافتراضي (للمكالمات المحلية)', 'Default Country Code (for local calls)')}</label>
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${t('إذا وصل الرقم يبدأ بـ 0 (مثل 059)، سيتم استبدال الصفر بهذا الرمز لتتمكن من مراسلته (مثل 966 ليصبح 96659).', 'If number starts with 0, it will be replaced by this code (e.g. 059 -> 96659).')}</p>
                            <input type="number" id="webhookCountryCode" value="${config.webhookCountryCode || '966'}" placeholder="966">
                        </div>
                        
                        <div class="toggle-row green" style="margin-bottom:12px; background:rgba(0,0,0,0.1); padding:8px; border-radius:6px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableMissedCallReply" ${config.enableMissedCallReply ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label green">${t('تفعيل الرد التلقائي للمكالمات', 'Enable Missed Call Auto-Reply')}</div>
                            </div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رمز الأمان (Token)', 'Webhook Secret Token')}</label>
                            <input type="text" id="missedCallToken" value="${config.missedCallToken || Math.random().toString(36).substring(2, 15)}" placeholder="${t('رمز سري لحماية الرابط', 'Secret token to protect the endpoint')}">
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رسالة الرد التلقائي (للاتصال الأول)', 'Auto-Reply Message (First Time)')}</label>
                            <textarea id="missedCallMessage" rows="3" placeholder="${t('مرحباً، لقد رأيت اتصالك. سأرد عليك في أقرب وقت عبر الواتساب.', 'Hello, I missed your call. I will reply on WhatsApp ASAP.')}">${config.missedCallMessage || ''}</textarea>
                        </div>
                        
                        <div style="margin-top: 20px; border-top: 1px solid var(--card-border); padding-top: 15px;">
                            <h4 style="margin-bottom: 10px; color: var(--accent);">${t('جهات الاتصال السابقة', 'Previous Contacts')}</h4>
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${t('أرسل رسالة مختلفة إذا كان هناك محادثة سابقة مع هذا الرقم.', 'Send a different message if you already have a chat history with this number.')}</p>
                            <div class="toggle-row" style="margin-bottom:12px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" id="enableMissedCallReturning" ${config.enableMissedCallReturning ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="toggle-label">${t('إرسال رسالة مختلفة لجهات الاتصال السابقة', 'Send different message to previous contacts')}</div>
                                </div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('رسالة المتصل السابق', 'Returning Caller Message')}</label>
                                <textarea id="missedCallReturningMessage" rows="3" placeholder="${t('أهلاً مجدداً! رأيت اتصالك، سأتواصل معك قريباً.', 'Hey again! Missed your call, I will text you soon.')}">${config.missedCallReturningMessage || ''}</textarea>
                            </div>
                        </div>

                        <div style="margin-top: 20px; border-top: 1px solid var(--card-border); padding-top: 15px;">
                            <h4 style="margin-bottom: 10px; color: var(--accent);"><i class="fas fa-phone-volume"></i> ${t('المكالمات المُجاب عليها', 'Answered Calls')}</h4>
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${t('أرسل رسالة تلقائية فور انتهائك من الرد على مكالمة شخص ما.', 'Send an automated message right after you finish an answered call.')}</p>
                            <div class="toggle-row green" style="margin-bottom:12px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" id="enableAnsweredCallReply" ${config.enableAnsweredCallReply ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="toggle-label">${t('إرسال رسالة بعد إنهاء المكالمة المردود عليها', 'Send message after finishing answered call')}</div>
                                </div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('رسالة المكالمة المُجاب عليها', 'Answered Call Message')}</label>
                                <textarea id="answeredCallMessage" rows="3" placeholder="${t('سعدت بالاتصال بك، يمكنك التواصل معي هنا عبر الواتساب في أي وقت.', 'Nice talking to you, you can also reach me here on WhatsApp anytime.')}">${config.answeredCallMessage || ''}</textarea>
                            </div>
                        </div>

                        <div style="font-size:11px;color:var(--text-muted);background:rgba(0,0,0,0.1);padding:10px;border-radius:6px;border:1px solid var(--card-border); margin-top:15px;">
                            <strong style="color:var(--accent);">${t('رابط الويب هوك الخاص بك:', 'Your Webhook URL:')}</strong><br>
                            <code>http://YOUR_BOT_IP:3000/api/webhooks/missed-call</code><br>
                            <code>http://YOUR_BOT_IP:3000/api/webhooks/answered-call</code><br><br>
                            ${t('في MacroDroid، استخدم إجراء HTTP Request (POST) وارسل JSON التالي:', 'In MacroDroid, use HTTP Request (POST) action and send this JSON:')}<br>
                            <pre style="margin-top:5px;background:black;color:#00ff00;padding:5px;border-radius:4px;">{
  "phoneNumber": "[call_number]",
  "token": "YOUR_TOKEN"
}</pre>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-spam">
                <div class="page-header">
                    <h2><i class="fas fa-shield-alt"></i> ${t('مكافحة الإزعاج', 'Anti-Spam')}</h2>
                    <p>${t('رصد الرسائل المتكررة خلال نافذة 15 ثانية', 'Monitor repeated messages within a 15-second window')}</p>
                </div>

                <div class="card warning" style="max-width:700px;">
                    <div class="toggle-row warning" style="margin-bottom:0; border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch">
                                <input type="checkbox" id="enableAntiSpam" ${config.enableAntiSpam ? 'checked' : ''} onchange="toggleGroupPanel('global', 'spam', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="toggle-label warning">
                                ${t('تفعيل نظام Anti-Spam', 'Enable Anti-Spam System')}
                                <small>${t('مراقبة معدل إرسال كل مستخدم خلال نافذة 15 ثانية', 'Monitor per-user send rate within 15 secs')}</small>
                            </div>
                        </div>
                    </div>

                    <div id="group_spam_panel_global" style="overflow: hidden; max-height: ${config.enableAntiSpam ? '800px' : '0px'}; opacity: ${config.enableAntiSpam ? '1' : '0'}; transition: max-height 0.45s ease, opacity 0.35s ease, margin-top 0.35s ease; margin-top: ${config.enableAntiSpam ? '20px' : '0px'};">
                        <div style="border-top: 1px dashed rgba(255,171,64,0.3); padding-top: 20px;">
                            <div class="field-row" style="margin-bottom:20px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الإجراء عند الرصد', 'Action on Detection')}</label>
                                    <select id="spamAction">
                                        <option value="poll" ${config.spamAction === 'poll' ? 'selected' : ''}><i class="fas fa-poll"></i> ${t('تصويت للإدارة', 'Admin Poll')}</option>
                                        <option value="auto" ${config.spamAction === 'auto' ? 'selected' : ''}><i class="fas fa-hammer"></i> ${t('طرد تلقائي وحظر', 'Auto Kick & Ban')}</option>
                                    </select>
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('حد تكرار نفس النص', 'Duplicate Text Limit')}</label>
                                    <input type="number" id="spamDuplicateLimit" value="${config.spamDuplicateLimit}" min="2" max="15" placeholder="3">
                                </div>
                            </div>
                            <label class="field-label" style="margin-bottom:12px;"><i class="fas fa-stopwatch"></i> ${t('حدود كل نوع خلال 15 ثانية', 'Limits per media type (15s)')}</label>
                            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">${t('فعّل النوع المراد مراقبته، ثم حدد الحد الأقصى للرسائل المسموح بها', 'Check the type to monitor, then set max allowed messages')}</p>
                            <div class="limit-grid">
                                ${mediaTypesMeta.map(tData => `
                                <div class="limit-item">
                                    <input type="checkbox" id="global_spam_check_${tData.id}" value="${tData.id}" ${config.spamTypes.includes(tData.id) ? 'checked' : ''}>
                                    <span>${tData.icon} ${tData.name}</span>
                                    <input type="number" id="global_spam_limit_${tData.id}" value="${config.spamLimits[tData.id] || 5}" min="1">
                                </div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-media">
                <div class="page-header">
                    <h2><i class="fas fa-filter"></i> ${t('فلتر الوسائط', 'Media Filter')}</h2>
                    <p>${t('منع قطعي لأنواع محددة — الحذف يحدث فوراً بغض النظر عن أي إعداد آخر', 'Absolute ban for specific media types — deleted instantly regardless of other settings')}</p>
                </div>
                <div class="card-grid">
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);"><i class="fas fa-folder-minus"></i> ${t('اختر الأنواع الممنوعة', 'Select Blocked Types')}</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom:18px;">${t('أي رسالة من هذه الأنواع ستُحذف تلقائياً ودون استثناء.', 'Any message of these types will be deleted automatically without exception.')}</p>
                        <div class="cb-group" id="globalBlockedTypes" style="gap:12px;">
                            ${mediaTypesMeta.map(tData => `
                            <label class="cb-label" style="flex:1; min-width:120px; justify-content:center; padding:12px;">
                                <input type="checkbox" value="${tData.id}" ${config.blockedTypes.includes(tData.id) ? 'checked' : ''}> ${tData.icon} ${tData.name}
                            </label>`).join('')}
                        </div>
                    </div>
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);"><i class="fas fa-gavel"></i> ${t('الإجراء عند الرصد', 'Action on Detection')}</h3></div>
                        <div class="field-group">
                            <label class="field-label">${t('ماذا يفعل البوت عند إرسال نوع ممنوع؟', 'What should the bot do when a blocked type is sent?')}</label>
                            <select id="globalBlockedAction" style="font-size:15px; padding:14px;">
                                <option value="delete" ${config.blockedAction === 'delete' ? 'selected' : ''}>${t('حذف الرسالة فقط (بصمت)', 'Delete Message Only (Silent)')}</option>
                                <option value="poll" ${config.blockedAction === 'poll' ? 'selected' : ''}>${t('حذف + فتح تصويت للإدارة', 'Delete + Open Admin Poll')}</option>
                                <option value="auto" ${config.blockedAction === 'auto' ? 'selected' : ''}>${t('حذف + طرد تلقائي وحظر', 'Delete + Auto Kick & Ban')}</option>
                            </select>
                        </div>
                        <div style="margin-top:16px; padding:16px; background:var(--red-dim); border-radius:10px; border:1px solid rgba(255,82,82,0.2);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2.2;">
                                <div><i class="fas fa-trash"></i> <strong style="color:var(--text);">${t('حذف فقط:', 'Delete Only:')}</strong> ${t('صامت، لا يعلم المرسل', 'Silent, sender is unaware')}</div>
                                <div><i class="fas fa-poll"></i> <strong style="color:var(--text);">${t('تصويت:', 'Poll:')}</strong> ${t('تنبيه الإدارة لاتخاذ قرار', 'Alert admins to decide')}</div>
                                <div><i class="fas fa-hammer"></i> <strong style="color:var(--text);">${t('طرد تلقائي:', 'Auto Kick:')}</strong> ${t('أقوى إجراء، حظر فوري', 'Strictest action, instant ban')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-ai">
                <div class="page-header">
                    <h2><i class="fas fa-brain"></i> ${t('المشرف الذكي (AI)', 'AI Moderator')}</h2>
                    <p>${t('تحليل المحتوى باستخدام نموذج Ollama LLM محلي', 'Analyze content using a local Ollama LLM model')}</p>
                </div>
                <div class="card-grid">
                    <div class="card info">
                        <div class="card-header">
                            <h3 style="color:var(--blue);"><i class="fas fa-plug"></i> ${t('تفعيل الذكاء الاصطناعي', 'Enable AI')}</h3>
                            <button type="button" class="btn btn-blue btn-sm" onclick="openOllamaModal()"><i class="fas fa-cog"></i> ${t('إعداد الخادم', 'Server Setup')}</button>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIFilter" ${config.enableAIFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label blue">${t('تحليل النصوص بالـ AI', 'AI Text Analysis')}<small>${t('فحص كل رسالة نصية قبل السماح بها', 'Scan every text message before allowing')}</small></div>
                            </div>
                        </div>
                        <div class="toggle-row purple">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIMedia" ${config.enableAIMedia ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label purple">${t('تحليل الصور (Vision AI)', 'Image Analysis (Vision)')}<small>${t('يتطلب نموذجاً يدعم Vision مثل llava', 'Requires a vision-capable model like llava')}</small></div>
                            </div>
                        </div>
                    </div>
                    <div class="card" id="aiPromptContainer">
                        <div class="card-header"><h3><i class="fas fa-file-alt"></i> ${t('تعليمات الذكاء الاصطناعي', 'AI Prompt Instructions')}</h3></div>
                        <div class="field-group">
                            <label class="field-label">${t('صف المحتوى الممنوع للنموذج', 'Describe forbidden content to the model')}</label>
                            <textarea id="aiPromptText" rows="6" style="font-size:14px; line-height:1.8;">${config.aiPrompt}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('كلمات التشغيل (كلمات تشير إلى المخالفة)', 'Trigger Words (words indicating violation)')}</label>
                            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 10px;">${t('عندما يجيب النموذج بأي من هذه الكلمات، سيتم حذف الرسالة', 'When the model responds with any of these words, the message will be deleted')}</p>
                            <div class="input-with-btn">
                                <input type="text" id="newAITriggerWord" placeholder="${t('مثال: نعم أو انتهاك', 'Example: نعم or violation')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addAITriggerWord();}">
                                <button type="button" class="btn btn-primary" onclick="addAITriggerWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                            <div id="aiTriggerWordsContainer" class="chip-container"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-global-qa">
                <div class="page-header">
                    <h2><i class="fas fa-comments"></i> ${t('الأسئلة والأجوبة العامة', 'Global Q&A')}</h2>
                    <p>${t('قاعدة أسئلة واحدة يمكن تطبيقها على كل المجموعات أو المجموعات المخصصة التي تختارها', 'One Q&A knowledge base that can be applied to all groups or selected custom groups')}</p>
                </div>

                <div class="card info" style="max-width:900px; margin-bottom:20px;">
                    <div class="toggle-row blue" style="margin-bottom:15px; border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch"><input type="checkbox" id="globalQAEnabled" ${config.globalQAEnabled ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="toggle-label blue">${t('تفعيل Q&A العام', 'Enable Global Q&A')}<small>${t('عند التفعيل: يعمل للمجموعات غير المخصصة تلقائياً، ويمكن تفعيله للمجموعات المخصصة من إعداداتها', 'When enabled: applies to non-custom groups automatically, and to custom groups when opted in')}</small></div>
                        </div>
                    </div>
                    <div class="toggle-row blue" style="margin-bottom:0; border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch"><input type="checkbox" id="enableQASmartMatch" ${config.enableQASmartMatch ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="toggle-label blue">${t('تفعيل الذكاء اللفظي لمعالجة الرسائل الواردة (Q&A)', 'Enable Smart Match for Incoming Q&A Messages')}<small>${t('يُنظّف رسائل المستخدم من التشكيل العربي والرموز المطولة قبل مطابقتها مع السؤال', 'Cleans the incoming user message from Arabic diacritics, tatweel, and symbols before matching with the question.')}</small></div>
                        </div>
                    </div>
                </div>

                <div class="card-grid" style="align-items:start;">
                    <div class="card" style="margin-bottom:0;">
                        <div class="card-header"><h3><i class="fas fa-plus-circle"></i> ${t('إضافة / تعديل زوج سؤال وجواب', 'Add / Edit Q&A Pair')}</h3></div>

                        <div class="sub-panel blue" style="margin-bottom:16px;">
                            <h4 style="color:var(--blue);">${t('مرجع الحقول الديناميكية', 'Dynamic Fields Reference')}</h4>
                            <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
                                <div><strong style="color:var(--blue);">{eventdate}</strong> - ${t('الحدث الأساسي (الأول في القائمة)', 'Primary event/deadline (first in list)')}</div>
                                <div><strong style="color:var(--blue);">{eventdate:Label}</strong> - ${t('حدث معين حسب العنوان', 'Specific event by label')}</div>
                                <div><strong style="color:var(--blue);">{user}</strong> - ${t('اسم المرسل', 'Sender username')}</div>
                            </div>
                        </div>

                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                            <label class="field-label" style="margin-bottom:0;">${t('إدارة الأحداث والمواعيد', 'Manage Events/Deadlines')}</label>
                            <button type="button" class="btn btn-primary btn-sm" onclick="addGlobalQAEventDate()"><i class="fas fa-plus"></i> ${t('إضافة حدث', 'Add Event')}</button>
                        </div>
                        <div id="globalQAEventDatesContainer" style="margin-bottom: 20px;"></div>

                        <div class="field-row" style="margin-bottom:16px;">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label" style="margin-bottom:4px;">${t('تاريخ الحدث القديم (لحقل {eventdate})', 'Legacy Event Date (for {eventdate})')}</label>
                                <input type="date" id="globalQAEventDateInput" style="color-scheme: dark; font-family: var(--font);">
                            </div>
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label" style="margin-bottom:4px;">${t('لغة عرض الأيام المتبقية', 'Days-Left Language')}</label>
                                <select id="globalQALanguageInput">
                                    <option value="ar">${t('العربية', 'Arabic')}</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
                        </div>

                        <label class="field-label">${t('أضف صيغ السؤال', 'Add Questions for This Answer')}</label>
                        <div class="field-group" style="margin-bottom:10px;">
                            <input type="text" id="globalQAQuestionInput" placeholder="${t('أدخل صيغة سؤال...', 'Enter a question variant...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addGlobalQAQuestion();}">
                            <button type="button" class="btn btn-primary btn-full" style="margin-top:10px;background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;" onclick="addGlobalQAQuestion()"><i class="fas fa-plus"></i> ${t('إضافة صيغة', 'Add Variant')}</button>
                            <div class="chip-container" id="globalQAQuestionsContainer" style="min-height:40px;"></div>
                        </div>

                        <label class="field-label" style="margin-top:14px;">${t('الإجابة', 'Answer')}</label>
                        <div class="field-group" style="margin-bottom:10px;">
                            <textarea id="globalQAAnswerInput" rows="4" placeholder="${t('استخدم {date} و {eventdate} و {user} داخل النص إن أردت', 'You can use {date}, {eventdate}, and {user} placeholders')}" style="margin-bottom:10px;" oninput="updateGlobalQACurrentAnswer(this.value)" onchange="updateGlobalQACurrentAnswer(this.value)"></textarea>
                            <button type="button" id="saveGlobalQABtn" class="btn btn-full" onclick="saveGlobalQA()" style="background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-save"></i> ${t('حفظ زوج س و ج', 'Save Q&A Pair')}</button>
                        </div>

                        <div class="sub-panel" style="margin-bottom:16px;border-color:rgba(100,220,150,0.3);background:rgba(100,220,150,0.04);">
                            <h4 style="color:#64dc96;margin-bottom:12px;"><i class="fas fa-paperclip"></i> ${t('إرفاق وسائط بهذه الإجابة', 'Attach Media to This Answer')}</h4>
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">${t('اختر ملفاً ليُرفق تلقائياً عند حفظ الزوج. سيرسل البوت الملف مع نص الإجابة كتعليق.', 'Select a file to automatically attach it when saving the Q&A pair. The bot will send the file + answer caption.')}</p>
                            <div id="globalQA_media_selected" style="display:none;align-items:center;gap:10px;background:rgba(100,220,150,0.1);border:1px solid rgba(100,220,150,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                                <i class="fas fa-paperclip" style="color:#64dc96;"></i>
                                <span id="globalQA_media_selected_name" style="font-size:13px;color:#64dc96;flex:1;"></span>
                                <button type="button" onclick="clearGlobalQAMedia()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button>
                            </div>
                            <div style="display:flex;gap:10px;margin-bottom:14px;">
                                <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--input-bg);border:1.5px dashed rgba(100,220,150,0.4);border-radius:10px;cursor:pointer;font-size:13px;color:var(--text-muted);transition:all 0.2s;" onmouseover="this.style.borderColor='#64dc96'" onmouseout="this.style.borderColor='rgba(100,220,150,0.4)'">
                                    <i class="fas fa-cloud-upload-alt" style="color:#64dc96;font-size:18px;"></i>
                                    <span>${currentLang==='en'?'Click to upload a file':'انقر لرفع ملف'}</span>
                                    <input type="file" id="globalQA_file_input" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onchange="uploadGlobalQAMedia(this)">
                                </label>
                            </div>
                            <div id="globalQA_upload_status" style="display:none;font-size:12px;color:var(--text-muted);margin-bottom:10px;"></div>
                            <div id="globalQA_media_grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;"></div>
                        </div>
                    </div>

                    <div class="card" style="margin-bottom:0;">
                        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                            <h3><i class="fas fa-list"></i> ${t('الأزواج المحفوظة', 'Saved Pairs')}</h3>
                            <button type="button" class="btn btn-ghost btn-sm" onclick="pasteGlobalQA()"><i class="fas fa-paste"></i> ${t('لصق س و ج', 'Paste Q&A')}</button>
                        </div>
                        <div id="globalQAList"></div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-groups">

                <div id="groupsListView">
                    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <h2><i class="fas fa-users-cog"></i> ${t('المجموعات المخصصة', 'Custom Groups')}</h2>
                            <p>${t('إعدادات مخصصة لكل مجموعة — تتجاوز الإعدادات العامة', 'Custom settings per group — overrides global settings')}</p>
                        </div>
                        <button type="button" class="btn btn-blue" onclick="addGroup()"><i class="fas fa-plus"></i> ${t('إضافة مجموعة', 'Add Group')}</button>
                    </div>
                    <div id="groupsContainer"></div>
                </div>

                <div id="groupsDetailView" style="display:none;">
                    <div class="group-detail-bar">
                        <button type="button" class="btn btn-ghost" onclick="closeGroupDetail()">
                            <i class="fas fa-arrow-${lang === 'en' ? 'left' : 'right'}"></i> ${t('رجوع', 'Back')}
                        </button>
                        <div class="group-detail-identity">
                            <div class="group-detail-avatar" id="detailGroupAvatar"></div>
                            <div>
                                <div style="font-size:18px; font-weight:700;" id="detailGroupName"></div>
                                <span class="group-id-badge" id="detailGroupId"></span>
                            </div>
                        </div>
                        <button type="button" class="btn btn-danger btn-sm" id="detailDeleteBtn"><i class="fas fa-trash"></i> ${t('حذف', 'Delete')}</button>
                    </div>
                    <div id="groupDetailBody"></div>
                </div>

            </div>

            <div class="page" id="page-import-export">
                <div class="page-header">
                    <h2><i class="fas fa-exchange-alt"></i> ${t('استيراد/تصدير البيانات', 'Import/Export Dataset')}</h2>
                    <p>${t('قم بتصدير واستيراد إعدادات البوت والقوائم المختلفة', 'Export and import bot settings and lists')}</p>
                </div>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-download"></i> ${t('تصدير البيانات', 'Export Data')}</h3>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('اختر البيانات المراد تصديرها', 'Select data to export')}</label>
                            <div class="cb-group" id="exportOptions">
                                <label class="cb-label">
                                    <input type="checkbox" id="export_global_settings" checked>
                                    ${t('الإعدادات العامة', 'Global Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_llm_settings" checked>
                                    ${t('إعدادات الذكاء الاصطناعي', 'AI Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_blacklist" checked>
                                    ${t('القائمة السوداء', 'Blacklist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_whitelist" checked>
                                    ${t('القائمة البيضاء', 'Whitelist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_blocked_extensions" checked>
                                    ${t('الرموز المحظورة', 'Blocked Extensions')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_whatsapp_groups" checked>
                                    ${t('مجموعات واتساب', 'WhatsApp Groups')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_custom_groups" checked>
                                    ${t('الإعدادات المخصصة للمجموعات', 'Custom Group Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_media" checked>
                                    ${t('ملفات الوسائط', 'Media Files')}
                                </label>
                            </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-full" onclick="exportData()">
                            <i class="fas fa-download"></i> ${t('تصدير الآن', 'Export Now')}
                        </button>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-upload"></i> ${t('استيراد البيانات', 'Import Data')}</h3>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('حدد ملف الاستيراد', 'Select import file')}</label>
                            <input type="file" id="importFile" accept=".json" style="cursor:pointer;">
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('اختر البيانات المراد استيرادها', 'Select data to import')}</label>
                            <div class="cb-group" id="importOptions">
                                <label class="cb-label">
                                    <input type="checkbox" id="import_global_settings" checked>
                                    ${t('الإعدادات العامة', 'Global Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_llm_settings" checked>
                                    ${t('إعدادات الذكاء الاصطناعي', 'AI Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_blacklist" checked>
                                    ${t('القائمة السوداء', 'Blacklist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_whitelist" checked>
                                    ${t('القائمة البيضاء', 'Whitelist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_blocked_extensions" checked>
                                    ${t('الرموز المحظورة', 'Blocked Extensions')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_whatsapp_groups" checked>
                                    ${t('مجموعات واتساب', 'WhatsApp Groups')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_custom_groups" checked>
                                    ${t('الإعدادات المخصصة للمجموعات', 'Custom Group Settings')}
                                </label>
                            </div>
                        </div>
                        <div class="sub-panel" style="margin-top:16px;">
                            <h4><i class="fas fa-exclamation-circle"></i> ${t('خيارات متقدمة', 'Advanced Options')}</h4>
                            <label class="cb-label" style="margin-bottom:10px;">
                                <input type="checkbox" id="import_blacklist_clear">
                                ${t('مسح القائمة السوداء الحالية قبل الاستيراد', 'Clear current blacklist before import')}
                            </label>
                            <label class="cb-label" style="margin-bottom:10px;">
                                <input type="checkbox" id="import_whitelist_clear">
                                ${t('مسح القائمة البيضاء الحالية قبل الاستيراد', 'Clear current whitelist before import')}
                            </label>
                            <label class="cb-label" style="margin-bottom:10px;">
                                <input type="checkbox" id="import_blocked_extensions_clear">
                                ${t('مسح الرموز المحظورة الحالية قبل الاستيراد', 'Clear current blocked extensions before import')}
                            </label>
                            <label class="cb-label">
                                <input type="checkbox" id="import_custom_groups_clear">
                                ${t('مسح إعدادات المجموعات المخصصة الحالية قبل الاستيراد', 'Clear current custom group settings before import')}
                            </label>
                            <label class="cb-label" style="margin-top:10px;">
                                <input type="checkbox" id="import_media" checked>
                                ${t('استيراد ملفات الوسائط (إن وجدت)', 'Import Media Files (if any)')}
                            </label>
                        </div>
                        <button type="button" class="btn btn-primary btn-full" onclick="importData()" style="margin-top:14px;">
                            <i class="fas fa-upload"></i> ${t('استيراد الآن', 'Import Now')}
                        </button>
                    </div>
                </div>
            </div>

            <div class="page" id="page-archive">
                <div class="page-header">
                    <h2><i class="fas fa-box-archive"></i> ${t('الأرشيف', 'Archive')}</h2>
                    <p>${t('الطلبات المعلقة وسجل إيقاف التحقق وإدارة عناصر الموافقة المحفوظة', 'Pending approvals, verification stop controls, and stored approval management')}</p>
                </div>

                <div class="card-grid">
                    <div class="card warning" style="border-color:rgba(255,193,7,0.35);">
                        <div class="card-header">
                            <h3><i class="fas fa-user-clock"></i> ${t('طلبات التحقق النشطة', 'Active Pending Verification')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--input-bg); padding:4px 10px; border-radius:20px;">${t('من هنا يتم المراجعة والحذف', 'Review and remove here')}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <button type="button" class="btn btn-sm" onclick="refreshPendingSecondaryApprovals()"><i class="fas fa-sync"></i> ${t('تحديث', 'Refresh')}</button>
                                <button type="button" class="btn btn-danger btn-sm" onclick="rejectAllPendingSecondaryApprovals()"><i class="fas fa-user-slash"></i> ${t('رفض الكل', 'Reject All')}</button>
                            </div>
                            <span id="pendingSecondaryMeta" style="font-size:11px;color:var(--text-muted);"></span>
                        </div>
                        <div id="pendingSecondaryList" style="max-height:320px;overflow:auto;border:1px solid var(--card-border);border-radius:8px;padding:10px;background:rgba(0,0,0,0.08);font-size:12px;color:var(--text-muted);"></div>
                    </div>

                    <div class="card info" style="border-color:rgba(64,196,255,0.35);">
                        <div class="card-header">
                            <h3><i class="fas fa-hourglass-half"></i> ${t('قائمة المتحقق جزئياً', 'Partially Approved List')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--input-bg); padding:4px 10px; border-radius:20px;">${t('تحتاج إرسال كلمة إعادة الفتح', 'Needs reopen keyword from user')}</span>
                        </div>
                        <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
                            <span id="partialSecondaryMeta" style="font-size:11px;color:var(--text-muted);"></span>
                        </div>
                        <div id="partialSecondaryList" style="max-height:320px;overflow:auto;border:1px solid var(--card-border);border-radius:8px;padding:10px;background:rgba(0,0,0,0.08);font-size:12px;color:var(--text-muted);"></div>
                    </div>

                    <div class="card danger" style="border-color:rgba(255,82,82,0.35);">
                        <div class="card-header">
                            <h3><i class="fas fa-stop-circle"></i> ${t('إيقاف عملية تحقق يدوياً', 'Stop Verification Process Manually')}</h3>
                        </div>
                        <div class="field-row">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label">${t('رقم المستخدم', 'User Number')}</label>
                                <input type="text" id="stopVerificationNumber" class="form-control" placeholder="${t('مثال: 9665XXXXXXXX', 'Example: 15551234567')}">
                            </div>
                        </div>
                        <button type="button" class="btn btn-danger btn-sm" onclick="stopVerificationProcessByCode()"><i class="fas fa-ban"></i> ${t('إيقاف العملية', 'Stop Process')}</button>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.6;">${t('من لوحة التحكم: يكفي إدخال رقم المستخدم لإيقاف الجلسة ورفض الطلب فوراً.', 'From dashboard: only the user number is needed to stop the session and reject the request immediately.')}</div>
                    </div>

                    <div class="card info" style="border-color:rgba(64,196,255,0.35);">
                        <div class="card-header">
                            <h3><i class="fas fa-envelope"></i> ${t('سجل البريد الإلكتروني', 'Email Delivery Log')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--input-bg); padding:4px 10px; border-radius:20px;">${t('نتيجة إرسال رمز التحقق', 'Verification email send results')}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
                            <button type="button" class="btn btn-sm" onclick="refreshEmailLogs()"><i class="fas fa-sync"></i> ${t('تحديث', 'Refresh')}</button>
                            <span id="emailLogMeta" style="font-size:11px;color:var(--text-muted);"></span>
                        </div>
                        <div id="emailLogList" style="max-height:320px;overflow:auto;border:1px solid var(--card-border);border-radius:8px;padding:10px;background:rgba(0,0,0,0.08);font-size:12px;color:var(--text-muted);"></div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-about">
                <style>
                    #page-about {
                        padding: 0 !important;
                        background: var(--bg);
                        color: var(--text);
                        font-family: inherit;
                    }
                    #page-about .about-hero {
                        position: relative;
                        padding: 40px 20px;
                        background: linear-gradient(135deg, var(--card-bg) 0%, var(--bg) 100%);
                        border-bottom: 1px solid var(--card-border);
                        text-align: center;
                        overflow: hidden;
                    }
                    #page-about .about-hero-content {
                        position: relative;
                        z-index: 1;
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    #page-about .hero-logo {
                        font-size: 56px;
                        color: var(--accent);
                        margin-bottom: 16px;
                    }
                    #page-about .hero-title {
                        font-size: 36px;
                        font-weight: 800;
                        margin: 0 0 12px 0;
                        background: linear-gradient(90deg, var(--text) 0%, var(--text-muted) 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        letter-spacing: -0.5px;
                    }
                    #page-about .hero-description {
                        font-size: 16px;
                        color: var(--text-muted);
                        margin: 0 0 24px 0;
                        line-height: 1.5;
                    }
                    #page-about .badge-container {
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                        flex-wrap: wrap;
                    }
                    #page-about .status-badge {
                        padding: 6px 14px;
                        border-radius: 30px;
                        font-size: 13px;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                    }
                    #page-about .status-badge.accent { border-color: rgba(0,200,83,0.3); color: var(--accent); background: var(--accent-dim); }
                    #page-about .status-badge.blue { border-color: rgba(64,196,255,0.3); color: var(--blue); background: rgba(64,196,255,0.1); }
                    
                    #page-about .about-container {
                        max-width: 1000px;
                        margin: 0 auto;
                        padding: 30px 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 40px;
                    }
                    
                    #page-about .section-header {
                        margin-bottom: 20px;
                        border-bottom: 1px solid var(--card-border);
                        padding-bottom: 10px;
                    }
                    #page-about .section-header h2 {
                        font-size: 22px;
                        color: var(--text);
                        margin: 0;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    #page-about .section-header h2 i { color: var(--accent); }
                    
                    #page-about .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
                    #page-about .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                    
                    #page-about .info-card {
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 12px;
                        padding: 20px;
                    }
                    #page-about .info-card:hover {
                        border-color: var(--accent);
                    }
                    
                    #page-about .feat-icon {
                        width: 40px;
                        height: 40px;
                        border-radius: 10px;
                        background: var(--accent-dim);
                        color: var(--accent);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                        margin-bottom: 12px;
                    }
                    #page-about .feat-title {
                        font-size: 16px;
                        font-weight: 700;
                        color: var(--text);
                        margin-bottom: 6px;
                    }
                    #page-about .feat-desc {
                        font-size: 13px;
                        color: var(--text-muted);
                        line-height: 1.5;
                    }
                    
                    #page-about .tech-pill {
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        padding: 8px 14px;
                        border-radius: 6px;
                        text-align: center;
                        font-weight: 600;
                        font-size: 13px;
                        color: var(--text-muted);
                    }
                    
                    #page-about .req-box {
                        display: flex;
                        justify-content: space-between;
                        padding: 12px 16px;
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 6px;
                    }
                    #page-about .req-label { color: var(--text-muted); font-size: 13px; }
                    #page-about .req-val { color: var(--text); font-weight: 700; font-size: 13px; }
                    
                    #page-about .dev-profile {
                        display: flex;
                        gap: 20px;
                        align-items: flex-start;
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 12px;
                        padding: 20px;
                    }
                    #page-about .dev-avatar {
                        width: 70px;
                        height: 70px;
                        border-radius: 50%;
                        background: var(--bg);
                        border: 2px solid var(--accent);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                    }
                    #page-about .dev-info { flex: 1; }
                    #page-about .dev-name { font-size: 20px; font-weight: 700; color: var(--text); margin: 0 0 2px 0; }
                    #page-about .dev-handle { font-size: 13px; color: var(--accent); margin: 0 0 10px 0; font-family: monospace; }
                    #page-about .dev-bio { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin: 0 0 16px 0; max-width: 500px; }
                    #page-about .dev-links { display: flex; gap: 10px; flex-wrap: wrap; }
                    #page-about .social-btn {
                        padding: 8px 16px;
                        border-radius: 6px;
                        background: var(--bg);
                        border: 1px solid var(--card-border);
                        color: var(--text);
                        text-decoration: none;
                        font-size: 13px;
                        font-weight: 600;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    }
                    #page-about .social-btn:hover {
                        border-color: var(--text);
                    }
                    
                    @media (max-width: 900px) {
                        #page-about .grid-3 { grid-template-columns: repeat(2, 1fr); }
                        #page-about .grid-2 { grid-template-columns: 1fr; }
                    }
                    @media (max-width: 600px) {
                        #page-about .grid-3 { grid-template-columns: 1fr; }
                        #page-about .dev-profile { flex-direction: column; align-items: center; text-align: center; }
                        #page-about .dev-links { justify-content: center; }
                    }
                </style>

                <div class="about-hero">
                    <div class="about-hero-content">
                        <div class="hero-logo"><i class="fas fa-shield-alt"></i></div>
                        <h1 class="hero-title">${t('المشرف الآلي', 'WhatsApp Auto Mod')}</h1>
                        <p class="hero-description">${t('نظام إدارة مجموعات واتساب متقدم مع الذكاء الاصطناعي المحلي.', 'Advanced WhatsApp group management with local AI intelligence.')}</p>
                        <div class="badge-container">
                            <span class="status-badge accent"><i class="fas fa-check-circle"></i> ${t('نشط', 'Active')}</span>
                            <span class="status-badge blue"><i class="fas fa-code-branch"></i> v6.6</span>
                            <span class="status-badge"><i class="fab fa-osi"></i> ${t('مفتوح المصدر', 'Open Source')}</span>
                        </div>
                        <div style="margin-top: 28px;">
                            <a href="https://github.com/az2oo1/wa-bot" target="_blank" style="display: inline-flex; align-items: center; gap: 10px; background: var(--text); color: var(--bg); padding: 12px 28px; border-radius: 30px; font-weight: 700; font-size: 15px; text-decoration: none; transition: transform 0.2s ease;">
                                <i class="fab fa-github" style="font-size: 18px;"></i> ${t('المستودع على GitHub', 'View on GitHub')}
                            </a>
                        </div>
                    </div>
                </div>

                <div class="about-container">
                    
                    <section class="overview-section">
                        <div class="info-card" style="text-align: center;">
                            <h3 style="font-size: 18px; color: var(--text); margin-top: 0; margin-bottom: 10px;">${t('عن النظام', 'About the System')}</h3>
                            <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; max-width: 700px; margin: 0 auto;">
                                ${t('هو نظام آلي ذكي لإدارة مجموعات واتساب يوفر حماية متقدمة من الرسائل غير المرغوبة والمحتوى المخالف. يتضمن تصفية كلمات مستخدمة، حجب الملحقات الخطرة، وإدارة قوائم حظر/سماح. يعمل بذكاء اصطناعي محلي ويوفر واجهة تحكم متقدمة.', 'An intelligent automated system for managing WhatsApp groups that provides advanced protection against spam and inappropriate content. Features custom word filtering, malicious extension blocking, and blacklist/whitelist management. Powered by local AI with an advanced dashboard.')}
                            </p>
                        </div>
                    </section>

                    <section>
                        <div class="section-header">
                            <h2><i class="fas fa-bolt"></i> ${t('الميزات الأساسية', 'Core Features')}</h2>
                        </div>
                        <div class="grid-3">
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-brain"></i></div>
                                <div class="feat-title">${t('الذكاء الاصطناعي', 'AI Moderation')}</div>
                                <div class="feat-desc">${t('كشف ومنع الرسائل غير المناسبة بذكاء محلي', 'Detect and block inappropriate messages dynamically.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-shield-virus"></i></div>
                                <div class="feat-title">${t('منع البريد المزعج', 'Anti-Spam')}</div>
                                <div class="feat-desc">${t('حماية من الرسائل الملحة والفيضانات', 'Protection against repetitive and flood messages.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-user-lock"></i></div>
                                <div class="feat-title">${t('حظر وسماح مرن', 'Access Control')}</div>
                                <div class="feat-desc">${t('إدارة مرنة للأرقام وقوائم الدخول', 'Flexible blacklist and whitelist configurations.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-photo-video"></i></div>
                                <div class="feat-title">${t('تصفية الملفات', 'Media Filtering')}</div>
                                <div class="feat-desc">${t('حظر أنواع معينة من المرفقات والملفات', 'Strict restrictions on unwanted or risky media assets.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-sliders-h"></i></div>
                                <div class="feat-title">${t('تحكم شامل', 'Advanced Control')}</div>
                                <div class="feat-desc">${t('تحكم كامل في إعدادات كل مجموعة', 'Deep and granular configurations customizable per group.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-language"></i></div>
                                <div class="feat-title">${t('تعدد اللغات', 'Multilingual')}</div>
                                <div class="feat-desc">${t('دعم كامل للواجهتين العربية والإنجليزية', 'Native dashboard interfaces in both English and Arabic.')}</div>
                            </div>
                        </div>
                    </section>

                    <div class="grid-2">
                        <section>
                            <div class="section-header">
                                <h2><i class="fas fa-layer-group"></i> ${t('التقنيات المستخدمة', 'Tech Stack')}</h2>
                            </div>
                            <div class="grid-2" style="gap: 10px;">
                                <div class="tech-pill">whatsapp-web.js</div>
                                <div class="tech-pill">Node.js / Express</div>
                                <div class="tech-pill">better-sqlite3</div>
                                <div class="tech-pill">Ollama AI</div>
                                <div class="tech-pill">Docker</div>
                                <div class="tech-pill">Vanilla JS / CSS</div>
                            </div>
                        </section>

                        <section>
                            <div class="section-header">
                                <h2><i class="fas fa-server"></i> ${t('متطلبات التشغيل', 'System Requirements')}</h2>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div class="req-box">
                                    <span class="req-label">${t('الذاكرة (بدون AI)', 'RAM (Base)')}</span>
                                    <span class="req-val">2 GB</span>
                                </div>
                                <div class="req-box">
                                    <span class="req-label">${t('الذاكرة (مع AI)', 'RAM (w/ AI)')}</span>
                                    <span class="req-val">8 GB+</span>
                                </div>
                                <div class="req-box">
                                    <span class="req-label">${t('التخزين', 'Storage')}</span>
                                    <span class="req-val">5 GB+ (20GB+ AI)</span>
                                </div>
                                <div class="req-box">
                                    <span class="req-label">${t('بيئة العمل', 'Environment')}</span>
                                    <span class="req-val">Node 16+ / Docker</span>
                                </div>
                            </div>
                        </section>
                    </div>

                    <section>
                        <div class="section-header">
                            <h2><i class="fas fa-laptop-code"></i> ${t('المطور والمساهمون', 'Developer & Contributors')}</h2>
                        </div>
                        <div class="dev-profile" style="margin-bottom: 20px;">
                            <div class="dev-avatar">
                                <img src="https://github.com/az2oo1.png" alt="${t('عبدالعزيز القاسم', 'Abdulaziz Algassem')}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div class="dev-info">
                                <h3 class="dev-name">${t('عبدالعزيز القاسم', 'Abdulaziz Algassem')}</h3>
                                <p class="dev-handle">@az2oo1 / INTERSTELLAR</p>
                                <p class="dev-bio">
                                    ${t('طالب تقنية معلومات متخصص في تطوير الحلول الذكية والتطبيقات المتقدمة.', 'IT student specialized in developing intelligent solutions and advanced applications.')}
                                </p>
                                <div class="dev-links">
                                    <a href="https://github.com/az2oo1" target="_blank" class="social-btn"><i class="fab fa-github"></i> GitHub</a>
                                    <a href="https://www.linkedin.com/in/agssa/" target="_blank" class="social-btn"><i class="fab fa-linkedin"></i> LinkedIn</a>
                                    <a href="https://instagram.com/az2oo1" target="_blank" class="social-btn"><i class="fab fa-instagram"></i> Instagram</a>
                                </div>
                            </div>
                        </div>

                        <div class="info-card" style="display: flex; gap: 16px; align-items: flex-start; padding: 16px 20px;">
                            <div class="dev-avatar" style="width: 50px; height: 50px; flex-shrink: 0; border-width: 1.5px; overflow: hidden;">
                                <img src="https://github.com/Fahad-Alshalawi1.png" alt="${t('فهد الشلوي', 'Fahad Alshalawi')}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div class="dev-info">
                                <h3 class="dev-name" style="font-size: 18px; margin: 0 0 2px 0;">${t('فهد الشلوي', 'Fahad Alshalawi')}</h3>
                                <p class="dev-handle" style="font-size: 13px; margin: 0 0 8px 0; color: var(--blue);"><i class="fas fa-brain"></i> ${t('مساهم الذكاء الاصطناعي', 'AI Contributor')}</p>
                                <p class="dev-bio" style="font-size: 13px; margin: 0 0 12px 0; line-height: 1.5;">
                                    ${t('مساعدة قيمة في تطوير خوارزميات الذكاء الاصطناعي وتجهيزها للعمل داخل النظام.', 'Valuable assistance in developing and integrating AI capabilities into the system.')}
                                </p>
                                <a href="https://github.com/Fahad-Alshalawi1" target="_blank" class="social-btn" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;"><i class="fab fa-github"></i> GitHub</a>
                            </div>
                        </div>
                    </section>

                </div>
            </div>

            <div class="page" id="page-users">
                <div class="page-header">
                    <h2><i class="fas fa-user-shield"></i> ${t('إدارة المستخدمين', 'User Management')}</h2>
                    <p>${t('إدارة الحسابات والصلاحيات بشكل مباشر داخل اللوحة', 'Manage users and permissions directly inside the dashboard')}</p>
                </div>

                <div class="um-stats">
                    <div class="um-stat">
                        <div class="um-stat-label">${t('إجمالي المستخدمين', 'Total Users')}</div>
                        <div class="um-stat-value" id="um_users_count">0</div>
                    </div>
                    <div class="um-stat">
                        <div class="um-stat-label">${t('المديرون العامون', 'Superadmins')}</div>
                        <div class="um-stat-value" id="um_superadmins_count">0</div>
                    </div>
                    <div class="um-stat">
                        <div class="um-stat-label">${t('مجموعات الصلاحيات', 'Permission Groups')}</div>
                        <div class="um-stat-value" id="um_perm_count">0</div>
                    </div>
                </div>

                <div class="um-layout">
                    <div class="um-stack">
                        <div class="card success">
                            <div class="card-header"><h3><i class="fas fa-user-plus"></i> ${t('إضافة مستخدم', 'Create User')}</h3></div>
                            <p class="um-card-note">${t('أنشئ حساباً جديداً بسرعة ثم عدّل وصوله من لوحة الوصول بالأسفل.', 'Create a user quickly, then fine-tune access in the access panel below.')}</p>
                            <div class="field-row">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('اسم المستخدم', 'Username')}</label>
                                    <input type="text" id="um_create_username" placeholder="agent_1">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الاسم المعروض', 'Display Name')}</label>
                                    <input type="text" id="um_create_display_name" placeholder="Agent One">
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('كلمة المرور', 'Password')}</label>
                                    <input type="password" id="um_create_password" placeholder="${t('8 أحرف على الأقل', 'At least 8 characters')}">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الدور السريع', 'Quick Role')}</label>
                                    <select id="um_create_quick_role">
                                        <option value="viewer">${t('مشاهدة فقط', 'Viewer')}</option>
                                        <option value="operator" selected>${t('مشغل', 'Operator')}</option>
                                        <option value="admin">${t('مدير كامل', 'Full Admin')}</option>
                                        <option value="custom">${t('مخصص (يدوي)', 'Custom (Manual)')}</option>
                                    </select>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('نطاق المجموعات', 'Groups Scope')}</label>
                                    <select id="um_create_group_scope">
                                        <option value="all" selected>${t('كل المجموعات', 'All Groups')}</option>
                                        <option value="none">${t('بدون صلاحيات مجموعات الآن', 'No Groups Yet')}</option>
                                    </select>
                                </div>
                                <div class="toggle-row" style="margin-bottom:0; margin-top:21px;">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" id="um_create_superadmin"><span class="slider"></span></label>
                                        <div class="toggle-label">${t('صلاحية مدير عام', 'Superadmin Permission')}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <button class="btn btn-primary" type="button" onclick="umCreateUser()"><i class="fas fa-wand-magic-sparkles"></i> ${t('إضافة المستخدم', 'Create User')}</button>
                                <button class="btn btn-ghost" type="button" onclick="umLoadData(true)"><i class="fas fa-sync"></i> ${t('تحديث', 'Refresh')}</button>
                            </div>
                            <div id="um_create_status" style="margin-top:10px;color:var(--text-muted);font-size:13px;"></div>
                        </div>

                        <div class="card info">
                            <div class="card-header"><h3><i class="fas fa-users"></i> ${t('المستخدمون', 'Users')}</h3></div>
                            <div class="um-scroll-box" id="um_users_list"></div>
                        </div>

                        <div class="card warning" style="margin-bottom:0;">
                            <div class="card-header"><h3><i class="fas fa-sliders-h"></i> ${t('صلاحيات المستخدم المحدد', 'Selected User Access')}</h3></div>
                            <p id="um_selected_user" style="color:var(--text-muted);margin-bottom:14px;">${t('اختر مستخدماً من القائمة', 'Select a user from the list')}</p>
                            <div class="field-row um-actions-row" style="margin-bottom:10px;">
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-perm', true)"><i class="fas fa-check-double"></i> ${t('تحديد كل الصلاحيات', 'Select All Permissions')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-perm', false)"><i class="fas fa-eraser"></i> ${t('إلغاء كل الصلاحيات', 'Clear Permissions')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-wa', true)"><i class="fas fa-check-double"></i> ${t('تحديد كل المجموعات', 'Select All Groups')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-wa', false)"><i class="fas fa-eraser"></i> ${t('إلغاء كل المجموعات', 'Clear Groups')}</button>
                            </div>
                            <div class="um-access-grid">
                                <div>
                                    <label class="field-label">${t('ماذا يمكن لهذا المستخدم أن يفعل؟', 'What can this user do?')}</label>
                                    <div id="um_assign_perm_groups" class="chip-container" style="display:block;min-height:120px;"></div>
                                </div>
                                <div>
                                    <label class="field-label">${t('في أي مجموعات يمكنه إدارة الإعدادات؟', 'Which groups can they manage?')}</label>
                                    <div id="um_assign_wa_groups" class="chip-container" style="display:block;min-height:120px;"></div>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <button class="btn btn-primary" type="button" onclick="umSaveSelectedUserAccess()"><i class="fas fa-save"></i> ${t('حفظ الوصول', 'Save Access')}</button>
                                <button class="btn btn-danger" type="button" onclick="umDeleteSelectedUser()"><i class="fas fa-trash"></i> ${t('حذف المستخدم', 'Delete User')}</button>
                            </div>
                            <div id="um_access_status" style="margin-top:10px;color:var(--text-muted);font-size:13px;"></div>
                        </div>
                    </div>

                    <div class="um-stack">
                        <div class="card purple">
                            <div class="card-header"><h3><i class="fas fa-layer-group"></i> ${t('إضافة مجموعة صلاحيات', 'Create Permission Group')}</h3></div>
                            <p class="um-card-note">${t('استخدم القوالب الجاهزة ثم عدّل الصلاحيات كما تريد.', 'Start with presets, then customize permissions as needed.')}</p>
                            <div class="field-row um-actions-row" style="margin-bottom:10px;">
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umUsePermPreset('viewer')">${t('مشاهدة فقط', 'Viewer')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umUsePermPreset('operator')">${t('مشغل', 'Operator')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umUsePermPreset('admin')">${t('مدير كامل', 'Full Admin')}</button>
                            </div>
                            <div class="field-row">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('اسم المجموعة', 'Group Name')}</label>
                                    <input type="text" id="um_perm_name" placeholder="${t('المشرفون', 'Moderators')}">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الوصف', 'Description')}</label>
                                    <input type="text" id="um_perm_desc" placeholder="${t('وصف مختصر', 'Short description')}">
                                </div>
                            </div>
                            <div class="field-group" style="margin-top:12px;">
                                <label class="field-label">${t('اختر الصلاحيات', 'Choose Permissions')}</label>
                                <div id="um_perm_picker" class="cb-group" style="gap:8px;"></div>
                            </div>
                            <div class="um-perm-help">
                                <label class="field-label" style="margin-bottom:8px;"><i class="fas fa-circle-info"></i> ${t('شرح الصلاحيات', 'Permissions Guide')}</label>
                                <div id="um_perm_help"></div>
                            </div>
                            <div class="field-row um-actions-row" style="margin-bottom:10px;">
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umSetAllCreatePerms(true)"><i class="fas fa-check-double"></i> ${t('تحديد الكل', 'Select All')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umSetAllCreatePerms(false)"><i class="fas fa-eraser"></i> ${t('مسح الكل', 'Clear All')}</button>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('إضافة صلاحية مخصصة', 'Add Custom Permission')}</label>
                                <div class="input-with-btn">
                                    <input type="text" id="um_perm_custom" placeholder="custom:permission" onkeypress="if(event.key==='Enter'){event.preventDefault();umAddCustomCreatePerm();}">
                                    <button class="btn btn-ghost" type="button" onclick="umAddCustomCreatePerm()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                                </div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('الصلاحيات المختارة', 'Selected Permissions')}</label>
                                <div id="um_perm_selected" class="chip-container" style="min-height:54px;"></div>
                            </div>
                            <div class="field-row" style="margin-top:6px;">
                                <button class="btn btn-primary" id="um_perm_submit_btn" type="button" onclick="umCreatePermissionGroup()"><i class="fas fa-plus"></i> ${t('إضافة المجموعة', 'Create Group')}</button>
                                <button class="btn btn-ghost" id="um_perm_cancel_btn" type="button" onclick="umResetPermissionForm()" style="display:none;"><i class="fas fa-rotate-left"></i> ${t('إلغاء التعديل', 'Cancel Edit')}</button>
                            </div>
                            <div id="um_perm_status" style="margin-top:10px;color:var(--text-muted);font-size:13px;"></div>

                            <button class="btn btn-ghost btn-sm" type="button" onclick="umTogglePermissionGroupsDrawer()" style="margin-top:10px; width:100%; justify-content:space-between;">
                                <span><i class="fas fa-key"></i> ${t('عرض مجموعات الصلاحيات الحالية', 'Show Current Permission Groups')}</span>
                                <i id="um_perm_drawer_icon" class="fas fa-chevron-down"></i>
                            </button>
                            <div id="um_perm_drawer" class="um-perm-drawer">
                                <div class="card" style="margin:0; padding:14px; background:var(--input-bg); border-color:var(--card-border);">
                                    <div class="um-scroll-box" id="um_perm_groups_list"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="saveMsgToast" class="toast"><i class="fas fa-check-circle"></i> ${t('تم الحفظ في قاعدة البيانات بنجاح!', 'Saved to database successfully!')}</div>

            </form>
        </div>

        <div id="ollamaModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 style="color:var(--blue);"><i class="fas fa-link"></i> ${t('إعدادات خادم Ollama', 'Ollama Server Settings')}</h3>
                    <button class="close-modal" onclick="closeOllamaModal()">×</button>
                </div>
                <div class="field-group">
                    <label class="field-label">${t('رابط الخادم (Endpoint URL)', 'Server URL (Endpoint)')}</label>
                    <input type="text" id="ollamaUrl" value="${config.ollamaUrl}" dir="ltr" style="text-align:left; font-family:monospace;">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('اسم النموذج', 'Model Name')}</label>
                    <input type="text" id="ollamaModel" value="${config.ollamaModel}" dir="ltr" style="text-align:left; font-family:monospace;" placeholder="Ex: llava">
                </div>
                <button type="button" class="btn btn-primary btn-full" onclick="closeOllamaModal()">${t('حفظ وإغلاق', 'Save & Close')}</button>
            </div>
        </div>

        <div id="debuggerModal" class="modal">
            <div class="modal-content" style="max-width:800px; background:#0d1117; border-color:#21262d;">
                <div class="modal-header">
                    <h3 style="color:var(--accent); font-family:monospace;"><i class="fas fa-terminal"></i> ${t('سجل الأحداث المباشر', 'Live Event Logs')}</h3>
                    <button class="close-modal" onclick="closeDebuggerModal()">×</button>
                </div>
                <div id="terminalOutput"></div>
                <button type="button" class="btn btn-ghost btn-full" style="margin-top:14px;" onclick="closeDebuggerModal()">${t('إغلاق', 'Close')}</button>
            </div>
        </div>

        <div id="scanResultsModal" class="modal">
            <div class="modal-content" style="max-width:850px;">
                <div class="modal-header">
                    <h3 style="color:var(--orange);"><i class="fas fa-search-plus"></i> ${t('نتائج الفحص التشخيصي للمجموعات', 'Group Diagnostic Scan Results')}</h3>
                    <button class="close-modal" onclick="closeScanResultsModal()">×</button>
                </div>
                <div id="scanResultsContainer" style="max-height: 480px; overflow-y: auto; margin-bottom: 20px;">
                    <!-- Results dynamic insertion -->
                </div>
                <button type="button" class="btn btn-ghost btn-full" onclick="closeScanResultsModal()">${t('إغلاق', 'Close')}</button>
            </div>
        </div>

        <div id="firstLoginModal" class="modal">
            <div class="modal-content" style="max-width:620px; border-color:rgba(255,171,64,0.35); background:linear-gradient(180deg,rgba(255,171,64,0.06) 0,var(--card-bg) 60%);">
                <div class="modal-header">
                    <h3 style="color:var(--orange);"><i class="fas fa-user-lock"></i> ${t('تغيير بيانات الدخول مطلوب', 'Credential Change Required')}</h3>
                </div>
                <p style="color:var(--text-muted); margin-top:-8px; margin-bottom:14px; line-height:1.8;">
                    ${t('تم تسجيل الدخول بالحساب الافتراضي. لأمان النظام، يجب تغيير اسم المستخدم وكلمة المرور قبل المتابعة.', 'You signed in with the default account. For security, you must change username and password before continuing.')}
                </p>
                <div class="field-group">
                    <label class="field-label">${t('اسم المستخدم الجديد', 'New Username')}</label>
                    <input id="firstLoginUsername" type="text" autocomplete="username" dir="ltr" style="text-align:left; font-family:monospace;" placeholder="admin_new">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('كلمة المرور الجديدة', 'New Password')}</label>
                    <input id="firstLoginPassword" type="password" autocomplete="new-password" placeholder="${t('8 أحرف على الأقل', 'At least 8 characters')}">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('تأكيد كلمة المرور', 'Confirm Password')}</label>
                    <input id="firstLoginConfirm" type="password" autocomplete="new-password" placeholder="${t('أعد كتابة كلمة المرور', 'Re-enter password')}">
                </div>
                <div id="firstLoginStatus" style="min-height:20px; color:var(--text-muted); margin-bottom:8px; font-size:13px;"></div>
                <button type="button" class="btn btn-primary btn-full" onclick="submitFirstLoginChange()"><i class="fas fa-key"></i> ${t('حفظ ومتابعة', 'Save and Continue')}</button>
            </div>
        </div>

        <script>
        window.INITIAL_CONFIG = {
            defaultAdminGroup: ${JSON.stringify(config.defaultAdminGroup || '')},
            defaultAdminLanguage: ${JSON.stringify(config.defaultAdminLanguage || 'ar')},
            customMessageText: ${JSON.stringify(config.customMessageText || '')}
        };
        </script>
        <script src="/js/dashboard.js"></script>
        <div class="modal" id="confirmModal">
            <div class="modal-content" style="max-width:460px;">
                <div class="modal-header" style="margin-bottom:14px;">
                    <h3 id="confirmModalTitle"><i class="fas fa-circle-question"></i> ${t('تأكيد الإجراء', 'Confirm Action')}</h3>
                    <button type="button" class="close-modal" id="confirmModalClose">&times;</button>
                </div>
                <div id="confirmModalMessage" style="color:var(--text-muted);line-height:1.8;margin-bottom:22px;"></div>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" class="btn btn-ghost" id="confirmModalCancel">${t('إلغاء', 'Cancel')}</button>
                    <button type="button" class="btn btn-danger" id="confirmModalConfirm">${t('تأكيد', 'Confirm')}</button>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};