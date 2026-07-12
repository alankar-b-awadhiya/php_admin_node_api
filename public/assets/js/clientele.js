/**
 * clientele.js — Clientele page (maps to /clientele, per the Clientele
 * section of the API reference: aba_main_db `clientele`. Public client
 * logos + admin moderation. Bearer required on every route.)
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/clientele/v1/clientele.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.industries        - list distinct industries
 *   GET    API.list              - list/filter (?status,?industry,?featured,?search,?page,?perPage)
 *   GET    API.get(id)           - get a single client
 *   POST   API.list              - create (multipart: logo optional)
 *   PATCH  API.update(id)        - update (multipart)
 *   DELETE API.remove(id)        - delete
 *   PATCH  API.toggleStatus(id)  - toggle ACTIVE / INACTIVE
 *   PATCH  API.toggleFeatured(id)- toggle the featured flag
 *   DELETE API.removeLogo(id)    - remove the logo
 *   PATCH  API.reorder           - { orders: [{id, displayOrder}] } (not wired
 *                                    to UI drag/drop here — the mockup only
 *                                    shows a read-only Order column)
 *
 * Field names below follow the shape shown in the README's sample for
 * GET /clientele/:id (clientName, logoUrl, websiteUrl, industry, isFeatured,
 * displayOrder, status). slug / shortDescription / fullDescription aren't in
 * that sample (only Basic Info fields are) but are implied by the provided
 * "Add Client" mockup's Description tab, so they're read defensively.
 */
