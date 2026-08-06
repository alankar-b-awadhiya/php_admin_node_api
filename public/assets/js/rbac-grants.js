/**
 * rbac-grants.js — Role Grants tab (maps to /master-rbac/grants).
 *   GET/POST /master-rbac/grants?usertypeId&resourceId&permissionId&isActive
 *   GET      /master-rbac/grants/:id
 *   PATCH    /master-rbac/grants/:id/allowed
 *   PATCH    /master-rbac/grants/:id/status
 *   DELETE   /master-rbac/grants/:id  (SUPERADMIN only)
 *   GET      /master-rbac/usertypes/:usertypeId/effective-permissions
 */
(function () {
  let rows = [];
  let usertypes = [];
  let resources = [];
  let permissions = [];

  async function init() {
    await Admin.requireAuth();
    await Promise.all([loadUsertypes(), loadResources(), loadPermissions()]);
    wireToolbar();
    document.getElementById('btnNewGrant').addEventListener('click', openCreateModal);
    document.getElementById('btnEffective').addEventListener('click', openEffectiveModal);
    await load();
  }

  async function loadUsertypes() {
    const res = await Admin.api.get('/master-usertypes');
    usertypes = res.data;
    fillSelect('usertypeFilter', usertypes, 'id', 'typeName', 'All roles');
  }
  async function loadResources() {
    const res = await Admin.api.get('/master-rbac/resources');
    resources = res.data;
    fillSelect('resourceFilter', resources, 'id', 'resourceName', 'All resources');
  }
  async function loadPermissions() {
    const res = await Admin.api.get('/master-rbac/permissions');
    permissions = res.data;
  }

  function fillSelect(id, items, valueKey, labelKey, placeholder) {
    const sel = document.getElementById(id);
    sel.innerHTML = `<option value="">${placeholder}</option>` + items.map((i) => `<option value="${i[valueKey]}">${Admin.escapeHtml(i[labelKey])}</option>`).join('');
  }

  function wireToolbar() {
    ['usertypeFilter', 'resourceFilter', 'statusFilter'].forEach((id) => {
      document.getElementById(id).addEventListener('change', load);
    });
  }

  async function load() {
    const body = document.getElementById('grantsTableBody');
    body.innerHTML = `<tr><td colspan="6" class="table-empty">Loading grants…</td></tr>`;
    try {
      const query = Admin.qs({
        usertypeId: document.getElementById('usertypeFilter').value,
        resourceId: document.getElementById('resourceFilter').value,
        isActive: document.getElementById('statusFilter').value,
      });
      const res = await Admin.api.get('/master-rbac/grants' + query);
      rows = res.data;
      render();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">Couldn't load grants.</td></tr>`;
      Admin.toastError(err);
    }
  }

  function usertypeName(id) {
    const ut = usertypes.find((u) => u.id === id);
    return ut ? ut.typeName : `#${id}`;
  }

  function render() {
    const body = document.getElementById('grantsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">No grants match your filters.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((g) => `
      <tr data-id="${g.id}">
        <td><strong>${Admin.escapeHtml(usertypeName(g.usertypeId))}</strong></td>
        <td>${Admin.escapeHtml(g.resource.name)} <span class="badge badge-gray">${Admin.escapeHtml(g.resource.type)}</span></td>
        <td><code>${Admin.escapeHtml(g.permission.code || g.permission.name)}</code></td>
        <td><label class="checkbox-row"><input type="checkbox" class="allowed-toggle" ${g.isAllowed ? 'checked' : ''}> ${g.isAllowed ? '<span class="badge badge-green">Allow</span>' : '<span class="badge badge-coral">Deny</span>'}</label></td>
        <td><label class="checkbox-row"><input type="checkbox" class="status-toggle" ${g.isActive ? 'checked' : ''}> ${Admin.badge(g.isActive)}</label></td>
        <td class="cell-actions">
          ${Admin.isUsertype('SUPERADMIN') ? '<button class="btn btn-danger btn-sm" data-act="delete">Revoke</button>' : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const g = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => remove(g));
      tr.querySelector('.allowed-toggle')?.addEventListener('change', (e) => toggleAllowed(g, e.target.checked));
      tr.querySelector('.status-toggle')?.addEventListener('change', (e) => toggleStatus(g, e.target.checked));
    });
  }

  function formHtml() {
    return `
      <div class="modal-header"><h3>New grant</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="grantForm">
        <div class="modal-body">
          <div id="grantFormErrors"></div>
          <div class="form-group">
            <label for="f-usertypeId">Role</label>
            <select id="f-usertypeId" required>${usertypes.map((u) => `<option value="${u.id}">${Admin.escapeHtml(u.typeName)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label for="f-resourceId">Resource</label>
            <select id="f-resourceId" required>${resources.map((r) => `<option value="${r.id}">${Admin.escapeHtml(r.resourceName)} (${Admin.escapeHtml(r.resourceType)})</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label for="f-permissionId">Permission</label>
            <select id="f-permissionId" required>${permissions.map((p) => `<option value="${p.id}">${Admin.escapeHtml(p.permissionCode || p.permissionName)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="checkbox-row"><input type="checkbox" id="f-isAllowed" checked> Allowed (uncheck to explicitly deny)</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="grantFormSubmit">Create grant</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() {
    if (!usertypes.length || !resources.length || !permissions.length) {
      Admin.toast('Create at least one usertype, resource and permission first', 'error');
      return;
    }
    Admin.openModal(formHtml());
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#grantForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('grantFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('grantFormSubmit');
      Admin.setButtonLoading(btn, true, 'Creating…');
      try {
        await Admin.api.post('/master-rbac/grants', {
          usertypeId: document.getElementById('f-usertypeId').value,
          resourceId: document.getElementById('f-resourceId').value,
          permissionId: document.getElementById('f-permissionId').value,
          isAllowed: document.getElementById('f-isAllowed').checked,
        });
        Admin.toast('Grant created', 'success');
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

  async function toggleAllowed(g, isAllowed) {
    try {
      await Admin.api.patch(`/master-rbac/grants/${g.id}/allowed`, { isAllowed });
      Admin.toast(isAllowed ? 'Grant set to allow' : 'Grant set to deny', 'success');
      load();
    } catch (err) { Admin.toastError(err); load(); }
  }

  async function toggleStatus(g, isActive) {
    try {
      await Admin.api.patch(`/master-rbac/grants/${g.id}/status`, { isActive });
      Admin.toast(isActive ? 'Grant activated' : 'Grant deactivated', 'success');
      load();
    } catch (err) { Admin.toastError(err); load(); }
  }

  async function remove(g) {
    const ok = await Admin.confirmAction({
      title: 'Revoke grant?',
      body: `Revoke <strong>${Admin.escapeHtml(usertypeName(g.usertypeId))}</strong>'s grant on <strong>${Admin.escapeHtml(g.resource.name)}</strong>?`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(`/master-rbac/grants/${g.id}`);
      Admin.toast('Grant revoked', 'success');
      load();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Effective permissions viewer --------------------------------------
  function openEffectiveModal() {
    Admin.openModal(`
      <div class="modal-header"><h3>Effective permissions</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label for="eff-usertype">Role</label>
          <select id="eff-usertype">
            <option value="">Select a role…</option>
            ${usertypes.map((u) => `<option value="${u.id}">${Admin.escapeHtml(u.typeName)}</option>`).join('')}
          </select>
        </div>
        <div id="eff-results"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-act="close">Close</button></div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#eff-usertype').addEventListener('change', async (e) => {
      const id = e.target.value;
      const box = document.getElementById('eff-results');
      if (!id) { box.innerHTML = ''; return; }
      box.innerHTML = `<p class="hint">Loading…</p>`;
      try {
        const res = await Admin.api.get(`/master-rbac/usertypes/${id}/effective-permissions`);
        const list = res.data || [];
        box.innerHTML = list.length
          ? `<div class="table-wrap"><table><thead><tr><th>Resource</th><th>Permission</th></tr></thead><tbody>${
              list.map((p) => `<tr><td>${Admin.escapeHtml(p.resourceName || p.resource || '')}</td><td><code>${Admin.escapeHtml(p.permissionCode || p.permissionName || p.permission || '')}</code></td></tr>`).join('')
            }</tbody></table></div>`
          : `<p class="hint">No active, allowed grants for this role.</p>`;
      } catch (err) {
        box.innerHTML = `<div class="form-errors">${Admin.escapeHtml(err.message)}</div>`;
      }
    });
  }

  init();
})();
