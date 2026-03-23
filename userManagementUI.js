module.exports = function renderUserManagement(authUser, lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    const dir = l === 'en' ? 'ltr' : 'rtl';
    const t = (ar, en) => l === 'en' ? en : ar;

    return `<!doctype html>
<html lang="${l}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t('إدارة المستخدمين', 'User Management')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root{
      --bg:#080c10;--card-bg:#131920;--card-border:#1e2830;--input-bg:#0a0f14;--input-border:#1e2830;
      --text:#dce8f5;--text-muted:#6b8099;--accent:#00c853;--accent-dim:rgba(0,200,83,0.1);
      --blue:#40c4ff;--red:#ff5252;--orange:#ffab40;--radius:12px;
    }
    *{box-sizing:border-box} html,body{margin:0;padding:0}
    body{font-family:'IBM Plex Sans Arabic',sans-serif;background:radial-gradient(circle at 10% 0%,#0f1720 0,#080c10 45%,#070a0d 100%);color:var(--text);min-height:100vh}
    .wrap{max-width:1320px;margin:0 auto;padding:28px}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;padding:16px 20px;background:rgba(19,25,32,.75);backdrop-filter:blur(10px);border:1px solid var(--card-border);border-radius:14px}
    .title h1{margin:0;font-size:28px;display:flex;gap:10px;align-items:center}
    .title p{margin:4px 0 0;color:var(--text-muted)}
    .top-actions{display:flex;gap:10px;flex-wrap:wrap}
    .btn{padding:10px 16px;border-radius:10px;border:1px solid var(--card-border);background:var(--input-bg);color:var(--text);font-weight:700;cursor:pointer}
    .btn:hover{filter:brightness(1.08)}
    .btn-primary{background:var(--accent-dim);border-color:rgba(0,200,83,0.45);color:var(--accent)}
    .btn-danger{background:rgba(255,82,82,.1);border-color:rgba(255,82,82,.45);color:var(--red)}
    .btn-blue{background:rgba(64,196,255,.1);border-color:rgba(64,196,255,.4);color:var(--blue)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:18px}
    .card h2{margin:0 0 12px;font-size:18px;display:flex;align-items:center;gap:8px}
    .field{margin-bottom:12px}
    label{display:block;font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
    input,select,textarea{width:100%;padding:11px 12px;background:var(--input-bg);border:1.5px solid var(--input-border);border-radius:10px;color:var(--text);font-family:inherit}
    input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    .status{margin-top:8px;min-height:18px;color:var(--text-muted);font-size:14px}
    .list{max-height:290px;overflow:auto;border:1px solid var(--card-border);border-radius:10px;padding:10px;background:var(--input-bg)}
    .list-item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--card-border)}
    .list-item:last-child{border-bottom:0}
    .list-check{display:flex;align-items:center;gap:8px;padding:6px 2px}
    .chips{display:flex;gap:6px;flex-wrap:wrap}
    .chip{border:1px solid rgba(64,196,255,.35);background:rgba(64,196,255,.1);color:var(--blue);border-radius:20px;padding:3px 10px;font-size:12px}
    .chip.warn{border-color:rgba(255,171,64,.35);background:rgba(255,171,64,.1);color:var(--orange)}
    .perm-picker{display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--input-bg);border:1px solid var(--card-border);border-radius:10px;max-height:210px;overflow:auto}
    .perm-option{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(64,196,255,.08);border:1px solid rgba(64,196,255,.25);font-size:13px;color:var(--text)}
    .perm-option input{width:auto;margin:0}
    .mono{font-family:monospace;font-size:12px;color:var(--text-muted)}
    .subtle{color:var(--text-muted);font-size:13px}
    .danger-text{color:#ff9f9f}
    @media (max-width:980px){.grid{grid-template-columns:1fr}.wrap{padding:16px}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div class="title">
        <h1><i class="fas fa-user-shield"></i> ${t('إدارة المستخدمين', 'User Management')}</h1>
        <p>${t('مسجل الدخول باسم', 'Signed in as')} ${String(authUser.display_name || authUser.username)}</p>
      </div>
      <div class="top-actions">
        <button class="btn btn-blue" onclick="window.location.href='/'"><i class="fas fa-arrow-left"></i> ${t('العودة للوحة', 'Back to Dashboard')}</button>
        <button class="btn" onclick="switchLanguage()"><i class="fas fa-language"></i> ${l === 'en' ? 'AR' : 'EN'}</button>
        <button class="btn btn-danger" onclick="logout()"><i class="fas fa-sign-out-alt"></i> ${t('تسجيل الخروج', 'Logout')}</button>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <h2><i class="fas fa-user-plus" style="color:var(--accent)"></i> ${t('إضافة مستخدم', 'Create User')}</h2>
        <div class="field"><label>${t('اسم المستخدم', 'Username')}</label><input id="createUsername" placeholder="agent_1"></div>
        <div class="field"><label>${t('الاسم المعروض', 'Display Name')}</label><input id="createDisplayName" placeholder="Agent One"></div>
        <div class="field"><label>${t('كلمة المرور', 'Password')}</label><input id="createPassword" type="password" placeholder="${t('8 أحرف على الأقل', 'At least 8 chars')}"></div>
        <div class="field"><label><input id="createSuperadmin" type="checkbox" style="width:auto"> ${t('صلاحية مدير عام', 'Superadmin')}</label></div>
        <div class="row"><button class="btn btn-primary" onclick="createUser()">${t('إضافة المستخدم', 'Create User')}</button><button class="btn" onclick="loadAll()">${t('تحديث', 'Refresh')}</button></div>
        <div id="createStatus" class="status"></div>
      </section>

      <section class="card">
        <h2><i class="fas fa-layer-group" style="color:var(--blue)"></i> ${t('إضافة مجموعة صلاحيات', 'Create Permission Group')}</h2>
        <div class="field"><label>${t('الاسم', 'Name')}</label><input id="permName" placeholder="${t('المشرفون', 'Moderators')}"></div>
        <div class="field"><label>${t('الوصف', 'Description')}</label><input id="permDescription" placeholder="${t('وصف قصير للمجموعة', 'Short group description')}"></div>
        <div class="field">
          <label>${t('اختر الصلاحيات', 'Choose Permissions')}</label>
          <div id="permPicker" class="perm-picker"></div>
        </div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn" onclick="setAllCreatePermissions(true)">${t('تحديد الكل', 'Select All')}</button>
          <button class="btn" onclick="setAllCreatePermissions(false)">${t('مسح الكل', 'Clear All')}</button>
        </div>
        <div class="field">
          <label>${t('إضافة صلاحية مخصصة', 'Add Custom Permission')}</label>
          <div class="row">
            <input id="permCustom" placeholder="custom:permission" onkeypress="if(event.key==='Enter'){event.preventDefault();addCustomCreatePermission();}">
            <button class="btn" onclick="addCustomCreatePermission()">${t('إضافة', 'Add')}</button>
          </div>
        </div>
        <div class="field">
          <label>${t('الصلاحيات المختارة', 'Selected Permissions')}</label>
          <div id="permSelected" class="chips"></div>
        </div>
        <div class="row"><button class="btn btn-primary" onclick="createPermissionGroup()">${t('إضافة المجموعة', 'Create Group')}</button></div>
        <div id="permStatus" class="status"></div>
      </section>
    </div>

    <div class="grid" style="margin-top:16px">
      <section class="card">
        <h2><i class="fas fa-users"></i> ${t('المستخدمون', 'Users')}</h2>
        <p class="subtle">${t('اختر مستخدماً لتعديل الوصول والإعدادات', 'Select a user to configure access and settings')}</p>
        <div class="list" id="usersList"></div>
      </section>
      <section class="card">
        <h2><i class="fas fa-key"></i> ${t('مجموعات الصلاحيات', 'Permission Groups')}</h2>
        <div class="list" id="permissionGroupsList"></div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <h2><i class="fas fa-sliders-h"></i> ${t('وصول المستخدم المحدد', 'Selected User Access')}</h2>
      <div id="selectedUserMeta" class="subtle">${t('لم يتم اختيار مستخدم', 'No user selected')}</div>

      <div class="grid" style="margin-top:12px">
        <div>
          <label>${t('تعيين مجموعات الصلاحيات', 'Assigned Permission Groups')}</label>
          <div class="list" id="assignPermissionGroups"></div>
        </div>
        <div>
          <label>${t('المجموعات المسموح بها في واتساب', 'Allowed WhatsApp Groups')}</label>
          <div class="list" id="assignWhatsappGroups"></div>
        </div>
      </div>

      <div class="grid" style="margin-top:12px">
        <div>
          <label>${t('لغة واجهة المستخدم', 'User UI Language')}</label>
          <select id="userSettingLanguage"><option value="">${t('افتراضي', 'Default')}</option><option value="ar">Arabic</option><option value="en">English</option></select>
        </div>
        <div>
          <label>${t('ملاحظات داخلية', 'Internal Notes')}</label>
          <input id="userSettingNotes" placeholder="${t('ملاحظة اختيارية', 'Optional note')}">
        </div>
      </div>

      <div class="row" style="margin-top:12px"><button class="btn btn-primary" onclick="saveSelectedUserAccess()">${t('حفظ الوصول', 'Save Access')}</button><button class="btn btn-danger" onclick="deleteSelectedUser()">${t('حذف المستخدم', 'Delete User')}</button></div>
      <div id="accessStatus" class="status"></div>
      <p class="subtle danger-text">${t('حذف المستخدم سيزيل كل الصلاحيات وإعداداته الخاصة نهائياً', 'Deleting a user permanently removes all access and custom settings')}</p>
    </section>
  </div>

  <script>
    const dict = {
      confirm_delete_group: '${t('هل تريد حذف مجموعة الصلاحيات؟', 'Delete this permission group?')}',
      confirm_delete_user: '${t('هل تريد حذف المستخدم المحدد؟', 'Delete selected user?')}',
      no_users: '${t('لا يوجد مستخدمون حالياً', 'No users yet')}',
      no_perms: '${t('لا توجد مجموعات صلاحيات', 'No permission groups')}',
      no_user_selected: '${t('لم يتم اختيار مستخدم', 'No user selected')}',
      editing: '${t('تعديل', 'Editing')}',
      active: '${t('مفعل', 'Active')}',
      disabled: '${t('معطل', 'Disabled')}',
      superadmin: '${t('مدير عام', 'Superadmin')}',
      select: '${t('اختيار', 'Select')}',
      create_ok: '${t('تم إنشاء المستخدم بنجاح', 'User created successfully')}',
      perm_create_ok: '${t('تم إنشاء مجموعة الصلاحيات', 'Permission group created')}',
      perm_delete_ok: '${t('تم حذف مجموعة الصلاحيات', 'Permission group deleted')}',
      access_ok: '${t('تم حفظ الوصول بنجاح', 'Access saved successfully')}',
      user_delete_ok: '${t('تم حذف المستخدم', 'User deleted')}',
      pick_user_first: '${t('اختر مستخدماً أولاً', 'Select a user first')}',
      no_perm_selected: '${t('لم يتم اختيار أي صلاحيات', 'No permissions selected')}'
    };

    const state = { users: [], permissionGroups: [], waGroups: [], selectedUserId: null, selectedUserAccess: null };
    const createPermissionCatalog = [
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
    let selectedCreatePermissions = new Set();

    async function api(url, options = {}) {
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
        throw new Error((data && (data.error || data.message)) || 'Request failed');
      }

      return data;
    }

    function setStatus(id, message, isError = false) {
      const el = document.getElementById(id);
      el.textContent = message;
      el.style.color = isError ? '#ff9f9f' : '#8ed4ff';
    }

    async function loadAll() {
      try {
        const [users, permissionGroups, waGroups] = await Promise.all([api('/api/users'), api('/api/access/permission-groups'), api('/api/groups')]);
        state.users = users || [];
        state.permissionGroups = permissionGroups || [];
        state.waGroups = waGroups || [];
        renderUsers();
        renderPermissionGroups();
        renderAccessEditors();
      } catch (err) {
        setStatus('createStatus', err.message, true);
      }
    }

    function renderUsers() {
      const list = document.getElementById('usersList');
      list.innerHTML = '';
      if (state.users.length === 0) {
        list.innerHTML = '<div class="subtle">' + dict.no_users + '</div>';
        return;
      }
      for (const user of state.users) {
        const item = document.createElement('div');
        item.className = 'list-item';

        const left = document.createElement('div');
        left.innerHTML = '<strong>' + escapeHtml(user.display_name) + '</strong> <span class="mono">(' + escapeHtml(user.username) + ')</span>';

        const right = document.createElement('div');
        right.className = 'chips';
        const activeChip = document.createElement('span');
        activeChip.className = 'chip';
        activeChip.textContent = user.is_active ? dict.active : dict.disabled;
        right.appendChild(activeChip);

        if (user.is_superadmin) {
          const adminChip = document.createElement('span');
          adminChip.className = 'chip warn';
          adminChip.textContent = dict.superadmin;
          right.appendChild(adminChip);
        }

        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn';
        selectBtn.style.padding = '6px 10px';
        selectBtn.textContent = dict.select;
        selectBtn.onclick = () => selectUser(user.id);
        right.appendChild(selectBtn);

        item.appendChild(left);
        item.appendChild(right);
        list.appendChild(item);
      }
    }

    function renderPermissionGroups() {
      const list = document.getElementById('permissionGroupsList');
      list.innerHTML = '';
      if (state.permissionGroups.length === 0) {
        list.innerHTML = '<div class="subtle">' + dict.no_perms + '</div>';
        return;
      }

      for (const group of state.permissionGroups) {
        const box = document.createElement('div');
        box.style.borderBottom = '1px solid var(--card-border)';
        box.style.padding = '8px 0';
        const permissions = Array.isArray(group.permissions) ? group.permissions : [];
        box.innerHTML =
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">' +
          '<div><strong>' + escapeHtml(group.name) + '</strong><div class="subtle">' + escapeHtml(group.description || '') + '</div></div>' +
          '<button class="btn btn-danger" style="padding:6px 10px;" onclick="deletePermissionGroup(' + group.id + ')">${t('حذف', 'Delete')}</button>' +
          '</div>' +
          '<div class="chips" style="margin-top:6px;">' + permissions.map(p => '<span class="chip">' + escapeHtml(p) + '</span>').join('') + '</div>';
        list.appendChild(box);
      }
    }

    async function selectUser(userId) {
      state.selectedUserId = userId;
      try {
        state.selectedUserAccess = await api('/api/users/' + userId + '/access');
        renderAccessEditors();
      } catch (err) {
        setStatus('accessStatus', err.message, true);
      }
    }

    function renderAccessEditors() {
      const meta = document.getElementById('selectedUserMeta');
      const permBox = document.getElementById('assignPermissionGroups');
      const waBox = document.getElementById('assignWhatsappGroups');
      permBox.innerHTML = '';
      waBox.innerHTML = '';

      if (!state.selectedUserId || !state.selectedUserAccess) {
        meta.textContent = dict.no_user_selected;
        return;
      }

      const user = state.users.find(u => u.id === state.selectedUserId);
      meta.innerHTML = user ? dict.editing + ': <strong>' + escapeHtml(user.display_name) + '</strong> <span class="mono">(' + escapeHtml(user.username) + ')</span>' : dict.editing + ' #' + state.selectedUserId;

      const selectedPermIds = new Set((state.selectedUserAccess.permissionGroupIds || []).map(Number));
      for (const group of state.permissionGroups) {
        const row = document.createElement('label');
        row.className = 'list-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = String(group.id);
        cb.checked = selectedPermIds.has(Number(group.id));
        cb.dataset.role = 'perm';
        row.appendChild(cb);
        const text = document.createElement('span');
        text.textContent = group.name;
        row.appendChild(text);
        permBox.appendChild(row);
      }

      const selectedWaGroupIds = new Set(state.selectedUserAccess.allowedGroupIds || []);
      for (const waGroup of state.waGroups) {
        const row = document.createElement('label');
        row.className = 'list-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = waGroup.id;
        cb.checked = selectedWaGroupIds.has(waGroup.id);
        cb.dataset.role = 'wa-group';
        row.appendChild(cb);
        const text = document.createElement('span');
        text.innerHTML = '<strong>' + escapeHtml(waGroup.name || waGroup.id) + '</strong> <span class="mono">' + escapeHtml(waGroup.id) + '</span>';
        row.appendChild(text);
        waBox.appendChild(row);
      }

      const settings = state.selectedUserAccess.settings || {};
      document.getElementById('userSettingLanguage').value = settings.uiLanguage || '';
      document.getElementById('userSettingNotes').value = settings.notes || '';
    }

    async function createUser() {
      try {
        await api('/api/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('createUsername').value,
            displayName: document.getElementById('createDisplayName').value,
            password: document.getElementById('createPassword').value,
            isSuperadmin: document.getElementById('createSuperadmin').checked
          })
        });
        setStatus('createStatus', dict.create_ok);
        document.getElementById('createPassword').value = '';
        await loadAll();
      } catch (err) {
        setStatus('createStatus', err.message, true);
      }
    }

    async function createPermissionGroup() {
      try {
        const permissions = Array.from(selectedCreatePermissions);
        if (!permissions.length) {
          throw new Error('${t('اختر صلاحية واحدة على الأقل', 'Select at least one permission')}');
        }
        await api('/api/access/permission-groups/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('permName').value,
            description: document.getElementById('permDescription').value,
            permissions
          })
        });
        setStatus('permStatus', dict.perm_create_ok);
        document.getElementById('permName').value = '';
        document.getElementById('permDescription').value = '';
        document.getElementById('permCustom').value = '';
        selectedCreatePermissions = new Set();
        renderCreatePermissionPicker();
        renderSelectedCreatePermissions();
        await loadAll();
      } catch (err) {
        setStatus('permStatus', err.message, true);
      }
    }

    function renderCreatePermissionPicker() {
      const picker = document.getElementById('permPicker');
      if (!picker) return;
      picker.innerHTML = '';

      for (const permission of createPermissionCatalog) {
        const option = document.createElement('label');
        option.className = 'perm-option';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedCreatePermissions.has(permission);
        cb.onchange = () => toggleCreatePermission(permission, cb.checked);
        option.appendChild(cb);
        const text = document.createElement('span');
        text.textContent = permission;
        option.appendChild(text);
        picker.appendChild(option);
      }
    }

    function renderSelectedCreatePermissions() {
      const selectedBox = document.getElementById('permSelected');
      if (!selectedBox) return;
      selectedBox.innerHTML = '';
      const list = Array.from(selectedCreatePermissions);

      if (!list.length) {
        const empty = document.createElement('span');
        empty.className = 'subtle';
        empty.textContent = dict.no_perm_selected;
        selectedBox.appendChild(empty);
        return;
      }

      for (const permission of list) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = permission;

        const remove = document.createElement('span');
        remove.style.cursor = 'pointer';
        remove.style.fontWeight = '700';
        remove.innerHTML = '&times;';
        remove.onclick = () => removeCreatePermission(permission);

        chip.appendChild(document.createTextNode(' '));
        chip.appendChild(remove);
        selectedBox.appendChild(chip);
      }
    }

    function toggleCreatePermission(permission, checked) {
      if (checked) selectedCreatePermissions.add(permission);
      else selectedCreatePermissions.delete(permission);
      renderSelectedCreatePermissions();
    }

    function removeCreatePermission(permission) {
      selectedCreatePermissions.delete(permission);
      renderCreatePermissionPicker();
      renderSelectedCreatePermissions();
    }

    function addCustomCreatePermission() {
      const input = document.getElementById('permCustom');
      const permission = String(input.value || '').trim();
      if (!permission) return;
      selectedCreatePermissions.add(permission);
      input.value = '';
      renderCreatePermissionPicker();
      renderSelectedCreatePermissions();
    }

    function setAllCreatePermissions(checked) {
      selectedCreatePermissions = checked ? new Set(createPermissionCatalog) : new Set();
      renderCreatePermissionPicker();
      renderSelectedCreatePermissions();
    }

    async function deletePermissionGroup(id) {
      if (!confirm(dict.confirm_delete_group)) return;
      try {
        await api('/api/access/permission-groups/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        setStatus('permStatus', dict.perm_delete_ok);
        await loadAll();
      } catch (err) {
        setStatus('permStatus', err.message, true);
      }
    }

    async function saveSelectedUserAccess() {
      if (!state.selectedUserId) {
        setStatus('accessStatus', dict.pick_user_first, true);
        return;
      }

      const permIds = Array.from(document.querySelectorAll('input[data-role="perm"]:checked')).map(cb => Number(cb.value));
      const waGroupIds = Array.from(document.querySelectorAll('input[data-role="wa-group"]:checked')).map(cb => cb.value);
      const settings = {
        uiLanguage: document.getElementById('userSettingLanguage').value,
        notes: document.getElementById('userSettingNotes').value
      };

      try {
        await api('/api/users/' + state.selectedUserId + '/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissionGroupIds: permIds, allowedGroupIds: waGroupIds, settings })
        });
        setStatus('accessStatus', dict.access_ok);
        await selectUser(state.selectedUserId);
        await loadAll();
      } catch (err) {
        setStatus('accessStatus', err.message, true);
      }
    }

    async function deleteSelectedUser() {
      if (!state.selectedUserId) {
        setStatus('accessStatus', dict.pick_user_first, true);
        return;
      }
      if (!confirm(dict.confirm_delete_user)) return;

      try {
        await api('/api/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: state.selectedUserId })
        });
        setStatus('accessStatus', dict.user_delete_ok);
        state.selectedUserId = null;
        state.selectedUserAccess = null;
        await loadAll();
      } catch (err) {
        setStatus('accessStatus', err.message, true);
      }
    }

    async function logout() {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }

    function switchLanguage() {
      const current = '${l}';
      const next = current === 'en' ? 'ar' : 'en';
      document.cookie = 'bot_lang=' + next + '; path=/; max-age=31536000';
      location.reload();
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    renderCreatePermissionPicker();
    renderSelectedCreatePermissions();
    loadAll();
  </script>
</body>
</html>`;
};
