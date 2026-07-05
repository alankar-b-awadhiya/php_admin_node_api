/**
 * categories.js — Categories page (maps to /categories).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY; nothing
 * else in this file should hardcode a URL. Keep this in sync with:
 *   Node API: src/api/v1/index.js, src/domains/categories/categories.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.types                - distinct category types (+ well-known defaults)
 *   GET    API.list                 - paginated list (?type, ?parent_id, ?search, ?page, ?perPage)
 *   POST   API.create               - create a category
 *   PATCH  API.update(id)           - partial update
 *   PATCH  API.toggle(id)           - flip active/inactive
 *   DELETE API.remove(id)           - soft-delete (blocked server-side if it has children)
 */
(function () {
  const API = {
    types: '/categories/types',
    list: '/categories',
    update: (id) => `/categories/${id}`,
    toggle: (id) => `/categories/${id}/toggle`,
    remove: (id) => `/categories/${id}`,
  };

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let rows = [];
  let types = [];
  let state = { type: '', search: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnNewCategory').addEventListener('click', openCreateModal);
    document.getElementById('btnRefreshCategories').addEventListener('click', () => loadList(true));
    document.getElementById('typeFilter').addEventListener('change', (e) => {
      state.type = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('btnApplyFilter').addEventListener('click', () => {
      state.search = document.getElementById('nameSearchInput').value.trim();
      document.getElementById('tableSearchInput').value = state.search;
      state.page = 1;
      loadList();
    });
    document.getElementById('nameSearchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btnApplyFilter').click();
    });
    document.getElementById('tableSearchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim();
      document.getElementById('nameSearchInput').value = state.search;
      state.page = 1;
      loadList();
    }, 350));
    document.getElementById('perPageSelect').addEventListener('change', (e) => {
      state.perPage = Number(e.target.value);
      state.page = 1;
      loadList();
    });

    await loadTypes();
    await loadList();
  }

  async function loadTypes() {
    const sel = document.getElementById('typeFilter');
    try {
      const res = await Admin.api.get(API.types);
      types = res.data.types || [];
      sel.innerHTML = types.map((t) => `<option value="${Admin.escapeHtml(t.id)}">${Admin.escapeHtml(t.typeLabel)}</option>`).join('');
      const preferred = types.find((t) => t.id === 'GALLERY') || types[0];
      if (preferred) {
        sel.value = preferred.id;
        state.type = preferred.id;
      }
    } catch (err) {
      Admin.toastError(err);
    }
  }

  async function loadList(spin) {
    const body = document.getElementById('categoriesTableBody');
    const refreshBtn = document.getElementById('btnRefreshCategories');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="8" class="table-empty">Loading categories…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        type: state.type,
        search: state.search,
        page: state.page,
        perPage: state.perPage,
      }));
      rows = res.data.categories || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">Couldn't load categories.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('categoriesTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">No categories found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((c) => `
      <tr data-id="${c.id}">
        <td>${c.id}</td>
        <td><strong>${Admin.escapeHtml(c.name)}</strong></td>
        <td class="cell-muted">${Admin.escapeHtml(c.slug)}</td>
        <td class="cell-muted">${c.parentName ? Admin.escapeHtml(c.parentName) : '—'}</td>
        <td><span class="badge-outline">${Admin.escapeHtml(c.typeSlug)}</span></td>
        <td><span class="count-pill-soft">${c.childrenCount}</span></td>
        <td>${Admin.badge(c.isActive)}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-toggle" data-act="toggle" title="${c.isActive ? 'Deactivate' : 'Activate'}">${ICON.toggle}</button>
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const c = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(c));
      tr.querySelector('[data-act="toggle"]')?.addEventListener('click', () => toggleStatus(c));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => remove(c));
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('categoriesPagination');
    if (!pagination) { el.innerHTML = ''; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="catPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="catNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('catPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('catNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  // ---- Create / Edit modal ------------------------------------------------

  async function loadParentOptions(type, excludeId) {
    try {
      const res = await Admin.api.get(API.list + Admin.qs({ type, perPage: 100, page: 1 }));
      return (res.data.categories || []).filter((c) => c.id !== excludeId);
    } catch (err) {
      Admin.toastError(err);
      return [];
    }
  }

  function typeOptionsHtml(selected) {
    return types.map((t) => `<option value="${Admin.escapeHtml(t.id)}" ${t.id === selected ? 'selected' : ''}>${Admin.escapeHtml(t.typeLabel)}</option>`).join('');
  }

  function parentOptionsHtml(parents, selectedParentId) {
    const opts = ['<option value="">— Root (no parent) —</option>']
      .concat(parents.map((p) => `<option value="${p.id}" ${p.id === selectedParentId ? 'selected' : ''}>${Admin.escapeHtml(p.name)}</option>`));
    return opts.join('');
  }

  function formHtml(c, parents) {
    const isEdit = !!c;
    const currentType = isEdit ? c.type : state.type;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Category' : 'Add Category'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="catForm">
        <div class="modal-body">
          <div id="catFormErrors"></div>
          <div class="form-group">
            <label for="f-name">Name <span style="color:var(--coral);">*</span></label>
            <input type="text" id="f-name" placeholder="Category name" value="${isEdit ? Admin.escapeHtml(c.name) : ''}" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-type">Category Type <span style="color:var(--coral);">*</span></label>
              <select id="f-type" required>${typeOptionsHtml(currentType)}</select>
            </div>
            <div class="form-group">
              <label for="f-parent">Parent Category</label>
              <select id="f-parent">${parentOptionsHtml(parents, isEdit ? c.parentId : null)}</select>
            </div>
          </div>
          <div class="form-group">
            <label for="f-status">Status</label>
            <select id="f-status">
              <option value="1" ${!isEdit || c.isActive ? 'selected' : ''}>Active</option>
              <option value="0" ${isEdit && !c.isActive ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div class="form-group">
            <label for="f-description">Description</label>
            <textarea id="f-description" placeholder="Optional description">${isEdit ? Admin.escapeHtml(c.description || '') : ''}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="catFormSubmit">${isEdit ? 'Save' : 'Save'}</button>
        </div>
      </form>
    `;
  }

  async function openCreateModal() {
    const type = state.type || (types[0] && types[0].id) || '';
    const parents = type ? await loadParentOptions(type, null) : [];
    Admin.openModal(formHtml(null, parents));
    wireForm(null);
    wireTypeChange(null);
  }

  async function openEditModal(c) {
    const parents = await loadParentOptions(c.type, c.id);
    Admin.openModal(formHtml(c, parents));
    wireForm(c);
    wireTypeChange(c);
  }

  function wireTypeChange(c) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelector('#f-type').addEventListener('change', async (e) => {
      const parents = await loadParentOptions(e.target.value, c ? c.id : null);
      const parentSel = backdrop.querySelector('#f-parent');
      parentSel.innerHTML = parentOptionsHtml(parents, null);
    });
  }

  function wireForm(c) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#catForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('catFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('catFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const payload = {
        name: document.getElementById('f-name').value.trim(),
        category_type_id: document.getElementById('f-type').value,
        parent_id: document.getElementById('f-parent').value || null,
        is_active: Number(document.getElementById('f-status').value),
        description: document.getElementById('f-description').value.trim() || null,
      };

      try {
        if (c) {
          await Admin.api.patch(API.update(c.id), payload);
          Admin.toast('Category updated', 'success');
        } else {
          await Admin.api.post(API.list, payload);
          Admin.toast('Category created', 'success');
        }
        Admin.closeModal();
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

  async function toggleStatus(c) {
    try {
      await Admin.api.patch(API.toggle(c.id));
      Admin.toast(c.isActive ? 'Category deactivated' : 'Category activated', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function remove(c) {
    const ok = await Admin.confirmAction({
      title: 'Delete category?',
      body: `Delete <strong>${Admin.escapeHtml(c.name)}</strong>? This can't be undone. Categories with sub-categories can't be deleted until those are moved or removed first.`,
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(c.id));
      Admin.toast('Category deleted', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
