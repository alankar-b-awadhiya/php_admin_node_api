/**
 * users.js — Master Users page (maps to /master-users).
 * Endpoints used:
 *   GET    /master-users?page&pageSize&usertypeId&isActive&search
 *   GET    /master-users/:id
 *   POST   /master-users
 *   PUT    /master-users/:id
 *   PATCH  /master-users/:id/usertype
 *   PATCH  /master-users/:id/status
 *   POST   /master-users/:id/reset-password
 *   POST   /master-users/:id/unlock
 *   DELETE /master-users/:id   (SUPERADMIN only)
 *   GET    /master-users/:id/sessions               - admin-level session list
 *   DELETE /master-users/:id/sessions/:jti           - revoke one session
 *   DELETE /master-users/:id/sessions (body:{jtis})  - bulk revoke
 */
(function () {
  let state = { page: 1, pageSize: 20, search: '', usertypeId: '', isActive: '' };
  let usertypes = [];

  async function init() {
    await Admin.requireAuth();
    await loadUsertypes();
    wireToolbar();
    document.getElementById('btnNewUser').addEventListener('click', openCreateModal);
    await loadUsers();
  }

  async function loadUsertypes() {
    try {
      const res = await Admin.api.get('/master-usertypes');
      usertypes = res.data;
      const filterSel = document.getElementById('usertypeFilter');
      usertypes.forEach((ut) => {
        const opt = document.createElement('option');
        opt.value = ut.id;
        opt.textContent = ut.typeName;
        filterSel.appendChild(opt);
      });
    } catch (err) {
      Admin.toastError(err);
    }
  }

  function wireToolbar() {
    document.getElementById('searchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim();
      state.page = 1;
      loadUsers();
    }, 350));
    document.getElementById('usertypeFilter').addEventListener('change', (e) => {
      state.usertypeId = e.target.value;
      state.page = 1;
      loadUsers();
    });
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.isActive = e.target.value;
      state.page = 1;
      loadUsers();
    });
  }

  async function loadUsers() {
    const body = document.getElementById('usersTableBody');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading users…</td></tr>`;
    try {
      const query = Admin.qs({
        page: state.page, pageSize: state.pageSize, search: state.search,
        usertypeId: state.usertypeId, isActive: state.isActive,
      });
      const res = await Admin.api.get('/master-users' + query);
      renderTable(res.data);
      renderPagination(res.meta && res.meta.pagination);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load users.</td></tr>`;
      Admin.toastError(err);
    }
  }

  function renderTable(rows) {
    const body = document.getElementById('usersTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">No users match your filters.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((u) => `
      <tr data-id="${u.id}">
        <td><strong>${Admin.escapeHtml(u.fullName)}</strong>${u.mustChangePassword ? ' <span class="badge badge-amber">Must reset PW</span>' : ''}</td>
        <td class="cell-muted mono">${Admin.escapeHtml(u.username)}</td>
        <td class="cell-muted">${Admin.escapeHtml(u.email || u.mobile || '—')}</td>
        <td>${roleSelect(u)}</td>
        <td>${statusToggle(u)}</td>
        <td class="cell-muted">${Admin.timeAgo(u.lastLoginAt)}</td>
        <td class="cell-actions">
          <button class="btn btn-secondary btn-sm" data-act="edit">Edit</button>
          <button class="btn btn-ghost btn-sm" data-act="sessions">Sessions</button>
          <button class="btn btn-ghost btn-sm" data-act="reset">Reset PW</button>
          ${u.lockedUntil ? '<button class="btn btn-ghost btn-sm" data-act="unlock">Unlock</button>' : ''}
          ${Admin.isUsertype('SUPERADMIN') ? '<button class="btn btn-danger btn-sm" data-act="delete">Delete</button>' : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const id = tr.dataset.id;
      const row = rows.find((r) => String(r.id) === id);
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(row));
      tr.querySelector('[data-act="sessions"]')?.addEventListener('click', () => openSessionsModal(row));
      tr.querySelector('[data-act="reset"]')?.addEventListener('click', () => resetPassword(row));
      tr.querySelector('[data-act="unlock"]')?.addEventListener('click', () => unlockUser(row));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteUser(row));
      const roleSel = tr.querySelector('.role-select');
      if (roleSel) roleSel.addEventListener('change', () => changeUsertype(row, roleSel.value));
      const statusInput = tr.querySelector('.status-toggle');
      if (statusInput) statusInput.addEventListener('change', () => toggleStatus(row, statusInput.checked));
    });
  }

  function roleSelect(u) {
    const opts = usertypes.map((ut) => `<option value="${ut.id}" ${ut.id === u.usertype.id ? 'selected' : ''}>${Admin.escapeHtml(ut.typeName)}</option>`).join('');
    return `<select class="role-select" style="padding:5px 8px; font-size:12.5px;">${opts}</select>`;
  }

  function statusToggle(u) {
    return `<label class="checkbox-row"><input type="checkbox" class="status-toggle" ${u.isActive ? 'checked' : ''}> ${Admin.badge(u.isActive)}</label>`;
  }

  function renderPagination(pagination) {
    const el = document.getElementById('pagination');
    if (!pagination) { el.innerHTML = ''; return; }
    const { page, pageSize, total } = pagination;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    el.innerHTML = `
      <span>${total} user${total === 1 ? '' : 's'} · page ${page} of ${totalPages}</span>
      <div class="flex-gap">
        <button class="btn btn-secondary btn-sm" id="prevPage" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <button class="btn btn-secondary btn-sm" id="nextPage" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>`;
    document.getElementById('prevPage')?.addEventListener('click', () => { state.page--; loadUsers(); });
    document.getElementById('nextPage')?.addEventListener('click', () => { state.page++; loadUsers(); });
  }

  // ---- Create / Edit modal ----------------------------------------------
  function userFormHtml(u) {
    const isEdit = !!u;
    const roleOpts = usertypes.map((ut) => `<option value="${ut.id}" ${u && ut.id === u.usertype.id ? 'selected' : ''}>${Admin.escapeHtml(ut.typeName)}</option>`).join('');
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit user' : 'New user'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="userForm">
        <div class="modal-body">
          <div id="userFormErrors"></div>
          ${!isEdit ? `
          <div class="form-group">
            <label for="f-usertypeId">Role</label>
            <select id="f-usertypeId" required>${roleOpts}</select>
          </div>` : ''}
          <div class="form-group">
            <label for="f-fullName">Full name</label>
            <input type="text" id="f-fullName" value="${isEdit ? Admin.escapeHtml(u.fullName) : ''}" required>
          </div>
          <div class="form-row">
            ${!isEdit ? `
            <div class="form-group">
              <label for="f-username">Username</label>
              <input type="text" id="f-username" placeholder="3-50 chars: letters, numbers, . _" required>
            </div>` : '<div></div>'}
            <div class="form-group">
              <label for="f-email">Email</label>
              <input type="email" id="f-email" value="${isEdit ? Admin.escapeHtml(u.email || '') : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-mobile">Mobile</label>
              <input type="text" id="f-mobile" placeholder="10-digit mobile" value="${isEdit ? Admin.escapeHtml(u.mobile || '') : ''}">
            </div>
            ${!isEdit ? `
            <div class="form-group">
              <label for="f-password">Password (optional)</label>
              <input type="password" id="f-password" placeholder="Leave blank to auto-generate">
            </div>` : '<div></div>'}
          </div>
          ${!isEdit ? '<p class="hint">Email or mobile is required (used for OTP login). Leaving password blank creates a temporary password shown once after creation.</p>' : ''}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="userFormSubmit">${isEdit ? 'Save changes' : 'Create user'}</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() {
    Admin.openModal(userFormHtml(null));
    wireModalForm(null);
  }
  function openEditModal(u) {
    Admin.openModal(userFormHtml(u));
    wireModalForm(u);
  }

  function wireModalForm(u) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('userFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('userFormSubmit');
      Admin.setButtonLoading(btn, true, u ? 'Saving…' : 'Creating…');
      try {
        if (u) {
          await Admin.api.put(`/master-users/${u.id}`, {
            fullName: document.getElementById('f-fullName').value.trim(),
            email: document.getElementById('f-email').value.trim() || null,
            mobile: document.getElementById('f-mobile').value.trim() || null,
          });
          Admin.toast('User updated', 'success');
        } else {
          const password = document.getElementById('f-password').value;
          const res = await Admin.api.post('/master-users', {
            usertypeId: document.getElementById('f-usertypeId').value,
            fullName: document.getElementById('f-fullName').value.trim(),
            username: document.getElementById('f-username').value.trim(),
            email: document.getElementById('f-email').value.trim() || null,
            mobile: document.getElementById('f-mobile').value.trim() || null,
            password: password || undefined,
          });
          Admin.toast('User created', 'success');
          if (res.data.tempPassword) showTempPassword(res.data.tempPassword, res.data.user.username);
        }
        Admin.closeModal();
        loadUsers();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  function showTempPassword(tempPassword, username) {
    Admin.openModal(`
      <div class="modal-header"><h3>Temporary password</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="callout callout-amber">Share this with <strong>${Admin.escapeHtml(username)}</strong> securely — it will not be shown again.</div>
        <div class="form-group"><label>Temporary password</label><input type="text" readonly value="${Admin.escapeHtml(tempPassword)}" onclick="this.select()"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" data-act="close">Done</button></div>
    `);
    document.querySelectorAll('#modalBackdrop [data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
  }

  // ---- Row actions -------------------------------------------------------
  async function changeUsertype(u, usertypeId) {
    try {
      await Admin.api.patch(`/master-users/${u.id}/usertype`, { usertypeId });
      Admin.toast('Role updated', 'success');
      loadUsers();
    } catch (err) { Admin.toastError(err); loadUsers(); }
  }

  async function toggleStatus(u, isActive) {
    try {
      await Admin.api.patch(`/master-users/${u.id}/status`, { isActive });
      Admin.toast(isActive ? 'User activated' : 'User deactivated', 'success');
      loadUsers();
    } catch (err) { Admin.toastError(err); loadUsers(); }
  }

  async function resetPassword(u) {
    const ok = await Admin.confirmAction({
      title: 'Reset password?',
      body: `Generate a new temporary password for <strong>${Admin.escapeHtml(u.fullName)}</strong>? They'll need to change it on next login.`,
      confirmLabel: 'Reset password',
    });
    if (!ok) return;
    try {
      const res = await Admin.api.post(`/master-users/${u.id}/reset-password`);
      showTempPassword(res.data.tempPassword, u.username);
      loadUsers();
    } catch (err) { Admin.toastError(err); }
  }

  async function unlockUser(u) {
    try {
      await Admin.api.post(`/master-users/${u.id}/unlock`);
      Admin.toast('User unlocked', 'success');
      loadUsers();
    } catch (err) { Admin.toastError(err); }
  }

  async function deleteUser(u) {
    const ok = await Admin.confirmAction({
      title: 'Delete user?',
      body: `This permanently deletes <strong>${Admin.escapeHtml(u.fullName)}</strong> (${Admin.escapeHtml(u.username)}). This can't be undone.`,
      confirmLabel: 'Delete user',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(`/master-users/${u.id}`);
      Admin.toast('User deleted', 'success');
      loadUsers();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Admin-level session management ------------------------------------
  // Distinct from the person's own "My Sessions" page (sessions.js) - this
  // lets an admin see/revoke ANY user's sessions, e.g. after a suspicious
  // activity flag or a reported lost/stolen device.
  let sessionSelection = new Set();

  async function openSessionsModal(u) {
    sessionSelection = new Set();
    Admin.openModal(sessionsModalHtml(u, null, 'loading'), 'modal-lg');
    wireSessionsModalStatic(u);
    await loadSessions(u);
  }

  function sessionsModalHtml(u, rows, state) {
    return `
      <div class="modal-header">
        <h3>Sessions — ${Admin.escapeHtml(u.fullName)}</h3>
        <button class="btn btn-ghost btn-icon" data-act="close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" id="sessSelectAll"></th>
                <th>Device / browser</th><th>IP address</th><th>Signed in</th><th>Expires</th><th></th>
              </tr>
            </thead>
            <tbody id="sessionsModalBody">
              ${state === 'loading'
                ? `<tr><td colspan="6" class="table-empty">Loading sessions…</td></tr>`
                : sessionsRowsHtml(rows)}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn btn-danger" id="btnRevokeSelected" disabled>Revoke selected (0)</button>
        <button class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `;
  }

  function sessionsRowsHtml(rows) {
    if (!rows || !rows.length) {
      return `<tr><td colspan="6" class="table-empty">No active sessions.</td></tr>`;
    }
    return rows.map((s) => `
      <tr data-jti="${Admin.escapeHtml(s.jti)}">
        <td><input type="checkbox" class="sess-row-select" value="${Admin.escapeHtml(s.jti)}"></td>
        <td>${Admin.escapeHtml(s.userAgent || 'Unknown device')}</td>
        <td class="cell-muted mono">${Admin.escapeHtml(s.ipAddress || '—')}</td>
        <td class="cell-muted">${Admin.formatDate(s.createdAt)}</td>
        <td class="cell-muted">${Admin.formatDate(s.expiresAt)}</td>
        <td class="cell-actions"><button class="btn btn-danger btn-sm" data-act="revoke-one">Revoke</button></td>
      </tr>
    `).join('');
  }

  function wireSessionsModalStatic(u) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    document.getElementById('btnRevokeSelected').addEventListener('click', () => revokeSelectedSessions(u));
  }

  function wireSessionsModalRows(u) {
    const body = document.getElementById('sessionsModalBody');
    const selectAll = document.getElementById('sessSelectAll');
    const revokeBtn = document.getElementById('btnRevokeSelected');

    function updateRevokeBtn() {
      revokeBtn.disabled = sessionSelection.size === 0;
      revokeBtn.textContent = `Revoke selected (${sessionSelection.size})`;
    }

    body.querySelectorAll('.sess-row-select').forEach((cb) => {
      cb.checked = sessionSelection.has(cb.value);
      cb.addEventListener('change', () => {
        if (cb.checked) sessionSelection.add(cb.value); else sessionSelection.delete(cb.value);
        updateRevokeBtn();
      });
    });
    selectAll?.addEventListener('change', () => {
      body.querySelectorAll('.sess-row-select').forEach((cb) => {
        cb.checked = selectAll.checked;
        if (cb.checked) sessionSelection.add(cb.value); else sessionSelection.delete(cb.value);
      });
      updateRevokeBtn();
    });
    body.querySelectorAll('tr').forEach((tr) => {
      tr.querySelector('[data-act="revoke-one"]')?.addEventListener('click', () => revokeOneSession(u, tr.dataset.jti));
    });
    updateRevokeBtn();
  }

  async function loadSessions(u) {
    const body = document.getElementById('sessionsModalBody');
    try {
      const res = await Admin.api.get(`/master-users/${u.id}/sessions`);
      body.innerHTML = sessionsRowsHtml(res.data);
      wireSessionsModalRows(u);
    } catch (err) {
      if (body) body.innerHTML = `<tr><td colspan="6" class="table-empty">Couldn't load sessions.</td></tr>`;
      Admin.toastError(err);
    }
  }

  async function revokeOneSession(u, jti) {
    const ok = await Admin.confirmAction({
      title: 'Revoke this session?',
      body: `${Admin.escapeHtml(u.fullName)} will be signed out on that device immediately.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(`/master-users/${u.id}/sessions/${encodeURIComponent(jti)}`);
      Admin.toast('Session revoked', 'success');
      sessionSelection.delete(jti);
      await loadSessions(u);
    } catch (err) { Admin.toastError(err); }
  }

  async function revokeSelectedSessions(u) {
    const jtis = Array.from(sessionSelection);
    if (!jtis.length) return;
    const ok = await Admin.confirmAction({
      title: `Revoke ${jtis.length} session${jtis.length === 1 ? '' : 's'}?`,
      body: `${Admin.escapeHtml(u.fullName)} will be signed out on ${jtis.length === 1 ? 'that device' : 'those devices'} immediately.`,
      confirmLabel: 'Revoke selected',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await Admin.api.delWithBody(`/master-users/${u.id}/sessions`, { jtis });
      Admin.toast(`${res.data.revokedCount} session(s) revoked`, 'success');
      sessionSelection = new Set();
      await loadSessions(u);
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
