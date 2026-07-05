/**
 * media.js — Media Library page (maps to /media).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY; nothing
 * else in this file should hardcode a URL. Keep this in sync with:
 *   Node API: src/api/v1/index.js, src/domains/media/media.routes.js
 * ---------------------------------------------------------------------------
 *
 * Categories (folders):
 *   GET    API.categories                - list categories for a type (?type, ?active)
 *   POST   API.categories                - create a category
 *   PATCH  API.categoryUpdate(id)        - update a category
 *   DELETE API.categoryDelete(id)        - delete (blocked server-side if it still has media)
 *
 * Media items (files):
 *   GET    API.list                      - paginated items (?category_id, ?media_type, ?status, ?search, ?page, ?per_page)
 *   POST   API.upload                    - multipart upload (files[], category_id, title, alt_text)
 *   PATCH  API.update(id)                - update a media item
 *   DELETE API.remove(id)                - delete a media item
 *   PATCH  API.bulkStatus                - { ids, status } — used here for single-item status toggle
 */
(function () {
  const API = {
    categories: '/media/categories',
    categoryUpdate: (id) => `/media/categories/${id}`,
    categoryDelete: (id) => `/media/categories/${id}`,
    list: '/media',
    upload: '/media/upload',
    update: (id) => `/media/${id}`,
    remove: (id) => `/media/${id}`,
    bulkStatus: '/media/bulk-status',
  };

  // Origin to prepend to the relative file/thumbnail paths the API returns
  // (e.g. "/uploads/media/image/xyz.jpg"), since those are served by
  // express.static on the API's own origin, not under /api/v1.
  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    return relPath ? API_ORIGIN + relPath : '';
  }

  const TABS = [
    { type: 'GALLERY', label: 'Gallery' },
    { type: 'VIDEO', label: 'Videos' },
    { type: 'DOCUMENT', label: 'Documents' },
    { type: 'AUDIO', label: 'Audio' },
  ];

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    folder: '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h4.4l1.6 2H17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z"/></svg>',
    image: '<svg width="26" height="26" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="8" r="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M3 14.5 8 9.5l3 3 3-3.2L17 14" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    video: '<svg width="26" height="26" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M14 9 18 6.5v7L14 11" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    document: '<svg width="26" height="26" viewBox="0 0 20 20" fill="none"><path d="M5 2h7l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 2v4h4" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    audio: '<svg width="26" height="26" viewBox="0 0 20 20" fill="none"><path d="M8 4v9.2a2.6 2.6 0 1 0 1.3 2.25V8h4V4H8Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  };

  function fileTypeIcon(mediaType) {
    return ICON[mediaType] || ICON.document;
  }

  // ---- State ---------------------------------------------------------------
  let state = {
    type: TABS[0].type,
    label: TABS[0].label,
    categoriesCache: [],   // flat list of categories for the current type
    pathStack: [],         // [{id, name}] — breadcrumb from root to current folder
    parentId: null,        // current folder id (null = root)
    view: 'folders',       // 'folders' | 'files'
    items: [],             // media items for the current leaf folder
    mediaSearch: '',
    page: 1,
    perPage: 24,
  };

  async function init() {
    await Admin.requireAuth();

    document.querySelectorAll('.media-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.type, btn.dataset.label));
    });
    document.getElementById('btnBack').addEventListener('click', goBack);
    document.getElementById('btnNewCategory').addEventListener('click', () => openCategoryModal(null));
    document.getElementById('btnRefreshMedia').addEventListener('click', refresh);
    document.getElementById('btnUpload').addEventListener('click', openUploadModal);
    document.getElementById('mediaSearchInput').addEventListener('input', Admin.debounce((e) => {
      state.mediaSearch = e.target.value.trim();
      state.page = 1;
      loadFiles();
    }, 350));

    switchTab(state.type, state.label);
  }

  function switchTab(type, label) {
    state.type = type;
    state.label = label;
    state.pathStack = [];
    state.parentId = null;
    state.view = 'folders';
    document.querySelectorAll('.media-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.type === type));
    loadCategories();
  }

  function refresh() {
    if (state.view === 'folders') loadCategories();
    else loadFiles();
  }

  // ---- Breadcrumb / toolbar visibility --------------------------------------

  function renderCrumb() {
    const title = state.pathStack.length ? state.pathStack[state.pathStack.length - 1].name : state.label;
    document.getElementById('mediaCrumbTitle').textContent = title;
    document.getElementById('btnBack').style.display = state.pathStack.length ? '' : 'none';

    const isFiles = state.view === 'files';
    document.getElementById('folderToolbar').style.display = isFiles ? 'none' : '';
    document.getElementById('filesToolbar').style.display = isFiles ? '' : 'none';
    document.getElementById('folderView').style.display = isFiles ? 'none' : '';
    document.getElementById('filesView').style.display = isFiles ? '' : 'none';
  }

  function goBack() {
    state.pathStack.pop();
    state.parentId = state.pathStack.length ? state.pathStack[state.pathStack.length - 1].id : null;
    state.view = 'folders';
    loadCategories();
  }

  // ---- Folders (categories) --------------------------------------------------

  async function loadCategories() {
    const list = document.getElementById('folderList');
    list.innerHTML = `<div class="table-empty">Loading…</div>`;
    renderCrumb();
    try {
      const res = await Admin.api.get(API.categories + Admin.qs({ type: state.type }));
      state.categoriesCache = res.data.categories || [];
      renderFolders();
    } catch (err) {
      list.innerHTML = `<div class="table-empty">Couldn't load categories.</div>`;
      Admin.toastError(err);
    }
  }

  function renderFolders() {
    const list = document.getElementById('folderList');
    const children = state.categoriesCache.filter((c) => (c.parent_id ?? null) === state.parentId);

    if (!children.length) {
      list.innerHTML = `<div class="table-empty">No categories yet. Create one with "New Category".</div>`;
      return;
    }

    list.innerHTML = children.map((c) => `
      <div class="folder-row" data-id="${c.id}">
        <div class="folder-row-lead">
          <span class="folder-icon">${ICON.folder}</span>
          <div class="folder-info">
            <div class="folder-name">${Admin.escapeHtml(c.name)}</div>
            ${c.description ? `<div class="folder-desc">${Admin.escapeHtml(c.description)}</div>` : ''}
            <div class="folder-meta">${Admin.badge(Number(c.status) === 1)}</div>
          </div>
        </div>
        <div class="folder-actions">
          <button class="btn btn-outline-indigo btn-sm" data-act="open">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 13.5 7.5 9l3 3 2.5-2.5L17 13" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            Open
          </button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.folder-row').forEach((row) => {
      const c = children.find((x) => String(x.id) === row.dataset.id);
      row.querySelector('[data-act="open"]').addEventListener('click', () => openFolder(c));
      row.querySelector('[data-act="edit"]').addEventListener('click', () => openCategoryModal(c));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteCategory(c));
    });
  }

  function openFolder(c) {
    state.pathStack.push({ id: c.id, name: c.name });
    state.parentId = c.id;
    const hasChildren = state.categoriesCache.some((x) => (x.parent_id ?? null) === c.id);
    if (hasChildren) {
      state.view = 'folders';
      renderCrumb();
      renderFolders();
    } else {
      state.view = 'files';
      state.mediaSearch = '';
      document.getElementById('mediaSearchInput').value = '';
      state.page = 1;
      renderCrumb();
      loadFiles();
    }
  }

  function typeOptionsHtml(selectedParentId) {
    // Parent can be root, or any other category of the same type except self (checked at call site).
    const opts = ['<option value="">— Root (no parent) —</option>'];
    state.categoriesCache.forEach((c) => {
      opts.push(`<option value="${c.id}" ${c.id === selectedParentId ? 'selected' : ''}>${Admin.escapeHtml(c.name)}</option>`);
    });
    return opts.join('');
  }

  function categoryFormHtml(c) {
    const isEdit = !!c;
    const parents = state.categoriesCache.filter((x) => !isEdit || x.id !== c.id);
    const parentOpts = ['<option value="">— Root (no parent) —</option>']
      .concat(parents.map((p) => `<option value="${p.id}" ${isEdit && c.parent_id === p.id ? 'selected' : (!isEdit && state.parentId === p.id ? 'selected' : '')}>${Admin.escapeHtml(p.name)}</option>`))
      .join('');

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
              <label>Category Type</label>
              <input type="text" value="${Admin.escapeHtml(state.label)}" disabled>
            </div>
            <div class="form-group">
              <label for="f-parent">Parent Category</label>
              <select id="f-parent">${parentOpts}</select>
            </div>
          </div>
          <div class="form-group">
            <label for="f-status">Status</label>
            <select id="f-status">
              <option value="1" ${!isEdit || Number(c.status) === 1 ? 'selected' : ''}>Active</option>
              <option value="2" ${isEdit && Number(c.status) !== 1 ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div class="form-group">
            <label for="f-description">Description</label>
            <textarea id="f-description" placeholder="Optional description">${isEdit ? Admin.escapeHtml(c.description || '') : ''}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="catFormSubmit">Save</button>
        </div>
      </form>
    `;
  }

  function openCategoryModal(c) {
    Admin.openModal(categoryFormHtml(c));
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
        type: state.type,
        parent_id: document.getElementById('f-parent').value || '',
        status: Number(document.getElementById('f-status').value),
        description: document.getElementById('f-description').value.trim() || null,
      };

      try {
        if (c) {
          await Admin.api.patch(API.categoryUpdate(c.id), payload);
          Admin.toast('Category updated', 'success');
        } else {
          await Admin.api.post(API.categories, payload);
          Admin.toast('Category created', 'success');
        }
        Admin.closeModal();
        loadCategories();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  async function deleteCategory(c) {
    const ok = await Admin.confirmAction({
      title: 'Delete category?',
      body: `Delete <strong>${Admin.escapeHtml(c.name)}</strong>? Categories that still contain files can't be deleted until those are moved or removed first.`,
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.categoryDelete(c.id));
      Admin.toast('Category deleted', 'success');
      loadCategories();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Files (media items) ---------------------------------------------------

  async function loadFiles() {
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = `<div class="table-empty">Loading…</div>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        category_id: state.parentId,
        search: state.mediaSearch,
        page: state.page,
        per_page: state.perPage,
      }));
      state.items = res.data.items || [];
      renderFiles();
      renderMediaPagination(res.meta && res.meta.pagination);
    } catch (err) {
      grid.innerHTML = `<div class="table-empty">Couldn't load files.</div>`;
      Admin.toastError(err);
    }
  }

  function renderFiles() {
    const grid = document.getElementById('mediaGrid');
    if (!state.items.length) {
      grid.innerHTML = `<div class="table-empty">No files here yet. Use "Upload" to add some.</div>`;
      return;
    }

    grid.innerHTML = state.items.map((m) => `
      <div class="media-tile" data-id="${m.mediaId}">
        ${m.mediaType === 'image'
          ? `<img class="media-thumb" src="${assetUrl(m.thumbnailPath || m.filePath)}" alt="${Admin.escapeHtml(m.altText || m.title || '')}" loading="lazy">`
          : `<div class="media-thumb">${fileTypeIcon(m.mediaType)}</div>`
        }
        <div class="media-tile-body">
          <div class="media-tile-title" title="${Admin.escapeHtml(m.title || m.originalName)}">${Admin.escapeHtml(m.title || m.originalName)}</div>
          <div class="media-tile-meta">${Admin.escapeHtml(m.mediaType)} · ${formatBytes(m.fileSize)}</div>
          <div class="media-tile-actions">
            <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
            <span class="status-toggle-badge" data-act="toggle" style="cursor:pointer;">${Admin.badge(Number(m.status) === 1)}</span>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.media-tile').forEach((tile) => {
      const m = state.items.find((x) => String(x.mediaId) === tile.dataset.id);
      tile.querySelector('[data-act="edit"]').addEventListener('click', () => openMediaEditModal(m));
      tile.querySelector('[data-act="delete"]').addEventListener('click', () => deleteMedia(m));
      tile.querySelector('[data-act="toggle"]').addEventListener('click', () => toggleMediaStatus(m));
    });
  }

  function formatBytes(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderMediaPagination(pagination) {
    const el = document.getElementById('mediaPagination');
    if (!pagination) { el.innerHTML = ''; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} files</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="mediaPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="mediaNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('mediaPrev')?.addEventListener('click', () => { state.page--; loadFiles(); });
    document.getElementById('mediaNext')?.addEventListener('click', () => { state.page++; loadFiles(); });
  }

  // ---- Upload modal -----------------------------------------------------------

  function openUploadModal() {
    Admin.openModal(`
      <div class="modal-header"><h3>Upload Files</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="uploadForm">
        <div class="modal-body">
          <div id="uploadFormErrors"></div>
          <div class="form-group">
            <label for="f-files">Files</label>
            <input type="file" id="f-files" multiple required>
            <p class="hint">Images, videos, PDFs, documents, audio — max 20 MB each.</p>
          </div>
          <div class="form-group">
            <label for="f-title">Title <span class="opt-label">(optional)</span></label>
            <input type="text" id="f-title" placeholder="Leave blank to use filename">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-success" id="uploadFormSubmit">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            Upload
          </button>
        </div>
      </form>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('uploadFormErrors');
      errBox.innerHTML = '';
      const filesInput = document.getElementById('f-files');
      if (!filesInput.files.length) {
        errBox.innerHTML = `<div class="form-errors"><strong>Choose at least one file</strong></div>`;
        return;
      }

      const btn = document.getElementById('uploadFormSubmit');
      Admin.setButtonLoading(btn, true, 'Uploading…');

      const fd = new FormData();
      Array.from(filesInput.files).forEach((f) => fd.append('files', f));
      fd.append('category_id', state.parentId);
      const title = document.getElementById('f-title').value.trim();
      if (title) fd.append('title', title);

      try {
        await Admin.api.uploadForm(API.upload, fd);
        Admin.toast('Files uploaded', 'success');
        Admin.closeModal();
        state.page = 1;
        loadFiles();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  // ---- Media edit / delete / toggle --------------------------------------------

  function openMediaEditModal(m) {
    Admin.openModal(`
      <div class="modal-header"><h3>Edit File</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="mediaEditForm">
        <div class="modal-body">
          <div id="mediaEditFormErrors"></div>
          <div class="form-group">
            <label for="f-m-title">Title</label>
            <input type="text" id="f-m-title" value="${Admin.escapeHtml(m.title || '')}">
          </div>
          <div class="form-group">
            <label for="f-m-alt">Alt text</label>
            <input type="text" id="f-m-alt" value="${Admin.escapeHtml(m.altText || '')}">
          </div>
          <div class="form-group">
            <label for="f-m-description">Description</label>
            <textarea id="f-m-description">${Admin.escapeHtml(m.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="f-m-status">Status</label>
            <select id="f-m-status">
              <option value="1" ${Number(m.status) === 1 ? 'selected' : ''}>Active</option>
              <option value="2" ${Number(m.status) !== 1 ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="mediaEditFormSubmit">Save</button>
        </div>
      </form>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#mediaEditForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('mediaEditFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('mediaEditFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        await Admin.api.patch(API.update(m.mediaId), {
          title: document.getElementById('f-m-title').value.trim(),
          alt_text: document.getElementById('f-m-alt').value.trim(),
          description: document.getElementById('f-m-description').value.trim() || null,
          status: Number(document.getElementById('f-m-status').value),
        });
        Admin.toast('File updated', 'success');
        Admin.closeModal();
        loadFiles();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m2) => `<li>${Admin.escapeHtml(m2)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  async function toggleMediaStatus(m) {
    const newStatus = Number(m.status) === 1 ? 2 : 1;
    try {
      await Admin.api.patch(API.bulkStatus, { ids: [m.mediaId], status: newStatus });
      Admin.toast(newStatus === 1 ? 'File activated' : 'File deactivated', 'success');
      loadFiles();
    } catch (err) { Admin.toastError(err); }
  }

  async function deleteMedia(m) {
    const ok = await Admin.confirmAction({
      title: 'Delete file?',
      body: `Delete <strong>${Admin.escapeHtml(m.title || m.originalName)}</strong>? This can't be undone.`,
      confirmLabel: 'Delete file',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(m.mediaId));
      Admin.toast('File deleted', 'success');
      loadFiles();
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
