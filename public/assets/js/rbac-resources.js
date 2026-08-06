/**
 * rbac-resources.js — Master Resources (maps to /master-rbac/resources).
 *   GET/POST /master-rbac/resources
 *   GET/PUT  /master-rbac/resources/:id
 *   PATCH    /master-rbac/resources/:id/status
 *   DELETE   /master-rbac/resources/:id  (SUPERADMIN only)
 *   (v2 schema: resources now carry parentId — table renders as an indented
 *   tree and the create/edit form gets a parent picker.)
 */
(function () {
  let rows = [];         // flat rows, each carries parentId (v2)
  let tree = [];          // rows ordered depth-first with a synthetic .depth, built from parentId
  const RESOURCE_TYPES = ['menu', 'module', 'sub_module', 'page', 'api'];

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  async function init() {
    await Admin.requireAuth();
    document.getElementById('btnNewResource').addEventListener('click', openCreateModal);
    document.getElementById('typeFilter').addEventListener('change', render);
    document.getElementById('statusFilter').addEventListener('change', load);
    document.getElementById('searchInput').addEventListener('input', Admin.debounce(render, 200));
    document.getElementById('btnRefresh').addEventListener('click', () => load(true));
    await load();
  }

  async function load(spin) {
    const body = document.getElementById('resourcesTableBody');
    const refreshBtn = document.getElementById('btnRefresh');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="8" class="table-empty">Loading resources…</td></tr>`;
    try {
      const isActive = document.getElementById('statusFilter').value;
      const res = await Admin.api.get('/master-rbac/resources' + Admin.qs({ isActive }));
      rows = res.data;
      tree = buildTree(rows);
      populateTypeFilter();
      render();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">Couldn't load resources.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  // ---- Tree helpers ------------------------------------------------------
  // Build a depth-first ordered list from the flat rows using parentId, so
  // the table can render as an indented tree without a second API round-trip.
  // (A dedicated GET /master-rbac/resources/tree exists server-side for
  // consumers that only need the nested shape — flattening client-side here
  // keeps search/type-filter/sort working against the same rows array.)
  function buildTree(list) {
    const byParent = {};
    list.forEach((r) => {
      const key = r.parentId ?? 'root';
      (byParent[key] = byParent[key] || []).push(r);
    });
    Object.values(byParent).forEach((group) => group.sort((a, b) => String(a.resourceName).localeCompare(String(b.resourceName))));

    const ordered = [];
    const visiting = new Set();
    function walk(parentKey, depth) {
      (byParent[parentKey] || []).forEach((r) => {
        if (visiting.has(r.id)) return; // guard against a stray cycle in the data
        visiting.add(r.id);
        ordered.push({ ...r, depth });
        walk(r.id, depth + 1);
      });
    }
    walk('root', 0);
    // Any row whose parentId points at a missing/filtered-out parent still
    // needs to show up somewhere — append it at depth 0 rather than lose it.
    const seen = new Set(ordered.map((r) => r.id));
    list.forEach((r) => { if (!seen.has(r.id)) ordered.push({ ...r, depth: 0 }); });
    return ordered;
  }

  function descendantIds(id) {
    const out = new Set();
    let frontier = [id];
    while (frontier.length) {
      const next = rows.filter((r) => frontier.includes(r.parentId)).map((r) => r.id);
      next.forEach((n) => out.add(n));
      frontier = next;
    }
    return out;
  }

  function populateTypeFilter() {
    const sel = document.getElementById('typeFilter');
    const current = sel.value;
    const types = [...new Set(rows.map((r) => r.resourceType))].sort();
    sel.innerHTML = '<option value="">All Types</option>' + types.map((t) => `<option value="${Admin.escapeHtml(t)}">${Admin.escapeHtml(t)}</option>`).join('');
    sel.value = current;
  }

  function filteredTree() {
    const type = document.getElementById('typeFilter').value;
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!type && !q) return tree;

    // Keep a row if it matches, OR if it's an ancestor of a match (so the
    // tree stays connected instead of showing orphaned indented rows), OR
    // a descendant of a match (so expanding a matched module still shows its children).
    const matchIds = new Set();
    rows.forEach((r) => {
      const typeOk = !type || r.resourceType === type;
      const qOk = !q || [r.resourceName, r.resourceType, r.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      if (typeOk && qOk) matchIds.add(r.id);
    });
    if (!matchIds.size) return [];

    const byId = new Map(rows.map((r) => [r.id, r]));
    const keep = new Set(matchIds);
    matchIds.forEach((id) => {
      let cur = byId.get(id);
      while (cur && cur.parentId) { keep.add(cur.parentId); cur = byId.get(cur.parentId); }
      descendantIds(id).forEach((d) => keep.add(d));
    });
    return tree.filter((r) => keep.has(r.id));
  }

  function render() {
    const body = document.getElementById('resourcesTableBody');
    const visible = filteredTree();
    document.getElementById('resourceCount').textContent = `${rows.length} resource${rows.length === 1 ? '' : 's'}`;

    if (!visible.length) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">No resources match your filters.</td></tr>`;
      return;
    }

    body.innerHTML = visible.map((r) => `
      <tr data-id="${r.id}">
        <td>
          <span class="tree-indent" style="width:${r.depth * 18}px;"></span>${r.depth > 0 ? '<span class="tree-branch">└</span>' : ''}
          <strong>${Admin.escapeHtml(r.resourceName)}</strong>
        </td>
        <td><span class="badge-outline">${Admin.escapeHtml((r.resourceType || '').toLowerCase())}</span></td>
        <td class="cell-muted">${r.parentId ? Admin.escapeHtml(parentName(r.parentId)) : '<span class="hint">— top level —</span>'}</td>
        <td class="text-refid">${r.resourceRefId}</td>
        <td class="cell-muted">${Admin.escapeHtml(r.description || '—')}</td>
        <td>${Admin.badge(r.isActive)}</td>
        <td class="cell-muted">${Admin.formatDate(r.createdAt)}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-toggle" data-act="toggle" title="${r.isActive ? 'Deactivate' : 'Activate'}">${ICON.toggle}</button>
          ${Admin.isUsertype('SUPERADMIN') ? `<button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>` : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const r = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(r));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(r));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => remove(r));
      tr.querySelector('[data-act="toggle"]')?.addEventListener('click', () => toggleStatus(r, !r.isActive));
    });
  }

  function parentName(parentId) {
    const p = rows.find((x) => x.id === parentId);
    return p ? p.resourceName : `#${parentId}`;
  }

  function openViewModal(r) {
    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(r.resourceName)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>Type</label><span class="badge-outline">${Admin.escapeHtml((r.resourceType || '').toLowerCase())}</span></div>
          <div class="form-group"><label>Ref ID</label><span class="text-refid">${r.resourceRefId}</span></div>
        </div>
        <div class="form-group"><label>Parent</label><p style="color:var(--text);margin:0;">${r.parentId ? Admin.escapeHtml(parentName(r.parentId)) : '— top level —'}</p></div>
        <div class="form-group"><label>Description</label><p style="color:var(--text);margin:0;">${Admin.escapeHtml(r.description || '—')}</p></div>
        <div class="form-group"><label>Status</label>${Admin.badge(r.isActive)}</div>
        <div class="form-group"><label>Created</label><p style="color:var(--text);margin:0;">${Admin.formatDate(r.createdAt)}</p></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-act="close">Close</button></div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
  }

  // Parent picker excludes the resource being edited and all of its
  // descendants — picking one of those would create a cycle, which the API
  // also rejects, but blocking it client-side gives an instant, clearer error.
  function parentOptionsHtml(excludeId, selectedId) {
    const blocked = excludeId ? new Set([excludeId, ...descendantIds(excludeId)]) : new Set();
    const options = tree.filter((r) => !blocked.has(r.id))
      .map((r) => `<option value="${r.id}" ${String(r.id) === String(selectedId) ? 'selected' : ''}>${'—'.repeat(r.depth)}${r.depth ? ' ' : ''}${Admin.escapeHtml(r.resourceName)} (${Admin.escapeHtml((r.resourceType || '').toLowerCase())})</option>`)
      .join('');
    return `<option value="">— Top level (no parent) —</option>${options}`;
  }

  function formHtml(r) {
    const isEdit = !!r;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit resource' : 'New resource'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="resForm">
        <div class="modal-body">
          <div id="resFormErrors"></div>
          ${!isEdit ? `
          <div class="form-row">
            <div class="form-group">
              <label for="f-resourceType">Resource type</label>
              <select id="f-resourceType" required>${RESOURCE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label for="f-resourceRefId">Reference ID</label>
              <input type="number" id="f-resourceRefId" min="1" placeholder="External id" required>
            </div>
          </div>` : ''}
          <div class="form-group">
            <label for="f-parentId">Parent resource</label>
            <select id="f-parentId">${parentOptionsHtml(isEdit ? r.id : null, isEdit ? r.parentId : '')}</select>
            <p class="hint">Nesting under a parent lets that parent auto-inherit "view" visibility whenever a role has any permission on this resource or its children.</p>
          </div>
          <div class="form-group">
            <label for="f-resourceName">Name</label>
            <input type="text" id="f-resourceName" value="${isEdit ? Admin.escapeHtml(r.resourceName) : ''}" required>
          </div>
          <div class="form-group">
            <label for="f-description">Description</label>
            <textarea id="f-description">${isEdit ? Admin.escapeHtml(r.description || '') : ''}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="resFormSubmit">${isEdit ? 'Save changes' : 'Create resource'}</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() { Admin.openModal(formHtml(null)); wireForm(null); }
  function openEditModal(r) { Admin.openModal(formHtml(r)); wireForm(r); }

  function wireForm(r) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#resForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('resFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('resFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      const parentIdRaw = document.getElementById('f-parentId').value;
      const parentId = parentIdRaw ? Number(parentIdRaw) : null;
      try {
        if (r) {
          await Admin.api.put(`/master-rbac/resources/${r.id}`, {
            resourceName: document.getElementById('f-resourceName').value.trim(),
            description: document.getElementById('f-description').value.trim() || null,
            parentId,
          });
          Admin.toast('Resource updated', 'success');
        } else {
          await Admin.api.post('/master-rbac/resources', {
            resourceType: document.getElementById('f-resourceType').value,
            resourceRefId: Number(document.getElementById('f-resourceRefId').value),
            resourceName: document.getElementById('f-resourceName').value.trim(),
            description: document.getElementById('f-description').value.trim() || null,
            parentId,
          });
          Admin.toast('Resource created', 'success');
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

  async function toggleStatus(r, isActive) {
    try {
      await Admin.api.patch(`/master-rbac/resources/${r.id}/status`, { isActive });
      Admin.toast(isActive ? 'Resource activated' : 'Resource deactivated', 'success');
      load();
    } catch (err) { Admin.toastError(err); load(); }
  }

  async function remove(r) {
    const childCount = rows.filter((x) => x.parentId === r.id).length;
    const ok = await Admin.confirmAction({
      title: 'Delete resource?',
      body: childCount
        ? `<strong>${Admin.escapeHtml(r.resourceName)}</strong> has ${childCount} child resource${childCount === 1 ? '' : 's'} — deleting it will cascade-delete its entire subtree, plus any grants referencing them. Continue?`
        : `Delete <strong>${Admin.escapeHtml(r.resourceName)}</strong>? Any grants referencing it will be removed too.`,
      confirmLabel: 'Delete resource',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(`/master-rbac/resources/${r.id}`);
      Admin.toast('Resource deleted', 'success');
      load();
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
