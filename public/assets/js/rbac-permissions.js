/**
 * rbac-permissions.js — Permissions tab + Role Matrix tab.
 *
 * Permissions tab maps to:
 *   GET/POST /master-rbac/permissions
 *   GET/PUT  /master-rbac/permissions/:id
 *   PATCH    /master-rbac/permissions/:id/status
 *   DELETE   /master-rbac/permissions/:id  (SUPERADMIN only)
 *
 * Role Matrix tab maps to:
 *   GET  /master-usertypes
 *   GET  /master-rbac/resources
 *   GET  /master-rbac/permissions
 *   GET  /master-rbac/grants?usertypeId=X
 *   POST /master-rbac/grants                                 (single-cell upsert)
 *   POST /master-rbac/usertypes/:usertypeId/grants/bulk       (grant-all / revoke-all / copy-from — new bulk endpoint)
 */
(function () {
  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    folder: '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a1 1 0 0 1 1-1h4l1.5 2H17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z"/></svg>',
  };

  // ============================= Tabs ====================================
  function initTabs() {
    const tabs = document.querySelectorAll('.tabstrip-btn');
    tabs.forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
    const initial = (location.hash === '#matrix') ? 'matrix' : 'permissions';
    activateTab(initial);
  }

  let matrixLoaded = false;
  function activateTab(name) {
    document.querySelectorAll('.tabstrip-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
    history.replaceState(null, '', name === 'matrix' ? '#matrix' : location.pathname);
    if (name === 'matrix' && !matrixLoaded) {
      matrixLoaded = true;
      Matrix.init();
    }
  }

  // ========================= Permissions tab ==============================
  const PermTab = (function () {
    let rows = [];

    function init() {
      document.getElementById('btnNewPermission').addEventListener('click', openCreateModal);
      document.getElementById('statusFilter').addEventListener('change', load);
      document.getElementById('permSearchInput').addEventListener('input', Admin.debounce(render, 200));
      document.getElementById('btnRefreshPerm').addEventListener('click', () => load(true));
      load();
    }

    async function load(spin) {
      const body = document.getElementById('permissionsTableBody');
      const refreshBtn = document.getElementById('btnRefreshPerm');
      if (spin) refreshBtn.classList.add('is-spinning');
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading permissions…</td></tr>`;
      try {
        const isActive = document.getElementById('statusFilter').value;
        const res = await Admin.api.get('/master-rbac/permissions' + Admin.qs({ isActive }));
        rows = res.data;
        render();
      } catch (err) {
        body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load permissions.</td></tr>`;
        Admin.toastError(err);
      } finally {
        if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
      }
    }

    function filteredRows() {
      const q = document.getElementById('permSearchInput').value.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((p) => [p.permissionName, p.permissionCode, p.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    }

    function render() {
      const body = document.getElementById('permissionsTableBody');
      const visible = filteredRows();
      document.getElementById('permissionCount').textContent = `${rows.length} permission${rows.length === 1 ? '' : 's'}`;

      if (!visible.length) {
        body.innerHTML = `<tr><td colspan="7" class="table-empty">No permissions match your filters.</td></tr>`;
        return;
      }

      body.innerHTML = visible.map((p, i) => `
        <tr data-id="${p.id}">
          <td class="cell-muted">${i + 1}</td>
          <td><strong>${Admin.escapeHtml(p.permissionName)}</strong></td>
          <td><code class="text-code" style="font-size:12px;">${Admin.escapeHtml(p.permissionCode || '—')}</code></td>
          <td class="cell-muted">${Admin.escapeHtml(p.description || '—')}</td>
          <td>${Admin.badge(p.isActive)}</td>
          <td class="cell-muted">${Admin.formatDate(p.createdAt)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
            <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
            <button class="icon-action icon-action-toggle" data-act="toggle" title="${p.isActive ? 'Deactivate' : 'Activate'}">${ICON.toggle}</button>
            ${Admin.isUsertype('SUPERADMIN') ? `<button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>` : ''}
          </td>
        </tr>
      `).join('');

      body.querySelectorAll('tr').forEach((tr) => {
        const p = rows.find((x) => String(x.id) === tr.dataset.id);
        tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(p));
        tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(p));
        tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => remove(p));
        tr.querySelector('[data-act="toggle"]')?.addEventListener('click', () => toggleStatus(p, !p.isActive));
      });
    }

    function openViewModal(p) {
      Admin.openModal(`
        <div class="modal-header"><h3>${Admin.escapeHtml(p.permissionName)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Code</label><code class="text-code" style="font-size:13px;">${Admin.escapeHtml(p.permissionCode || '—')}</code></div>
          <div class="form-group"><label>Description</label><p style="color:var(--text);margin:0;">${Admin.escapeHtml(p.description || '—')}</p></div>
          <div class="form-group"><label>Status</label>${Admin.badge(p.isActive)}</div>
          <div class="form-group"><label>Created</label><p style="color:var(--text);margin:0;">${Admin.formatDate(p.createdAt)}</p></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" data-act="close">Close</button></div>
      `);
      document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    }

    function formHtml(p) {
      const isEdit = !!p;
      return `
        <div class="modal-header"><h3>${isEdit ? 'Edit permission' : 'New permission'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
        <form id="permForm">
          <div class="modal-body">
            <div id="permFormErrors"></div>
            <div class="form-group">
              <label for="f-permissionCode">Code</label>
              <input type="text" id="f-permissionCode" value="${isEdit ? Admin.escapeHtml(p.permissionCode || '') : ''}" placeholder="e.g. USERS.VIEW">
              <p class="hint">Uppercase letters/numbers/underscore/dot.</p>
            </div>
            <div class="form-group">
              <label for="f-permissionName">Name</label>
              <input type="text" id="f-permissionName" value="${isEdit ? Admin.escapeHtml(p.permissionName) : ''}" required>
            </div>
            <div class="form-group">
              <label for="f-description">Description</label>
              <textarea id="f-description">${isEdit ? Admin.escapeHtml(p.description || '') : ''}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
            <button type="submit" class="btn btn-primary" id="permFormSubmit">${isEdit ? 'Save changes' : 'Create permission'}</button>
          </div>
        </form>
      `;
    }

    function openCreateModal() { Admin.openModal(formHtml(null)); wireForm(null); }
    function openEditModal(p) { Admin.openModal(formHtml(p)); wireForm(p); }

    function wireForm(p) {
      const backdrop = document.getElementById('modalBackdrop');
      backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
      backdrop.querySelector('#permForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = document.getElementById('permFormErrors');
        errBox.innerHTML = '';
        const btn = document.getElementById('permFormSubmit');
        Admin.setButtonLoading(btn, true, 'Saving…');
        try {
          if (p) {
            await Admin.api.put(`/master-rbac/permissions/${p.id}`, {
              permissionName: document.getElementById('f-permissionName').value.trim(),
              description: document.getElementById('f-description').value.trim() || null,
            });
            Admin.toast('Permission updated', 'success');
          } else {
            await Admin.api.post('/master-rbac/permissions', {
              permissionCode: document.getElementById('f-permissionCode').value.trim().toUpperCase() || undefined,
              permissionName: document.getElementById('f-permissionName').value.trim(),
              description: document.getElementById('f-description').value.trim() || null,
            });
            Admin.toast('Permission created', 'success');
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

    async function toggleStatus(p, isActive) {
      try {
        await Admin.api.patch(`/master-rbac/permissions/${p.id}/status`, { isActive });
        Admin.toast(isActive ? 'Permission activated' : 'Permission deactivated', 'success');
        load();
      } catch (err) { Admin.toastError(err); load(); }
    }

    async function remove(p) {
      const ok = await Admin.confirmAction({
        title: 'Delete permission?',
        body: `Delete <strong>${Admin.escapeHtml(p.permissionName)}</strong>? Any grants referencing it will be removed too.`,
        confirmLabel: 'Delete permission',
        danger: true,
      });
      if (!ok) return;
      try {
        await Admin.api.del(`/master-rbac/permissions/${p.id}`);
        Admin.toast('Permission deleted', 'success');
        load();
      } catch (err) { Admin.toastError(err); }
    }

    return { init, load };
  })();

  // ============================ Role Matrix tab ===========================
  const Matrix = (function () {
    let usertypes = [];
    let resources = [];
    let permissions = [];
    let grantMap = {}; // `${resourceId}:${permissionId}` -> grant

    async function init() {
      try {
        const [utRes, resRes, permRes] = await Promise.all([
          Admin.api.get('/master-usertypes' + Admin.qs({ isActive: 'true' })),
          Admin.api.get('/master-rbac/resources' + Admin.qs({ isActive: 'true' })),
          Admin.api.get('/master-rbac/permissions' + Admin.qs({ isActive: 'true' })),
        ]);
        usertypes = utRes.data;
        resources = resRes.data;
        permissions = permRes.data;
        populateRoleSelects();
        wireToolbar();
        if (usertypes.length) await loadGrantsForRole(document.getElementById('matrixRole').value);
        else document.getElementById('matrixGroups').innerHTML = `<div class="card"><div class="table-empty">No roles found. Create a usertype first.</div></div>`;
      } catch (err) {
        document.getElementById('matrixGroups').innerHTML = `<div class="card"><div class="table-empty">Couldn't load the role matrix.</div></div>`;
        Admin.toastError(err);
      }
    }

    function populateRoleSelects() {
      const roleSel = document.getElementById('matrixRole');
      const copySel = document.getElementById('matrixCopyFrom');
      roleSel.innerHTML = usertypes.map((u) => `<option value="${u.id}">${Admin.escapeHtml((u.code || u.name || '').toLowerCase())}</option>`).join('');
      copySel.innerHTML = '<option value="">— Source role —</option>' + usertypes.map((u) => `<option value="${u.id}">${Admin.escapeHtml((u.code || u.name || '').toLowerCase())}</option>`).join('');
    }

    function wireToolbar() {
      document.getElementById('matrixRole').addEventListener('change', (e) => loadGrantsForRole(e.target.value));
      document.getElementById('btnCopyFrom').addEventListener('click', copyFromRole);
      document.getElementById('btnGrantAll').addEventListener('click', () => bulkSetAll(true));
      document.getElementById('btnRevokeAll').addEventListener('click', () => bulkSetAll(false));
      document.getElementById('btnEffective').addEventListener('click', openEffectiveModal);
    }

    async function loadGrantsForRole(usertypeId) {
      renderLoading();
      try {
        const res = await Admin.api.get('/master-rbac/grants' + Admin.qs({ usertypeId, isActive: 'true' }));
        grantMap = {};
        res.data.forEach((g) => { grantMap[`${g.resource.id}:${g.permission.id}`] = g; });
        renderMatrix(usertypeId);
      } catch (err) {
        document.getElementById('matrixGroups').innerHTML = `<div class="card"><div class="table-empty">Couldn't load grants for this role.</div></div>`;
        Admin.toastError(err);
      }
    }

    function renderLoading() {
      document.getElementById('matrixGroups').innerHTML = `<div class="card"><div class="table-empty">Loading role matrix…</div></div>`;
    }

    // ---- Tree grouping (v2: resources carry parentId) ---------------------
    // Each top-level resource (parentId === null) becomes its own card/group;
    // its entire descendant subtree renders inside that card as indented rows,
    // so the matrix mirrors the real module → sub_module → page → api tree
    // instead of a flat, arbitrary resourceType bucket.
    function buildRootGroups() {
      const byParent = {};
      resources.forEach((r) => { const k = r.parentId ?? 'root'; (byParent[k] = byParent[k] || []).push(r); });
      Object.values(byParent).forEach((g) => g.sort((a, b) => String(a.resourceName).localeCompare(String(b.resourceName))));

      const groups = [];
      const visiting = new Set();
      function collect(id, depth, bucket) {
        (byParent[id] || []).forEach((r) => {
          if (visiting.has(r.id)) return;
          visiting.add(r.id);
          bucket.push({ ...r, depth });
          collect(r.id, depth + 1, bucket);
        });
      }
      (byParent.root || []).forEach((root) => {
        visiting.add(root.id);
        const bucket = [{ ...root, depth: 0 }];
        collect(root.id, 1, bucket);
        groups.push({ rootId: root.id, rootName: root.resourceName, rootType: root.resourceType, rows: bucket });
      });
      // Resources whose parent chain is broken/missing (shouldn't normally
      // happen) still need a home — surface them as their own single-row group.
      const grouped = new Set(groups.flatMap((g) => g.rows.map((r) => r.id)));
      resources.forEach((r) => {
        if (!grouped.has(r.id)) groups.push({ rootId: r.id, rootName: r.resourceName, rootType: r.resourceType, rows: [{ ...r, depth: 0 }] });
      });
      return groups;
    }

    function renderMatrix() {
      const groups = buildRootGroups();
      const container = document.getElementById('matrixGroups');
      container.innerHTML = groups.map((group) => `
        <div class="card" style="margin-bottom:18px;" data-root-id="${group.rootId}">
          <div class="module-group-header">
            <span class="module-group-title">${ICON.folder} ${Admin.escapeHtml(group.rootName)}
              <span class="badge-outline" style="margin-left:6px;">${Admin.escapeHtml((group.rootType || '').toLowerCase())}</span>
              <span class="count-pill-soft">${group.rows.length} Resource${group.rows.length === 1 ? '' : 's'}</span>
            </span>
            <span class="all-none-links">
              <button class="link-all" data-group-act="all">✓ All</button>
              <button class="link-none" data-group-act="none">✕ None</button>
            </span>
          </div>
          <div class="matrix-table-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th class="resource-head">Resource</th>
                  ${permissions.map((p) => `<th>${Admin.escapeHtml(p.permissionName)}<span class="perm-code text-code">${Admin.escapeHtml((p.permissionCode || '').toLowerCase())}</span></th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${group.rows.map((r) => `
                  <tr data-resource-id="${r.id}">
                    <td class="matrix-resource-cell" style="padding-left:${14 + r.depth * 18}px;">
                      ${r.depth > 0 ? '<span class="tree-branch">└</span>' : ''}<strong>${Admin.escapeHtml(r.resourceName)}</strong>
                      <span>${Admin.escapeHtml((r.resourceType || '').toLowerCase())}${r.description ? ' · ' + Admin.escapeHtml(r.description) : ''}</span>
                    </td>
                    ${permissions.map((p) => {
                      const g = grantMap[`${r.id}:${p.id}`];
                      const checked = !!(g && g.isAllowed);
                      return `<td><label class="switch"><input type="checkbox" data-resource-id="${r.id}" data-permission-id="${p.id}" ${checked ? 'checked' : ''}><span class="slider"></span></label></td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('input[type="checkbox"][data-resource-id]').forEach((input) => {
        input.addEventListener('change', (e) => onCellToggle(e.target));
      });
      container.querySelectorAll('[data-group-act]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const card = e.target.closest('.card');
          const rootId = Number(card.dataset.rootId);
          setGroupAll(rootId, btn.dataset.groupAct === 'all');
        });
      });
    }

    async function onCellToggle(input) {
      const usertypeId = document.getElementById('matrixRole').value;
      const resourceId = Number(input.dataset.resourceId);
      const permissionId = Number(input.dataset.permissionId);
      const isAllowed = input.checked;
      input.disabled = true;
      try {
        await Admin.api.post('/master-rbac/grants', { usertypeId: Number(usertypeId), resourceId, permissionId, isAllowed });
        grantMap[`${resourceId}:${permissionId}`] = { resource: { id: resourceId }, permission: { id: permissionId }, isAllowed };
      } catch (err) {
        input.checked = !isAllowed; // revert on failure
        Admin.toastError(err);
      } finally {
        input.disabled = false;
      }
    }

    function subtreeIds(rootId) {
      const ids = new Set([rootId]);
      let frontier = [rootId];
      while (frontier.length) {
        const next = resources.filter((r) => frontier.includes(r.parentId)).map((r) => r.id);
        next.forEach((n) => ids.add(n));
        frontier = next;
      }
      return ids;
    }

    async function setGroupAll(rootId, isAllowed) {
      const usertypeId = Number(document.getElementById('matrixRole').value);
      const ids = subtreeIds(rootId);
      const grants = resources.filter((r) => ids.has(r.id))
        .flatMap((r) => permissions.map((p) => ({ resourceId: r.id, permissionId: p.id, isAllowed })));
      if (!grants.length) return;
      const rootName = resources.find((r) => r.id === rootId)?.resourceName || `#${rootId}`;
      try {
        await Admin.api.post(`/master-rbac/usertypes/${usertypeId}/grants/bulk`, { grants });
        Admin.toast(`${rootName} ${isAllowed ? 'granted' : 'revoked'} for all permissions`, 'success');
        await loadGrantsForRole(usertypeId);
      } catch (err) { Admin.toastError(err); }
    }

    async function bulkSetAll(isAllowed) {
      const usertypeId = Number(document.getElementById('matrixRole').value);
      if (!usertypeId) return;
      const ok = await Admin.confirmAction({
        title: isAllowed ? 'Grant all permissions?' : 'Revoke all permissions?',
        body: `This will ${isAllowed ? 'grant' : 'revoke'} every permission on every resource for this role.`,
        confirmLabel: isAllowed ? 'Grant all' : 'Revoke all',
        danger: !isAllowed,
      });
      if (!ok) return;
      const grants = resources.flatMap((r) => permissions.map((p) => ({ resourceId: r.id, permissionId: p.id, isAllowed })));
      const btn = isAllowed ? document.getElementById('btnGrantAll') : document.getElementById('btnRevokeAll');
      Admin.setButtonLoading(btn, true, isAllowed ? 'Granting…' : 'Revoking…');
      try {
        await Admin.api.post(`/master-rbac/usertypes/${usertypeId}/grants/bulk`, { grants });
        Admin.toast(isAllowed ? 'All permissions granted' : 'All permissions revoked', 'success');
        await loadGrantsForRole(usertypeId);
      } catch (err) {
        Admin.toastError(err);
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    }

    async function copyFromRole() {
      const sourceId = document.getElementById('matrixCopyFrom').value;
      const targetId = Number(document.getElementById('matrixRole').value);
      if (!sourceId) { Admin.toast('Pick a source role to copy from first', 'error'); return; }
      if (Number(sourceId) === targetId) { Admin.toast('Source and target role are the same', 'error'); return; }
      const ok = await Admin.confirmAction({
        title: 'Copy permissions?',
        body: `Copy all permission grants from the selected source role onto this role? Existing grants on this role will be overwritten for matching resource/permission pairs.`,
        confirmLabel: 'Copy permissions',
      });
      if (!ok) return;
      const btn = document.getElementById('btnCopyFrom');
      Admin.setButtonLoading(btn, true, 'Copying…');
      try {
        const res = await Admin.api.get('/master-rbac/grants' + Admin.qs({ usertypeId: sourceId, isActive: 'true' }));
        const grants = res.data.map((g) => ({ resourceId: g.resource.id, permissionId: g.permission.id, isAllowed: g.isAllowed }));
        if (grants.length) {
          await Admin.api.post(`/master-rbac/usertypes/${targetId}/grants/bulk`, { grants });
        }
        Admin.toast('Permissions copied', 'success');
        await loadGrantsForRole(targetId);
      } catch (err) {
        Admin.toastError(err);
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    }

    // ---- Effective permissions viewer (v2: explicit + cascade) ------------
    function openEffectiveModal() {
      const currentRoleId = document.getElementById('matrixRole').value;
      Admin.openModal(`
        <div class="modal-header"><h3>Effective permissions</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
        <div class="modal-body">
          <div class="form-group">
            <label for="eff-usertype">Role</label>
            <select id="eff-usertype">
              ${usertypes.map((u) => `<option value="${u.id}" ${String(u.id) === String(currentRoleId) ? 'selected' : ''}>${Admin.escapeHtml(u.typeName || u.code || u.name)}</option>`).join('')}
            </select>
          </div>
          <label class="checkbox-row" style="margin-bottom:10px;">
            <input type="checkbox" id="eff-cascade" checked>
            Include inherited "view" (parent resources made visible because a child is allowed)
          </label>
          <p class="hint" style="margin-top:-6px;">Cascade view is for sidebar/menu visibility only — action buttons still check the exact resource's own explicit grant, never the inherited one.</p>
          <div id="eff-results"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" data-act="close">Close</button></div>
      `);
      const backdrop = document.getElementById('modalBackdrop');
      backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
      backdrop.querySelector('#eff-usertype').addEventListener('change', loadEffective);
      backdrop.querySelector('#eff-cascade').addEventListener('change', loadEffective);
      loadEffective();
    }

    async function loadEffective() {
      const id = document.getElementById('eff-usertype').value;
      const cascade = document.getElementById('eff-cascade').checked;
      const box = document.getElementById('eff-results');
      if (!id) { box.innerHTML = ''; return; }
      box.innerHTML = `<p class="hint">Loading…</p>`;
      try {
        const path = cascade
          ? `/master-rbac/usertypes/${id}/effective-permissions/menu`
          : `/master-rbac/usertypes/${id}/effective-permissions`;
        const res = await Admin.api.get(path);
        const list = res.data || [];
        box.innerHTML = list.length
          ? `<div class="table-wrap"><table><thead><tr><th>Resource</th><th>Permission</th><th></th></tr></thead><tbody>${
              list.map((p) => `<tr>
                <td>${Admin.escapeHtml(p.resourceName || p.resource || '')}</td>
                <td><code>${Admin.escapeHtml(p.permissionCode || p.permissionName || p.permission || '')}</code></td>
                <td>${p.isImplicit ? '<span class="badge badge-indigo">Inherited (view)</span>' : '<span class="badge badge-green">Explicit</span>'}</td>
              </tr>`).join('')
            }</tbody></table></div>`
          : `<p class="hint">No active, allowed grants for this role.</p>`;
      } catch (err) {
        box.innerHTML = `<div class="form-errors">${Admin.escapeHtml(err.message)}</div>`;
      }
    }

    return { init };
  })();

  async function init() {
    await Admin.requireAuth();
    initTabs();
    PermTab.init();
  }

  init();
})();
