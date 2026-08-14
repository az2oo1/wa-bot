const currentLang = 'ar';
            const currentDir = 'rtl';
            let fetchedGroups = [];
            let firstLoginEnforced = false;

            const dict = {
                'delete_confirm': 'هل أنت متأكد من رغبتك في حذف الإعدادات المخصصة لهذه المجموعة؟',
                'logout_confirm': 'هل أنت متأكد من رغبتك في تسجيل الخروج من حساب واتساب؟ سيتم فصل البوت.',
                'signout_confirm': 'هل تريد تسجيل الخروج من لوحة التحكم؟',
                'logging_out': '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الخروج...',
                'purge_warn': '⚠️ تحذير: هذا الخيار سيجعل البوت يبحث في جميع المجموعات، وسيطرد أي شخص موجود في القائمة السوداء فوراً. متأكد؟',
                'purging': '<i class="fas fa-spinner fa-spin"></i> جاري المسح والطرد من المجموعات...',
                'saving_schedule': '<i class="fas fa-spinner fa-spin"></i> جاري حفظ الجدولة...',
                'running_sync': '<i class="fas fa-spinner fa-spin"></i> جاري التنفيذ...',
                'schedule_saved': '✅ تم حفظ الجدولة بنجاح',
                'schedule_load_fail': '❌ تعذر تحميل إعدادات الجدولة',
                'sync_success': '✅ تمت المزامنة بنجاح',
                'conn_err': 'حدث خطأ في الاتصال بالخادم.',
                'save_success': '<i class="fas fa-check-circle"></i> تم الحفظ في قاعدة البيانات بنجاح!',
                'save_fail': '<i class="fas fa-times-circle"></i> فشل الحفظ، تحقق من السيرفر',
                'group': 'المجموعة',
                'no_id': 'لم يتم التحديد',
                'delete': 'حذف',
                'target_group': 'اختر المجموعة المستهدفة',
                'admin_group': 'مجموعة الإدارة (اتركه فارغاً للافتراضي)',
                'admin_group_label': 'اختر المجموعة لتلقي التنبيهات',
                'admin_msg_lang': 'لغة رسائل الإدارة',
                'use_default_lang': 'استخدم الافتراضي',
                'lang_ar': 'العربية',
                'lang_en': 'English',
                'blocked_types': 'الأنواع الممنوعة قطعياً',
                'block_action': 'إجراء المنع',
                'act_del': 'حذف الرسالة فقط',
                'act_poll': 'حذف + تصويت للإدارة',
                'act_auto': 'حذف + طرد تلقائي',
                'anti_spam': 'مكافحة الإزعاج (Anti-Spam)',
                'spam_desc': 'رصد الرسائل المتكررة خلال 15 ثانية',
                'limits_15s': 'حدود كل نوع (15 ثانية)',
                'text_dup': 'تكرار النص',
                'action': 'الإجراء',
                'poll': 'تصويت للإدارة',
                'auto_kick': 'طرد تلقائي',
                'welcome_msg': 'رسالة ترحيبية عند الانضمام',
                'welcome_desc': 'يُرسلها البوت لكل عضو جديد',
                'msg_text': 'نص الرسالة ({user} للمنشن)',
                'enable_bl': 'تفعيل القائمة السوداء',
                'bl_desc': 'طرد فوري لأي رقم محظور',
                'word_filter': 'فلتر الكلمات الممنوعة',
                'wf_desc': 'حذف فوري عند رصد كلمة ممنوعة',
                'use_global': 'تطبيق الكلمات العامة أيضاً',
                'ug_desc': 'إضافة قائمة الكلمات العامة لهذه المجموعة',
                'custom_words': 'كلمات ممنوعة مخصصة لهذه المجموعة',
                'add': 'إضافة',
                'ai_text': 'المشرف الذكي (AI) للنصوص',
                'ai_trigger_words_group': 'كلمات تشغيل AI لهذه المجموعة',
                'ai_trigger_words_desc_group': 'عند وجود أي كلمة من هذه الكلمات في رد النموذج سيتم حذف الرسالة',
                'join_profile_screening': 'فحص الملف الشخصي عند الانضمام',
                'join_profile_screening_desc': 'يفحص الاسم/النبذة للأعضاء الجدد وطلبات الانضمام',
                'ai_vision': 'تحليل الصور (Vision)',
                'direct_del': 'الحذف المباشر (تخطي التصويت)',
                'select_group': 'اختر مجموعة...',
                'default_setting': 'الاختيار الافتراضي (عام)',
                'panic_mode': 'وضع الطوارئ (Panic Mode)',
                'panic_desc': 'إغلاق المجموعة تلقائياً عند رصد هجوم',
                'panic_msg_limit': 'عدد الرسائل',
                'panic_time_window': 'خلال (ثواني)',
                'panic_lock_dur': 'مدة الإغلاق (دقائق)',
                'panic_target': 'إرسال التنبيه إلى',
                'target_group_only': 'المجموعة المستهدفة فقط',
                'admin_group_only': 'مجموعة الإدارة فقط',
                'target_both': 'كلاهما (المجموعة والإدارة)',
                'panic_msg_text': 'نص التنبيه ({time} للمدة)',
                'enable_wl': 'تفعيل القائمة البيضاء',
                'wl_desc': 'تخطي الفلاتر للأرقام الموثوقة',
                'use_global_bl': 'تطبيق القائمة السوداء العامة',
                'ug_bl_desc': 'دمج الأرقام المحظورة العامة مع هذه المجموعة',
                'custom_bl': 'أرقام محظورة مخصصة لهذه المجموعة',
                'use_global_wl': 'تطبيق القائمة البيضاء العامة',
                'ug_wl_desc': 'دمج الأرقام الموثوقة العامة مع هذه المجموعة',
                'custom_wl': 'أرقام موثوقة مخصصة لهذه المجموعة',
                'cred_change_saving': 'جاري حفظ بيانات الدخول الجديدة...',
                'cred_change_done': 'تم تحديث بيانات الدخول بنجاح',
                'cred_change_failed': 'فشل تحديث بيانات الدخول'
            };

            async function loadKnownGroups() {
                try {
                    const res = await fetch('/api/groups', { cache: 'no-store' });
                    if (res.status === 401) {
                        window.location.replace('/login');
                        return;
                    }
                    if (!res.ok) return;
                    fetchedGroups = await res.json();

                    const defAdminContainer = document.getElementById('defaultAdminGroupContainer');
                    if (defAdminContainer) {
                        let defHTML = `
                            <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>${dict.admin_group_label}</span>
                                <span style="cursor:pointer; color:var(--accent); font-size:14px;" onclick="loadKnownGroups()" title="Refresh Groups"><i class="fas fa-sync"></i></span>
                            </label>
                            <select id="defaultAdminGroup" dir="ltr" style="text-align:${currentDir === 'rtl' ? 'right' : 'left'};">
                        `;
                        defHTML += `<option value="">-- ${dict.select_group} --</option>`;
                        
                        let defFound = false;
                        fetchedGroups.forEach(g => {
                            const sel = g.id === '' ? 'selected' : '';
                            if(sel) defFound = true;
                            defHTML += `<option value="${g.id}" ${sel}>${g.name}</option>`;
                        });

                        if ('' && !defFound) {
                            defHTML += `<option value="" selected> (Unknown)</option>`;
                        }
                        defHTML += `</select>`;
                        defHTML += `
                            <div class="field-group" style="margin-top:12px; margin-bottom:0;">
                                <label class="field-label">${dict.admin_msg_lang}</label>
                                <select id="defaultAdminLanguage" dir="ltr" style="text-align:${currentDir === 'rtl' ? 'right' : 'left'};">
                                    <option value="ar" selected>${dict.lang_ar}</option>
                                    <option value="en" >${dict.lang_en}</option>
                                </select>
                            </div>
                        `;
                        defAdminContainer.innerHTML = defHTML;
                    }
                    
                    renderGroups();

                } catch(e) {}
            }

            function createGroupSelectHTML(selectedValue, onchangeCode, allowEmpty = false) {
                let html = `<select onchange="${onchangeCode}" dir="ltr" style="text-align:${currentDir === 'rtl' ? 'right' : 'left'};">`;
                html += `<option value="">${allowEmpty ? '-- ' + dict.default_setting + ' --' : '-- ' + dict.select_group + ' --'}</option>`;
                let found = false;
                fetchedGroups.forEach(g => {
                    let sel = g.id === selectedValue ? 'selected' : '';
                    if(sel) found = true;
                    html += `<option value="${g.id}" ${sel}>${g.name}</option>`;
                });
                if (selectedValue && !found) {
                    html += `<option value="${selectedValue}" selected>${selectedValue} (Unknown)</option>`;
                }
                html += `</select>`;
                return html;
            }

            function switchLanguage(checkbox) {
                const newLang = checkbox.checked ? 'en' : 'ar';
                document.cookie = "bot_lang=" + newLang + "; path=/; max-age=31536000";
                window.location.reload();
            }

            function openOllamaModal() { document.getElementById('ollamaModal').classList.add('open'); }
            function closeOllamaModal() { document.getElementById('ollamaModal').classList.remove('open'); }
            
            let debuggerInterval;
            function openDebuggerModal() { 
                document.getElementById('debuggerModal').classList.add('open'); 
                fetchLogs();
                debuggerInterval = setInterval(fetchLogs, 1500); 
            }
            function closeDebuggerModal() { 
                document.getElementById('debuggerModal').classList.remove('open'); 
                clearInterval(debuggerInterval);
            }

            function openScanResultsModal() { document.getElementById('scanResultsModal').classList.add('open'); }
            function closeScanResultsModal() { document.getElementById('scanResultsModal').classList.remove('open'); }

            async function scanGroupsForFlags() {
                const btn = document.getElementById('scanBtn');
                const origHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Scanning...' : 'جاري الفحص...');
                btn.disabled = true;

                try {
                    const res = await fetch('/api/blacklist/scan', { method: 'POST' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        showToast('❌ ' + (data.error || (currentLang === 'en' ? 'Scan failed' : 'فشل الفحص')));
                        btn.innerHTML = origHtml;
                        btn.disabled = false;
                        return;
                    }

                    const container = document.getElementById('scanResultsContainer');
                    container.innerHTML = '';

                    const results = data.scanResults || [];
                    if (results.length === 0) {
                        container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">' + 
                            (currentLang === 'en' ? 'No flagged users or pending requests found in any groups.' : 'لم يتم العثور على مستخدمين أو طلبات معلقة مخالفة في أي مجموعة.') + 
                            '</div>';
                    } else {
                        let html = '';
                        results.forEach(group => {
                            html += `<div class="sub-panel" style="margin-bottom:15px; border-color:var(--card-border);">
                                <h4 style="color:var(--accent); font-size:16px; margin-bottom:10px;"><i class="fas fa-users"></i> ${umEscapeHtml(group.groupName)}</h4>
                                <div style="font-size:11px; color:var(--text-muted); margin-top:-6px; margin-bottom:12px; font-family:monospace;">${umEscapeHtml(group.groupId)}</div>`;
                            
                            if (group.flaggedParticipants && group.flaggedParticipants.length > 0) {
                                html += `<div style="font-weight:bold; font-size:13px; margin-bottom:6px; color:var(--red);"><i class="fas fa-user-slash"></i> أعضاء مخالفون (سيتم طردهم):</div>`;
                                group.flaggedParticipants.forEach(member => {
                                    html += `<div style="padding:6px 10px; background:rgba(255,82,82,0.05); border:1px solid rgba(255,82,82,0.15); border-radius:6px; margin-bottom:6px; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <span style="font-weight:600; color:var(--text);">${umEscapeHtml(member.cleanId)}</span>
                                            ${member.isLID ? `<span style="font-size:10px; background:rgba(64,196,255,0.15); color:var(--blue); padding:1px 5px; border-radius:4px; margin-inline-start:6px; font-family:monospace;">LID</span>` : ''}
                                            <div style="font-size:10px; color:var(--text-muted); font-family:monospace; margin-top:2px;">ID: ${umEscapeHtml(member.id)}</div>
                                        </div>
                                        <div style="font-size:12px; color:var(--red); font-weight:600;">${umEscapeHtml(member.reason)}</div>
                                    </div>`;
                                });
                            }

                            if (group.flaggedPendingRequests && group.flaggedPendingRequests.length > 0) {
                                if (group.flaggedParticipants && group.flaggedParticipants.length > 0) {
                                    html += `<div style="height:1px; background:var(--card-border); margin:12px 0;"></div>`;
                                }
                                html += `<div style="font-weight:bold; font-size:13px; margin-bottom:6px; color:var(--orange);"><i class="fas fa-user-clock"></i> طلبات معلقة مخالفة (سيتم رفضها):</div>`;
                                group.flaggedPendingRequests.forEach(req => {
                                    html += `<div style="padding:6px 10px; background:rgba(255,171,64,0.05); border:1px solid rgba(255,171,64,0.15); border-radius:6px; margin-bottom:6px; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <span style="font-weight:600; color:var(--text);">${umEscapeHtml(req.cleanId)}</span>
                                            ${req.isLID ? `<span style="font-size:10px; background:rgba(64,196,255,0.15); color:var(--blue); padding:1px 5px; border-radius:4px; margin-inline-start:6px; font-family:monospace;">LID (${req.unmasked ? (currentLang === 'en' ? 'Unmasked' : 'تم كشف الرقم') : (currentLang === 'en' ? 'Unresolved' : 'مخفي')})</span>` : ''}
                                            <div style="font-size:10px; color:var(--text-muted); font-family:monospace; margin-top:2px;">ID: ${umEscapeHtml(req.id)}</div>
                                        </div>
                                        <div style="font-size:12px; color:var(--orange); font-weight:600;">${umEscapeHtml(req.reason)}</div>
                                    </div>`;
                                });
                            }
                            html += `</div>`;
                        });
                        container.innerHTML = html;
                    }

                    openScanResultsModal();
                } catch (e) {
                    showToast('❌ ' + e.message);
                } finally {
                    btn.innerHTML = origHtml;
                    btn.disabled = false;
                }
            }

            async function enforceFirstLoginChange() {
                try {
                    const res = await fetch('/auth/me', { cache: 'no-store' });
                    if (res.status === 401) {
                        window.location.replace('/login');
                        return;
                    }
                    if (!res.ok) return;
                    const me = await res.json();
                    if (!me || !me.mustChangeCredentials) return;

                    firstLoginEnforced = true;
                    const modal = document.getElementById('firstLoginModal');
                    const usernameInput = document.getElementById('firstLoginUsername');
                    const statusEl = document.getElementById('firstLoginStatus');
                    if (statusEl) statusEl.textContent = '';
                    if (usernameInput) usernameInput.value = me.username || '';
                    modal.classList.add('open');
                    document.body.style.overflow = 'hidden';
                } catch (e) {}
            }

            async function submitFirstLoginChange() {
                const usernameEl = document.getElementById('firstLoginUsername');
                const passwordEl = document.getElementById('firstLoginPassword');
                const confirmEl = document.getElementById('firstLoginConfirm');
                const statusEl = document.getElementById('firstLoginStatus');
                if (!usernameEl || !passwordEl || !confirmEl || !statusEl) return;

                statusEl.style.color = 'var(--text-muted)';
                statusEl.textContent = dict.cred_change_saving;

                try {
                    const response = await fetch('/auth/first-login-change', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: usernameEl.value,
                            password: passwordEl.value,
                            confirmPassword: confirmEl.value
                        })
                    });

                    if (!response.ok) {
                        const data = await response.json().catch(() => ({ error: dict.cred_change_failed }));
                        statusEl.style.color = 'var(--red)';
                        statusEl.textContent = data.error || dict.cred_change_failed;
                        return;
                    }

                    statusEl.style.color = 'var(--accent)';
                    statusEl.textContent = dict.cred_change_done;
                    firstLoginEnforced = false;
                    document.getElementById('firstLoginModal').classList.remove('open');
                    document.body.style.overflow = '';
                    showToast('<i class="fas fa-check-circle"></i> ' + dict.cred_change_done);
                } catch (e) {
                    statusEl.style.color = 'var(--red)';
                    statusEl.textContent = dict.cred_change_failed;
                }
            }

            window.onclick = function(event) {
                if (event.target === document.getElementById('ollamaModal')) closeOllamaModal();
                if (event.target === document.getElementById('debuggerModal')) closeDebuggerModal();
                if (event.target === document.getElementById('scanResultsModal')) closeScanResultsModal();
                if (event.target === document.getElementById('confirmModal')) closeConfirmModal(false);
            }

            let confirmResolver = null;

            function closeConfirmModal(result) {
                const modal = document.getElementById('confirmModal');
                if (!modal) return;
                modal.classList.remove('open');
                document.body.style.overflow = '';
                if (confirmResolver) {
                    const resolve = confirmResolver;
                    confirmResolver = null;
                    resolve(Boolean(result));
                }
            }

            function showConfirmModal(message, options = {}) {
                return new Promise(resolve => {
                    const modal = document.getElementById('confirmModal');
                    const titleEl = document.getElementById('confirmModalTitle');
                    const msgEl = document.getElementById('confirmModalMessage');
                    const closeBtn = document.getElementById('confirmModalClose');
                    const cancelBtn = document.getElementById('confirmModalCancel');
                    const confirmBtn = document.getElementById('confirmModalConfirm');

                    if (!modal || !titleEl || !msgEl || !closeBtn || !cancelBtn || !confirmBtn) {
                        resolve(window.confirm(message));
                        return;
                    }

                    const title = options.title || (currentLang === 'en' ? 'Confirm Action' : 'تأكيد الإجراء');
                    const confirmText = options.confirmText || (currentLang === 'en' ? 'Confirm' : 'تأكيد');
                    const cancelText = options.cancelText || (currentLang === 'en' ? 'Cancel' : 'إلغاء');

                    titleEl.innerHTML = '<i class="fas fa-circle-question"></i> ' + umEscapeHtml(title);
                    msgEl.textContent = String(message || '');
                    confirmBtn.textContent = confirmText;
                    cancelBtn.textContent = cancelText;
                    confirmBtn.className = 'btn ' + (options.confirmClass || 'btn-danger');

                    confirmResolver = resolve;
                    modal.classList.add('open');
                    document.body.style.overflow = 'hidden';

                    confirmBtn.onclick = () => closeConfirmModal(true);
                    cancelBtn.onclick = () => closeConfirmModal(false);
                    closeBtn.onclick = () => closeConfirmModal(false);
                });
            }

            async function fetchLogs() {
                try {
                    let res = await fetch('/api/logs');
                    let logs = await res.json();
                    const term = document.getElementById('terminalOutput');
                    
                    let html = logs.map(l => {
                        let styled = l.replace(/\[خطأ\]/g, '<span style="color:#ff3b30">[ERROR]</span>')
                                      .replace(/\[معلومة\]/g, '<span style="color:#4fc3f7">[INFO]</span>')
                                      .replace(/\[فحص\]/g, '<span style="color:#ffeb3b">[SCAN]</span>')
                                      .replace(/\[أمان\]/g, '<span style="color:#ff9800">[SECURITY]</span>')
                                      .replace(/\[تنظيف\]/g, '<span style="color:#9c27b0">[PURGE]</span>');
                        return `<div>${styled}</div>`;
                    }).join('');
                    
                    if (term.innerHTML !== html) {
                        term.innerHTML = html;
                        term.scrollTop = term.scrollHeight;
                    }
                } catch(e) {}
            }

            async function logoutBot() {
                if(await showConfirmModal(dict.logout_confirm.replace(/<[^>]*>?/gm, ''))) {
                    renderDashboardStatus(dict.logging_out.replace(/<[^>]*>?/gm, '').trim(), 'terminating');
                    await fetch('/api/logout', { method: 'POST' });
                }
            }

            async function signOutSession() {
                if (firstLoginEnforced) return;
                if (!await showConfirmModal(dict.signout_confirm.replace(/<[^>]*>?/gm, ''))) return;
                try {
                    await fetch('/auth/logout', { method: 'POST' });
                } catch (e) {}
                window.location.href = '/login';
            }

            const pageTitles = {
                'page-status': 'حالة الاتصال',
                'page-blacklist': 'إدارة الأرقام',
                'page-general': 'الإعدادات العامة',
                'page-missed-call': 'المكالمات الفائتة',
                'page-spam': 'مكافحة الإزعاج',
                'page-media': 'فلتر الوسائط',
                'page-ai': 'الذكاء الاصطناعي',
                'page-global-qa': 'الأسئلة العامة',
                'page-groups': 'المجموعات المخصصة',
                'page-import-export': 'استيراد/تصدير',
                'page-archive': 'الأرشيف',
                'page-users': 'إدارة المستخدمين',
                'page-about': 'حول'
            };
            function showPage(pageId, btn) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById(pageId).classList.add('active');
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                if(btn) btn.classList.add('active');
                document.getElementById('topbarTitle').textContent = pageTitles[pageId] || '';
                closeSidebar();
                if (pageId === 'page-groups') {
                    document.getElementById('groupsListView').style.display = 'block';
                    document.getElementById('groupsDetailView').style.display = 'none';
                }
                if (pageId === 'page-users') {
                    umLoadData();
                }
                if (pageId === 'page-archive') {
                    if (typeof refreshPendingSecondaryApprovals === 'function') refreshPendingSecondaryApprovals();
                    if (typeof refreshEmailLogs === 'function') refreshEmailLogs();
                }
            }
            function toggleSidebar() {
                document.getElementById('sidebar').classList.toggle('open');
                document.getElementById('sidebarOverlay').classList.toggle('open');
            }
            function closeSidebar() {
                document.getElementById('sidebar').classList.remove('open');
                document.getElementById('sidebarOverlay').classList.remove('open');
            }
            function showToast(msg) {
                const t = document.getElementById('saveMsgToast');
                if(msg) t.innerHTML = msg;
                t.classList.add('show');
                setTimeout(() => t.classList.remove('show'), 3000);
            }

            const umState = {
                users: [],
                permissionGroups: [],
                waGroups: [],
                selectedUserId: null,
                selectedUserAccess: null,
                loaded: false
            };
            const umNoUsersText = 'لا يوجد مستخدمون حالياً';
            const umNoPermsText = 'لا توجد مجموعات صلاحيات';
            const umSelectText = 'اختيار';
            const umDeleteText = 'حذف';
            const umCreatePermCatalog = [
                'dashboard:read',
                'groups:view',
                'config:write',
                'config:write-scoped',
                'security:manage',
                'media:manage',
                'import-export:manage',
                'bot:logout',
                'logs:view',
                'users:manage',
                '*'
            ];
            const umPermissionDescriptions = {
                'dashboard:read': {
                    ar: 'عرض لوحة التحكم والحالة العامة.',
                    en: 'View dashboard pages and overall status.'
                },
                'groups:view': {
                    ar: 'عرض المجموعات وبياناتها داخل النظام.',
                    en: 'View WhatsApp groups and related data.'
                },
                'config:write': {
                    ar: 'تعديل جميع الإعدادات العامة وإعدادات المجموعات.',
                    en: 'Edit all global and group configuration.'
                },
                'config:write-scoped': {
                    ar: 'تعديل الإعدادات فقط ضمن المجموعات المسموح بها للمستخدم.',
                    en: 'Edit settings only for groups assigned to this user.'
                },
                'security:manage': {
                    ar: 'إدارة القوائم السوداء/البيضاء وإجراءات الأمان.',
                    en: 'Manage blacklist/whitelist and security actions.'
                },
                'media:manage': {
                    ar: 'رفع/حذف وإدارة الوسائط الخاصة بالمجموعات.',
                    en: 'Upload/delete/manage group media files.'
                },
                'import-export:manage': {
                    ar: 'استخدام أدوات الاستيراد والتصدير للبيانات.',
                    en: 'Use data import and export tools.'
                },
                'bot:logout': {
                    ar: 'فصل جلسة واتساب (تسجيل خروج البوت).',
                    en: 'Disconnect WhatsApp session (bot logout).'
                },
                'logs:view': {
                    ar: 'عرض سجل الأحداث والعمليات.',
                    en: 'View event and activity logs.'
                },
                'users:manage': {
                    ar: 'إدارة المستخدمين والصلاحيات.',
                    en: 'Manage users and permissions.'
                },
                '*': {
                    ar: 'وصول كامل لكل الصلاحيات بدون قيود.',
                    en: 'Full unrestricted access to all permissions.'
                }
            };
            const umNoCreatePermsText = 'لم يتم اختيار أي صلاحيات';
            let umCreatePermSet = new Set();
            let umEditingPermGroupId = null;

            async function umApi(url, options = {}) {
                const res = await fetch(url, options);
                const text = await res.text();
                const contentType = res.headers.get('content-type') || '';

                let data = null;
                if (text) {
                    if (contentType.includes('application/json')) {
                        try { data = JSON.parse(text); } catch (e) { data = null; }
                    } else {
                        try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
                    }
                }

                if (!res.ok) {
                    throw new Error((data && (data.error || data.message)) || (currentLang === 'en' ? 'Request failed' : 'فشل الطلب'));
                }

                return data;
            }

            function umSetStatus(elId, msg, isErr = false) {
                const el = document.getElementById(elId);
                if (!el) return;
                el.textContent = msg || '';
                el.style.color = isErr ? 'var(--red)' : 'var(--text-muted)';
            }

            function umUpdateSummary() {
                const usersCountEl = document.getElementById('um_users_count');
                const superadminsCountEl = document.getElementById('um_superadmins_count');
                const permsCountEl = document.getElementById('um_perm_count');
                if (usersCountEl) usersCountEl.textContent = String((umState.users || []).length);
                if (superadminsCountEl) superadminsCountEl.textContent = String((umState.users || []).filter(u => u.is_superadmin).length);
                if (permsCountEl) permsCountEl.textContent = String((umState.permissionGroups || []).length);
            }

            function umEscapeHtml(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            async function umLoadData(force = false) {
                if (umState.loaded && !force) return;
                try {
                    const [users, permissionGroups, waGroups] = await Promise.all([
                        umApi('/api/users'),
                        umApi('/api/access/permission-groups'),
                        umApi('/api/groups')
                    ]);
                    umState.users = users || [];
                    umState.permissionGroups = permissionGroups || [];
                    umState.waGroups = waGroups || [];
                    umState.loaded = true;
                    umUpdateSummary();
                    umRenderUsers();
                    umRenderPermissionGroups();
                    umRenderSelectedUserAccess();
                } catch (e) {
                    umSetStatus('um_create_status', e.message, true);
                }
            }

            function umRenderUsers() {
                const container = document.getElementById('um_users_list');
                if (!container) return;
                if (!umState.users.length) {
                    container.innerHTML = '<p style="color:var(--text-muted);">' + umNoUsersText + '</p>';
                    return;
                }

                container.innerHTML = umState.users.map(user => {
                    const activeTxt = user.is_active ? (currentLang === 'en' ? 'Active' : 'مفعل') : (currentLang === 'en' ? 'Disabled' : 'معطل');
                    const superTxt = user.is_superadmin ? '<span class="chip" style="margin-inline-start:6px;">' + (currentLang === 'en' ? 'Superadmin' : 'مدير عام') + '</span>' : '';
                    const activeClass = user.is_active ? 'green' : 'red';
                    const selectedClass = Number(umState.selectedUserId) === Number(user.id) ? ' um-selected-user' : '';
                    return '' +
                        '<div class="group-list-card' + selectedClass + '" style="padding:12px 14px;margin-bottom:10px;align-items:center;" onclick="umSelectUser(' + user.id + ')">' +
                            '<div class="glc-info">' +
                                '<div class="glc-name">' + umEscapeHtml(user.display_name) + ' <span class="mono">(' + umEscapeHtml(user.username) + ')</span></div>' +
                                '<div class="glc-chips" style="margin-top:6px;">' +
                                    '<span class="glc-chip ' + activeClass + '">' + activeTxt + '</span>' +
                                    superTxt +
                                '</div>' +
                            '</div>' +
                            '<button type="button" class="btn btn-sm btn-blue" onclick="event.stopPropagation();umSelectUser(' + user.id + ')"><i class="fas fa-hand-pointer"></i> ' + umSelectText + '</button>' +
                        '</div>';
                }).join('');
            }

            function umRenderPermissionGroups() {
                const container = document.getElementById('um_perm_groups_list');
                if (!container) return;
                if (!umState.permissionGroups.length) {
                    container.innerHTML = '<p style="color:var(--text-muted);">' + umNoPermsText + '</p>';
                    return;
                }

                container.innerHTML = umState.permissionGroups.map(group => {
                    const perms = Array.isArray(group.permissions) ? group.permissions : [];
                    const permsHtml = perms.map(p => '<span class="chip">' + umEscapeHtml(p) + '</span>').join('');
                    return '' +
                        '<div class="card" style="padding:12px;margin-bottom:10px;">' +
                            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
                                '<div>' +
                                    '<strong>' + umEscapeHtml(group.name) + '</strong>' +
                                    '<div style="color:var(--text-muted);font-size:12px;">' + umEscapeHtml(group.description || '') + '</div>' +
                                '</div>' +
                                '<div style="display:flex;gap:8px;">' +
                                    '<button type="button" class="btn btn-sm btn-blue" onclick="umEditPermissionGroup(' + group.id + ')"><i class="fas fa-pen"></i> ' + (currentLang === 'en' ? 'Edit' : 'تعديل') + '</button>' +
                                    '<button type="button" class="btn btn-sm btn-danger" onclick="umDeletePermissionGroup(' + group.id + ')"><i class="fas fa-trash"></i> ' + umDeleteText + '</button>' +
                                '</div>' +
                            '</div>' +
                            '<div class="chip-container" style="margin-top:8px;max-height:80px;">' + permsHtml + '</div>' +
                        '</div>';
                }).join('');
            }

            async function umSelectUser(userId) {
                umState.selectedUserId = userId;
                try {
                    umState.selectedUserAccess = await umApi('/api/users/' + userId + '/access');
                    umRenderSelectedUserAccess();
                } catch (e) {
                    umSetStatus('um_access_status', e.message, true);
                }
            }

            function umRenderSelectedUserAccess() {
                const meta = document.getElementById('um_selected_user');
                const permBox = document.getElementById('um_assign_perm_groups');
                const waBox = document.getElementById('um_assign_wa_groups');
                if (!meta || !permBox || !waBox) return;

                if (!umState.selectedUserId || !umState.selectedUserAccess) {
                    meta.textContent = currentLang === 'en' ? 'Select a user from the list' : 'اختر مستخدماً من القائمة';
                    permBox.innerHTML = '';
                    waBox.innerHTML = '';
                    return;
                }

                const user = umState.users.find(u => u.id === umState.selectedUserId);
                meta.innerHTML = user
                    ? (currentLang === 'en' ? 'Editing:' : 'تعديل:') + ' <strong>' + umEscapeHtml(user.display_name) + '</strong> <span class="mono">(' + umEscapeHtml(user.username) + ')</span>'
                    : (currentLang === 'en' ? 'User:' : 'المستخدم:') + ' #' + umState.selectedUserId;

                const selectedPermIds = new Set((umState.selectedUserAccess.permissionGroupIds || []).map(Number));
                permBox.innerHTML = umState.permissionGroups.map(group => {
                    const checked = selectedPermIds.has(Number(group.id)) ? 'checked' : '';
                    return '<label class="cb-label" style="display:flex;margin:0 0 8px 0;justify-content:flex-start;">' +
                        '<input type="checkbox" data-role="um-perm" value="' + group.id + '" ' + checked + '> ' + umEscapeHtml(group.name) +
                    '</label>';
                }).join('');

                const selectedWaIds = new Set(umState.selectedUserAccess.allowedGroupIds || []);
                waBox.innerHTML = umState.waGroups.map(group => {
                    const checked = selectedWaIds.has(group.id) ? 'checked' : '';
                    return '<label class="cb-label" style="display:flex;margin:0 0 8px 0;justify-content:flex-start;">' +
                        '<input type="checkbox" data-role="um-wa" value="' + group.id + '" ' + checked + '> ' + umEscapeHtml(group.name || group.id) +
                    '</label>';
                }).join('');
            }

            async function umCreateUser() {
                try {
                    const usernameRaw = document.getElementById('um_create_username').value;
                    const displayNameRaw = document.getElementById('um_create_display_name').value;
                    const passwordRaw = document.getElementById('um_create_password').value;
                    const role = document.getElementById('um_create_quick_role').value;
                    const scope = document.getElementById('um_create_group_scope').value;

                    const isAdminByRole = role === 'admin';
                    const isSuperadmin = document.getElementById('um_create_superadmin').checked || isAdminByRole;

                    await umApi('/api/users/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: usernameRaw,
                            displayName: displayNameRaw,
                            password: passwordRaw,
                            isSuperadmin
                        })
                    });

                    await umLoadData(true);

                    const usernameNorm = String(usernameRaw || '').trim().toLowerCase();
                    const createdUser = umState.users.find(u => String(u.username || '').toLowerCase() === usernameNorm);

                    if (createdUser && !isSuperadmin && role !== 'custom') {
                        const roleName = role === 'viewer' ? 'Viewer' : 'Operator';
                        const roleGroup = umState.permissionGroups.find(g => String(g.name || '').toLowerCase() === roleName.toLowerCase());
                        const permissionGroupIds = roleGroup ? [roleGroup.id] : [];
                        const allowedGroupIds = scope === 'all' ? umState.waGroups.map(g => g.id) : [];

                        await umApi('/api/users/' + createdUser.id + '/access', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ permissionGroupIds, allowedGroupIds, settings: {} })
                        });
                    }

                    umSetStatus('um_create_status', currentLang === 'en' ? 'User created and configured successfully' : 'تم إنشاء المستخدم وضبط الصلاحيات بنجاح');
                    document.getElementById('um_create_password').value = '';
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_create_status', e.message, true);
                }
            }

            async function umCreatePermissionGroup() {
                try {
                    const permissions = Array.from(umCreatePermSet);
                    if (!permissions.length) {
                        throw new Error(currentLang === 'en' ? 'Select at least one permission' : 'اختر صلاحية واحدة على الأقل');
                    }
                    const isEditMode = umEditingPermGroupId !== null;
                    await umApi(isEditMode ? '/api/access/permission-groups/update' : '/api/access/permission-groups/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: isEditMode ? umEditingPermGroupId : undefined,
                            name: document.getElementById('um_perm_name').value,
                            description: document.getElementById('um_perm_desc').value,
                            permissions
                        })
                    });
                    umResetPermissionForm(false);
                    umSetStatus('um_perm_status', isEditMode
                        ? (currentLang === 'en' ? 'Permission group updated' : 'تم تحديث مجموعة الصلاحيات')
                        : (currentLang === 'en' ? 'Permission group created' : 'تم إنشاء مجموعة الصلاحيات'));
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_perm_status', e.message, true);
                }
            }

            async function umDeletePermissionGroup(id) {
                if (!await showConfirmModal(currentLang === 'en' ? 'Delete this permission group?' : 'هل تريد حذف مجموعة الصلاحيات؟')) return;
                try {
                    await umApi('/api/access/permission-groups/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    if (umEditingPermGroupId !== null && Number(umEditingPermGroupId) === Number(id)) {
                        umResetPermissionForm(false);
                    }
                    umSetStatus('um_perm_status', currentLang === 'en' ? 'Permission group deleted' : 'تم حذف مجموعة الصلاحيات');
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_perm_status', e.message, true);
                }
            }

            async function umSaveSelectedUserAccess() {
                if (!umState.selectedUserId) {
                    umSetStatus('um_access_status', currentLang === 'en' ? 'Select a user first' : 'اختر مستخدماً أولاً', true);
                    return;
                }
                try {
                    const permissionGroupIds = Array.from(document.querySelectorAll('input[data-role="um-perm"]:checked')).map(cb => Number(cb.value));
                    const allowedGroupIds = Array.from(document.querySelectorAll('input[data-role="um-wa"]:checked')).map(cb => cb.value);
                    await umApi('/api/users/' + umState.selectedUserId + '/access', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ permissionGroupIds, allowedGroupIds, settings: {} })
                    });
                    umSetStatus('um_access_status', currentLang === 'en' ? 'Access saved successfully' : 'تم حفظ الوصول بنجاح');
                    await umSelectUser(umState.selectedUserId);
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_access_status', e.message, true);
                }
            }

            async function umDeleteSelectedUser() {
                if (!umState.selectedUserId) {
                    umSetStatus('um_access_status', currentLang === 'en' ? 'Select a user first' : 'اختر مستخدماً أولاً', true);
                    return;
                }
                if (!await showConfirmModal(currentLang === 'en' ? 'Delete selected user?' : 'هل تريد حذف المستخدم المحدد؟')) return;
                try {
                    await umApi('/api/users/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: umState.selectedUserId })
                    });
                    umSetStatus('um_access_status', currentLang === 'en' ? 'User deleted' : 'تم حذف المستخدم');
                    umState.selectedUserId = null;
                    umState.selectedUserAccess = null;
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_access_status', e.message, true);
                }
            }

            function umUsePermPreset(preset) {
                const presets = {
                    viewer: ['dashboard:read', 'groups:view', 'logs:view'],
                    operator: ['dashboard:read', 'groups:view', 'config:write', 'security:manage', 'media:manage', 'import-export:manage', 'bot:logout', 'logs:view', 'users:manage'],
                    admin: ['*']
                };
                const lines = presets[preset] || [];
                umCreatePermSet = new Set(lines);
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umTogglePermissionGroupsDrawer(forceOpen = null) {
                const drawer = document.getElementById('um_perm_drawer');
                const icon = document.getElementById('um_perm_drawer_icon');
                if (!drawer || !icon) return;

                const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
                drawer.classList.toggle('open', shouldOpen);
                icon.className = shouldOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            }

            function umRenderCreatePermPicker() {
                const picker = document.getElementById('um_perm_picker');
                if (!picker) return;
                picker.innerHTML = '';
                umCreatePermCatalog.forEach(permission => {
                    const label = document.createElement('label');
                    label.className = 'cb-label';
                    label.style.margin = '0';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = umCreatePermSet.has(permission);
                    checkbox.addEventListener('change', () => umToggleCreatePerm(permission, checkbox.checked));
                    label.appendChild(checkbox);

                    const text = document.createElement('span');
                    text.textContent = ' ' + permission;
                    label.appendChild(text);

                    picker.appendChild(label);
                });
            }

            function umRenderPermissionHelp() {
                const helpBox = document.getElementById('um_perm_help');
                if (!helpBox) return;
                helpBox.innerHTML = umCreatePermCatalog.map(permission => {
                    const desc = umPermissionDescriptions[permission] || {
                        ar: 'صلاحية مخصصة.',
                        en: 'Custom permission.'
                    };
                    const text = currentLang === 'en' ? desc.en : desc.ar;
                    return '<div class="um-perm-help-item">' +
                        '<div class="um-perm-help-key">' + umEscapeHtml(permission) + '</div>' +
                        '<div class="um-perm-help-desc">' + umEscapeHtml(text) + '</div>' +
                    '</div>';
                }).join('');
            }

            function umRenderCreatePermSelection() {
                const selected = document.getElementById('um_perm_selected');
                if (!selected) return;
                const permissions = Array.from(umCreatePermSet);
                if (!permissions.length) {
                    selected.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">' + umNoCreatePermsText + '</span>';
                    return;
                }
                selected.innerHTML = '';
                permissions.forEach(permission => {
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    chip.textContent = permission;

                    const remove = document.createElement('span');
                    remove.className = 'chip-remove';
                    remove.innerHTML = '&times;';
                    remove.addEventListener('click', () => umRemoveCreatePerm(permission));
                    chip.appendChild(document.createTextNode(' '));
                    chip.appendChild(remove);

                    selected.appendChild(chip);
                });
            }

            function umResetPermissionForm(clearStatus = true) {
                umEditingPermGroupId = null;
                const nameEl = document.getElementById('um_perm_name');
                const descEl = document.getElementById('um_perm_desc');
                const customEl = document.getElementById('um_perm_custom');
                const submitBtn = document.getElementById('um_perm_submit_btn');
                const cancelBtn = document.getElementById('um_perm_cancel_btn');

                if (nameEl) nameEl.value = '';
                if (descEl) descEl.value = '';
                if (customEl) customEl.value = '';

                umCreatePermSet = new Set();
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();

                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (currentLang === 'en' ? 'Create Group' : 'إضافة المجموعة');
                }
                if (cancelBtn) cancelBtn.style.display = 'none';
                if (clearStatus) umSetStatus('um_perm_status', '');
            }

            function umEditPermissionGroup(id) {
                const group = umState.permissionGroups.find(g => Number(g.id) === Number(id));
                if (!group) {
                    umSetStatus('um_perm_status', currentLang === 'en' ? 'Permission group not found' : 'لم يتم العثور على مجموعة الصلاحيات', true);
                    return;
                }

                umEditingPermGroupId = Number(group.id);

                const nameEl = document.getElementById('um_perm_name');
                const descEl = document.getElementById('um_perm_desc');
                const submitBtn = document.getElementById('um_perm_submit_btn');
                const cancelBtn = document.getElementById('um_perm_cancel_btn');

                if (nameEl) nameEl.value = group.name || '';
                if (descEl) descEl.value = group.description || '';
                umCreatePermSet = new Set(Array.isArray(group.permissions) ? group.permissions : []);

                umRenderCreatePermPicker();
                umRenderCreatePermSelection();

                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> ' + (currentLang === 'en' ? 'Save Changes' : 'حفظ التعديلات');
                }
                if (cancelBtn) cancelBtn.style.display = 'inline-flex';

                umTogglePermissionGroupsDrawer(true);
                umSetStatus('um_perm_status', currentLang === 'en' ? 'Editing permission group' : 'جاري تعديل مجموعة الصلاحيات');
            }

            function umToggleCreatePerm(permission, checked) {
                if (checked) umCreatePermSet.add(permission);
                else umCreatePermSet.delete(permission);
                umRenderCreatePermSelection();
            }

            function umRemoveCreatePerm(permission) {
                umCreatePermSet.delete(permission);
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umAddCustomCreatePerm() {
                const input = document.getElementById('um_perm_custom');
                if (!input) return;
                const permission = String(input.value || '').trim();
                if (!permission) return;
                umCreatePermSet.add(permission);
                input.value = '';
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umSetAllCreatePerms(checked) {
                umCreatePermSet = checked ? new Set(umCreatePermCatalog) : new Set();
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umToggleAll(role, checked) {
                document.querySelectorAll('input[data-role="' + role + '"]').forEach(el => {
                    el.checked = checked;
                });
            }

            function umHandleQuickRoleChange() {
                const roleEl = document.getElementById('um_create_quick_role');
                const superEl = document.getElementById('um_create_superadmin');
                if (!roleEl || !superEl) return;
                if (roleEl.value === 'admin') superEl.checked = true;
                if (roleEl.value === 'viewer' || roleEl.value === 'operator') superEl.checked = false;
            }

            const umQuickRoleEl = document.getElementById('um_create_quick_role');
            if (umQuickRoleEl) umQuickRoleEl.addEventListener('change', umHandleQuickRoleChange);
            umRenderCreatePermPicker();
            umRenderPermissionHelp();
            umRenderCreatePermSelection();

            let customMessagesArr = ("").split('||').map(s=>s.trim()).filter(Boolean);
            let approvalWordsArr = "yes".split(',').map(s=>s.trim()).filter(Boolean);
            let banWordsArr = "no".split(',').map(s=>s.trim()).filter(Boolean);
            let defaultWordsArr = [];
            let aiFilterTriggerWordsArr = ["نعم"];
            let globalQAArr = [];
            let globalQAEditingIndex = null;
            let globalQAQuestionsDraft = [];
            let globalQAEventDatesDraft = [];
            let globalQALegacyEventDate = '';
            let globalQACurrentAnswer = '';
            let globalQAPendingMediaFile = '';
            let globalQALanguage = 'ar';
            let globalQAMediaLoaded = false;
            let blacklistArr = []; 
            let blockedExtensionsArr = [];
            let approvedArr = []; 
            let whitelistArr = []; 
            let groupsConfigObj = {};
            const metaTypes = [{"id":"text","icon":"<i class=\"fas fa-file-alt\"></i>","name":"نصوص"},{"id":"image","icon":"<i class=\"fas fa-image\"></i>","name":"صور"},{"id":"video","icon":"<i class=\"fas fa-video\"></i>","name":"فيديو"},{"id":"audio","icon":"<i class=\"fas fa-music\"></i>","name":"صوتيات"},{"id":"document","icon":"<i class=\"fas fa-file\"></i>","name":"ملفات"},{"id":"sticker","icon":"<i class=\"fas fa-smile\"></i>","name":"ملصقات"}];
            
            let groupsArr = Object.keys(groupsConfigObj).map(key => ({
                id: key,
                adminGroup: groupsConfigObj[key].adminGroup || '',
                adminLanguage: groupsConfigObj[key].adminLanguage || 'default',
                words: groupsConfigObj[key].words || [],
                aiFilterTriggerWords: groupsConfigObj[key].aiFilterTriggerWords || [],
                useDefaultWords: groupsConfigObj[key].useDefaultWords !== false,
                enableJoinProfileScreening: groupsConfigObj[key].enableJoinProfileScreening || false,
                enableWordFilter: groupsConfigObj[key].enableWordFilter !== false,
                enableAIFilter: groupsConfigObj[key].enableAIFilter || false,
                enableAIMedia: groupsConfigObj[key].enableAIMedia || false,
                autoAction: groupsConfigObj[key].autoAction || false,
                enableBlacklist: groupsConfigObj[key].enableBlacklist !== false,
                enableWhitelist: groupsConfigObj[key].enableWhitelist !== false,
                useGlobalBlacklist: groupsConfigObj[key].useGlobalBlacklist !== false,
                useGlobalWhitelist: groupsConfigObj[key].useGlobalWhitelist !== false,
                useGlobalQA: groupsConfigObj[key].useGlobalQA === true,
                customBlacklist: groupsConfigObj[key].customBlacklist || [],
                customWhitelist: groupsConfigObj[key].customWhitelist || [],
                enableAntiSpam: groupsConfigObj[key].enableAntiSpam || false,
                spamDuplicateLimit: groupsConfigObj[key].spamDuplicateLimit || 3,
                spamAction: groupsConfigObj[key].spamAction || 'poll',
                enableWelcomeMessage: groupsConfigObj[key].enableWelcomeMessage || false, 
                welcomeMessageText: groupsConfigObj[key].welcomeMessageText || 'مرحباً بك يا {user} في مجموعتنا!',
                blockedTypes: groupsConfigObj[key].blockedTypes || [],
                blockedAction: groupsConfigObj[key].blockedAction || 'delete',
                spamTypes: groupsConfigObj[key].spamTypes || ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                spamLimits: groupsConfigObj[key].spamLimits || {text:7, image:3, video:2, audio:3, document:3, sticker:3},
                enablePanicMode: groupsConfigObj[key].enablePanicMode || false,
                panicMessageLimit: groupsConfigObj[key].panicMessageLimit || 10,
                panicTimeWindow: groupsConfigObj[key].panicTimeWindow || 5,
                panicLockoutDuration: groupsConfigObj[key].panicLockoutDuration || 10,
                panicAlertTarget: groupsConfigObj[key].panicAlertTarget || 'both',
                panicAlertMessage: groupsConfigObj[key].panicAlertMessage || '🚨 عذراً، تم رصد هجوم (Raid)! سيتم إغلاق المجموعة لمدة {time} دقائق.',
                enableQAFeature: groupsConfigObj[key].enableQAFeature || false,
                qaList: groupsConfigObj[key].qaList || [],
                eventDate: groupsConfigObj[key].eventDate || '',
                eventDates: groupsConfigObj[key].eventDates || [],
                qaLanguage: groupsConfigObj[key].qaLanguage || 'ar',
                currentQAQuestions: [],
                currentQAAnswer: '',
                editingQAIndex: null
            }));

            let currentDetailIndex = null;

            function switchGroupTab(groupIndex, tabName, btn) {
                document.querySelectorAll('#gtabs_' + groupIndex + ' .group-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('[id^="gtab_' + groupIndex + '_"]').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById('gtab_' + groupIndex + '_' + tabName);
                if (panel) panel.classList.add('active');
            }

            function renderGroups() {
                const container = document.getElementById('groupsContainer');
                container.innerHTML = '';

                if (groupsArr.length === 0) {
                    container.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
                        <i class="fas fa-users-cog" style="font-size:48px; margin-bottom:16px; display:block; opacity:0.3;"></i>
                        <div style="font-size:16px; font-weight:600;">${currentLang === 'en' ? 'No custom groups yet' : 'لا توجد مجموعات مخصصة بعد'}</div>
                        <div style="font-size:13px; margin-top:6px;">${currentLang === 'en' ? 'Click "Add Group" to get started' : 'اضغط على "إضافة مجموعة" للبدء'}</div>
                    </div>`;
                    return;
                }

                groupsArr.forEach((group, groupIndex) => {
                    const knownGroup = fetchedGroups.find(g => g.id === group.id);
                    const groupName = knownGroup ? knownGroup.name : (group.id ? group.id.split('@')[0].slice(-10) + '...' : dict.no_id);
                    const initials = groupName.replace(/[^؀-ۿa-zA-Z]/g, '').slice(0, 2) || '؟';
                    const shortGroupId = group.id ? group.id.split('@')[0] : '';

                    let chips = '';
                    if (group.enablePanicMode) chips += `<span class="glc-chip orange"><i class="fas fa-radiation"></i> ${currentLang==='en'?'Panic Mode':'طوارئ'}</span>`;
                    if (group.enableAntiSpam)  chips += `<span class="glc-chip orange"><i class="fas fa-shield-alt"></i> Anti-Spam</span>`;
                    if (group.enableAIFilter)  chips += `<span class="glc-chip blue"><i class="fas fa-brain"></i> AI</span>`;
                    if (group.enableWordFilter) chips += `<span class="glc-chip green"><i class="fas fa-filter"></i> ${currentLang==='en'?'Word Filter':'فلتر كلمات'}</span>`;
                    if (group.enableWelcomeMessage) chips += `<span class="glc-chip green"><i class="fas fa-door-open"></i> ${currentLang==='en'?'Welcome':'ترحيب'}</span>`;
                    if (group.blockedTypes && group.blockedTypes.length > 0) chips += `<span class="glc-chip red"><i class="fas fa-ban"></i> ${group.blockedTypes.length} ${currentLang==='en'?'blocked':'ممنوع'}</span>`;

                    const enabledCount = [
                        group.enablePanicMode,
                        group.enableAntiSpam,
                        group.enableAIFilter,
                        group.enableWordFilter,
                        group.enableWelcomeMessage,
                        group.enableJoinProfileScreening,
                        group.enableWhitelist,
                        group.enableBlacklist
                    ].filter(Boolean).length;

                    const card = document.createElement('div');
                    card.className = 'group-list-card';
                    card.onclick = () => openGroupDetail(groupIndex);
                    card.innerHTML = `
                        <div class="glc-avatar">${initials}</div>
                        <div class="glc-info">
                            <div class="glc-name">${groupName}</div>
                            ${group.id ? `<span class="glc-id" title="${umEscapeHtml(group.id)}">${shortGroupId}</span>` : `<span style="color:var(--orange);font-size:12px;">${dict.no_id}</span>`}
                            ${chips ? `<div class="glc-chips">${chips}</div>` : ''}
                        </div>
                        <div class="glc-side">
                            <div class="glc-stats">
                                <strong>${enabledCount}</strong>
                                <span>${currentLang === 'en' ? 'active' : 'مفعل'}</span>
                            </div>
                            <i class="fas fa-chevron-${currentLang==='en'?'right':'left'} glc-arrow"></i>
                        </div>
                    `;
                    container.appendChild(card);
                });
            }

            function openGroupDetail(groupIndex) {
                currentDetailIndex = groupIndex;
                const group = groupsArr[groupIndex];
                const knownGroup = fetchedGroups.find(g => g.id === group.id);
                const groupName = knownGroup ? knownGroup.name : (group.id || dict.no_id);
                const initials = groupName.replace(/[^؀-ۿa-zA-Z]/g, '').slice(0, 2) || '؟';

                const av = document.getElementById('detailGroupAvatar');
                av.textContent = initials;
                document.getElementById('detailGroupName').textContent = groupName;
                document.getElementById('detailGroupId').textContent = group.id || dict.no_id;

                document.getElementById('detailDeleteBtn').onclick = async () => {
                    if (await showConfirmModal(dict.delete_confirm.replace(/<[^>]*>?/gm, ''))) {
                        groupsArr.splice(groupIndex, 1);
                        closeGroupDetail();
                    }
                };

                renderGroupDetailBody(groupIndex);

                document.getElementById('groupsListView').style.display = 'none';
                document.getElementById('groupsDetailView').style.display = 'block';
            }

            function closeGroupDetail() {
                document.getElementById('groupsDetailView').style.display = 'none';
                document.getElementById('groupsListView').style.display = 'block';
                currentDetailIndex = null;
                renderGroups();
            }

            function renderGroupChips(groupIndex, type) {
                const group = groupsArr[groupIndex];
                let html = '';
                let containerId = '';
                if (type === 'words') {
                    html = group.words.map((word, wordIndex) => `<div class="chip">${word} <span class="chip-remove" onclick="removeGroupWord(${groupIndex}, ${wordIndex})">&times;</span></div>`).join('');
                    containerId = 'chip_container_words_' + groupIndex;
                } else if (type === 'blacklist') {
                    html = group.customBlacklist.map((num, idx) => `<div class="chip red-chip">${num} <span class="chip-remove" onclick="removeGroupBlacklist(${groupIndex}, ${idx})">&times;</span></div>`).join('');
                    containerId = 'chip_container_bl_' + groupIndex;
                } else if (type === 'whitelist') {
                    html = group.customWhitelist.map((num, idx) => `<div class="chip">${num} <span class="chip-remove" onclick="removeGroupWhitelist(${groupIndex}, ${idx})">&times;</span></div>`).join('');
                    containerId = 'chip_container_wl_' + groupIndex;
                }
                const container = document.getElementById(containerId);
                if (container) container.innerHTML = html;
            }

            function renderGroupDetailBody(groupIndex, activeTab = 'general') {
                const group = groupsArr[groupIndex];
                const container = document.getElementById('groupDetailBody');

                let wordsHtml = group.words.map((word, wordIndex) => 
                    `<div class="chip">${word} <span class="chip-remove" onclick="removeGroupWord(${groupIndex}, ${wordIndex})">&times;</span></div>`
                ).join('');

                let aiWordsHtml = (group.aiFilterTriggerWords || []).map((word, wordIndex) =>
                    `<div class="chip">${word} <span class="chip-remove" onclick="removeGroupAITriggerWord(${groupIndex}, ${wordIndex})">&times;</span></div>`
                ).join('');

                let blHtml = group.customBlacklist.map((num, idx) => 
                    `<div class="chip red-chip">${num} <span class="chip-remove" onclick="removeGroupBlacklist(${groupIndex}, ${idx})">&times;</span></div>`
                ).join('');

                let wlHtml = group.customWhitelist.map((num, idx) => 
                    `<div class="chip">${num} <span class="chip-remove" onclick="removeGroupWhitelist(${groupIndex}, ${idx})">&times;</span></div>`
                ).join('');

                const blockedChecks = metaTypes.map(t => 
                    `<label class="cb-label"><input type="checkbox" value="${t.id}" ${group.blockedTypes.includes(t.id)?'checked':''} onchange="updateGroupArray(${groupIndex}, 'blockedTypes', '${t.id}', this.checked)"> ${t.icon} ${t.name}</label>`
                ).join('');

                const spamLimitGrid = metaTypes.map(t => {
                    const isChecked = group.spamTypes.includes(t.id) ? 'checked' : '';
                    const limitVal = group.spamLimits[t.id] || 5;
                    return `<div class="limit-item">
                        <input type="checkbox" value="${t.id}" ${isChecked} onchange="updateGroupArray(${groupIndex}, 'spamTypes', '${t.id}', this.checked)">
                        <span style="font-size:13px;width:70px;">${t.icon} ${t.name}</span>
                        <input type="number" value="${limitVal}" min="1" onchange="updateSpamLimit(${groupIndex}, '${t.id}', this.value)">
                    </div>`;
                }).join('');

                const tabs = [
                    { id: 'general', icon: 'fa-cog',        label: currentLang==='en'?'General':'عام' },
                    { id: 'filters', icon: 'fa-filter',     label: currentLang==='en'?'Filters':'فلاتر' },
                    { id: 'qa',      icon: 'fa-question',   label: currentLang==='en'?'Q&A':'س و ج' },
                    { id: 'spam',    icon: 'fa-shield-alt', label: currentLang==='en'?'Anti-Spam':'سبام' },
                    { id: 'panic',   icon: 'fa-radiation',  label: currentLang==='en'?'Panic':'طوارئ' },
                    { id: 'lists',   icon: 'fa-list',       label: currentLang==='en'?'Lists':'القوائم' },
                ];
                const tabButtons = tabs.map((tab) => {
                    const extraAction = tab.id === 'qa' ? ';loadGroupMedia(' + groupIndex + ')' : '';
                    return '<button type="button" class="group-tab ' + (tab.id === activeTab ? 'active' : '') + '" onclick=\'switchGroupTab(' + groupIndex + ', "' + tab.id + '", this)' + extraAction + '\'><i class="fas ' + tab.icon + '"></i> ' + tab.label + '</button>';
                }).join('');

                container.innerHTML = `
                    <div class="field-row" style="margin-bottom:20px;">
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">${dict.target_group}</label>
                            ${createGroupSelectHTML(group.id, `updateGroupData(${groupIndex}, 'id', this.value)`, false)}
                        </div>
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">${dict.admin_group}</label>
                            ${createGroupSelectHTML(group.adminGroup, `updateGroupData(${groupIndex}, 'adminGroup', this.value)`, true)}
                        </div>
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">${dict.admin_msg_lang}</label>
                            <select onchange="updateGroupData(${groupIndex}, 'adminLanguage', this.value)">
                                <option value="default" ${group.adminLanguage==='default'?'selected':''}>${dict.use_default_lang}</option>
                                <option value="ar" ${group.adminLanguage==='ar'?'selected':''}>${dict.lang_ar}</option>
                                <option value="en" ${group.adminLanguage==='en'?'selected':''}>${dict.lang_en}</option>
                            </select>
                        </div>
                    </div>

                    <div class="group-tabs" id="gtabs_${groupIndex}">${tabButtons}</div>

                    <div class="group-tab-panel ${activeTab==='general'?'active':''}" id="gtab_${groupIndex}_general">
                        <div class="sub-panel red" style="margin-bottom:16px;">
                            <h4 style="color:var(--red);">${dict.blocked_types}</h4>
                            <div class="cb-group" style="margin-bottom:10px;">${blockedChecks}</div>
                            <label class="field-label">${dict.block_action}</label>
                            <select onchange="updateGroupData(${groupIndex}, 'blockedAction', this.value)">
                                <option value="delete" ${group.blockedAction==='delete'?'selected':''}>${dict.act_del}</option>
                                <option value="poll" ${group.blockedAction==='poll'?'selected':''}>${dict.act_poll}</option>
                                <option value="auto" ${group.blockedAction==='auto'?'selected':''}>${dict.act_auto}</option>
                            </select>
                        </div>
                        <div class="card success">
                            <div class="toggle-row green" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enableWelcomeMessage?'checked':''} onchange="toggleGroupPanel(${groupIndex},'welcome',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">${dict.welcome_msg}<small>${dict.welcome_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_welcome_panel_${groupIndex}" style="overflow:hidden;max-height:${group.enableWelcomeMessage?'200px':'0px'};opacity:${group.enableWelcomeMessage?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enableWelcomeMessage?'20px':'0px'};">
                                <label class="field-label">${dict.msg_text}</label>
                                <textarea rows="2" onchange="updateGroupData(${groupIndex}, 'welcomeMessageText', this.value)">${group.welcomeMessageText}</textarea>
                            </div>
                        </div>
                        <div class="toggle-row pink" style="margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" ${group.autoAction?'checked':''} onchange="updateGroupToggle(${groupIndex},'autoAction',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label pink">${dict.direct_del}</div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel ${activeTab==='filters'?'active':''}" id="gtab_${groupIndex}_filters">
                        <div class="card warning">
                            <div class="toggle-row warning" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enableWordFilter?'checked':''} onchange="toggleGroupPanel(${groupIndex},'words',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">${dict.word_filter}<small>${dict.wf_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_words_panel_${groupIndex}" style="overflow:hidden;max-height:${group.enableWordFilter?'600px':'0px'};opacity:${group.enableWordFilter?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enableWordFilter?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(255,171,64,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" ${group.useDefaultWords?'checked':''} onchange="updateGroupToggle(${groupIndex},'useDefaultWords',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">${dict.use_global}<small>${dict.ug_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">${dict.custom_words}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupWord_${groupIndex}" placeholder="..." onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWord(${groupIndex});}">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWord(${groupIndex})"><i class="fas fa-plus"></i> ${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_words_${groupIndex}">${wordsHtml}</div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" ${group.enableAIFilter?'checked':''} onchange="updateGroupToggle(${groupIndex},'enableAIFilter',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label blue">${dict.ai_text}</div>
                            </div>
                        </div>
                        <div style="margin-bottom:12px; padding:14px; background:var(--input-bg); border:1.5px dashed var(--card-border); border-radius:10px;">
                            <label class="field-label">${dict.ai_trigger_words_group}</label>
                            <p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${dict.ai_trigger_words_desc_group}</p>
                            <div class="input-with-btn" style="margin-bottom:10px;">
                                <input type="text" id="newGroupAITriggerWord_${groupIndex}" placeholder="..." onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupAITriggerWord(${groupIndex});}">
                                <button type="button" class="btn btn-primary btn-sm" onclick="addGroupAITriggerWord(${groupIndex})"><i class="fas fa-plus"></i> ${dict.add}</button>
                            </div>
                            <div class="chip-container" id="chip_container_ai_words_${groupIndex}">${aiWordsHtml}</div>
                        </div>
                        <div class="toggle-row purple" style="margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" ${group.enableAIMedia?'checked':''} onchange="updateGroupToggle(${groupIndex},'enableAIMedia',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label purple">${dict.ai_vision}</div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-top:12px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" ${group.enableJoinProfileScreening?'checked':''} onchange="updateGroupToggle(${groupIndex},'enableJoinProfileScreening',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label blue">${dict.join_profile_screening}<small>${dict.join_profile_screening_desc}</small></div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel ${activeTab==='qa'?'active':''}" id="gtab_${groupIndex}_qa">
                        <div class="card info">
                            <div class="toggle-row blue" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enableQAFeature?'checked':''} onchange="toggleGroupPanel(${groupIndex},'qa',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label blue">${currentLang==='en'?'Enable Q&A Feature':'تفعيل ميزة الأسئلة والأجوبة'}<small>${currentLang==='en'?'Auto-respond to predefined questions with dynamic fields':'الإجابة التلقائية على الأسئلة المحددة مع حقول ديناميكية'}</small></div>
                                </div>
                            </div>
                            <div class="toggle-row" style="margin-top:12px; margin-bottom:0; border-color:rgba(64,196,255,0.25); background:rgba(64,196,255,0.05);">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.useGlobalQA?'checked':''} onchange="updateGroupToggle(${groupIndex},'useGlobalQA',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label">${currentLang==='en'?'Apply Global Q&A in this group':'تطبيق Q&A العام في هذه المجموعة'}<small>${currentLang==='en'?'Uses entries from the Global Q&A page when no custom Q&A match is found':'يستخدم الأزواج الموجودة في صفحة Q&A العامة عند عدم تطابق س و ج المخصص'}</small></div>
                                </div>
                            </div>
                            <div id="group_qa_panel_${groupIndex}" style="overflow-y:auto;max-height:${group.enableQAFeature?'600px':'0px'};opacity:${group.enableQAFeature?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enableQAFeature?'20px':'0px'};padding-right:8px;">
                                <div class="sub-panel blue" style="margin-bottom:16px;">
                                    <h4 style="color:var(--blue);">${currentLang==='en'?'Dynamic Fields Reference':'مرجع الحقول الديناميكية'}</h4>
                                    <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
                                        <div><strong style="color:var(--blue);">{eventdate}</strong> - ${currentLang==='en'?'Primary event/deadline (first in list)':'الحدث الأساسي (الأول في القائمة)'}</div>
                                        <div><strong style="color:var(--blue);">{eventdate:Label}</strong> - ${currentLang==='en'?'Specific event by label':'حدث معين حسب العنوان'}</div>
                                        <div><strong style="color:var(--blue);">{user}</strong> - ${currentLang==='en'?'Sender username':'اسم المرسل'}</div>
                                    </div>
                                </div>
                                
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                                    <label class="field-label" style="margin-bottom:0;">${currentLang==='en'?'Manage Events/Deadlines':'إدارة الأحداث والمواعيد'}</label>
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addEventDate(${groupIndex})"><i class="fas fa-plus"></i> ${currentLang==='en'?'Add Event':'إضافة حدث'}</button>
                                </div>
                                <div id="event_dates_container_${groupIndex}" style="margin-bottom: 20px;">
                                    ${(group.currentQAEventDates || []).map((ed, edIdx) => {
                                        return `<div class="field-row" style="margin-bottom:10px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); align-items: flex-end; gap: 12px;">
                                            <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                                                <label class="field-label" style="font-size:10px;">${currentLang==='en'?'Label (e.g. Exam)':'العنوان (مثل: اختبار)'}</label>
                                                <input type="text" value="${ed.label || ''}" placeholder="..." onchange="updateEventDate(${groupIndex}, ${edIdx}, \'label\', this.value)">
                                            </div>
                                            <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                                                <label class="field-label" style="font-size:10px;">${currentLang==='en'?'Date':'التاريخ'}</label>
                                                <input type="date" value="${ed.date || ''}" onchange="updateEventDate(${groupIndex}, ${edIdx}, \'date\', this.value)" style="color-scheme: dark;">
                                            </div>
                                            <button type="button" class="icon-btn" onclick="removeEventDate(${groupIndex}, ${edIdx})" style="border-color:rgba(255,82,82,0.3);color:var(--red);" title="${currentLang==='en'?'Delete event':'حذف الحدث'}"><i class="fas fa-trash"></i></button>
                                        </div>`;
                                    }).join('')}
                                    ${(!group.currentQAEventDates || group.currentQAEventDates.length === 0) ? `<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center; border: 1px dashed var(--card-border); border-radius: 8px;">${currentLang==='en'?'No extra events added yet.':'لم يتم إضافة أحداث إضافية بعد.'}</div>` : ''}
                                </div>

                                <div class="field-row" style="margin-bottom:16px;">
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label" style="margin-bottom:4px;">${currentLang==='en'?'Legacy Event Date (for {eventdate})':'تاريخ الحدث القديم (لحقل {eventdate})'}</label>
                                        <input type="date" id="newQAEventDate_${groupIndex}" value="${group.currentQAEventDate || ''}" onchange="updateGroupData(${groupIndex}, 'currentQAEventDate', this.value)" style="color-scheme: dark; font-family: var(--font);">
                                    </div>
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label" style="margin-bottom:4px;">${currentLang==='en'?'Days-Left Language':'لغة عرض الأيام المتبقية'}</label>
                                        <select id="qaLang_${groupIndex}" onchange="updateGroupData(${groupIndex}, 'qaLanguage', this.value)">
                                            <option value="ar" ${(group.qaLanguage||'ar')==='ar'?'selected':''}>${currentLang==='en'?'Arabic (عربي)':'العربية'}</option>
                                            <option value="en" ${(group.qaLanguage||'ar')==='en'?'selected':''}>English</option>
                                        </select>
                                    </div>
                                </div>

                                <label class="field-label">${currentLang==='en'?'Add Questions for This Answer':'أضف أسئلة لهذه الإجابة'}</label>
                                <div class="field-group" style="margin-bottom:10px;">
                                    <input type="text" id="newQAQuestion_${groupIndex}" placeholder="${currentLang==='en'?'Enter a question variant (e.g., when is the test)...':'أدخل صيغة السؤال...'}" style="margin-bottom:10px;" onkeypress="if(event.key==='Enter'){event.preventDefault();addQuestionToQA(${groupIndex});}">
                                    <button type="button" class="btn btn-full" onclick="addQuestionToQA(${groupIndex})" style="margin-bottom:10px;background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-plus"></i> ${currentLang==='en'?'Add Question Variant':'إضافة صيغة سؤال'}</button>
                                    <div class="chip-container" id="qa_questions_container_${groupIndex}" style="min-height:40px;">${(group.currentQAQuestions || []).map((q, qIdx) => `<div class="chip"><span>${q}</span><span class="chip-remove" onclick="removeQuestionFromQA(${groupIndex}, ${qIdx})">×</span></div>`).join('')}</div>
                                </div>
                                <label class="field-label">${currentLang==='en'?'Answer (Use {date}, {eventdate}, {user} for dynamic values)':'الإجابة (استخدم {date}, {eventdate}, {user} للحقول الديناميكية)'}</label>
                                <div class="field-group" style="margin-bottom:10px;">
                                    <textarea id="newQAAnswer_${groupIndex}" placeholder="${currentLang==='en'?'Enter answer with optional dynamic fields...':'أدخل الإجابة مع الحقول الديناميكية الاختيارية...'}" rows="3" style="margin-bottom:10px;" oninput="updateGroupData(${groupIndex}, 'currentQAAnswer', this.value)" onchange="updateGroupData(${groupIndex}, 'currentQAAnswer', this.value)">${group.currentQAAnswer || ''}</textarea>
                                    <button type="button" id="saveQABtn_${groupIndex}" class="btn btn-full" onclick="addGroupQA(${groupIndex})" style="background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-save"></i> ${currentLang==='en'?'Save Q&A Pair':'حفظ زوج س و ج'}</button>
                                </div>

                                <div class="sub-panel" style="margin-bottom:16px;border-color:rgba(100,220,150,0.3);background:rgba(100,220,150,0.04);">
                                    <h4 style="color:#64dc96;margin-bottom:12px;"><i class="fas fa-paperclip"></i> ${currentLang==='en'?'Attach Media to This Answer':'إرفاق وسائط بهذه الإجابة'}</h4>
                                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">${currentLang==='en'?'Select a file to automatically attach it when saving the Q&A pair. The bot will send the file + answer caption.':'اختر ملفاً ليُرفق تلقائياً عند حفظ الزوج. سيرسل البوت الملف مع نص الإجابة كتعليق.'}</p>
                                    <div id="qa_media_selected_${groupIndex}" style="display:none;align-items:center;gap:10px;background:rgba(100,220,150,0.1);border:1px solid rgba(100,220,150,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                                        <i class="fas fa-paperclip" style="color:#64dc96;"></i>
                                        <span id="qa_media_selected_name_${groupIndex}" style="font-size:13px;color:#64dc96;flex:1;"></span>
                                        <button type="button" onclick="clearQAMedia(${groupIndex})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button>
                                    </div>
                                    <div style="display:flex;gap:10px;margin-bottom:14px;">
                                        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--input-bg);border:1.5px dashed rgba(100,220,150,0.4);border-radius:10px;cursor:pointer;font-size:13px;color:var(--text-muted);transition:all 0.2s;" onmouseover="this.style.borderColor='#64dc96'" onmouseout="this.style.borderColor='rgba(100,220,150,0.4)'">
                                            <i class="fas fa-cloud-upload-alt" style="color:#64dc96;font-size:18px;"></i>
                                            <span>${currentLang==='en'?'Click to upload a file':'انقر لرفع ملف'}</span>
                                            <input type="file" id="qa_file_input_${groupIndex}" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onchange="uploadGroupMedia(${groupIndex}, this)">
                                        </label>
                                    </div>
                                    <div id="qa_upload_status_${groupIndex}" style="display:none;font-size:12px;color:var(--text-muted);margin-bottom:10px;"></div>
                                    <div id="qa_media_grid_${groupIndex}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;"></div>
                                </div>

                                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;">
                                    <label class="field-label" style="margin:0;">${currentLang==='en'?'Q&A Pairs':'أزواج الأسئلة والأجوبة'}</label>
                                    <button type="button" class="btn btn-sm" onclick="pasteQA(${groupIndex})" style="background:var(--accent-dim);color:var(--accent);border-color:rgba(0,230,118,0.3);"><i class="fas fa-paste"></i> ${currentLang==='en'?'Paste Q&A':'لصق س و ج'}</button>
                                </div>
                                <div id="qa_container_${groupIndex}">
                                    ${(group.qaList || []).map((qa, qaIdx) => `
                                        <div class="group-card" style="margin-bottom:10px;">
                                            <div class="group-card-header" style="padding:12px;">
                                                <div class="group-card-title" style="font-size:14px;">
                                                    <i class="fas fa-question" style="color:var(--blue);"></i> ${currentLang==='en'?'Question Variations':'صيغ الأسئلة'} (${(qa.questions || []).length})
                                                </div>
                                                <div style="display:flex;gap:8px;">
                                                    <button type="button" class="icon-btn" onclick="copyQA(${groupIndex}, ${qaIdx})" style="background:rgba(255,160,0,0.1);color:#ffa000;border-color:rgba(255,160,0,0.3);" title="${currentLang==='en'?'Copy':'نسخ'}">
                                                        <i class="fas fa-copy"></i>
                                                    </button>
                                                    <button type="button" class="icon-btn" onclick="editGroupQA(${groupIndex}, ${qaIdx})" style="background:var(--blue-dim);color:var(--blue);border-color:rgba(64,196,255,0.3);" title="${currentLang==='en'?'Edit':'تعديل'}">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button type="button" class="icon-btn" onclick="removeGroupQA(${groupIndex}, ${qaIdx})" style="background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3);" title="${currentLang==='en'?'Delete':'حذف'}">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="group-card-body" style="padding:12px;">
                                                <div style="margin-bottom:10px;">
                                                    <div class="chip-container" style="background:rgba(64,196,255,0.05);border-color:rgba(64,196,255,0.2);">${(qa.questions || []).map((q) => `<div class="chip" style="background:rgba(64,196,255,0.15);color:var(--blue);border-color:rgba(64,196,255,0.3);"><i class="fas fa-search"></i> ${q}</div>`).join('')}</div>
                                                </div>
                                                <div style="color:var(--text-muted);font-size:13px;">
                                                    <strong>${currentLang==='en'?'Answer':'الإجابة'}:</strong> ${qa.answer || '(empty)'}
                                                </div>
                                                ${qa.mediaFile ? `<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:#64dc96;"><i class="fas fa-paperclip"></i> ${qa.mediaFile}</div>` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel" id="gtab_${groupIndex}_spam">
                        <div class="card warning">
                            <div class="toggle-row warning" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enableAntiSpam?'checked':''} onchange="toggleGroupPanel(${groupIndex},'spam',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">${dict.anti_spam}<small>${dict.spam_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_spam_panel_${groupIndex}" style="overflow:hidden;max-height:${group.enableAntiSpam?'800px':'0px'};opacity:${group.enableAntiSpam?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enableAntiSpam?'20px':'0px'};">
                                <div style="border-top:1px dashed rgba(255,171,64,0.3);padding-top:20px;">
                                    <div class="field-row" style="margin-bottom:20px;">
                                        <div class="field-group" style="margin-bottom:0;">
                                            <label class="field-label">${dict.action}</label>
                                            <select onchange="updateGroupData(${groupIndex}, 'spamAction', this.value)">
                                                <option value="poll" ${group.spamAction==='poll'?'selected':''}>${dict.poll}</option>
                                                <option value="auto" ${group.spamAction==='auto'?'selected':''}>${dict.auto_kick}</option>
                                            </select>
                                        </div>
                                        <div class="field-group" style="margin-bottom:0;">
                                            <label class="field-label">${dict.text_dup}</label>
                                            <input type="number" value="${group.spamDuplicateLimit}" min="2" max="15" onchange="updateGroupData(${groupIndex},'spamDuplicateLimit',parseInt(this.value))">
                                        </div>
                                    </div>
                                    <label class="field-label" style="margin-bottom:12px;"><i class="fas fa-stopwatch"></i> ${dict.limits_15s}</label>
                                    <div class="limit-grid">${spamLimitGrid}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel" id="gtab_${groupIndex}_panic">
                        <div class="card danger">
                            <div class="toggle-row danger" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enablePanicMode?'checked':''} onchange="toggleGroupPanel(${groupIndex},'panic',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">${dict.panic_mode}<small>${dict.panic_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_panic_panel_${groupIndex}" style="overflow:hidden;max-height:${group.enablePanicMode?'800px':'0px'};opacity:${group.enablePanicMode?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enablePanicMode?'20px':'0px'};">
                                <div style="border-top:1px dashed rgba(255,82,82,0.3);padding-top:20px;">
                                    <div class="field-row" style="margin-bottom:12px;">
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">${dict.panic_msg_limit}</label><input type="number" value="${group.panicMessageLimit}" min="2" onchange="updateGroupData(${groupIndex},'panicMessageLimit',parseInt(this.value))"></div>
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">${dict.panic_time_window}</label><input type="number" value="${group.panicTimeWindow}" min="1" onchange="updateGroupData(${groupIndex},'panicTimeWindow',parseInt(this.value))"></div>
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">${dict.panic_lock_dur}</label><input type="number" value="${group.panicLockoutDuration}" min="1" onchange="updateGroupData(${groupIndex},'panicLockoutDuration',parseInt(this.value))"></div>
                                    </div>
                                    <div class="field-group">
                                        <label class="field-label">${dict.panic_target}</label>
                                        <select onchange="updateGroupData(${groupIndex},'panicAlertTarget',this.value)">
                                            <option value="both" ${group.panicAlertTarget==='both'?'selected':''}>${dict.target_both}</option>
                                            <option value="group" ${group.panicAlertTarget==='group'?'selected':''}>${dict.target_group_only}</option>
                                            <option value="admin" ${group.panicAlertTarget==='admin'?'selected':''}>${dict.admin_group_only}</option>
                                        </select>
                                    </div>
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label">${dict.panic_msg_text}</label>
                                        <textarea rows="2" onchange="updateGroupData(${groupIndex},'panicAlertMessage',this.value)">${group.panicAlertMessage}</textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel" id="gtab_${groupIndex}_lists">
                        <div class="card danger">
                            <div class="toggle-row danger" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enableBlacklist?'checked':''} onchange="toggleGroupPanel(${groupIndex},'blacklist',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">${dict.enable_bl}<small>${dict.bl_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_blacklist_panel_${groupIndex}" style="overflow:hidden;max-height:${group.enableBlacklist?'600px':'0px'};opacity:${group.enableBlacklist?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enableBlacklist?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(255,82,82,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" ${group.useGlobalBlacklist?'checked':''} onchange="updateGroupToggle(${groupIndex},'useGlobalBlacklist',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">${dict.use_global_bl}<small>${dict.ug_bl_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">${dict.custom_bl}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupBl_${groupIndex}" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupBlacklist(${groupIndex});}">
                                    <button type="button" class="btn btn-danger btn-sm" onclick="addGroupBlacklist(${groupIndex})"><i class="fas fa-plus"></i> ${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_bl_${groupIndex}">${blHtml}</div>
                            </div>
                        </div>
                        <div class="card success">
                            <div class="toggle-row green" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" ${group.enableWhitelist?'checked':''} onchange="toggleGroupPanel(${groupIndex},'whitelist',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">${dict.enable_wl}<small>${dict.wl_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_whitelist_panel_${groupIndex}" style="overflow:hidden;max-height:${group.enableWhitelist?'600px':'0px'};opacity:${group.enableWhitelist?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:${group.enableWhitelist?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(0,230,118,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" ${group.useGlobalWhitelist?'checked':''} onchange="updateGroupToggle(${groupIndex},'useGlobalWhitelist',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">${dict.use_global_wl}<small>${dict.ug_wl_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">${dict.custom_wl}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupWl_${groupIndex}" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWhitelist(${groupIndex});}">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWhitelist(${groupIndex})"><i class="fas fa-plus"></i> ${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_wl_${groupIndex}">${wlHtml}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            function updateGroupArray(gIndex, arrName, val, isChecked) {
                let arr = groupsArr[gIndex][arrName];
                if (isChecked && !arr.includes(val)) arr.push(val);
                if (!isChecked) {
                    let idx = arr.indexOf(val);
                    if (idx > -1) arr.splice(idx, 1);
                }
            }

            function updateSpamLimit(gIndex, type, val) {
                if (!groupsArr[gIndex].spamLimits) groupsArr[gIndex].spamLimits = {};
                groupsArr[gIndex].spamLimits[type] = parseInt(val) || 5;
            }

            function getCheckedValues(containerId) {
                const checkboxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`);
                return Array.from(checkboxes).map(cb => cb.value);
            }

            function renderBlacklist() {
                const container = document.getElementById('blacklistContainer');
                container.innerHTML = '';
                blacklistArr.forEach((number, index) => {
                    container.innerHTML += `<div class="chip red-chip">${number} <span class="chip-remove" onclick="removeBlacklistNumber(${index})">&times;</span></div>`;
                });
                document.getElementById('blacklist-count').innerText = blacklistArr.length;
            }

            function renderWhitelist() {
                const container = document.getElementById('whitelistContainer');
                container.innerHTML = '';
                whitelistArr.forEach((number, index) => {
                    container.innerHTML += `<div class="chip">${number} <span class="chip-remove" onclick="removeWhitelistNumber(${index})">&times;</span></div>`;
                });
            }

            function renderBlockedExtensions() {
                const container = document.getElementById('blockedExtensionsContainer');
                if(!container) return;
                container.innerHTML = '';
                blockedExtensionsArr.forEach((ext, index) => {
                    container.innerHTML += `<div class="chip red-chip">+${ext} <span class="chip-remove" onclick="removeBlockedExtension(${index})">&times;</span></div>`;
                });
            }

            function renderApproved() {
                const container = document.getElementById('approvedContainer');
                if(!container) return;
                container.innerHTML = '';
                approvedArr.forEach((number, index) => {
                    container.innerHTML += `<div class="chip">${number} <span class="chip-remove" onclick="removeApprovedNumber(${index})">&times;</span></div>`;
                });
            }

            window.addEventListener('DOMContentLoaded', () => { 
                renderBlockedExtensions(); 
                renderApproved();
                if(typeof renderCustomMessages === 'function') renderCustomMessages();
                if(typeof renderApprovalWords === 'function') renderApprovalWords();
                if(typeof renderBanWords === 'function') renderBanWords();
                if(typeof refreshPendingSecondaryApprovals === 'function') refreshPendingSecondaryApprovals();
                if(typeof refreshEmailLogs === 'function') refreshEmailLogs();
            });

            function formatPendingVerificationItem(item) {
                const requesterId = String(item.requesterId || '')
                    .replace(/:[0-9]+/, '')
                    .replace('@lid', '@c.us');
                const phoneFromApi = String(item.phoneNumber || '').replace(/D/g, '');
                const phoneFromRequesterId = requesterId.replace(/@[^s]+$/, '').replace(/D/g, '');
                const phoneNumber = phoneFromApi || phoneFromRequesterId;
                const groupName = item.groupName || item.groupId || '-';
                const state = item.state || '-';
                const flowType = String(item.flowType || 'join');
                const flowLabel = flowType === 'test'
                    ? (currentLang === 'en' ? 'Test' : 'اختبار')
                    : (currentLang === 'en' ? 'Live' : 'فعلي');
                const lifecycleStatus = String(item.lifecycleStatus || 'active');
                const reopenCode = String(item.reopenCode || 'reopen');
                const ageText = item.createdAt ? new Date(item.createdAt).toLocaleString() : '-';
                const replyStatus = String(item.replyStatus || 'not_sent');
                const replyCount = Number(item.replyCount || 0);
                const repliedAt = Number(item.repliedAt || 0);
                const replyBadge = replyStatus === 'replied'
                    ? (currentLang === 'en' ? 'Replied' : 'ردّ')
                    : replyStatus === 'pending'
                        ? (currentLang === 'en' ? 'Waiting reply' : 'بانتظار الرد')
                        : (currentLang === 'en' ? 'No bait sent' : 'لم تُرسل البايْت بعد');
                const stateBadge = lifecycleStatus === 'partially_approved'
                    ? (currentLang === 'en' ? 'Partially approved' : 'متحقق جزئياً')
                    : state;
                const replyMeta = repliedAt ? new Date(repliedAt).toLocaleString() : '';
                const requesterData = encodeURIComponent(String(item.requesterId || ''));
                const groupData = encodeURIComponent(String(item.groupId || ''));
                return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:1px dashed var(--card-border);padding:8px 0;">'
                    + '<div style="min-width:0;">'
                    + '<div style="color:var(--text);font-weight:600;">' + (currentLang === 'en' ? 'Phone: ' : 'الرقم: ') + (phoneNumber || (currentLang === 'en' ? 'Not available' : 'غير متوفر')) + '</div>'
                    + '<div style="font-size:10px;color:var(--text-muted);">' + (currentLang === 'en' ? 'WhatsApp ID: ' : 'معرّف واتساب: ') + requesterId + '</div>'
                    + '<div style="font-size:11px;color:var(--text-muted);">' + groupName + ' • ' + stateBadge + ' • ' + flowLabel + (lifecycleStatus === 'partially_approved' ? ' • ' + (currentLang === 'en' ? 'Send ' : 'أرسل ') + reopenCode + (currentLang === 'en' ? ' to reopen' : ' لإعادة الفتح') : '') + '</div>'
                    + '<div style="font-size:11px;color:var(--text-muted);">' + (currentLang === 'en' ? 'Reply log: ' : 'سجل الرد: ') + replyBadge + (replyCount > 0 ? ' • ' + (currentLang === 'en' ? 'Replies: ' : 'عدد الردود: ') + replyCount : '') + (replyMeta ? ' • ' + replyMeta : '') + '</div>'
                    + '<div style="font-size:10px;color:var(--text-muted);">' + ageText + '</div>'
                    + '</div>'
                    + '<button class="btn btn-primary btn-sm pending-secondary-trigger-btn" style="padding:4px 8px; margin-right:4px;" data-requester-id="' + requesterData + '" data-group-id="' + groupData + '">' + (currentLang === 'en' ? 'Resend Verification' : 'إعادة إرسال التحقق') + '</button>'
                    + (lifecycleStatus === 'partially_approved' ? '<button class="btn btn-warning btn-sm pending-secondary-reset-btn" style="padding:4px 8px; margin-right:4px;" data-requester-id="' + requesterData + '" title="' + (currentLang === 'en' ? 'Reset back to keyword bait phase' : 'إعادة إلى مرحلة الكلمة السرية') + '">' + (currentLang === 'en' ? '↺ Reset to Bait' : '↺ إعادة للبداية') + '</button>' : '')
                    + '<button class="btn btn-danger btn-sm pending-secondary-reject-btn" style="padding:4px 8px;" data-requester-id="' + requesterData + '" data-group-id="' + groupData + '">' + (currentLang === 'en' ? 'Reject' : 'رفض') + '</button>'
                    + '</div>';
            }

            function bindPendingSecondaryActionButtons() {
                const triggerBtns = document.querySelectorAll('.pending-secondary-trigger-btn');
                triggerBtns.forEach(btn => {
                    btn.onclick = () => {
                        const requesterId = decodeURIComponent(btn.getAttribute('data-requester-id') || '');
                        const groupId = decodeURIComponent(btn.getAttribute('data-group-id') || '');
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        triggerPendingSecondaryApproval(requesterId, groupId);
                    };
                });
                
                const buttons = document.querySelectorAll('.pending-secondary-reject-btn');
                buttons.forEach(btn => {
                    btn.onclick = () => {
                        const requesterId = decodeURIComponent(btn.getAttribute('data-requester-id') || '');
                        const groupId = decodeURIComponent(btn.getAttribute('data-group-id') || '');
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        removePendingSecondaryApproval(requesterId, groupId);
                    };
                });

                const resetBtns = document.querySelectorAll('.pending-secondary-reset-btn');
                resetBtns.forEach(btn => {
                    btn.onclick = async () => {
                        const requesterId = decodeURIComponent(btn.getAttribute('data-requester-id') || '');
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        try {
                            const r = await fetch('/api/secondary-verification/pending/reset-to-bait', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ requesterId })
                            });
                            if (r.ok) { refreshPendingSecondaryApprovals(); }
                            else { btn.disabled = false; btn.innerHTML = (currentLang === 'en' ? '↺ Reset to Bait' : '↺ إعادة للبداية'); }
                        } catch(e) { btn.disabled = false; btn.innerHTML = (currentLang === 'en' ? '↺ Reset to Bait' : '↺ إعادة للبداية'); }
                    };
                });
            }

            async function refreshPendingSecondaryApprovals() {
                const listEl = document.getElementById('pendingSecondaryList');
                const metaEl = document.getElementById('pendingSecondaryMeta');
                const partialListEl = document.getElementById('partialSecondaryList');
                const partialMetaEl = document.getElementById('partialSecondaryMeta');
                if (!listEl) return;
                try {
                    listEl.innerHTML = (currentLang === 'en' ? 'Loading...' : 'جاري التحميل...');
                    if (partialListEl) partialListEl.innerHTML = (currentLang === 'en' ? 'Loading...' : 'جاري التحميل...');
                    const res = await fetch('/api/secondary-verification/pending');
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        if (res.status === 403) {
                            listEl.innerHTML = '<div style="color:var(--text-muted);">' + (currentLang === 'en' ? 'You do not have permission to view pending approvals.' : 'ليس لديك صلاحية لعرض الطلبات المعلقة.') + '</div>';
                            if (partialListEl) {
                                partialListEl.innerHTML = '<div style="color:var(--text-muted);">' + (currentLang === 'en' ? 'You do not have permission to view this list.' : 'ليس لديك صلاحية لعرض هذه القائمة.') + '</div>';
                            }
                        } else {
                            listEl.innerHTML = '<div style="color:#ffb3b3;">' + (data.error || 'Failed') + '</div>';
                            if (partialListEl) {
                                partialListEl.innerHTML = '<div style="color:#ffb3b3;">' + (data.error || 'Failed') + '</div>';
                            }
                        }
                        return;
                    }
                    const items = Array.isArray(data.pending) ? data.pending : [];
                    const partialItems = items.filter(item => String(item && item.lifecycleStatus || '') === 'partially_approved');
                    const activeItems = items.filter(item => String(item && item.lifecycleStatus || '') !== 'partially_approved');
                    if (metaEl) metaEl.textContent = (currentLang === 'en' ? 'Timeout: ' : 'المهلة: ') + (data.timeoutDays || 2) + (currentLang === 'en' ? ' day(s)' : ' يوم');
                    if (partialMetaEl) {
                        partialMetaEl.textContent = (currentLang === 'en' ? 'Count: ' : 'العدد: ') + partialItems.length;
                    }
                    if (activeItems.length === 0) {
                        listEl.innerHTML = '<div>' + (currentLang === 'en' ? 'No pending approvals.' : 'لا توجد طلبات معلقة.') + '</div>';
                    } else {
                        listEl.innerHTML = activeItems.map(formatPendingVerificationItem).join('');
                    }
                    if (partialListEl) {
                        if (partialItems.length === 0) {
                            partialListEl.innerHTML = '<div>' + (currentLang === 'en' ? 'No partially approved users.' : 'لا يوجد متحققون جزئياً.') + '</div>';
                        } else {
                            partialListEl.innerHTML = partialItems.map(formatPendingVerificationItem).join('');
                        }
                    }
                    bindPendingSecondaryActionButtons();
                } catch (e) {
                    listEl.innerHTML = '<div style="color:#ffb3b3;">' + (e.message || 'Error') + '</div>';
                    if (partialListEl) {
                        partialListEl.innerHTML = '<div style="color:#ffb3b3;">' + (e.message || 'Error') + '</div>';
                    }
                }
            }

            function formatEmailLogItem(item) {
                const requesterId = String(item.requesterId || '').replace(/:[0-9]+/, '').replace('@lid', '@c.us');
                const phoneNumber = requesterId.replace('@c.us', '').replace(/D/g, '') || (currentLang === 'en' ? 'Not available' : 'غير متوفر');
                const email = String(item.email || '');
                const status = String(item.status || '').toLowerCase();
                const statusText = status === 'sent'
                    ? (currentLang === 'en' ? 'Sent' : 'تم الإرسال')
                    : status === 'failed'
                        ? (currentLang === 'en' ? 'Failed' : 'فشل')
                        : (currentLang === 'en' ? 'Pending' : 'معلق');
                const statusColor = status === 'sent' ? '#6ee7a2' : status === 'failed' ? '#ff8f8f' : 'var(--text-muted)';
                const createdAt = Number(item.createdAt || 0);
                const sentAt = Number(item.sentAt || 0);
                const timeText = (sentAt > 0 ? sentAt : createdAt) > 0
                    ? new Date(sentAt > 0 ? sentAt : createdAt).toLocaleString()
                    : '-';
                const errorCode = String(item.errorCode || '').trim();
                const errorMessage = String(item.errorMessage || '').trim();
                const errorLine = errorCode || errorMessage
                    ? '<div style="font-size:10px;color:#ffb3b3;word-break:break-word;">'
                        + (currentLang === 'en' ? 'Error: ' : 'الخطأ: ')
                        + [errorCode, errorMessage].filter(Boolean).join(' • ')
                      + '</div>'
                    : '';

                return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:1px dashed var(--card-border);padding:8px 0;">'
                    + '<div style="min-width:0;">'
                    + '<div style="color:var(--text);font-weight:600;">' + (currentLang === 'en' ? 'Email: ' : 'البريد: ') + (email || '-') + '</div>'
                    + '<div style="font-size:10px;color:var(--text-muted);">' + (currentLang === 'en' ? 'Phone: ' : 'الرقم: ') + phoneNumber + ' • ' + requesterId + '</div>'
                    + '<div style="font-size:11px;color:' + statusColor + ';">' + (currentLang === 'en' ? 'Status: ' : 'الحالة: ') + statusText + '</div>'
                    + errorLine
                    + '<div style="font-size:10px;color:var(--text-muted);">' + timeText + '</div>'
                    + '</div>'
                    + '</div>';
            }

            async function refreshEmailLogs() {
                const listEl = document.getElementById('emailLogList');
                const metaEl = document.getElementById('emailLogMeta');
                if (!listEl) return;
                try {
                    listEl.innerHTML = (currentLang === 'en' ? 'Loading...' : 'جاري التحميل...');
                    const res = await fetch('/api/email-log?limit=100');
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        if (res.status === 403) {
                            listEl.innerHTML = '<div style="color:var(--text-muted);">' + (currentLang === 'en' ? 'You do not have permission to view email logs.' : 'ليس لديك صلاحية لعرض سجل البريد.') + '</div>';
                        } else {
                            listEl.innerHTML = '<div style="color:#ffb3b3;">' + (data.error || 'Failed') + '</div>';
                        }
                        return;
                    }
                    const logs = Array.isArray(data.logs) ? data.logs : [];
                    if (metaEl) {
                        const total = Number(data.total || logs.length || 0);
                        metaEl.textContent = (currentLang === 'en' ? 'Total: ' : 'الإجمالي: ') + total;
                    }
                    if (logs.length === 0) {
                        listEl.innerHTML = '<div>' + (currentLang === 'en' ? 'No email logs yet.' : 'لا توجد سجلات بريد حتى الآن.') + '</div>';
                        return;
                    }
                    listEl.innerHTML = logs.map(formatEmailLogItem).join('');
                } catch (e) {
                    listEl.innerHTML = '<div style="color:#ffb3b3;">' + (e.message || 'Error') + '</div>';
                }
            }

            async function triggerPendingSecondaryApproval(requesterId, groupId) {
                try {
                    const res = await fetch('/api/secondary-verification/pending/trigger', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requesterId, groupId })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (data.success) {
                        showToast(currentLang === 'en' ? 'Triggered successfully!' : 'تم الإرسال بنجاح!', 'success');
                        loadPendingSecondaryApprovals();
                    } else {
                        showToast(data.error || (currentLang === 'en' ? 'Failed to trigger verification' : 'فشل في إرسال التحقق'), 'error');
                        loadPendingSecondaryApprovals();
                    }
                } catch (e) {
                    showToast(currentLang === 'en' ? 'Failed to trigger verification' : 'فشل في إرسال التحقق', 'error');
                    loadPendingSecondaryApprovals();
                }
            }

            async function removePendingSecondaryApproval(requesterId, groupId) {
                try {
                    const res = await fetch('/api/secondary-verification/pending/remove', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requesterId, groupId })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        showToast((currentLang === 'en' ? '❌ Remove failed: ' : '❌ فشل الحذف: ') + (data.error || 'Unknown error'));
                        return;
                    }
                    showToast(currentLang === 'en' ? '✅ Removed from pending list' : '✅ تم الحذف من قائمة المعلق');
                    refreshPendingSecondaryApprovals();
                } catch (e) {
                    showToast((currentLang === 'en' ? '❌ Remove failed: ' : '❌ فشل الحذف: ') + (e.message || 'Network error'));
                }
            }

            async function rejectAllPendingSecondaryApprovals() {
                const confirmText = currentLang === 'en'
                    ? 'Reject all pending verification requests now?'
                    : 'هل تريد رفض جميع طلبات التحقق المعلقة الآن؟';
                if (!await showConfirmModal(confirmText)) return;

                try {
                    const res = await fetch('/api/secondary-verification/pending/reject-all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        showToast((currentLang === 'en' ? '❌ Reject all failed: ' : '❌ فشل رفض الكل: ') + (data.error || 'Unknown error'));
                        return;
                    }

                    const removed = Number(data.removed || 0);
                    if (removed > 0) {
                        showToast((currentLang === 'en' ? '✅ Rejected pending requests: ' : '✅ تم رفض الطلبات المعلقة: ') + removed);
                    } else {
                        showToast(currentLang === 'en' ? 'ℹ️ No pending approvals to reject' : 'ℹ️ لا توجد طلبات معلقة لرفضها');
                    }
                    refreshPendingSecondaryApprovals();
                } catch (e) {
                    showToast((currentLang === 'en' ? '❌ Reject all failed: ' : '❌ فشل رفض الكل: ') + (e.message || 'Network error'));
                }
            }

            async function stopVerificationProcessByCode() {
                const numberEl = document.getElementById('stopVerificationNumber');
                const number = numberEl ? (numberEl.value || '').trim() : '';
                if (!number) {
                    showToast(currentLang === 'en' ? '⚠️ Enter user number' : '⚠️ أدخل رقم المستخدم');
                    return;
                }
                try {
                    const res = await fetch('/api/secondary-verification/stop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        showToast((currentLang === 'en' ? '❌ Stop failed: ' : '❌ فشل الإيقاف: ') + (data.error || 'Unknown error'));
                        return;
                    }
                    showToast(currentLang === 'en' ? '✅ Process stopped and request rejected' : '✅ تم إيقاف العملية ورفض الطلب');
                    if (numberEl) numberEl.value = '';
                    refreshPendingSecondaryApprovals();
                } catch (e) {
                    showToast((currentLang === 'en' ? '❌ Stop failed: ' : '❌ فشل الإيقاف: ') + (e.message || 'Network error'));
                }
            }

            async function addBlacklistNumber() {
                const input = document.getElementById('newBlacklistNumber');
                let justNumbers = input.value.replace(/\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!blacklistArr.includes(finalId)) {
                        blacklistArr.push(finalId);
                        renderBlacklist(); 
                        try {
                            await fetch('/api/blacklist/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function addBlockedExtension() {
                const input = document.getElementById('newBlockedExtension');
                let justNumbers = input.value.replace(/\D/g, '');
                if (justNumbers) {
                    if (!blockedExtensionsArr.includes(justNumbers)) {
                        blockedExtensionsArr.push(justNumbers);
                        renderBlockedExtensions();
                        try {
                            await fetch('/api/extensions/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ext: justNumbers}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function removeBlockedExtension(index) {
                const extToRemove = blockedExtensionsArr[index];
                blockedExtensionsArr.splice(index, 1);
                renderBlockedExtensions();
                try {
                    await fetch('/api/extensions/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ext: extToRemove}) });
                } catch(e) {}
            }

            async function addWhitelistNumber() {
                const input = document.getElementById('newWhitelistNumber');
                let justNumbers = input.value.replace(/\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!whitelistArr.includes(finalId)) {
                        whitelistArr.push(finalId);
                        renderWhitelist(); 
                        try {
                            await fetch('/api/whitelist/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function removeBlacklistNumber(index) {
                const numberToRemove = blacklistArr[index];
                blacklistArr.splice(index, 1);
                renderBlacklist();
                try {
                    await fetch('/api/blacklist/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function removeWhitelistNumber(index) {
                const numberToRemove = whitelistArr[index];
                whitelistArr.splice(index, 1);
                renderWhitelist();
                try {
                    await fetch('/api/whitelist/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function addApprovedNumber() {
                const input = document.getElementById('newApprovedNumber');
                let justNumbers = input.value.replace(/D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!approvedArr.includes(finalId)) {
                        approvedArr.push(finalId);
                        renderApproved();
                        try {
                            await fetch('/api/approved/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function extractApprovedNumbersFromGroups(btn) {
                const selectedCheckboxes = Array.from(document.querySelectorAll('.extract-group-cb:checked'));
                if (selectedCheckboxes.length === 0) {
                    return alert("الرجاء اختيار مجموعة واحدة على الأقل.");
                }
                
                const groupIds = selectedCheckboxes.map(cb => cb.value);
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/approved/extract-groups', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ groupIds })
                    });
                    const data = await res.json();
                    
                    if (!res.ok) {
                        throw new Error(data.error || 'Request failed');
                    }
                    alert(data.message);
                    location.reload();
                } catch(e) {
                    alert(e.message);
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                }
            }

            async function removeApprovedNumber(index) {
                const numberToRemove = approvedArr[index];
                approvedArr.splice(index, 1);
                renderApproved();
                try {
                    await fetch('/api/approved/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function purgeBlacklisted() {
                if(!await showConfirmModal(dict.purge_warn.replace(/<[^>]*>?/gm, ''))) return;
                const btn = document.getElementById('purgeBtn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = dict.purging;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/blacklist/purge', { method: 'POST' });
                    const data = await res.json();
                    if(data.error) showToast('Error: ' + data.error);
                    else showToast('Success: ' + data.message);
                } catch(e) {
                    showToast(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }

            async function loadScheduleSettings() {
                try {
                    const res = await fetch('/api/schedules', { cache: 'no-store' });
                    if (!res.ok) return;
                    const data = await res.json();

                    const autoToggle = document.getElementById('autoPurgeScheduleEnabled');
                    const autoInterval = document.getElementById('autoPurgeIntervalMinutes');
                    const adminToggle = document.getElementById('adminWhitelistSyncEnabled');
                    const adminInterval = document.getElementById('adminWhitelistSyncIntervalMinutes');

                    if (autoToggle) autoToggle.checked = Boolean(data.autoPurgeScheduleEnabled);
                    if (autoInterval) autoInterval.value = Math.max(1, parseInt(data.autoPurgeIntervalMinutes, 10) || 60);
                    if (adminToggle) adminToggle.checked = Boolean(data.adminWhitelistSyncEnabled);
                    if (adminInterval) adminInterval.value = Math.max(1, parseInt(data.adminWhitelistSyncIntervalMinutes, 10) || 60);
                } catch (e) {
                    showToast(dict.schedule_load_fail);
                }
            }

            async function saveScheduleSettings() {
                const autoToggle = document.getElementById('autoPurgeScheduleEnabled');
                const autoInterval = document.getElementById('autoPurgeIntervalMinutes');
                const adminToggle = document.getElementById('adminWhitelistSyncEnabled');
                const adminInterval = document.getElementById('adminWhitelistSyncIntervalMinutes');

                const payload = {
                    autoPurgeScheduleEnabled: autoToggle ? autoToggle.checked : false,
                    autoPurgeIntervalMinutes: Math.max(1, parseInt(autoInterval ? autoInterval.value : '60', 10) || 60),
                    adminWhitelistSyncEnabled: adminToggle ? adminToggle.checked : false,
                    adminWhitelistSyncIntervalMinutes: Math.max(1, parseInt(adminInterval ? adminInterval.value : '60', 10) || 60)
                };

                const res = await fetch('/api/schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }

                await loadScheduleSettings();
            }

            async function saveAutoPurgeSchedule() {
                const btn = document.getElementById('saveAutoPurgeScheduleBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.saving_schedule;
                btn.disabled = true;
                try {
                    await saveScheduleSettings();
                    showToast(dict.schedule_saved);
                } catch (e) {
                    showToast('❌ ' + (e.message || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            async function saveAdminWhitelistSyncSchedule() {
                const btn = document.getElementById('saveAdminWhitelistSyncScheduleBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.saving_schedule;
                btn.disabled = true;
                try {
                    await saveScheduleSettings();
                    showToast(dict.schedule_saved);
                } catch (e) {
                    showToast('❌ ' + (e.message || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            async function runAutoPurgeNow() {
                const btn = document.getElementById('runAutoPurgeScheduleBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.running_sync;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/blacklist/purge', { method: 'POST' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        showToast('❌ ' + (data.error || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                    } else {
                        showToast('✅ ' + (data.message || 'OK'));
                    }
                } catch (e) {
                    showToast(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            async function runAdminWhitelistSyncNow() {
                const btn = document.getElementById('runAdminWhitelistSyncBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.running_sync;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/whitelist/sync-admins', { method: 'POST' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        showToast('❌ ' + (data.error || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                    } else {
                        showToast(data.message || dict.sync_success);
                        if (Array.isArray(data.whitelist)) {
                            whitelistArr = data.whitelist;
                            renderWhitelist();
                        }
                    }
                } catch (e) {
                    showToast(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            function renderCustomMessages() {
                const container = document.getElementById('customMessagesContainer');
                if (!container) return;
                container.innerHTML = '';
                customMessagesArr.forEach((msg, index) => {
                    const safeMsg = umEscapeHtml(msg);
                    container.innerHTML += '<div class="chip" title="' + safeMsg + '" style="cursor:default; display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; width: 100%;"><span style="flex:1; white-space:pre-wrap; word-break:break-word; margin-inline-end: 10px; line-height: 1.4;">' + safeMsg + '</span> <span class="chip-remove" style="padding:4px; font-size:18px;" onclick="removeCustomMessage(' + index + ')">&times;</span></div>';
                });
            }

            function addCustomMessage() {
                const input = document.getElementById('newCustomMessage');
                if (!input) return;
                const msg = input.value.trim();
                if (msg && !customMessagesArr.includes(msg)) {
                    customMessagesArr.push(msg);
                    input.value = '';
                    renderCustomMessages();
                }
            }

            function removeCustomMessage(index) {
                customMessagesArr.splice(index, 1);
                renderCustomMessages();
            }

            function renderApprovalWords() {
                const container = document.getElementById('approvalWordsContainer');
                container.innerHTML = '';
                approvalWordsArr.forEach((word, index) => {
                    container.innerHTML += '<div class="chip">' + word + ' <span class="chip-remove" onclick="removeApprovalWord(' + index + ')">&times;</span></div>';
                });
            }
            function addApprovalWord() {
                const input = document.getElementById('newApprovalWord');
                const word = input.value.trim();
                if (word && !approvalWordsArr.includes(word)) {
                    approvalWordsArr.push(word);
                    input.value = '';
                    renderApprovalWords();
                }
            }
            function removeApprovalWord(index) {
                approvalWordsArr.splice(index, 1);
                renderApprovalWords();
            }

            function renderBanWords() {
                const container = document.getElementById('banWordsContainer');
                container.innerHTML = '';
                banWordsArr.forEach((word, index) => {
                    container.innerHTML += '<div class="chip">' + word + ' <span class="chip-remove" onclick="removeBanWord(' + index + ')">&times;</span></div>';
                });
            }
            function addBanWord() {
                const input = document.getElementById('newBanWord');
                const word = input.value.trim();
                if (word && !banWordsArr.includes(word)) {
                    banWordsArr.push(word);
                    input.value = '';
                    renderBanWords();
                }
            }
            function removeBanWord(index) {
                banWordsArr.splice(index, 1);
                renderBanWords();
            }

            function renderDefaultWords() {
                const container = document.getElementById('defaultWordsContainer');
                container.innerHTML = '';
                defaultWordsArr.forEach((word, index) => {
                    container.innerHTML += `<div class="chip">${word} <span class="chip-remove" onclick="removeDefaultWord(${index})">&times;</span></div>`;
                });
            }
            function addDefaultWord() {
                const input = document.getElementById('newDefaultWord');
                const word = input.value.trim();
                if (word && !defaultWordsArr.includes(word)) {
                    defaultWordsArr.push(word);
                    input.value = '';
                    renderApprovalWords();
            renderBanWords();
            renderDefaultWords();
                }
            }
            function removeDefaultWord(index) {
                defaultWordsArr.splice(index, 1);
                renderDefaultWords();
            }

            function renderAITriggerWords() {
                const container = document.getElementById('aiTriggerWordsContainer');
                container.innerHTML = '';
                aiFilterTriggerWordsArr.forEach((word, index) => {
                    const chip = document.createElement('div');
                    chip.className = 'chip';
                    chip.textContent = word + ' ';
                    const removeBtn = document.createElement('span');
                    removeBtn.className = 'chip-remove';
                    removeBtn.textContent = '×';
                    removeBtn.onclick = () => removeAITriggerWord(index);
                    chip.appendChild(removeBtn);
                    container.appendChild(chip);
                });
            }

            function addAITriggerWord() {
                const input = document.getElementById('newAITriggerWord');
                const word = input.value.trim();
                if (word && !aiFilterTriggerWordsArr.includes(word)) {
                    aiFilterTriggerWordsArr.push(word);
                    input.value = '';
                    renderAITriggerWords();
                }
            }

            function removeAITriggerWord(index) {
                aiFilterTriggerWordsArr.splice(index, 1);
                renderAITriggerWords();
            }

            function renderGlobalQAQuestionsDraft() {
                const container = document.getElementById('globalQAQuestionsContainer');
                if (!container) return;
                if (!globalQAQuestionsDraft.length) {
                    container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">' +
                        (currentLang === 'en' ? 'No question variants added yet.' : 'لم يتم إضافة صيغ أسئلة بعد.') +
                        '</div>';
                    return;
                }
                container.innerHTML = globalQAQuestionsDraft.map((q, idx) =>
                    '<div class="chip">' + q + ' <span class="chip-remove" onclick="removeGlobalQAQuestion(' + idx + ')">&times;</span></div>'
                ).join('');
            }

            function addGlobalQAQuestion() {
                const input = document.getElementById('globalQAQuestionInput');
                if (!input) return;
                const q = String(input.value || '').trim().toLowerCase();
                if (!q) return;
                if (!globalQAQuestionsDraft.includes(q)) globalQAQuestionsDraft.push(q);
                input.value = '';
                renderGlobalQAQuestionsDraft();
            }

            function removeGlobalQAQuestion(index) {
                globalQAQuestionsDraft.splice(index, 1);
                renderGlobalQAQuestionsDraft();
            }

            function renderGlobalQAEventDatesForm() {
                const container = document.getElementById('globalQAEventDatesContainer');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                if (!container) return;
                container.innerHTML = (globalQAEventDatesDraft || []).map(function(ed, edIdx) {
                    return '<div class="field-row" style="margin-bottom:10px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); align-items: flex-end; gap: 12px;">' +
                        '<div class="field-group" style="margin-bottom:0; flex: 1.5;">' +
                            '<label class="field-label" style="font-size:10px;">' + (currentLang === 'en' ? 'Label (e.g. Exam)' : 'العنوان (مثل: اختبار)') + '</label>' +
                            '<input type="text" value="' + (ed.label || '') + '" placeholder="..." onchange="updateGlobalQAEventDate(' + edIdx + ', \'label\', this.value)">' +
                        '</div>' +
                        '<div class="field-group" style="margin-bottom:0; flex: 1.5;">' +
                            '<label class="field-label" style="font-size:10px;">' + (currentLang === 'en' ? 'Date' : 'التاريخ') + '</label>' +
                            '<input type="date" value="' + (ed.date || '') + '" onchange="updateGlobalQAEventDate(' + edIdx + ', \'date\', this.value)" style="color-scheme: dark;">' +
                        '</div>' +
                        '<button type="button" class="icon-btn" onclick="removeGlobalQAEventDate(' + edIdx + ')" style="border-color:rgba(255,82,82,0.3);color:var(--red);" title="' + (currentLang === 'en' ? 'Delete event' : 'حذف الحدث') + '"><i class="fas fa-trash"></i></button>' +
                    '</div>';
                }).join('');
                if (!globalQAEventDatesDraft.length) {
                    container.innerHTML += '<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center; border: 1px dashed var(--card-border); border-radius: 8px;">' + (currentLang === 'en' ? 'No extra events added yet.' : 'لم يتم إضافة أحداث إضافية بعد.') + '</div>';
                }
                if (legacyInput) legacyInput.value = globalQALegacyEventDate || '';
                if (langInput) langInput.value = globalQALanguage || 'ar';
            }

            function addGlobalQAEventDate() {
                globalQAEventDatesDraft.push({ label: '', date: '' });
                renderGlobalQAEventDatesForm();
            }

            function removeGlobalQAEventDate(index) {
                globalQAEventDatesDraft.splice(index, 1);
                renderGlobalQAEventDatesForm();
            }

            function updateGlobalQAEventDate(index, field, value) {
                if (!globalQAEventDatesDraft[index]) return;
                globalQAEventDatesDraft[index][field] = value;
            }

            function updateGlobalQACurrentAnswer(value) {
                globalQACurrentAnswer = String(value || '');
            }

            function setGlobalQAMediaSelection(mediaFile) {
                globalQAPendingMediaFile = mediaFile || '';
                const indicator = document.getElementById('globalQA_media_selected');
                const nameEl = document.getElementById('globalQA_media_selected_name');
                if (!indicator || !nameEl) return;
                if (globalQAPendingMediaFile) {
                    indicator.style.display = 'flex';
                    nameEl.textContent = '📎 ' + globalQAPendingMediaFile;
                } else {
                    indicator.style.display = 'none';
                    nameEl.textContent = '';
                }
            }

            function loadGlobalQAMedia() {
                fetch('/api/media/list/global-qa')
                    .then(r => r.json())
                    .then(files => renderGlobalQAMediaGrid(files))
                    .catch(() => {});
            }

            function renderGlobalQAMediaGrid(files) {
                const grid = document.getElementById('globalQA_media_grid');
                if (!grid) return;
                if (!files || files.length === 0) {
                    grid.innerHTML = '<p style="font-size:12px;color:var(--text-muted);grid-column:1/-1;">' + (currentLang === 'en' ? 'No files uploaded yet.' : 'لا توجد ملفات محملة بعد.') + '</p>';
                    return;
                }
                const imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
                grid.innerHTML = files.map(function(f) {
                    const ext = f.name.split('.').pop().toLowerCase();
                    let preview;
                    if (imgExts.includes(ext)) {
                        preview = '<img src="/media/global-qa/' + encodeURIComponent(f.name) + '" style="width:100%;height:72px;object-fit:cover;border-radius:6px 6px 0 0;">';
                    } else {
                        const icons = { mp4:'fa-film', mov:'fa-film', webm:'fa-film', mkv:'fa-film', mp3:'fa-music', ogg:'fa-music', wav:'fa-music', pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', zip:'fa-file-archive', rar:'fa-file-archive' };
                        const icon = icons[ext] || 'fa-file';
                        preview = '<div style="width:100%;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:6px 6px 0 0;"><i class="fas ' + icon + '" style="font-size:28px;color:var(--text-muted);"></i></div>';
                    }
                    const kb = (f.size/1024).toFixed(1);
                    const isSelected = globalQAPendingMediaFile === f.name;
                    return '<div style="background:var(--card-bg);border:1.5px solid ' + (isSelected ? '#64dc96' : 'var(--card-border)') + ';border-radius:8px;overflow:hidden;">' +
                        preview +
                        '<div style="padding:6px 8px;">' +
                            '<div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + f.name + '">' + f.name + '</div>' +
                            '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">' + kb + ' KB</div>' +
                            '<div style="display:flex;gap:4px;">' +
                                '<button type="button" onclick="selectGlobalQAMedia(\'' + f.name + '\')" style="flex:1;font-size:11px;padding:4px;background:' + (isSelected ? 'rgba(100,220,150,0.15)' : 'var(--input-bg)') + ';color:' + (isSelected ? '#64dc96' : 'var(--text-muted)') + ';border:1px solid ' + (isSelected ? 'rgba(100,220,150,0.4)' : 'var(--card-border)') + ';border-radius:5px;cursor:pointer;">' +
                                    '<i class="fas ' + (isSelected ? 'fa-check' : 'fa-link') + '"></i> ' + (isSelected ? (currentLang === 'en' ? 'Selected' : 'محدد') : (currentLang === 'en' ? 'Select' : 'اختر')) +
                                '</button>' +
                                '<button type="button" onclick="deleteGlobalQAMedia(\'' + f.name + '\')" style="padding:4px 6px;background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.3);border-radius:5px;cursor:pointer;font-size:11px;">' +
                                    '<i class="fas fa-trash"></i>' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }).join('');
            }

            function uploadGlobalQAMedia(input) {
                const file = input.files[0];
                if (!file) return;
                const statusEl = document.getElementById('globalQA_upload_status');
                statusEl.style.display = 'block';
                statusEl.textContent = currentLang==='en' ? '⏳ Uploading...' : '⏳ جاري الرفع...';
                const fd = new FormData();
                fd.append('file', file);
                fetch('/api/media/upload/global-qa', { method:'POST', body:fd })
                    .then(r => r.json())
                    .then(data => {
                        statusEl.textContent = currentLang==='en' ? '✅ Uploaded: ' + data.filename : '✅ تم الرفع: ' + data.filename;
                        setTimeout(() => { statusEl.style.display='none'; }, 3000);
                        loadGlobalQAMedia();
                        input.value = '';
                    })
                    .catch(() => { statusEl.textContent = currentLang==='en' ? '❌ Upload failed' : '❌ فشل الرفع'; });
            }

            function selectGlobalQAMedia(filename) {
                const wasSelected = globalQAPendingMediaFile === filename;
                setGlobalQAMediaSelection(wasSelected ? '' : filename);
                loadGlobalQAMedia();
            }

            function clearGlobalQAMedia() {
                setGlobalQAMediaSelection('');
                loadGlobalQAMedia();
            }

            function deleteGlobalQAMedia(filename) {
                if (!window.confirm(currentLang === 'en' ? 'Delete ' + filename + '?' : 'حذف ' + filename + '؟')) return;
                fetch('/api/media/delete/global-qa/' + encodeURIComponent(filename), { method:'DELETE' })
                    .then(() => {
                        if (globalQAPendingMediaFile === filename) clearGlobalQAMedia();
                        loadGlobalQAMedia();
                    });
            }

            function renderGlobalQAList() {
                const list = document.getElementById('globalQAList');
                if (!list) return;
                if (!Array.isArray(globalQAArr) || globalQAArr.length === 0) {
                    list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:10px;border:1px dashed var(--card-border);border-radius:8px;">' +
                        (currentLang === 'en' ? 'No global Q&A entries yet.' : 'لا توجد أزواج Q&A عامة بعد.') +
                        '</div>';
                    return;
                }

                list.innerHTML = globalQAArr.map((qa, idx) => {
                    const questions = Array.isArray(qa.questions) ? qa.questions : (qa.question ? [qa.question] : []);
                    const answer = String(qa.answer || '');
                    const eventDates = Array.isArray(qa.eventDates) ? qa.eventDates : [];
                    return '<div class="group-card" style="margin-bottom:10px;">' +
                        '<div class="group-card-header" style="padding:12px;">' +
                        '<div class="group-card-title" style="font-size:13px;">' +
                        '<i class="fas fa-bolt" style="color:var(--accent);"></i> ' +
                        (currentLang === 'en' ? 'Triggers' : 'المحفزات') + ' (' + questions.length + ')' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;">' +
                        '<button type="button" class="icon-btn" onclick="copyGlobalQA(' + idx + ')" style="background:rgba(255,160,0,0.1);color:#ffa000;border-color:rgba(255,160,0,0.3);" title="' + (currentLang==='en'?'Copy':'نسخ') + '"><i class="fas fa-copy"></i></button>' +
                        '<button type="button" class="icon-btn" onclick="editGlobalQA(' + idx + ')" style="background:rgba(64,196,255,0.1);color:var(--blue);border-color:rgba(64,196,255,0.3);" title="' + (currentLang==='en'?'Edit':'تعديل') + '"><i class="fas fa-pen"></i></button>' +
                        '<button type="button" class="icon-btn" onclick="removeGlobalQA(' + idx + ')" style="background:rgba(255,82,82,0.1);color:var(--red);border-color:rgba(255,82,82,0.3);" title="' + (currentLang==='en'?'Delete':'حذف') + '"><i class="fas fa-trash"></i></button>' +
                        '</div>' +
                        '</div>' +
                        '<div class="group-card-body" style="padding:14px; flex:1; display:flex; flex-direction:column;">' +
                        '<div style="margin-bottom:12px;">' +
                        '<div class="chip-container" style="gap:4px; max-height:60px; overflow-y:auto; padding-right:4px;">' +
                        questions.map(q => '<div class="chip" style="background:var(--input-bg); color:var(--text); border:1px solid var(--card-border); font-size:11px; padding:2px 8px;"><i class="fas fa-search" style="color:var(--text-muted); font-size:10px;"></i> ' + q + '</div>').join('') +
                        '</div>' +
                        '</div>' +
                        '<div style="color:var(--text-muted); font-size:13px; line-height:1.5; flex:1; background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border-left:3px solid var(--card-border);">' +
                        ((answer.substring(0, 150) + (answer && answer.length > 150 ? '...' : '')) || '<em style="opacity:0.5;">(empty)</em>') +
                        '</div>' +
                        (qa.mediaFile ? '<div style="margin-top:12px;display:flex;align-items:center;gap:6px;font-size:11px;color:#64dc96; background:rgba(100,220,150,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(100,220,150,0.3);"><i class="fas fa-paperclip"></i> ' + qa.mediaFile + '</div>' : '') +
                        (eventDates.length > 0 ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--blue); background:rgba(64,196,255,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(64,196,255,0.3);"><i class="fas fa-calendar-alt"></i> ' + eventDates.length + ' ' + (currentLang==='en'?'Event(s)':'حدث/أحداث') + '</div>' : '') +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            function resetGlobalQAForm() {
                globalQAEditingIndex = null;
                globalQAQuestionsDraft = [];
                globalQAEventDatesDraft = [];
                globalQALegacyEventDate = '';
                globalQACurrentAnswer = '';
                globalQAPendingMediaFile = '';
                globalQALanguage = 'ar';
                const answerEl = document.getElementById('globalQAAnswerInput');
                const saveBtn = document.getElementById('saveGlobalQABtn');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                if (answerEl) answerEl.value = '';
                if (legacyInput) legacyInput.value = '';
                if (langInput) langInput.value = 'ar';
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> ' + (currentLang === 'en' ? 'Save Q&A Pair' : 'حفظ زوج س و ج');
                    saveBtn.style.background = 'var(--accent-dim)';
                    saveBtn.style.color = 'var(--accent)';
                }
                setGlobalQAMediaSelection('');
                renderGlobalQAQuestionsDraft();
                renderGlobalQAEventDatesForm();
            }

            function editGlobalQA(index) {
                const qa = globalQAArr[index];
                if (!qa) return;
                globalQAEditingIndex = index;
                globalQAQuestionsDraft = Array.isArray(qa.questions) ? [...qa.questions] : (qa.question ? [qa.question] : []);
                globalQAEventDatesDraft = JSON.parse(JSON.stringify(qa.eventDates || []));
                globalQALegacyEventDate = qa.eventDate || '';
                globalQACurrentAnswer = qa.answer || '';
                globalQAPendingMediaFile = qa.mediaFile || '';
                globalQALanguage = qa.qaLanguage || 'ar';
                const answerEl = document.getElementById('globalQAAnswerInput');
                const saveBtn = document.getElementById('saveGlobalQABtn');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                if (answerEl) answerEl.value = qa.answer || '';
                if (legacyInput) legacyInput.value = globalQALegacyEventDate;
                if (langInput) langInput.value = globalQALanguage;
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> ' + (currentLang === 'en' ? 'Update Q&A Pair' : 'تحديث زوج س و ج');
                    saveBtn.style.background = 'var(--orange)';
                    saveBtn.style.color = '#000';
                }
                setGlobalQAMediaSelection(globalQAPendingMediaFile);
                renderGlobalQAQuestionsDraft();
                renderGlobalQAEventDatesForm();
                loadGlobalQAMedia();
            }

            function copyGlobalQA(index) {
                const qa = globalQAArr[index];
                if (!qa) return;
                localStorage.setItem('wa_bot_qa_clipboard', JSON.stringify({ qa: qa, sourceGroupId: 'global-qa' }));
                showToast(currentLang === 'en' ? 'Q&A copied!' : 'تم نسخ سؤال وجواب!');
            }

            async function pasteGlobalQA() {
                const clipDataStr = localStorage.getItem('wa_bot_qa_clipboard');
                if (!clipDataStr) {
                    showToast(currentLang === 'en' ? 'Nothing in clipboard.' : 'لا يوجد شيء في الحافظة.');
                    return;
                }
                const clipData = JSON.parse(clipDataStr);
                let qa = JSON.parse(JSON.stringify(clipData.qa));
                if (qa.mediaFile && clipData.sourceGroupId && clipData.sourceGroupId !== 'global-qa') {
                    try { await fetch('/api/media/copy/' + encodeURIComponent(clipData.sourceGroupId) + '/global-qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: qa.mediaFile }) }); } catch(e){}
                }
                if (!Array.isArray(globalQAArr)) globalQAArr = [];
                globalQAArr.push(qa);
                renderGlobalQAList();
                loadGlobalQAMedia();
                showToast(currentLang === 'en' ? 'Q&A pasted!' : 'تم لصق سؤال وجواب!');
            }

            function removeGlobalQA(index) {
                if (!Array.isArray(globalQAArr)) return;
                globalQAArr.splice(index, 1);
                if (globalQAEditingIndex === index) resetGlobalQAForm();
                if (globalQAEditingIndex !== null && globalQAEditingIndex > index) globalQAEditingIndex -= 1;
                renderGlobalQAList();
            }

            function saveGlobalQA() {
                const answerEl = document.getElementById('globalQAAnswerInput');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                const answer = String(answerEl ? answerEl.value : '').trim();
                globalQALegacyEventDate = legacyInput ? legacyInput.value : globalQALegacyEventDate;
                globalQALanguage = langInput ? (langInput.value === 'en' ? 'en' : 'ar') : 'ar';
                globalQACurrentAnswer = answer;

                if (!globalQAQuestionsDraft.length || (!answer && !globalQAPendingMediaFile)) {
                    showToast(currentLang === 'en' ? 'Please add question variants and answer first' : 'يرجى إضافة صيغ السؤال والإجابة أولاً');
                    return;
                }

                const entry = {
                    questions: [...globalQAQuestionsDraft],
                    answer: answer,
                    eventDates: JSON.parse(JSON.stringify(globalQAEventDatesDraft || [])),
                    eventDate: globalQALegacyEventDate,
                    qaLanguage: globalQALanguage
                };
                if (globalQAPendingMediaFile) entry.mediaFile = globalQAPendingMediaFile;

                if (globalQAEditingIndex !== null && globalQAEditingIndex >= 0 && globalQAEditingIndex < globalQAArr.length) {
                    globalQAArr[globalQAEditingIndex] = entry;
                } else {
                    globalQAArr.push(entry);
                }

                resetGlobalQAForm();
                renderGlobalQAList();
            }

            function toggleGroupPanel(groupIndex, type, enabled) {
                const panelMap = { spam: 'spam', welcome: 'welcome', words: 'words', qa: 'qa', panic: 'panic', blacklist: 'blacklist', whitelist: 'whitelist' };
                const fieldMap = { spam: 'enableAntiSpam', welcome: 'enableWelcomeMessage', words: 'enableWordFilter', qa: 'enableQAFeature', panic: 'enablePanicMode', blacklist: 'enableBlacklist', whitelist: 'enableWhitelist' };
                const maxHeightMap = { spam: '600px', welcome: '200px', words: '600px', qa: '600px', panic: '800px', blacklist: '600px', whitelist: '600px' };

                if (groupIndex !== 'global') {
                    groupsArr[groupIndex][fieldMap[type]] = enabled;
                }

                const panel = document.getElementById(`group_${panelMap[type]}_panel_${groupIndex}`);
                const toggle = panel ? panel.previousElementSibling : null;
                if (!panel) return;

                if (enabled) {
                    panel.style.maxHeight = maxHeightMap[type];
                    panel.style.opacity = '1';
                    panel.style.marginTop = '20px';
                    panel.style.overflowY = 'auto';
                    if (toggle) toggle.style.borderRadius = '10px 10px 0 0';
                } else {
                    panel.style.maxHeight = '0px';
                    panel.style.opacity = '0';
                    panel.style.marginTop = '0px';
                    panel.style.overflowY = 'hidden';
                    if (toggle) toggle.style.borderRadius = '10px';
                }
            }

            function addGroup() {
                groupsArr.push({ 
                    id: '', adminGroup: '', words: [], useDefaultWords: true, 
                    aiFilterTriggerWords: [],
                    enableJoinProfileScreening: false,
                    adminLanguage: 'default',
                    enableWordFilter: true, enableAIFilter: false, enableAIMedia: false, 
                    autoAction: false, enableBlacklist: true, enableWhitelist: true,
                    useGlobalBlacklist: true, useGlobalWhitelist: true,
                    customBlacklist: [], customWhitelist: [],
                    enableAntiSpam: false, spamDuplicateLimit: 3, spamAction: 'poll',
                    enableWelcomeMessage: false, welcomeMessageText: 'مرحباً بك يا {user} في مجموعتنا!',
                    blockedTypes: [], blockedAction: 'delete', 
                    spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                    spamLimits: {text:7, image:3, video:2, audio:3, document:3, sticker:3},
                    enablePanicMode: false, panicMessageLimit: 10, panicTimeWindow: 5, panicLockoutDuration: 10, panicAlertTarget: 'both', panicAlertMessage: '🚨 عذراً، تم رصد هجوم (Raid)! سيتم إغلاق المجموعة لمدة {time} دقائق.',
                    useGlobalQA: false,
                    enableQAFeature: false, qaList: [], eventDate: '', eventDates: [], qaLanguage: 'ar', currentQAQuestions: [], currentQAAnswer: '', editingQAIndex: null
                });
                openGroupDetail(groupsArr.length - 1);
            }

            async function removeGroup(index) {
                if(await showConfirmModal(dict.delete_confirm.replace(/<[^>]*>?/gm, ''))) {
                    groupsArr.splice(index, 1);
                    closeGroupDetail();
                }
            }

            function updateGroupData(index, field, value) {
                groupsArr[index][field] = value;
                if (field === 'id' && index === currentDetailIndex) {
                    const knownGroup = fetchedGroups.find(g => g.id === value);
                    const groupName = knownGroup ? knownGroup.name : (value || dict.no_id);
                    const initials = groupName.replace(/[^؀-ۿa-zA-Z]/g, '').slice(0, 2) || '؟';
                    document.getElementById('detailGroupName').textContent = groupName;
                    document.getElementById('detailGroupId').textContent = value || dict.no_id;
                    document.getElementById('detailGroupAvatar').textContent = initials;
                }
            }
            function updateGroupToggle(index, field, isChecked) { groupsArr[index][field] = isChecked; }

            function addGroupWord(groupIndex) {
                const input = document.getElementById(`newGroupWord_${groupIndex}`);
                const word = input.value.trim();
                if (word && !groupsArr[groupIndex].words.includes(word)) {
                    groupsArr[groupIndex].words.push(word);
                    input.value = '';
                    renderGroupChips(groupIndex, 'words');
                }
            }
            function removeGroupWord(groupIndex, wordIndex) {
                groupsArr[groupIndex].words.splice(wordIndex, 1);
                renderGroupChips(groupIndex, 'words');
            }

            function addGroupAITriggerWord(groupIndex) {
                const input = document.getElementById(`newGroupAITriggerWord_${groupIndex}`);
                const word = input.value.trim();
                if (!word) return;
                if (!Array.isArray(groupsArr[groupIndex].aiFilterTriggerWords)) groupsArr[groupIndex].aiFilterTriggerWords = [];
                if (!groupsArr[groupIndex].aiFilterTriggerWords.includes(word)) {
                    groupsArr[groupIndex].aiFilterTriggerWords.push(word);
                    input.value = '';
                    renderGroupAITriggerWords(groupIndex);
                }
            }

            function removeGroupAITriggerWord(groupIndex, wordIndex) {
                if (!Array.isArray(groupsArr[groupIndex].aiFilterTriggerWords)) return;
                groupsArr[groupIndex].aiFilterTriggerWords.splice(wordIndex, 1);
                renderGroupAITriggerWords(groupIndex);
            }

            function renderGroupAITriggerWords(groupIndex) {
                const container = document.getElementById(`chip_container_ai_words_${groupIndex}`);
                if (!container) return;
                const words = Array.isArray(groupsArr[groupIndex].aiFilterTriggerWords) ? groupsArr[groupIndex].aiFilterTriggerWords : [];
                container.innerHTML = words.map((word, idx) =>
                    `<div class="chip">${word} <span class="chip-remove" onclick="removeGroupAITriggerWord(${groupIndex}, ${idx})">&times;</span></div>`
                ).join('');
            }

            function addQuestionToQA(groupIndex) {
                const input = document.getElementById(`newQAQuestion_${groupIndex}`);
                const question = input.value.trim().toLowerCase();
                if (question) {
                    if (!groupsArr[groupIndex].currentQAQuestions) groupsArr[groupIndex].currentQAQuestions = [];
                    if (!groupsArr[groupIndex].currentQAQuestions.includes(question)) {
                        groupsArr[groupIndex].currentQAQuestions.push(question);
                        input.value = '';
                        renderQAQuestions(groupIndex);
                    } else {
                        showToast(currentLang === 'en' ? 'This question variant already exists' : 'صيغة السؤال هذه موجودة بالفعل');
                    }
                }
            }
            
            function removeQuestionFromQA(groupIndex, questionIndex) {
                if (groupsArr[groupIndex].currentQAQuestions) {
                    groupsArr[groupIndex].currentQAQuestions.splice(questionIndex, 1);
                    renderQAQuestions(groupIndex);
                }
            }

            function renderQAEventDatesForm(groupIndex) {
                const container = document.getElementById(`event_dates_container_${groupIndex}`);
                const legacyInput = document.getElementById(`newQAEventDate_${groupIndex}`);
                if (!container) return;
                const group = groupsArr[groupIndex];
                container.innerHTML = (group.currentQAEventDates || []).map((ed, edIdx) => {
                    return `<div class="field-row" style="margin-bottom:10px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); align-items: flex-end; gap: 12px;">
                        <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                            <label class="field-label" style="font-size:10px;">${currentLang==='en'?'Label (e.g. Exam)':'العنوان (مثل: اختبار)'}</label>
                            <input type="text" value="${ed.label || ''}" placeholder="..." onchange="updateEventDate(${groupIndex}, ${edIdx}, 'label', this.value)">
                        </div>
                        <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                            <label class="field-label" style="font-size:10px;">${currentLang==='en'?'Date':'التاريخ'}</label>
                            <input type="date" value="${ed.date || ''}" onchange="updateEventDate(${groupIndex}, ${edIdx}, 'date', this.value)" style="color-scheme: dark;">
                        </div>
                        <button type="button" class="icon-btn" onclick="removeEventDate(${groupIndex}, ${edIdx})" style="border-color:rgba(255,82,82,0.3);color:var(--red);" title="${currentLang==='en'?'Delete event':'حذف الحدث'}"><i class="fas fa-trash"></i></button>
                    </div>`;
                }).join('');
                
                if (!group.currentQAEventDates || group.currentQAEventDates.length === 0) {
                    container.innerHTML += `<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center; border: 1px dashed var(--card-border); border-radius: 8px;">${currentLang==='en'?'No extra events added yet.':'لم يتم إضافة أحداث إضافية بعد.'}</div>`;
                }
                
                if (legacyInput) legacyInput.value = group.currentQAEventDate || '';
            }

            function addEventDate(groupIndex) {
                const answerEl = document.getElementById(`newQAAnswer_${groupIndex}`);
                if (answerEl) groupsArr[groupIndex].currentQAAnswer = answerEl.value;
                if (!groupsArr[groupIndex].currentQAEventDates) groupsArr[groupIndex].currentQAEventDates = [];
                groupsArr[groupIndex].currentQAEventDates.push({ label: '', date: '' });
                renderGroupDetailBody(groupIndex, 'qa');
            }

            function removeEventDate(groupIndex, dateIndex) {
                const answerEl = document.getElementById(`newQAAnswer_${groupIndex}`);
                if (answerEl) groupsArr[groupIndex].currentQAAnswer = answerEl.value;
                groupsArr[groupIndex].currentQAEventDates.splice(dateIndex, 1);
                renderGroupDetailBody(groupIndex, 'qa');
            }

            function updateEventDate(groupIndex, dateIndex, field, value) {
                if (!groupsArr[groupIndex].currentQAEventDates[dateIndex]) return;
                groupsArr[groupIndex].currentQAEventDates[dateIndex][field] = value;
            }
            
            function renderQAQuestions(groupIndex) {
                const container = document.getElementById(`qa_questions_container_${groupIndex}`);
                if (!container) return;
                const questions = groupsArr[groupIndex].currentQAQuestions || [];
                container.innerHTML = questions.map((q, qIdx) => `
                    <div class="chip">
                        <span>${q}</span>
                        <span class="chip-remove" onclick="removeQuestionFromQA(${groupIndex}, ${qIdx})">×</span>
                    </div>
                `).join('');
            }

            function addGroupQA(groupIndex) {
                const answerInput = document.getElementById(`newQAAnswer_${groupIndex}`);
                const answer = (answerInput ? answerInput.value : (groupsArr[groupIndex].currentQAAnswer || '')).trim();
                const questions = groupsArr[groupIndex].currentQAQuestions || [];
                const mediaFile = groupsArr[groupIndex].pendingMediaFile || '';
                const eventDates = groupsArr[groupIndex].currentQAEventDates || [];
                const eventDate = groupsArr[groupIndex].currentQAEventDate || '';
                const editingIndex = Number.isInteger(groupsArr[groupIndex].editingQAIndex)
                    ? groupsArr[groupIndex].editingQAIndex
                    : null;
                
                if (questions.length > 0 && (answer || mediaFile)) {
                    if (!groupsArr[groupIndex].qaList) groupsArr[groupIndex].qaList = [];
                    const newPair = { questions: questions, answer: answer, eventDates: JSON.parse(JSON.stringify(eventDates)), eventDate: eventDate };
                    if (mediaFile) newPair.mediaFile = mediaFile;
                    if (editingIndex !== null && editingIndex >= 0 && editingIndex < groupsArr[groupIndex].qaList.length) {
                        groupsArr[groupIndex].qaList[editingIndex] = newPair;
                    } else {
                        groupsArr[groupIndex].qaList.push(newPair);
                    }
                    if (answerInput) answerInput.value = '';
                    groupsArr[groupIndex].currentQAQuestions = [];
                    groupsArr[groupIndex].currentQAAnswer = '';
                    groupsArr[groupIndex].currentQAEventDates = [];
                    groupsArr[groupIndex].currentQAEventDate = '';
                    groupsArr[groupIndex].editingQAIndex = null;
                    // Clear media selection
                    groupsArr[groupIndex].pendingMediaFile = '';
                    const indicator = document.getElementById(`qa_media_selected_${groupIndex}`);
                    if (indicator) indicator.style.display = 'none';
                    loadGroupMedia(groupIndex); // refresh grid (deselects all)
                    
                    // Render form and list again to clear event dates from UI
                    renderGroupDetailBody(groupIndex, 'qa');
                } else {
                    const msg = currentLang === 'en' ? 'Please add at least one question variant and an answer or attach a media file' : 'يرجى إضافة صيغة سؤال واحدة على الأقل وملء الإجابة أو إرفاق وسائط';
                    showToast(msg);
                }
            }

            
            function removeGroupQA(groupIndex, qaIndex) {
                if (groupsArr[groupIndex].qaList) {
                    groupsArr[groupIndex].qaList.splice(qaIndex, 1);
                    renderGroupQA(groupIndex);
                }
                const editingIndex = Number.isInteger(groupsArr[groupIndex].editingQAIndex)
                    ? groupsArr[groupIndex].editingQAIndex
                    : null;
                if (editingIndex !== null) {
                    if (editingIndex === qaIndex) groupsArr[groupIndex].editingQAIndex = null;
                    if (editingIndex > qaIndex) groupsArr[groupIndex].editingQAIndex = editingIndex - 1;
                }
            }
            
            function renderGroupQA(groupIndex) {
                const container = document.getElementById(`qa_container_${groupIndex}`);
                if (!container) return;
                const qaList = groupsArr[groupIndex].qaList || [];
                container.innerHTML = qaList.map((qa, qaIdx) => `
                                    <div class="group-card" style="margin-bottom:0; display:flex; flex-direction:column; border:1px solid rgba(255,255,255,0.05); background:var(--card-bg);">
                                        <div class="group-card-header" style="padding:14px; border-bottom:1px solid rgba(255,255,255,0.05);">
                                            <div class="group-card-title" style="font-size:13px; font-weight:bold; color:var(--text);">
                                                <i class="fas fa-bolt" style="color:var(--accent);"></i> ${qa.questions ? qa.questions.length : 0} ${currentLang==='en'?'Triggers':'محفزات'}
                                            </div>
                                            <div style="display:flex;gap:6px;">
                                                <button type="button" class="icon-btn" onclick="copyQA(${groupIndex}, ${qaIdx})" style="background:rgba(255,160,0,0.1);color:#ffa000;border-color:rgba(255,160,0,0.3); width:28px; height:28px;" title="${currentLang==='en'?'Copy':'نسخ'}">
                                                    <i class="fas fa-copy"></i>
                                                </button>
                                                <button type="button" class="icon-btn" onclick="editGroupQA(${groupIndex}, ${qaIdx})" style="background:rgba(64,196,255,0.1);color:var(--blue);border-color:rgba(64,196,255,0.3); width:28px; height:28px;" title="${currentLang==='en'?'Edit':'تعديل'}">
                                                    <i class="fas fa-pen"></i>
                                                </button>
                                                <button type="button" class="icon-btn" onclick="removeGroupQA(${groupIndex}, ${qaIdx})" style="background:rgba(255,82,82,0.1);color:var(--red);border-color:rgba(255,82,82,0.3); width:28px; height:28px;" title="${currentLang==='en'?'Delete':'حذف'}">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="group-card-body" style="padding:14px; flex:1; display:flex; flex-direction:column;">
                                            <div style="margin-bottom:12px;">
                                                <div class="chip-container" style="gap:4px; max-height:60px; overflow-y:auto; padding-right:4px;">${(qa.questions || []).map((q) => `<div class="chip" style="background:var(--input-bg); color:var(--text); border:1px solid var(--card-border); font-size:11px; padding:2px 8px;"><i class="fas fa-search" style="color:var(--text-muted); font-size:10px;"></i> ${q}</div>`).join('')}</div>
                                            </div>
                                            <div style="color:var(--text-muted); font-size:13px; line-height:1.5; flex:1; background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border-left:3px solid var(--card-border);">
                                                ${(qa.answer || '').substring(0, 150) + (qa.answer && qa.answer.length > 150 ? '...' : '') || '<em style="opacity:0.5;">(empty)</em>'}
                                            </div>
                                            ${qa.mediaFile ? `<div style="margin-top:12px;display:flex;align-items:center;gap:6px;font-size:11px;color:#64dc96; background:rgba(100,220,150,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(100,220,150,0.3);"><i class="fas fa-paperclip"></i> ${qa.mediaFile}</div>` : ''}
                                            ${qa.eventDates && qa.eventDates.length > 0 ? `<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--blue); background:rgba(64,196,255,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(64,196,255,0.3);"><i class="fas fa-calendar-alt"></i> ${qa.eventDates.length} ${currentLang==='en'?'Event(s)':'حدث/أحداث'}</div>` : ''}
                                        </div>
                                    </div>`).join('');
            }

            // ── Media management for Q&A ──────────────────────────────────────
            function loadGroupMedia(groupIndex) {
                const group = groupsArr[groupIndex];
                const groupId = encodeURIComponent(group.id);
                fetch(`/api/media/list/${groupId}`)
                    .then(r => r.json())
                    .then(files => renderMediaGrid(groupIndex, files))
                    .catch(() => {});
            }

            function renderMediaGrid(groupIndex, files) {
                const grid = document.getElementById(`qa_media_grid_${groupIndex}`);
                if (!grid) return;
                if (files.length === 0) { grid.innerHTML = `<p style="font-size:12px;color:var(--text-muted);grid-column:1/-1;">${currentLang==='en'?'No files uploaded yet.':'لا توجد ملفات محملة بعد.'}</p>`; return; }
                const imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
                const vidExts = ['mp4','mov','webm','mkv','avi'];
                const audExts = ['mp3','ogg','wav','m4a','aac'];
                grid.innerHTML = files.map(f => {
                    const ext = f.name.split('.').pop().toLowerCase();
                    const groupId = encodeURIComponent(groupsArr[groupIndex].id);
                    let preview;
                    if (imgExts.includes(ext)) {
                        preview = `<img src="/media/${groupId}/${encodeURIComponent(f.name)}" style="width:100%;height:72px;object-fit:cover;border-radius:6px 6px 0 0;">`;
                    } else {
                        const icons = { mp4:'fa-film', mov:'fa-film', webm:'fa-film', mkv:'fa-film', mp3:'fa-music', ogg:'fa-music', wav:'fa-music', pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', zip:'fa-file-archive', rar:'fa-file-archive' };
                        const icon = icons[ext] || 'fa-file';
                        preview = `<div style="width:100%;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:6px 6px 0 0;"><i class="fas ${icon}" style="font-size:28px;color:var(--text-muted);"></i></div>`;
                    }
                    const kb = (f.size/1024).toFixed(1);
                    const isSelected = groupsArr[groupIndex].pendingMediaFile === f.name;
                    return `<div style="background:var(--card-bg);border:1.5px solid ${isSelected ? '#64dc96' : 'var(--card-border)'};border-radius:8px;overflow:hidden;">
                        ${preview}
                        <div style="padding:6px 8px;">
                            <div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.name}">${f.name}</div>
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">${kb} KB</div>
                            <div style="display:flex;gap:4px;">
                                <button type="button" onclick="selectQAMedia(${groupIndex},\'${f.name}\')" style="flex:1;font-size:11px;padding:4px;background:${isSelected ? 'rgba(100,220,150,0.15)' : 'var(--input-bg)'};color:${isSelected ? '#64dc96' : 'var(--text-muted)'};border:1px solid ${isSelected ? 'rgba(100,220,150,0.4)' : 'var(--card-border)'};border-radius:5px;cursor:pointer;">
                                    <i class="fas ${isSelected ? 'fa-check' : 'fa-link'}"></i> ${isSelected ? (currentLang==='en'?'Selected':'محدد') : (currentLang==='en'?'Select':'اختر')}
                                </button>
                                <button type="button" onclick="deleteGroupMedia(${groupIndex},\'${f.name}\')" style="padding:4px 6px;background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.3);border-radius:5px;cursor:pointer;font-size:11px;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            }

            function uploadGroupMedia(groupIndex, input) {
                const file = input.files[0];
                if (!file) return;
                const group = groupsArr[groupIndex];
                const groupId = encodeURIComponent(group.id);
                const statusEl = document.getElementById(`qa_upload_status_${groupIndex}`);
                statusEl.style.display = 'block';
                statusEl.textContent = currentLang==='en' ? '⏳ Uploading...' : '⏳ جاري الرفع...';
                const fd = new FormData();
                fd.append('file', file);
                fetch(`/api/media/upload/${groupId}`, { method:'POST', body:fd })
                    .then(r => r.json())
                    .then(data => {
                        statusEl.textContent = currentLang==='en' ? '✅ Uploaded: ' + data.filename : '✅ تم الرفع: ' + data.filename;
                        setTimeout(() => { statusEl.style.display='none'; }, 3000);
                        loadGroupMedia(groupIndex);
                        input.value = '';
                    })
                    .catch(() => { statusEl.textContent = currentLang==='en' ? '❌ Upload failed' : '❌ فشل الرفع'; });
            }

            function selectQAMedia(groupIndex, filename) {
                const wasSelected = groupsArr[groupIndex].pendingMediaFile === filename;
                groupsArr[groupIndex].pendingMediaFile = wasSelected ? '' : filename;
                // Update selected indicator
                const indicator = document.getElementById(`qa_media_selected_${groupIndex}`);
                const nameEl = document.getElementById(`qa_media_selected_name_${groupIndex}`);
                if (!wasSelected && filename) {
                    indicator.style.display = 'flex';
                    nameEl.textContent = '📎 ' + filename;
                } else {
                    indicator.style.display = 'none';
                }
                // Re-render grid to update button states
                fetch(`/api/media/list/${encodeURIComponent(groupsArr[groupIndex].id)}`)
                    .then(r => r.json()).then(files => renderMediaGrid(groupIndex, files)).catch(()=>{});
            }

            function clearQAMedia(groupIndex) { selectQAMedia(groupIndex, ''); }

            async function deleteGroupMedia(groupIndex, filename) {
                if (!await showConfirmModal(currentLang==='en' ? `Delete ${filename}?` : `حذف ${filename}؟`)) return;
                const groupId = encodeURIComponent(groupsArr[groupIndex].id);
                fetch(`/api/media/delete/${groupId}/${encodeURIComponent(filename)}`, { method:'DELETE' })
                    .then(() => {
                        if (groupsArr[groupIndex].pendingMediaFile === filename) selectQAMedia(groupIndex, '');
                        loadGroupMedia(groupIndex);
                    });
            }

            function copyQA(groupIndex, qaIndex) {
                const qa = groupsArr[groupIndex].qaList[qaIndex];
                if (qa) {
                    const clipData = { qa: qa, sourceGroupId: groupsArr[groupIndex].id };
                    localStorage.setItem('wa_bot_qa_clipboard', JSON.stringify(clipData));
                    showToast(currentLang === 'en' ? 'Q&A copied!' : 'تم نسخ سؤال وجواب!');
                }
            }

            async function pasteQA(groupIndex) {
                const clipDataStr = localStorage.getItem('wa_bot_qa_clipboard');
                if (!clipDataStr) {
                    showToast(currentLang === 'en' ? 'Nothing in clipboard.' : 'لا يوجد شيء في الحافظة.');
                    return;
                }
                const clipData = JSON.parse(clipDataStr);
                const targetGroupId = groupsArr[groupIndex].id;
                let qa = JSON.parse(JSON.stringify(clipData.qa));
                
                if (qa.mediaFile && clipData.sourceGroupId && clipData.sourceGroupId !== targetGroupId) {
                    try { await fetch('/api/media/copy/' + encodeURIComponent(clipData.sourceGroupId) + '/' + encodeURIComponent(targetGroupId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: qa.mediaFile }) }); } catch(e){}
                }
                
                if (!groupsArr[groupIndex].qaList) groupsArr[groupIndex].qaList = [];
                groupsArr[groupIndex].qaList.push(qa);
                renderGroupDetailBody(groupIndex, 'qa');
                loadGroupMedia(groupIndex);
                showToast(currentLang === 'en' ? 'Q&A pasted!' : 'تم لصق سؤال وجواب!');
            }

            function editGroupQA(groupIndex, qaIndex) {
                const qa = groupsArr[groupIndex].qaList[qaIndex];
                if (!qa) return;
                // Pre-fill questions and event dates
                groupsArr[groupIndex].currentQAQuestions = [...(qa.questions || [])];
                groupsArr[groupIndex].currentQAEventDates = JSON.parse(JSON.stringify(qa.eventDates || []));
                groupsArr[groupIndex].currentQAEventDate = qa.eventDate || '';
                groupsArr[groupIndex].editingQAIndex = qaIndex;
                groupsArr[groupIndex].currentQAAnswer = qa.answer || '';
                groupsArr[groupIndex].pendingMediaFile = qa.mediaFile || '';
                
                renderGroupDetailBody(groupIndex, 'qa');

                // Update save button appearance to indicate edit mode
                const saveBtn = document.getElementById(`saveQABtn_${groupIndex}`);
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> ' + (currentLang==='en' ? 'Update Q&A Pair' : 'تحديث زوج س و ج');
                    saveBtn.style.background = 'var(--orange)';
                    saveBtn.style.color = '#000';
                }
                // Scroll to form
                const questionInput = document.getElementById(`newQAQuestion_${groupIndex}`);
                if (questionInput) questionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            function addGroupBlacklist(gIndex) {
                const input = document.getElementById(`newGroupBl_${gIndex}`);
                let justNumbers = input.value.replace(/\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!groupsArr[gIndex].customBlacklist.includes(finalId)) {
                        groupsArr[gIndex].customBlacklist.push(finalId);
                        input.value = '';
                        renderGroupChips(gIndex, 'blacklist');
                    }
                }
            }
            function removeGroupBlacklist(gIndex, idx) {
                groupsArr[gIndex].customBlacklist.splice(idx, 1);
                renderGroupChips(gIndex, 'blacklist');
            }

            function addGroupWhitelist(gIndex) {
                const input = document.getElementById(`newGroupWl_${gIndex}`);
                let justNumbers = input.value.replace(/\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!groupsArr[gIndex].customWhitelist.includes(finalId)) {
                        groupsArr[gIndex].customWhitelist.push(finalId);
                        input.value = '';
                        renderGroupChips(gIndex, 'whitelist');
                    }
                }
            }
            function removeGroupWhitelist(gIndex, idx) {
                groupsArr[gIndex].customWhitelist.splice(idx, 1);
                renderGroupChips(gIndex, 'whitelist');
            }

            function getStatusIconClass(kind) {
                if (kind === 'connected') return 'fas fa-check';
                if (kind === 'waiting_qr') return 'fas fa-qrcode';
                if (kind === 'syncing' || kind === 'initializing' || kind === 'retrying' || kind === 'terminating') return 'fas fa-spinner fa-spin';
                if (kind === 'error') return 'fas fa-exclamation-triangle';
                if (kind === 'disconnected') return 'fas fa-sign-out-alt';
                return 'fas fa-info-circle';
            }

            function renderDashboardStatus(statusText, statusKind) {
                const iconEl = document.getElementById('status-text-icon');
                const labelEl = document.getElementById('status-text-label');
                const detailEl = document.getElementById('status-text-detail');
                const detailCheckEl = document.getElementById('status-text-detail-check');
                const dot = document.getElementById('statusDot');
                const logoutBtn = document.getElementById('logoutBtn');
                const text = String(statusText || '').trim();
                const kind = String(statusKind || 'unknown');

                if (iconEl) iconEl.className = getStatusIconClass(kind);
                if (labelEl) labelEl.textContent = text;
                if (detailEl) detailEl.textContent = text;
                if (detailCheckEl) detailCheckEl.style.display = kind === 'connected' ? 'inline-block' : 'none';

                if (dot) {
                    if (kind === 'connected') dot.className = 'status-dot online';
                    else if (kind === 'waiting_qr') dot.className = 'status-dot waiting';
                    else dot.className = 'status-dot';
                }

                if (logoutBtn) logoutBtn.style.display = kind === 'connected' ? 'block' : 'none';
            }

            renderBlacklist();
            renderWhitelist();
            renderDefaultWords();
            renderAITriggerWords();
            renderGlobalQAQuestionsDraft();
            renderGlobalQAEventDatesForm();
            renderGlobalQAList();
            loadGlobalQAMedia();
            loadScheduleSettings();
            loadKnownGroups();
            enforceFirstLoginChange();

            setInterval(async () => {
                try {
                    let res = await fetch('/api/status?lang=' + currentLang, { cache: 'no-store' });
                    if (res.status === 401) {
                        window.location.replace('/login');
                        return;
                    }
                    if (!res.ok) return;
                    let data = await res.json();
                    renderDashboardStatus(data.statusText || '', data.statusKind || 'unknown');

                    const qrImg = document.getElementById('qr-image');
                    const qrPlaceholder = document.getElementById('qr-placeholder');
                    if(data.qr) {
                        qrImg.src = data.qr;
                        qrImg.style.display = 'block';
                        if(qrPlaceholder) qrPlaceholder.style.display = 'none';
                    } else {
                        qrImg.style.display = 'none';
                        if(qrPlaceholder) qrPlaceholder.style.display = 'block';
                    }
                } catch(e) {}
            }, 2000);

            async function exportData() {
                const selected = {
                    global_settings: document.getElementById('export_global_settings').checked,
                    llm_settings: document.getElementById('export_llm_settings').checked,
                    blacklist: document.getElementById('export_blacklist').checked,
                    whitelist: document.getElementById('export_whitelist').checked,
                    blocked_extensions: document.getElementById('export_blocked_extensions').checked,
                    whatsapp_groups: document.getElementById('export_whatsapp_groups').checked,
                    custom_groups: document.getElementById('export_custom_groups').checked,
                    media: document.getElementById('export_media') ? document.getElementById('export_media').checked : false
                };

                try {
                    const res = await fetch('/api/export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selected })
                    });

                    if (!res.ok) {
                        let reason = '';
                        try {
                            const errData = await res.json();
                            reason = errData && errData.error ? String(errData.error) : '';
                        } catch (_) {
                            try {
                                reason = (await res.text() || '').trim();
                            } catch (_) {}
                        }
                        const prefix = currentLang==='en' ? '❌ Export failed' : '❌ فشل التصدير';
                        showToast(reason ? (prefix + ': ' + reason) : prefix);
                        return;
                    }

                    const json = await res.text();
                    if (!json || !json.trim()) {
                        throw new Error(currentLang==='en' ? 'Empty export response' : 'استجابة تصدير فارغة');
                    }

                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `automod_backup_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast(currentLang==='en' ? '✅ Export successful!' : '✅ تم التصدير بنجاح!');
                } catch (error) {
                    console.error('Export error:', error);
                    showToast(currentLang==='en' ? '❌ Export error: ' + error.message : '❌ خطأ التصدير: ' + error.message);
                }
            }

            async function importData() {
                const fileInput = document.getElementById('importFile');
                if (!fileInput.files.length) {
                    showToast(currentLang==='en' ? '⚠️ Please select a file' : '⚠️ يرجى اختيار ملف');
                    return;
                }

                const file = fileInput.files[0];
                try {
                    const json = await file.text();
                    const importedData = JSON.parse(json);
                    const dataset = importedData.data || importedData;

                    if (!dataset || typeof dataset !== 'object') {
                        showToast(currentLang==='en' ? '❌ Invalid file format' : '❌ صيغة الملف غير صحيحة');
                        return;
                    }

                    const selected = {
                        global_settings: document.getElementById('import_global_settings').checked,
                        llm_settings: document.getElementById('import_llm_settings').checked,
                        blacklist: document.getElementById('import_blacklist').checked,
                        blacklist_clear: document.getElementById('import_blacklist_clear').checked,
                        whitelist: document.getElementById('import_whitelist').checked,
                        whitelist_clear: document.getElementById('import_whitelist_clear').checked,
                        blocked_extensions: document.getElementById('import_blocked_extensions').checked,
                        blocked_extensions_clear: document.getElementById('import_blocked_extensions_clear').checked,
                        whatsapp_groups: document.getElementById('import_whatsapp_groups').checked,
                        custom_groups: document.getElementById('import_custom_groups').checked,
                        custom_groups_clear: document.getElementById('import_custom_groups_clear').checked,
                        media: document.getElementById('import_media') ? document.getElementById('import_media').checked : false
                    };

                    if (!await showConfirmModal(currentLang==='en' ? 'Confirm import? This action may override existing data.' : 'هل تؤكد الاستيراد؟ قد يؤدي هذا إلى إلغاء البيانات الموجودة.')) {
                        return;
                    }

                    const res = await fetch('/api/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dataset, selected })
                    });

                    if (!res.ok) {
                        const errorData = await res.json();
                        showToast(currentLang==='en' ? '❌ Import failed: ' + errorData.error : '❌ فشل الاستيراد: ' + errorData.error);
                        return;
                    }

                    showToast(currentLang==='en' ? '✅ Import successful! Reloading...' : '✅ تم الاستيراد بنجاح! جاري إعادة التحميل...');
                    fileInput.value = '';
                    setTimeout(() => window.location.reload(), 1500);
                } catch (error) {
                    console.error('Import error:', error);
                    showToast(currentLang==='en' ? '❌ Import error: ' + error.message : '❌ خطأ الاستيراد: ' + error.message);
                }
            }

            async function runSecondaryVerificationTest() {
                const numberEl = document.getElementById('secondaryVerificationTestNumber');
                const groupEl = document.getElementById('secondaryVerificationTestGroup');
                const btn = document.getElementById('secondaryVerificationTestBtn');
                if (!numberEl || !btn) return;

                const number = (numberEl.value || '').trim();
                const groupId = groupEl ? groupEl.value : '';
                if (!number) {
                    showToast(currentLang === 'en' ? '⚠️ Please enter a number first' : '⚠️ أدخل رقمًا للاختبار أولاً');
                    return;
                }

                const originalHtml = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Running...' : 'جاري التنفيذ...');

                try {
                    const res = await fetch('/api/secondary-verification/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number, groupId })
                    });

                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        showToast((currentLang === 'en' ? '❌ Test failed: ' : '❌ فشل الاختبار: ') + (data.error || 'Unknown error'));
                        return;
                    }

                    showToast((currentLang === 'en' ? '✅ ' : '✅ ') + (data.message || (currentLang === 'en' ? 'Test message sent' : 'تم إرسال رسالة الاختبار')));
                } catch (err) {
                    showToast((currentLang === 'en' ? '❌ Test failed: ' : '❌ فشل الاختبار: ') + (err.message || 'Network error'));
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            }

            async function saveConfig() {
                let finalGroupsObj = {};
                groupsArr.forEach(g => { 
                    if(g.id) { finalGroupsObj[g.id] = g; } 
                });

                const gSpamTypes = [];
                const gSpamLimits = {};
                metaTypes.forEach(t => {
                    const cb = document.getElementById('global_spam_check_' + t.id);
                    if(cb && cb.checked) gSpamTypes.push(t.id);
                    const lim = document.getElementById('global_spam_limit_' + t.id);
                    gSpamLimits[t.id] = parseInt(lim ? lim.value : 5) || 5;
                });

                let defAdmin = '';
                const defAdminEl = document.getElementById('defaultAdminGroup');
                if (defAdminEl) defAdmin = defAdminEl.value;
                let defAdminLang = 'ar';
                const defAdminLangEl = document.getElementById('defaultAdminLanguage');
                if (defAdminLangEl) defAdminLang = defAdminLangEl.value === 'en' ? 'en' : 'ar';

                const newConfig = {
                    enableAntiSpam: document.getElementById('enableAntiSpam').checked,
                    safeMode: document.getElementById('safeMode').checked,
                    spamDuplicateLimit: parseInt(document.getElementById('spamDuplicateLimit').value) || 3,
                    spamAction: document.getElementById('spamAction').value,
                    spamTypes: gSpamTypes,
                    spamLimits: gSpamLimits,
                    blockedTypes: getCheckedValues('globalBlockedTypes'),
                    blockedAction: document.getElementById('globalBlockedAction').value,
                    enableBlacklist: document.getElementById('enableBlacklist').checked,
                    enableWhitelist: document.getElementById('enableWhitelist').checked,
                    autoPurgeScheduleEnabled: document.getElementById('autoPurgeScheduleEnabled') ? document.getElementById('autoPurgeScheduleEnabled').checked : false,
                    autoPurgeIntervalMinutes: document.getElementById('autoPurgeIntervalMinutes') ? (parseInt(document.getElementById('autoPurgeIntervalMinutes').value, 10) || 60) : 60,
                    adminWhitelistSyncEnabled: document.getElementById('adminWhitelistSyncEnabled') ? document.getElementById('adminWhitelistSyncEnabled').checked : false,
                    adminWhitelistSyncIntervalMinutes: document.getElementById('adminWhitelistSyncIntervalMinutes') ? (parseInt(document.getElementById('adminWhitelistSyncIntervalMinutes').value, 10) || 60) : 60,
                    enableJoinProfileScreening: document.getElementById('enableJoinProfileScreening').checked,
                    enableSecondaryVerification: document.getElementById('enableSecondaryVerification') ? document.getElementById('enableSecondaryVerification').checked : false,
                    secondaryVerificationGroups: document.getElementById('secondaryVerificationGroupsContainer') ? Array.from(document.querySelectorAll('.sec-verification-grp-cb:checked')).map(cb => cb.value) : [],
                    secondaryVerificationLanguage: document.getElementById('secondaryVerificationLanguage') ? document.getElementById('secondaryVerificationLanguage').value : 'en',
                    secondaryVerificationDelay: document.getElementById('secondaryVerificationDelay') ? parseInt(document.getElementById('secondaryVerificationDelay').value, 10) : 3600,
                    secondaryVerificationTimeoutDays: document.getElementById('secondaryVerificationTimeoutDays') ? parseInt(document.getElementById('secondaryVerificationTimeoutDays').value, 10) : 2,
                    enableKeywordVerification: document.getElementById('enableKeywordVerification') ? document.getElementById('enableKeywordVerification').checked : false,
                    enableEmailVerification: document.getElementById('enableEmailVerification') ? document.getElementById('enableEmailVerification').checked : false,
                    enablePhotoVerification: document.getElementById('enablePhotoVerification') ? document.getElementById('enablePhotoVerification').checked : false,
                    enableSecondarySmartMatch: document.getElementById('enableSecondarySmartMatch') ? document.getElementById('enableSecondarySmartMatch').checked : false,
                    secondaryVerificationStopCode: document.getElementById('secondaryVerificationStopCode') ? document.getElementById('secondaryVerificationStopCode').value.trim() : '',
                    customMessageText: customMessagesArr.join(' || '),
                    approvalKeyword: approvalWordsArr.join(','),
                    banKeyword: banWordsArr.join(','),
                    emailDomain: document.getElementById('emailDomain') ? document.getElementById('emailDomain').value.trim() : '',
                    smtpHost: document.getElementById('smtpHost') ? document.getElementById('smtpHost').value.trim() : '',
                    smtpPort: document.getElementById('smtpPort') ? parseInt(document.getElementById('smtpPort').value, 10) : 587,
                    outlookEmail: document.getElementById('outlookEmail') ? document.getElementById('outlookEmail').value.trim() : '',
                    outlookPassword: document.getElementById('outlookPassword') ? document.getElementById('outlookPassword').value.trim() : '',

                    enableMissedCallReply: document.getElementById('enableMissedCallReply') ? document.getElementById('enableMissedCallReply').checked : false,
                    missedCallToken: document.getElementById('missedCallToken') ? document.getElementById('missedCallToken').value.trim() : '',
                    missedCallMessage: document.getElementById('missedCallMessage') ? document.getElementById('missedCallMessage').value.trim() : '',
                    enableMissedCallReturning: document.getElementById('enableMissedCallReturning') ? document.getElementById('enableMissedCallReturning').checked : false,
                    missedCallReturningMessage: document.getElementById('missedCallReturningMessage') ? document.getElementById('missedCallReturningMessage').value.trim() : '',
                    webhookCountryCode: document.getElementById('webhookCountryCode') ? document.getElementById('webhookCountryCode').value.trim() : '',
                    enableAnsweredCallReply: document.getElementById('enableAnsweredCallReply') ? document.getElementById('enableAnsweredCallReply').checked : false,
                    answeredCallMessage: document.getElementById('answeredCallMessage') ? document.getElementById('answeredCallMessage').value.trim() : '',

                    enableWordFilter: document.getElementById('enableWordFilter').checked,
                    enableWordFilterSmartMatch: document.getElementById('enableWordFilterSmartMatch') ? document.getElementById('enableWordFilterSmartMatch').checked : false,
                    enableAIFilter: document.getElementById('enableAIFilter').checked,
                    enableAIMedia: document.getElementById('enableAIMedia').checked,
                    autoAction: document.getElementById('autoAction').checked,
                    aiPrompt: document.getElementById('aiPromptText').value.trim(),
                    aiFilterTriggerWords: aiFilterTriggerWordsArr,
                    ollamaUrl: document.getElementById('ollamaUrl').value.trim(),
                    ollamaModel: document.getElementById('ollamaModel').value.trim(),
                    defaultAdminGroup: defAdmin,
                    defaultAdminLanguage: defAdminLang,
                    defaultWords: defaultWordsArr,
                    globalQAEnabled: document.getElementById('globalQAEnabled') ? document.getElementById('globalQAEnabled').checked : false,
                    enableQASmartMatch: document.getElementById('enableQASmartMatch') ? document.getElementById('enableQASmartMatch').checked : false,
                    globalQA: globalQAArr,
                    groupsConfig: finalGroupsObj
                };
                
                const res = await fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newConfig)
                });
                
                if(res.ok) {
                    showToast(dict.save_success);
                    setTimeout(() => window.location.reload(), 800);
                } else showToast(dict.save_fail);
            }

            document.getElementById('configForm').onsubmit = async (e) => {
                e.preventDefault();
                await saveConfig();
            }