/**
 * usertypes.js — Usertypes page (maps to /master-usertypes).
 *   GET/POST    /master-usertypes
 *   GET/PUT     /master-usertypes/:id
 *   PATCH       /master-usertypes/:id/status
 *   DELETE      /master-usertypes/:id   (SUPERADMIN only; server also blocks is_system rows)
 */
(function () {
  let rows = [];

  async function init() {
    await Admin.requireAuth();
    document.getElementById('btnNewUsertype').addEventListener('click', openCreateModal);
    document.getElementById('statusFilter').addEventListener('change', load);
    await load();
  }

  async function load() {
    const body = document.getElementById('usertypesTableBody');
    body.innerHTML = `<tr><td colspan="6" class="table-empty">Loading usertypes…</td></tr>`;
    try {
      const isActive = document.getElementById('statusFilter').value;
      const res = await Admin.api.get('/master-usertypes' + Admin.qs({ isActive }));
      rows = res.data;
      render();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">Couldn't load usertypes.</td></tr>`;
      Admin.toastError(err);
    }
  }

  function render() {
    const body = document.getElementById('usertypesTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">No usertypes yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((ut) => `
      <tr data-id="${ut.id}">
        <td><code>${Admin.escapeHtml(ut.typeCode)}</code>${ut.isSystem ? ' <span class="badge badge-indigo">System</span>' : ''}</td>
        <td><strong>${Admin.escapeHtml(ut.typeName)}</strong></td>
        <td class="cell-muted">${Admin.escapeHtml(ut.description || '—')}</td>
        <td class="cell-muted">${(ut.permissions || []).length ? ut.permissions.map((p) => `<span class="badge badge-gray" style="margin:2px;">${Admin.escapeHtml(p)}</span>`).join('') : '—'}</td>
        <td><label class="checkbox-row"><input type="checkbox" class="status-toggle" ${ut.isActive ? 'checked' : ''}> ${Admin.badge(ut.isActive)}</label></td>
        <td class="cell-actions">
          <button class="btn btn-secondary btn-sm" data-act="edit">Edit</button>
          ${!ut.isSystem && Admin.isUsertype('SUPERADMIN') ? '<button class="btn btn-danger btn-sm" data-act="delete">Delete</button>' : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const ut = rows.find((r) => String(r.id) === tr.dataset.id);
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(ut));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => remove(ut));
      tr.querySelector('.status-toggle')?.addEventListener('change', (e) => toggleStatus(ut, e.target.checked));
    });
  }

  function formHtml(ut) {
    const isEdit = !!ut;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit usertype' : 'New usertype'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="utForm">
        <div class="modal-body">
          <div id="utFormErrors"></div>
          ${!isEdit ? `
          <div class="form-group">
            <label for="f-typeCode">Type code</label>
            <input type="text" id="f-typeCode" placeholder="e.g. EDITOR" style="text-transform:uppercase;" required>
            <p class="hint">Uppercase letters, numbers, underscore only.</p>
          </div>` : `<div class="form-group"><label>Type code</label><input type="text" value="${Admin.escapeHtml(ut.typeCode)}" disabled></div>`}
          <div class="form-group">
            <label for="f-typeName">Display name</label>
            <input type="text" id="f-typeName" value="${isEdit ? Admin.escapeHtml(ut.typeName) : ''}" required>
          </div>
          <div class="form-group">
            <label for="f-description">Description</label>
            <textarea id="f-description">${isEdit ? Admin.escapeHtml(ut.description || '') : ''}</textarea>
          </div>
          <div class="form-group">
            <label for="f-permissions">Permissions</label>
            <input type="text" id="f-permissions" value="${isEdit ? Admin.escapeHtml((ut.permissions || []).join(', ')) : ''}" placeholder="users.view, users.manage">
            <p class="hint">Comma-separated permission tags. Use <code>*</code> for full access.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="utFormSubmit">${isEdit ? 'Save changes' : 'Create usertype'}</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() { Admin.openModal(formHtml(null)); wireForm(null); }
  function openEditModal(ut) { Admin.openModal(formHtml(ut)); wireForm(ut); }

  function wireForm(ut) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#utForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('utFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('utFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      const permissions = document.getElementById('f-permissions').value
        .split(',').map((s) => s.trim()).filter(Boolean);
      try {
        if (ut) {
          await Admin.api.put(`/master-usertypes/${ut.id}`, {
            typeName: document.getElementById('f-typeName').value.trim(),
            description: document.getElementById('f-description').value.trim() || null,
            permissions,
          });
          Admin.toast('Usertype updated', 'success');
        } else {
          await Admin.api.post('/master-usertypes', {
            typeCode: document.getElementById('f-typeCode').value.trim().toUpperCase(),
            typeName: document.getElementById('f-typeName').value.trim(),
            description: document.getElementById('f-description').value.trim() || null,
            permissions,
          });
          Admin.toast('Usertype created', 'success');
        }
        Admin.closeModal();
        load();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  async function toggleStatus(ut, isActive) {
    try {
      await Admin.api.patch(`/master-usertypes/${ut.id}/status`, { isActive });
      Admin.toast(isActive ? 'Usertype activated' : 'Usertype deactivated', 'success');
      load();
    } catch (err) { Admin.toastError(err); load(); }
  }

  async function remove(ut) {
    const ok = await Admin.confirmAction({
      title: 'Delete usertype?',
      body: `Delete <strong>${Admin.escapeHtml(ut.typeName)}</strong>? Users currently on this role must be moved first.`,
      confirmLabel: 'Delete usertype',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(`/master-usertypes/${ut.id}`);
      Admin.toast('Usertype deleted', 'success');
      load();
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