(function () {
  const API = {
    industries: '/clientele/industries',
    list: '/clientele',
    get: (id) => `/clientele/${id}`,
    update: (id) => `/clientele/${id}`,
    remove: (id) => `/clientele/${id}`,
    toggleStatus: (id) => `/clientele/${id}/status`,
    toggleFeatured: (id) => `/clientele/${id}/featured`,
    removeLogo: (id) => `/clientele/${id}/logo`,
  };

  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    if (!relPath) return '';
    if (/^https?:\/\//i.test(relPath)) return relPath;
    return API_ORIGIN + relPath;
  }

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    star: '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.2l2.36 4.78 5.28.77-3.82 3.72.9 5.26L10 14.27l-4.72 2.48.9-5.26L2.36 7.75l5.28-.77L10 2.2Z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    building: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 8h.01M10 8h.01M13 8h.01M7 11h.01M10 11h.01M13 11h.01M7 14h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    link: '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 12l4-4M9 6h3a3 3 0 0 1 0 6h-1M11 14H8a3 3 0 0 1 0-6h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };

  let rows = [];
  let industries = [];
  let state = { search: '', status: '', industry: '', featured: '', page: 1, perPage: 25 };

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
    document.getElementById('featuredFilter').addEventListener('change', (e) => {
      state.featured = e.target.value; state.page = 1; loadList();
    });

    await loadIndustries();
    await loadList();
  }

  async function loadIndustries() {
    const sel = document.getElementById('industryFilter');
    try {
      const res = await Admin.api.get(API.industries);
      industries = res.data.industries || res.data.items || (Array.isArray(res.data) ? res.data : []) || [];
      sel.innerHTML = '<option value="">All Industries</option>' +
        industries.map((i) => {
          const val = typeof i === 'string' ? i : (i.industry || i.name || '');
          return `<option value="${Admin.escapeHtml(val)}">${Admin.escapeHtml(val)}</option>`;
        }).join('');
    } catch (err) {
      Admin.toastError(err);
    }
  }

  async function loadList(spin) {
    const body = document.getElementById('clientsTableBody');
    const refreshBtn = document.getElementById('btnRefreshClients');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading clients…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        search: state.search,
        status: state.status,
        industry: state.industry,
        featured: state.featured,
        page: state.page,
        perPage: state.perPage,
      }));
      rows = res.data.clients || res.data.items || (Array.isArray(res.data) ? res.data : []) || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('clientsCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} client${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load clients.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('clientsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">No clients found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((c) => {
      const logo = c.logoUrl || c.logo_url;
      const logoCell = logo
        ? `<img class="client-logo" src="${assetUrl(logo)}" alt="">`
        : `<div class="client-logo client-logo-empty">${ICON.building}</div>`;
      const website = c.websiteUrl || c.website_url;
      const isActive = String(c.status || '').toUpperCase() === 'ACTIVE';
      return `
        <tr data-id="${c.id}">
          <td>${logoCell}</td>
          <td><strong>${Admin.escapeHtml(c.clientName || c.client_name)}</strong>${c.isFeatured ? `<span class="client-name-star">${ICON.star}</span>` : ''}</td>
          <td class="cell-muted">${Admin.escapeHtml(c.industry || '—')}</td>
          <td>${website ? `<a class="client-website-link" href="${assetUrl(website)}" target="_blank" rel="noopener">${ICON.link}${Admin.escapeHtml(truncate(website.replace(/^https?:\/\//, ''), 24))}</a>` : '<span class="cell-muted">—</span>'}</td>
          <td><span class="order-chip">${c.displayOrder ?? c.display_order ?? '—'}</span></td>
          <td>${Admin.badge(isActive)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
            <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
            <button class="icon-action icon-action-toggle" data-act="status" title="${isActive ? 'Deactivate' : 'Activate'}">${ICON.toggle}</button>
            <button class="icon-action icon-action-star ${c.isFeatured ? 'is-on' : ''}" data-act="featured" title="${c.isFeatured ? 'Unfeature' : 'Feature'}">${ICON.star}</button>
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const c = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(c));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(c));
      tr.querySelector('[data-act="status"]')?.addEventListener('click', () => toggleStatus(c));
      tr.querySelector('[data-act="featured"]')?.addEventListener('click', () => toggleFeatured(c));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removeClient(c));
    });
  }

  function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n - 1) + '…' : (str || '');
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

  // ---- Status / featured toggle / delete ---------------------------------

  async function toggleStatus(c) {
    try {
      await Admin.api.patch(API.toggleStatus(c.id));
      Admin.toast('Status updated', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function toggleFeatured(c) {
    try {
      await Admin.api.patch(API.toggleFeatured(c.id));
      Admin.toast(c.isFeatured ? 'Removed from featured' : 'Marked as featured', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removeClient(c) {
    const ok = await Admin.confirmAction({
      title: 'Delete client?',
      body: `Delete <strong>${Admin.escapeHtml(c.clientName || c.client_name)}</strong>? This can't be undone.`,
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

  // ---- View modal (read-only) ---------------------------------------------

  function openViewModal(c) {
    const logo = c.logoUrl || c.logo_url;
    const website = c.websiteUrl || c.website_url;
    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(c.clientName || c.client_name)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        ${logo ? `<img src="${assetUrl(logo)}" alt="" style="max-height:80px;max-width:220px;object-fit:contain;margin-bottom:14px;">` : ''}
        <div class="flex-gap" style="margin-bottom:12px;">
          ${Admin.badge(String(c.status || '').toUpperCase() === 'ACTIVE')}
          ${c.isFeatured ? '<span class="badge badge-indigo"><span class="badge-dot"></span>featured</span>' : ''}
          <span class="badge-outline">${Admin.escapeHtml(c.industry || 'Uncategorized')}</span>
        </div>
        ${website ? `<p><a class="client-website-link" href="${assetUrl(website)}" target="_blank" rel="noopener">${ICON.link}${Admin.escapeHtml(website)}</a></p>` : ''}
        <p style="color:var(--text-muted);font-size:13.5px;">${Admin.escapeHtml(c.shortDescription || c.short_description || 'No short description.')}</p>
        <div class="log-body-pre">${Admin.escapeHtml(c.fullDescription || c.full_description || 'No full description.')}</div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
  }

  // ---- Add / Edit modal (tabbed: Basic Info / Logo / Description) --------

  function clientFormHtml(c) {
    const isEdit = !!c;
    const currentLogo = isEdit ? (c.logoUrl || c.logo_url) : null;
    const shortDesc = isEdit ? (c.shortDescription || c.short_description || '') : '';
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Client' : 'Add Client'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="tabs" id="clientTabs">
        <button type="button" class="tab-btn is-active" data-tab="basic">Basic Info</button>
        <button type="button" class="tab-btn" data-tab="logo">Logo</button>
        <button type="button" class="tab-btn" data-tab="desc">Description</button>
      </div>
      <form id="clientForm">
        <div class="modal-body">
          <div id="clientFormErrors"></div>

          <div class="tab-panel is-active" data-panel="basic">
            <div class="form-row">
              <div class="form-group">
                <label for="f-name">Client Name <span style="color:var(--coral);">*</span></label>
                <input type="text" id="f-name" placeholder="e.g. Acme Corporation" value="${isEdit ? Admin.escapeHtml(c.clientName || c.client_name) : ''}" required>
              </div>
              <div class="form-group">
                <label for="f-slug">Slug</label>
                <input type="text" id="f-slug" placeholder="auto-generated if blank" value="${isEdit ? Admin.escapeHtml(c.slug || '') : ''}">
                <p class="hint">Leave blank to auto-generate from name</p>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-industry">Industry</label>
                <input type="text" id="f-industry" placeholder="e.g. Agriculture, Banking..." value="${isEdit ? Admin.escapeHtml(c.industry || '') : ''}" list="industryList">
                <datalist id="industryList">${industries.map((i) => `<option value="${Admin.escapeHtml(typeof i === 'string' ? i : (i.industry || i.name || ''))}">`).join('')}</datalist>
              </div>
              <div class="form-group">
                <label for="f-website">Website URL</label>
                <input type="text" id="f-website" placeholder="https://example.com" value="${isEdit ? Admin.escapeHtml(c.websiteUrl || c.website_url || '') : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-order">Display Order</label>
                <input type="number" id="f-order" value="${isEdit ? (c.displayOrder ?? c.display_order ?? 0) : 0}">
                <p class="hint">Lower = appears first</p>
              </div>
              <div class="form-group">
                <label for="f-status">Status</label>
                <select id="f-status">
                  <option value="ACTIVE" ${!isEdit || String(c.status).toUpperCase() === 'ACTIVE' ? 'selected' : ''}>Active</option>
                  <option value="INACTIVE" ${isEdit && String(c.status).toUpperCase() === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
                </select>
                <label class="checkbox-row" style="margin-top:9px;">
                  <input type="checkbox" id="f-featured" ${isEdit && c.isFeatured ? 'checked' : ''}>
                  <span>Featured Client</span>
                </label>
              </div>
            </div>
          </div>

          <div class="tab-panel" data-panel="logo">
            <div class="form-group">
              <label>Upload Logo</label>
              <input type="file" id="f-logo-file" accept="image/*">
              <p class="hint">JPEG, PNG, GIF or WebP. Recommended: square or wide format, transparent PNG. Max 5 MB.</p>
            </div>
            <p class="upload-or-divider">— OR provide a URL directly —</p>
            <div class="form-group">
              <input type="text" id="f-logo-url" placeholder="https://cdn.example.com/logos/acme.png" value="${isEdit && !currentLogo ? '' : ''}">
              <p class="hint">If a file is uploaded above, the URL field is ignored.</p>
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

          <div class="tab-panel" data-panel="desc">
            <div class="form-group">
              <label for="f-short-desc">Short Description</label>
              <textarea id="f-short-desc" maxlength="500" placeholder="One-liner shown in listings (max 500 chars)...">${Admin.escapeHtml(shortDesc)}</textarea>
              <div class="char-counter"><span id="shortDescCount">${shortDesc.length}</span> / 500</div>
              <p class="hint">Shown in card views and listings</p>
            </div>
            <div class="form-group">
              <label for="f-full-desc">Full Description</label>
              <textarea id="f-full-desc" style="min-height:120px;" placeholder="Detailed profile — supports HTML...">${isEdit ? Admin.escapeHtml(c.fullDescription || c.full_description || '') : ''}</textarea>
              <p class="hint">Shown in detail / view modals</p>
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

  function openEditModal(c) {
    Admin.openModal(clientFormHtml(c));
    wireClientModal(c);
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

    const shortDesc = backdrop.querySelector('#f-short-desc');
    shortDesc.addEventListener('input', () => {
      backdrop.querySelector('#shortDescCount').textContent = shortDesc.value.length;
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
      fd.append('client_name', document.getElementById('f-name').value.trim());
      fd.append('slug', document.getElementById('f-slug').value.trim());
      fd.append('industry', document.getElementById('f-industry').value.trim());
      fd.append('website_url', document.getElementById('f-website').value.trim());
      fd.append('display_order', document.getElementById('f-order').value || 0);
      fd.append('status', document.getElementById('f-status').value);
      fd.append('is_featured', document.getElementById('f-featured').checked ? 1 : 0);
      fd.append('short_description', document.getElementById('f-short-desc').value.trim());
      fd.append('full_description', document.getElementById('f-full-desc').value);

      const fileInput = document.getElementById('f-logo-file');
      const logoUrl = document.getElementById('f-logo-url').value.trim();
      if (fileInput.files[0]) {
        fd.append('logo', fileInput.files[0]);
      } else if (logoUrl) {
        fd.append('logo_url', logoUrl);
      }

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

  init();
})();
