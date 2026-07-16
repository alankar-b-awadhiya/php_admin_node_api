/**
 * social-clients.js — Social Clients page (maps to /social-clients, per the
 * OAuth multiple-clients UI plan: aba_main_db `social_clients`. Agency
 * clients/tenants whose social accounts get connected + posts scheduled.
 * Bearer/cookie session required on every route.)
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/socialClients/v1/socialClients.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.industries        - list distinct industries
 *   GET    API.list              - list/filter (?status,?industry,?search,?page,?per_page)
 *   GET    API.get(id)           - get a single client (includes connectedAccountsCount, postsCount)
 *   POST   API.list              - create (multipart: logo optional)
 *   PATCH  API.update(id)        - update (multipart)
 *   DELETE API.remove(id)        - delete (soft)
 *   PATCH  API.toggleStatus(id)  - flips ACTIVE <-> PAUSED
 *   DELETE API.removeLogo(id)    - remove the logo
 *
 * status is numeric: 1=ACTIVE, 2=PAUSED, 3=ARCHIVED (socialClients.service.js STATUS).
 */
(function () {
  const API = {
    industries: '/social-clients/industries',
    list: '/social-clients',
    get: (id) => `/social-clients/${id}`,
    update: (id) => `/social-clients/${id}`,
    remove: (id) => `/social-clients/${id}`,
    toggleStatus: (id) => `/social-clients/${id}/status`,
    removeLogo: (id) => `/social-clients/${id}/logo`,
  };

  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    if (!relPath) return '';
    if (/^https?:\/\//i.test(relPath)) return relPath;
    return API_ORIGIN + relPath;
  }

  const STATUS_LABELS = { 1: 'Active', 2: 'Paused', 3: 'Archived' };
  const STATUS_BADGE = { 1: 'badge-green', 2: 'badge-amber', 3: 'badge-gray' };

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    building: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 8h.01M10 8h.01M13 8h.01M7 11h.01M10 11h.01M13 11h.01M7 14h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    access: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.5" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 17c0-3 2.9-5.2 6.5-5.2S16.5 14 16.5 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };

  const CLIENT_USER_API = {
    list: (clientId) => `/social-clients/${clientId}/users`,
    add: (clientId) => `/social-clients/${clientId}/users`,
    update: (clientId, clientUserId) => `/social-clients/${clientId}/users/${clientUserId}`,
    remove: (clientId, clientUserId) => `/social-clients/${clientId}/users/${clientUserId}`,
  };
  const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', editor: 'Editor', viewer: 'Viewer' };

  let rows = [];
  let industries = [];
  let state = { search: '', status: '', industry: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnAddClient').addEventListener('click', openCreateModal);
    document.getElementById('btnRefreshClients').addEventListener('click', () => loadList(true));

    document.getElementById('searchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim(); state.page = 1; loadList();
    }, 350));
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.status = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('industryFilter').addEventListener('change', (e) => {
      state.industry = e.target.value; state.page = 1; loadList();
    });

    await loadIndustries();
    await loadList();
  }

  async function loadIndustries() {
    const sel = document.getElementById('industryFilter');
    try {
      const res = await Admin.api.get(API.industries);
      industries = res.data.industries || [];
      sel.innerHTML = '<option value="">All Industries</option>' +
        industries.map((i) => `<option value="${Admin.escapeHtml(i)}">${Admin.escapeHtml(i)}</option>`).join('');
    } catch (err) {
      Admin.toastError(err);
    }
  }

  async function loadList(spin) {
    const body = document.getElementById('clientsTableBody');
    const refreshBtn = document.getElementById('btnRefreshClients');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="8" class="table-empty">Loading clients…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        search: state.search,
        status: state.status,
        industry: state.industry,
        page: state.page,
        per_page: state.perPage,
      }));
      rows = res.data.clients || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('clientsCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} client${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">Couldn't load clients.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('clientsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">No clients found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((c) => `
      <tr data-id="${c.id}">
        <td>${c.logoUrl ? `<img class="client-logo" src="${assetUrl(c.logoUrl)}" alt="">` : `<div class="client-logo client-logo-empty">${ICON.building}</div>`}</td>
        <td><strong>${Admin.escapeHtml(c.businessName)}</strong></td>
        <td class="cell-muted"><code>${Admin.escapeHtml(c.clientCode)}</code></td>
        <td>
          ${c.contactName ? Admin.escapeHtml(c.contactName) : '<span class="cell-muted">—</span>'}
          ${c.email ? `<div class="cell-muted" style="font-size:11.5px;">${Admin.escapeHtml(c.email)}</div>` : ''}
        </td>
        <td class="cell-muted">${Admin.escapeHtml(c.industry || '—')}</td>
        <td><span class="count-pill-soft">${c.connectedAccountsCount ?? '—'}</span></td>
        <td><span class="badge ${STATUS_BADGE[c.status] || 'badge-gray'}"><span class="badge-dot"></span>${STATUS_LABELS[c.status] || 'Unknown'}</span></td>
        <td class="cell-actions">
          <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-copy" data-act="access" title="Manage Access">${ICON.access}</button>
          <button class="icon-action icon-action-toggle" data-act="status" title="${c.status === 1 ? 'Pause' : 'Activate'}">${ICON.toggle}</button>
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const c = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(c));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(c));
      tr.querySelector('[data-act="access"]')?.addEventListener('click', () => openAccessModal(c));
      tr.querySelector('[data-act="status"]')?.addEventListener('click', () => toggleStatus(c));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removeClient(c));
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('clientsPagination');
    if (!pagination) { el.innerHTML = `<span>Total: ${rows.length}</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="clientPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="clientNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('clientPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('clientNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  // ---- Status toggle / delete ----------------------------------------

  async function toggleStatus(c) {
    try {
      await Admin.api.patch(API.toggleStatus(c.id));
      Admin.toast('Status updated', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removeClient(c) {
    const ok = await Admin.confirmAction({
      title: 'Delete client?',
      body: `Delete <strong>${Admin.escapeHtml(c.businessName)}</strong>? Connected accounts and posts stay in place for audit history, but this client will no longer be selectable. This can't be undone.`,
      confirmLabel: 'Delete client',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(c.id));
      Admin.toast('Client deleted', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- View modal (read-only) -----------------------------------------

  async function openViewModal(c) {
    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(c.businessName)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="clientViewBody">
        <div class="flex-gap"><span class="spinner spinner-dark"></span> Loading…</div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    try {
      const res = await Admin.api.get(API.get(c.id));
      const full = res.data.client;
      const body = document.getElementById('clientViewBody');
      if (!body) return;
      body.innerHTML = `
        ${full.logoUrl ? `<img src="${assetUrl(full.logoUrl)}" alt="" style="max-height:80px;max-width:220px;object-fit:contain;margin-bottom:14px;">` : ''}
        <div class="flex-gap" style="margin-bottom:12px;">
          <span class="badge ${STATUS_BADGE[full.status] || 'badge-gray'}"><span class="badge-dot"></span>${STATUS_LABELS[full.status] || 'Unknown'}</span>
          <span class="badge-outline">${Admin.escapeHtml(full.industry || 'Uncategorized')}</span>
          <code>${Admin.escapeHtml(full.clientCode)}</code>
        </div>
        <div class="form-row">
          <div><strong>Contact</strong><div class="cell-muted">${Admin.escapeHtml(full.contactName || '—')}</div></div>
          <div><strong>Email</strong><div class="cell-muted">${Admin.escapeHtml(full.email || '—')}</div></div>
        </div>
        <div class="form-row">
          <div><strong>Phone</strong><div class="cell-muted">${Admin.escapeHtml(full.phone || '—')}</div></div>
          <div><strong>Timezone</strong><div class="cell-muted">${Admin.escapeHtml(full.timezone || '—')}</div></div>
        </div>
        <div class="flex-gap" style="margin:14px 0;">
          <span class="count-pill-soft">${full.connectedAccountsCount} connected account${full.connectedAccountsCount === 1 ? '' : 's'}</span>
          <span class="count-pill-soft">${full.postsCount} post${full.postsCount === 1 ? '' : 's'}</span>
        </div>
        ${full.internalNotes ? `<div class="log-body-pre">${Admin.escapeHtml(full.internalNotes)}</div>` : ''}
      `;
    } catch (err) {
      Admin.toastError(err);
      Admin.closeModal();
    }
  }

  // ---- Add / Edit modal (tabbed: Basic Info / Logo / Notes) -----------

  function clientFormHtml(c) {
    const isEdit = !!c;
    const currentLogo = isEdit ? c.logoUrl : null;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Client' : 'Add Client'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="tabs" id="clientTabs">
        <button type="button" class="tab-btn is-active" data-tab="basic">Basic Info</button>
        <button type="button" class="tab-btn" data-tab="logo">Logo</button>
        <button type="button" class="tab-btn" data-tab="notes">Notes</button>
      </div>
      <form id="clientForm">
        <div class="modal-body">
          <div id="clientFormErrors"></div>

          <div class="tab-panel is-active" data-panel="basic">
            <div class="form-row">
              <div class="form-group">
                <label for="f-name">Business Name <span style="color:var(--coral);">*</span></label>
                <input type="text" id="f-name" placeholder="e.g. Acme Retail Pvt Ltd" value="${isEdit ? Admin.escapeHtml(c.businessName) : ''}" required>
              </div>
              <div class="form-group">
                <label for="f-industry">Industry</label>
                <input type="text" id="f-industry" placeholder="e.g. Retail, Hospitality..." value="${isEdit ? Admin.escapeHtml(c.industry || '') : ''}" list="industryList">
                <datalist id="industryList">${industries.map((i) => `<option value="${Admin.escapeHtml(i)}">`).join('')}</datalist>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-contact">Contact Name</label>
                <input type="text" id="f-contact" value="${isEdit ? Admin.escapeHtml(c.contactName || '') : ''}">
              </div>
              <div class="form-group">
                <label for="f-email">Email</label>
                <input type="email" id="f-email" value="${isEdit ? Admin.escapeHtml(c.email || '') : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-phone">Phone</label>
                <input type="text" id="f-phone" value="${isEdit ? Admin.escapeHtml(c.phone || '') : ''}">
              </div>
              <div class="form-group">
                <label for="f-timezone">Timezone</label>
                <input type="text" id="f-timezone" placeholder="Asia/Kolkata" value="${isEdit ? Admin.escapeHtml(c.timezone || '') : 'Asia/Kolkata'}">
              </div>
            </div>
            ${isEdit ? `
              <div class="form-group">
                <label for="f-status">Status</label>
                <select id="f-status">
                  <option value="1" ${c.status === 1 ? 'selected' : ''}>Active</option>
                  <option value="2" ${c.status === 2 ? 'selected' : ''}>Paused</option>
                  <option value="3" ${c.status === 3 ? 'selected' : ''}>Archived</option>
                </select>
              </div>
            ` : ''}
          </div>

          <div class="tab-panel" data-panel="logo">
            <div class="form-group">
              <label>Upload Logo</label>
              <input type="file" id="f-logo-file" accept="image/*">
              <p class="hint">JPEG, PNG, GIF or WebP. Max 5 MB.</p>
            </div>
            ${isEdit && currentLogo ? `
              <div class="settings-image-row" style="margin-top:14px;">
                <div class="settings-image-preview" style="width:70px;height:70px;"><img src="${assetUrl(currentLogo)}" alt=""></div>
                <div class="settings-image-controls">
                  <button type="button" class="btn btn-danger btn-sm" id="btnRemoveLogo">Remove current logo</button>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="tab-panel" data-panel="notes">
            <div class="form-group">
              <label for="f-notes">Internal Notes</label>
              <textarea id="f-notes" style="min-height:120px;" placeholder="Not visible to the client — internal agency notes only...">${isEdit ? Admin.escapeHtml(c.internalNotes || '') : ''}</textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="clientFormSubmit">Save</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() {
    Admin.openModal(clientFormHtml(null));
    wireClientModal(null);
  }

  async function openEditModal(c) {
    // Fetch the full record (internalNotes isn't in the list payload).
    try {
      const res = await Admin.api.get(API.get(c.id));
      const full = res.data.client;
      Admin.openModal(clientFormHtml(full));
      wireClientModal(full);
    } catch (err) { Admin.toastError(err); }
  }

  function wireClientModal(c) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    backdrop.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('is-active'));
        backdrop.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('is-active'));
        btn.classList.add('is-active');
        backdrop.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('is-active');
      });
    });

    const removeLogoBtn = backdrop.querySelector('#btnRemoveLogo');
    if (removeLogoBtn) {
      removeLogoBtn.addEventListener('click', async () => {
        const ok = await Admin.confirmAction({ title: 'Remove logo?', confirmLabel: 'Remove', danger: true });
        if (!ok) return;
        try {
          await Admin.api.del(API.removeLogo(c.id));
          Admin.toast('Logo removed', 'success');
          removeLogoBtn.closest('.settings-image-row').remove();
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
    }

    backdrop.querySelector('#clientForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('clientFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('clientFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const fd = new FormData();
      fd.append('business_name', document.getElementById('f-name').value.trim());
      fd.append('industry', document.getElementById('f-industry').value.trim());
      fd.append('contact_name', document.getElementById('f-contact').value.trim());
      fd.append('email', document.getElementById('f-email').value.trim());
      fd.append('phone', document.getElementById('f-phone').value.trim());
      fd.append('timezone', document.getElementById('f-timezone').value.trim() || 'Asia/Kolkata');
      fd.append('internal_notes', document.getElementById('f-notes').value.trim());
      const statusEl = document.getElementById('f-status');
      if (statusEl) fd.append('status', statusEl.value);

      const fileInput = document.getElementById('f-logo-file');
      if (fileInput.files[0]) fd.append('logo', fileInput.files[0]);

      try {
        if (c) {
          await Admin.api.uploadForm(API.update(c.id), fd, { method: 'PATCH' });
          Admin.toast('Client updated', 'success');
        } else {
          await Admin.api.uploadForm(API.list, fd);
          Admin.toast('Client created', 'success');
        }
        Admin.closeModal();
        loadIndustries();
        loadList();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  // ---- Manage Access modal (social_client_users) -----------------------

  async function openAccessModal(c) {
    Admin.openModal(`
      <div class="modal-header"><h3>Access — ${Admin.escapeHtml(c.businessName)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="form-row" style="align-items:flex-end;">
          <div class="form-group">
            <label for="acc-user-id">Add staff — Master User ID <span style="color:var(--coral);">*</span></label>
            <input type="number" id="acc-user-id" placeholder="e.g. 14" min="1">
          </div>
          <div class="form-group">
            <label for="acc-role">Role</label>
            <select id="acc-role">
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="editor" selected>Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <button type="button" class="btn btn-primary" id="btnAccessAdd">Add</button>
          </div>
        </div>
        <p class="hint" style="margin-top:-8px;margin-bottom:14px;">Look up the numeric user id on the Master Users page — this doesn't search by name/email.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>User ID</th><th>Role</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody id="accessTableBody"><tr><td colspan="4" class="table-empty">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    document.getElementById('btnAccessAdd').addEventListener('click', async (e) => {
      const userId = parseInt(document.getElementById('acc-user-id').value, 10);
      const role = document.getElementById('acc-role').value;
      if (!userId) { Admin.toast('Enter a user id', 'error'); return; }
      Admin.setButtonLoading(e.target, true, 'Adding…');
      try {
        await Admin.api.post(CLIENT_USER_API.add(c.id), { user_id: userId, role });
        Admin.toast('Access granted', 'success');
        document.getElementById('acc-user-id').value = '';
        loadAccessTable(c.id);
      } catch (err) { Admin.toastError(err); }
      finally { Admin.setButtonLoading(e.target, false); }
    });

    loadAccessTable(c.id);
  }

  async function loadAccessTable(clientId) {
    const body = document.getElementById('accessTableBody');
    if (!body) return;
    try {
      const res = await Admin.api.get(CLIENT_USER_API.list(clientId));
      const members = res.data.users || [];
      if (!members.length) {
        body.innerHTML = `<tr><td colspan="4" class="table-empty">No one has explicit access yet — SUPERADMIN/ADMIN can always reach this client.</td></tr>`;
        return;
      }
      body.innerHTML = members.map((m) => `
        <tr data-id="${m.id}">
          <td><code>#${m.userId}</code></td>
          <td>
            <select class="acc-role-select" data-id="${m.id}">
              ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}" ${m.role === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </td>
          <td>${Admin.badge(m.isActive, 'Active', 'Suspended')}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-toggle" data-act="suspend" title="${m.isActive ? 'Suspend' : 'Reactivate'}">${ICON.toggle}</button>
            <button class="icon-action icon-action-delete" data-act="revoke" title="Revoke">${ICON.trash}</button>
          </td>
        </tr>
      `).join('');

      body.querySelectorAll('.acc-role-select').forEach((sel) => {
        sel.addEventListener('change', async () => {
          try {
            await Admin.api.patch(CLIENT_USER_API.update(clientId, sel.dataset.id), { role: sel.value });
            Admin.toast('Role updated', 'success');
          } catch (err) { Admin.toastError(err); loadAccessTable(clientId); }
        });
      });
      body.querySelectorAll('[data-act="suspend"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const isActive = tr.querySelector('.badge-green') === null; // currently suspended -> reactivate
          try {
            await Admin.api.patch(CLIENT_USER_API.update(clientId, tr.dataset.id), { is_active: isActive ? 1 : 0 });
            loadAccessTable(clientId);
          } catch (err) { Admin.toastError(err); }
        });
      });
      body.querySelectorAll('[data-act="revoke"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const ok = await Admin.confirmAction({ title: 'Revoke access?', confirmLabel: 'Revoke', danger: true });
          if (!ok) return;
          try {
            await Admin.api.del(CLIENT_USER_API.remove(clientId, tr.dataset.id));
            Admin.toast('Access revoked', 'success');
            loadAccessTable(clientId);
          } catch (err) { Admin.toastError(err); }
        });
      });
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4" class="table-empty">Couldn't load access list.</td></tr>`;
      Admin.toastError(err);
    }
  }

  init();
})();
