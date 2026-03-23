module.exports = function renderUserManagement(authUser) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User Management</title>
  <style>
    :root {
      --bg: #0f1720;
      --panel: #172230;
      --muted: #a6bdd5;
      --text: #e8f0f8;
      --accent: #2ea043;
      --border: #2a3b50;
      --danger: #d73a49;
      --warn: #e3b341;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Arial, sans-serif; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 22px; }
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 18px;
    }
    .title h1 { margin: 0; font-size: 30px; }
    .title p { margin: 6px 0 0; color: var(--muted); }
    .top-actions { display: flex; gap: 8px; }
    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 700;
      color: #fff;
      background: #32506f;
    }
    button.primary { background: var(--accent); }
    button.danger { background: var(--danger); }
    button.warn { background: var(--warn); color: #222; }
    button.ghost { background: #1e2d3e; border: 1px solid var(--border); }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
    }
    .panel h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    input, select, textarea {
      width: 100%;
      padding: 9px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0f1720;
      color: var(--text);
    }
    label {
      font-size: 12px;
      color: var(--muted);
      display: block;
      margin-bottom: 4px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .field { margin-bottom: 10px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      text-align: left;
      padding: 8px;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .mono { font-family: monospace; font-size: 12px; }
    .status { margin-top: 8px; min-height: 18px; color: var(--muted); }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip {
      background: #20354b;
      border: 1px solid #345678;
      border-radius: 16px;
      padding: 2px 9px;
      font-size: 12px;
    }
    .list {
      max-height: 270px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      background: #101a24;
    }
    .list-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .list-item input { width: auto; }
    .subtle { color: var(--muted); font-size: 13px; }
    .danger-text { color: #ff8787; }
    @media (max-width: 960px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="title">
        <h1>User Management</h1>
        <p>Signed in as ${String(authUser.display_name || authUser.username)}</p>
      </div>
      <div class="top-actions">
        <button class="ghost" onclick="window.location.href='/'">Back To Dashboard</button>
        <button class="warn" onclick="logout()">Logout</button>
      </div>
    </div>

    <div class="grid">
      <section class="panel">
        <h2>Create User</h2>
        <div class="field">
          <label>Username</label>
          <input id="createUsername" placeholder="agent_1">
        </div>
        <div class="field">
          <label>Display Name</label>
          <input id="createDisplayName" placeholder="Agent One">
        </div>
        <div class="field">
          <label>Password</label>
          <input id="createPassword" type="password" placeholder="At least 8 chars">
        </div>
        <div class="field">
          <label><input id="createSuperadmin" type="checkbox" style="width:auto; margin-right:6px;"> Superadmin</label>
        </div>
        <div class="row">
          <button class="primary" onclick="createUser()">Create User</button>
          <button onclick="loadAll()">Refresh</button>
        </div>
        <div id="createStatus" class="status"></div>
      </section>

      <section class="panel">
        <h2>Create Permission Group</h2>
        <div class="field">
          <label>Name</label>
          <input id="permName" placeholder="Moderators">
        </div>
        <div class="field">
          <label>Description</label>
          <input id="permDescription" placeholder="Can moderate scoped groups">
        </div>
        <div class="field">
          <label>Permissions (one per line)</label>
          <textarea id="permList" rows="6" placeholder="dashboard:read\ngroups:view\nconfig:write-scoped\nmedia:manage"></textarea>
        </div>
        <div class="row">
          <button class="primary" onclick="createPermissionGroup()">Create Group</button>
        </div>
        <div id="permStatus" class="status"></div>
      </section>
    </div>

    <div class="grid" style="margin-top: 14px;">
      <section class="panel">
        <h2>Users</h2>
        <p class="subtle">Select a user to configure access and settings.</p>
        <div class="list" id="usersList"></div>
      </section>

      <section class="panel">
        <h2>Permission Groups</h2>
        <div class="list" id="permissionGroupsList"></div>
      </section>
    </div>

    <div class="panel" style="margin-top: 14px;">
      <h2>Selected User Access</h2>
      <div id="selectedUserMeta" class="subtle">No user selected.</div>

      <div class="grid" style="margin-top: 10px;">
        <div>
          <label>Assigned Permission Groups</label>
          <div class="list" id="assignPermissionGroups"></div>
        </div>
        <div>
          <label>Allowed WhatsApp Groups (Custom Groups Scope)</label>
          <div class="list" id="assignWhatsappGroups"></div>
        </div>
      </div>

      <div class="grid" style="margin-top: 10px;">
        <div>
          <label>User UI Language (custom setting)</label>
          <select id="userSettingLanguage">
            <option value="">Default</option>
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label>Notes (custom setting)</label>
          <input id="userSettingNotes" placeholder="Any internal notes">
        </div>
      </div>

      <div class="row" style="margin-top: 12px;">
        <button class="primary" onclick="saveSelectedUserAccess()">Save Access</button>
        <button class="danger" onclick="deleteSelectedUser()">Delete User</button>
      </div>
      <div id="accessStatus" class="status"></div>
      <p class="subtle danger-text">Deleting a user permanently removes group access and custom settings.</p>
    </div>
  </div>

  <script>
    const state = {
      users: [],
      permissionGroups: [],
      waGroups: [],
      selectedUserId: null,
      selectedUserAccess: null
    };

    async function api(url, options = {}) {
      const res = await fetch(url, options);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || 'Request failed');
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }

    function setStatus(id, message, isError = false) {
      const el = document.getElementById(id);
      el.textContent = message;
      el.style.color = isError ? '#ff8787' : '#9ec8ee';
    }

    async function loadAll() {
      try {
        const [users, permissionGroups, waGroups] = await Promise.all([
          api('/api/users'),
          api('/api/access/permission-groups'),
          api('/api/groups')
        ]);
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
        list.innerHTML = '<div class="subtle">No users yet.</div>';
        return;
      }
      for (const user of state.users) {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.justifyContent = 'space-between';

        const left = document.createElement('div');
        left.innerHTML = '<strong>' + escapeHtml(user.display_name) + '</strong> <span class="mono">(' + escapeHtml(user.username) + ')</span>';

        const right = document.createElement('div');
        right.className = 'chips';

        const activeChip = document.createElement('span');
        activeChip.className = 'chip';
        activeChip.textContent = user.is_active ? 'active' : 'disabled';
        right.appendChild(activeChip);

        if (user.is_superadmin) {
          const adminChip = document.createElement('span');
          adminChip.className = 'chip';
          adminChip.textContent = 'superadmin';
          right.appendChild(adminChip);
        }

        const selectBtn = document.createElement('button');
        selectBtn.textContent = 'Select';
        selectBtn.style.padding = '6px 10px';
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
        list.innerHTML = '<div class="subtle">No permission groups.</div>';
        return;
      }
      for (const group of state.permissionGroups) {
        const box = document.createElement('div');
        box.style.borderBottom = '1px solid var(--border)';
        box.style.padding = '8px 0';
        const permissions = Array.isArray(group.permissions) ? group.permissions : [];
        box.innerHTML =
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">' +
            '<div><strong>' + escapeHtml(group.name) + '</strong><div class="subtle">' + escapeHtml(group.description || '') + '</div></div>' +
            '<button class="danger" style="padding:6px 10px;" onclick="deletePermissionGroup(' + group.id + ')">Delete</button>' +
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
        meta.textContent = 'No user selected.';
        return;
      }

      const user = state.users.find(u => u.id === state.selectedUserId);
      meta.innerHTML = user
        ? 'Editing: <strong>' + escapeHtml(user.display_name) + '</strong> <span class="mono">(' + escapeHtml(user.username) + ')</span>'
        : 'Editing user #' + state.selectedUserId;

      const selectedPermIds = new Set((state.selectedUserAccess.permissionGroupIds || []).map(Number));
      for (const group of state.permissionGroups) {
        const row = document.createElement('label');
        row.className = 'list-item';
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
        row.className = 'list-item';
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
        setStatus('createStatus', 'User created successfully');
        document.getElementById('createPassword').value = '';
        await loadAll();
      } catch (err) {
        setStatus('createStatus', err.message, true);
      }
    }

    async function createPermissionGroup() {
      try {
        const permissions = document.getElementById('permList').value
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
        await api('/api/access/permission-groups/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('permName').value,
            description: document.getElementById('permDescription').value,
            permissions
          })
        });
        setStatus('permStatus', 'Permission group created');
        document.getElementById('permName').value = '';
        document.getElementById('permDescription').value = '';
        document.getElementById('permList').value = '';
        await loadAll();
      } catch (err) {
        setStatus('permStatus', err.message, true);
      }
    }

    async function deletePermissionGroup(id) {
      if (!confirm('Delete this permission group?')) return;
      try {
        await api('/api/access/permission-groups/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        setStatus('permStatus', 'Permission group deleted');
        await loadAll();
      } catch (err) {
        setStatus('permStatus', err.message, true);
      }
    }

    async function saveSelectedUserAccess() {
      if (!state.selectedUserId) {
        setStatus('accessStatus', 'Select a user first', true);
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
          body: JSON.stringify({
            permissionGroupIds: permIds,
            allowedGroupIds: waGroupIds,
            settings
          })
        });
        setStatus('accessStatus', 'Access saved successfully');
        await selectUser(state.selectedUserId);
        await loadAll();
      } catch (err) {
        setStatus('accessStatus', err.message, true);
      }
    }

    async function deleteSelectedUser() {
      if (!state.selectedUserId) {
        setStatus('accessStatus', 'Select a user first', true);
        return;
      }
      if (!confirm('Delete selected user?')) return;

      try {
        await api('/api/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: state.selectedUserId })
        });
        setStatus('accessStatus', 'User deleted');
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

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    loadAll();
  </script>
</body>
</html>`;
};
