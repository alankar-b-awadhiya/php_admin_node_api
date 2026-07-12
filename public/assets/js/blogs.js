/**
 * blogs.js — Blogs page (maps to /blogs, per the Blogs section of the API
 * reference: aba_main_db `blogs`, Bearer required on every route).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/blogs/v1/blogs.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.categories           - list blog categories (/blogs/categories)
 *   GET    API.list                 - paginated list (?category_id, ?status, ?featured, ?search, ?page, ?perPage)
 *   GET    API.get(id)              - single post
 *   POST   API.list                 - create a post (multipart: featured_image optional)
 *   PATCH  API.update(id)           - update a post (multipart)
 *   DELETE API.remove(id)           - delete a post
 *   PATCH  API.cycleStatus(id)      - cycle draft -> published -> archived -> draft
 *   PATCH  API.toggleFeatured(id)   - toggle the featured flag
 *   DELETE API.removeImage(id)      - remove the featured image
 *
 * NOTE on "New Category": the README only documents a read endpoint for
 * blog categories (GET /blogs/categories) — there's no POST under /blogs
 * for creating one. Blog categories are one type inside the generic, typed
 * `categories` domain that's shared across blogs/media/clientele/etc
 * (see /categories, /categories/types in the API reference), so category
 * creation here goes through THAT domain: we look up which category type
 * corresponds to blogs from GET /categories/types, then POST /categories
 * with that type's id — mirroring exactly what categories.js does on the
 * Categories page. If no matching type exists yet, we tell the user to
 * create a "Blog" category type first (Categories page manages types).
 */
(function () {
  const API = {
    categories: '/blogs/categories',
    list: '/blogs',
    get: (id) => `/blogs/${id}`,
    update: (id) => `/blogs/${id}`,
    remove: (id) => `/blogs/${id}`,
    cycleStatus: (id) => `/blogs/${id}/status`,
    toggleFeatured: (id) => `/blogs/${id}/featured`,
    removeImage: (id) => `/blogs/${id}/image`,
  };
  const GENERIC_CATEGORIES = {
    types: '/categories/types',
    list: '/categories',
  };

  // Origin to prepend to relative file paths the API returns (served by
  // express.static on the API's own origin, not under /api/v1) — same
  // convention as media.js / settings.js.
  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    return relPath ? API_ORIGIN + relPath : '';
  }

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    cycle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.2l2.36 4.78 5.28.77-3.82 3.72.9 5.26L10 14.27l-4.72 2.48.9-5.26L2.36 7.75l5.28-.77L10 2.2Z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    image: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="8" r="1.4" stroke="currentColor" stroke-width="1.2"/><path d="M3 14l4.5-4.5 3 3 2.5-2.5L17.5 15" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  };

  const STATUS_ORDER = ['draft', 'published', 'archived'];

  let rows = [];
  let categories = []; // from /blogs/categories, normalized {id, name}
  let blogCategoryType = null; // resolved once from /categories/types, for "New Category"
  let state = { search: '', status: '', categoryId: '', featured: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnAddBlogPost').addEventListener('click', openCreatePostModal);
    document.getElementById('btnNewCategory').addEventListener('click', openCreateCategoryModal);
    document.getElementById('btnRefreshBlogs').addEventListener('click', () => loadList(true));

    document.getElementById('searchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim();
      state.page = 1;
      loadList();
    }, 350));
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.status = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      state.categoryId = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('featuredFilter').addEventListener('change', (e) => {
      state.featured = e.target.value; state.page = 1; loadList();
    });

    await loadCategories();
    await loadList();
  }

  // ---- Normalizing helpers (backend field names for blog categories/posts
  // aren't fully pinned down in the README beyond the /blogs GET sample, so
  // read defensively across the naming conventions used elsewhere in this
  // codebase) ---------------------------------------------------------------
  function normCategory(c) {
    return {
      id: c.id ?? c.categoryId ?? c.category_id,
      name: c.name ?? c.categoryName ?? c.title ?? '(unnamed)',
    };
  }

  async function loadCategories() {
    const sel = document.getElementById('categoryFilter');
    try {
      const res = await Admin.api.get(API.categories);
      const list = res.data.categories || res.data.items || (Array.isArray(res.data) ? res.data : []) || [];
      categories = list.map(normCategory);
      sel.innerHTML = '<option value="">All Categories</option>' +
        categories.map((c) => `<option value="${c.id}">${Admin.escapeHtml(c.name)}</option>`).join('');
    } catch (err) {
      Admin.toastError(err);
    }
  }

  async function loadList(spin) {
    const body = document.getElementById('blogsTableBody');
    const refreshBtn = document.getElementById('btnRefreshBlogs');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading articles…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        search: state.search,
        status: state.status,
        category_id: state.categoryId,
        featured: state.featured,
        page: state.page,
        perPage: state.perPage,
      }));
      rows = res.data.blogs || res.data.items || (Array.isArray(res.data) ? res.data : []) || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('articlesCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} article${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load articles.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function statusBadge(status) {
    const s = (status || 'draft').toLowerCase();
    if (s === 'published') return `<span class="badge badge-green"><span class="badge-dot"></span>published</span>`;
    if (s === 'archived') return `<span class="badge badge-amber"><span class="badge-dot"></span>archived</span>`;
    return `<span class="badge badge-gray"><span class="badge-dot"></span>draft</span>`;
  }

  function renderTable() {
    const body = document.getElementById('blogsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">No blog posts found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((b) => {
      const img = b.featuredImage || b.featured_image;
      const thumb = img
        ? `<img class="blog-thumb" src="${assetUrl(img)}" alt="" loading="lazy">`
        : `<div class="blog-thumb blog-thumb-empty">${ICON.image}</div>`;
      const excerpt = b.excerpt ? `<div class="blog-title-sub">${Admin.escapeHtml(truncate(b.excerpt, 70))}</div>` : '';
      const author = b.authorName || b.author_name || b.authorNameOverride || '—';
      return `
        <tr data-id="${b.id}">
          <td>${thumb}</td>
          <td>
            <strong>${Admin.escapeHtml(b.title)}</strong>
            ${excerpt}
          </td>
          <td class="cell-muted">${Admin.escapeHtml(b.categoryName || b.category_name || '—')}</td>
          <td class="cell-muted">${Admin.escapeHtml(author)}</td>
          <td>${statusBadge(b.status)}</td>
          <td class="cell-muted">${Admin.formatDate(b.publishedAt || b.published_at)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
            <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
            <button class="icon-action icon-action-toggle" data-act="cycle" title="Change status">${ICON.cycle}</button>
            <button class="icon-action icon-action-star ${b.isFeatured ? 'is-on' : ''}" data-act="featured" title="${b.isFeatured ? 'Unfeature' : 'Feature'}">${ICON.star}</button>
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const b = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(b));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditPostModal(b));
      tr.querySelector('[data-act="cycle"]')?.addEventListener('click', () => cycleStatus(b));
      tr.querySelector('[data-act="featured"]')?.addEventListener('click', () => toggleFeatured(b));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removePost(b));
    });
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function renderPagination(pagination) {
    const el = document.getElementById('blogsPagination');
    if (!pagination) { el.innerHTML = `<span>Total: ${rows.length}</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="blogPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="blogNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('blogPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('blogNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  // ---- Status cycle / featured toggle / delete ----------------------------

  async function cycleStatus(b) {
    try {
      await Admin.api.patch(API.cycleStatus(b.id));
      Admin.toast('Status updated', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function toggleFeatured(b) {
    try {
      await Admin.api.patch(API.toggleFeatured(b.id));
      Admin.toast(b.isFeatured ? 'Removed from featured' : 'Marked as featured', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removePost(b) {
    const ok = await Admin.confirmAction({
      title: 'Delete blog post?',
      body: `Delete <strong>${Admin.escapeHtml(b.title)}</strong>? This can't be undone.`,
      confirmLabel: 'Delete post',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(b.id));
      Admin.toast('Blog post deleted', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- View modal (read-only) ----------------------------------------------

  function openViewModal(b) {
    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(b.title)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        ${(b.featuredImage || b.featured_image) ? `<img src="${assetUrl(b.featuredImage || b.featured_image)}" alt="" style="width:100%;border-radius:var(--radius-md);margin-bottom:14px;">` : ''}
        <div class="flex-gap" style="margin-bottom:12px;">
          ${statusBadge(b.status)}
          ${b.isFeatured ? '<span class="badge badge-indigo"><span class="badge-dot"></span>featured</span>' : ''}
          <span class="badge-outline">${Admin.escapeHtml(b.categoryName || b.category_name || 'Uncategorized')}</span>
        </div>
        <p style="color:var(--text-muted);font-size:13.5px;">${Admin.escapeHtml(b.excerpt || 'No excerpt.')}</p>
        <div class="log-body-pre">${Admin.escapeHtml(b.content || 'No content.')}</div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
  }

  // ---- Add / Edit Blog Post modal (tabbed: Basic Info / Featured Image / SEO) --

  function categoryOptionsHtml(selectedId) {
    const opts = ['<option value="">— No Category —</option>']
      .concat(categories.map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${Admin.escapeHtml(c.name)}</option>`));
    return opts.join('');
  }

  function postFormHtml(b) {
    const isEdit = !!b;
    const currentImage = isEdit ? (b.featuredImage || b.featured_image) : null;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Blog Post' : 'Add Blog Post'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="tabs" id="postTabs">
        <button type="button" class="tab-btn is-active" data-tab="basic">Basic Info</button>
        <button type="button" class="tab-btn" data-tab="image">Featured Image</button>
        <button type="button" class="tab-btn" data-tab="seo">SEO / Meta</button>
      </div>
      <form id="postForm">
        <div class="modal-body">
          <div id="postFormErrors"></div>

          <div class="tab-panel is-active" data-panel="basic">
            <div class="form-row">
              <div class="form-group">
                <label for="f-title">Title <span style="color:var(--coral);">*</span></label>
                <input type="text" id="f-title" placeholder="e.g. 10 Tips for Modern Farming" value="${isEdit ? Admin.escapeHtml(b.title) : ''}" required>
              </div>
              <div class="form-group">
                <label for="f-category">Category</label>
                <select id="f-category">${categoryOptionsHtml(isEdit ? (b.categoryId ?? b.category_id) : '')}</select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-status">Status</label>
                <select id="f-status">
                  <option value="draft" ${!isEdit || (b.status || 'draft') === 'draft' ? 'selected' : ''}>Draft</option>
                  <option value="published" ${isEdit && b.status === 'published' ? 'selected' : ''}>Published</option>
                  <option value="archived" ${isEdit && b.status === 'archived' ? 'selected' : ''}>Archived</option>
                </select>
              </div>
              <div class="form-group">
                <label for="f-published-at">Published At</label>
                <input type="datetime-local" id="f-published-at" value="${isEdit ? toDatetimeLocal(b.publishedAt || b.published_at) : ''}">
                <p class="hint">Leave blank to set on publish</p>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="f-author-id">Author ID</label>
                <input type="text" id="f-author-id" placeholder="Optional user ID override" value="${isEdit ? Admin.escapeHtml(b.authorId ?? b.author_id ?? '') : ''}">
              </div>
              <div class="form-group">
                <label for="f-author-name">Author Name Override</label>
                <input type="text" id="f-author-name" placeholder="Optional author name override" value="${isEdit ? Admin.escapeHtml(b.authorNameOverride ?? b.author_name_override ?? '') : ''}">
              </div>
            </div>
            <div class="form-group">
              <label for="f-excerpt">Excerpt</label>
              <textarea id="f-excerpt" placeholder="Brief summary shown in listings...">${isEdit ? Admin.escapeHtml(b.excerpt || '') : ''}</textarea>
            </div>
            <div class="form-group">
              <label for="f-content">Content</label>
              <textarea id="f-content" placeholder="Full blog post content (supports HTML)..." style="min-height:160px;">${isEdit ? Admin.escapeHtml(b.content || '') : ''}</textarea>
            </div>
          </div>

          <div class="tab-panel" data-panel="image">
            <div class="settings-image-row">
              <div class="settings-image-preview" id="imgPreview" style="width:96px;height:96px;">${currentImage ? `<img src="${assetUrl(currentImage)}" alt="">` : ''}</div>
              <div class="settings-image-controls">
                <input type="file" id="f-image" accept="image/*">
                <p class="hint">JPG or PNG. Leave blank to keep the current image.</p>
                ${isEdit && currentImage ? `<button type="button" class="btn btn-danger btn-sm" id="btnRemoveImage">Remove current image</button>` : ''}
              </div>
            </div>
          </div>

          <div class="tab-panel" data-panel="seo">
            <div class="form-group">
              <label for="f-slug">Slug</label>
              <input type="text" id="f-slug" placeholder="auto-generated-from-title" value="${isEdit ? Admin.escapeHtml(b.slug || '') : ''}">
              <p class="hint">Leave blank to auto-generate from the title</p>
            </div>
            <div class="form-group">
              <label for="f-tags">Tags</label>
              <input type="text" id="f-tags" placeholder="comma, separated, tags" value="${isEdit && Array.isArray(b.tags) ? Admin.escapeHtml(b.tags.join(', ')) : ''}">
            </div>
            <div class="form-group">
              <label for="f-meta-title">Meta Title</label>
              <input type="text" id="f-meta-title" placeholder="SEO title" value="${isEdit ? Admin.escapeHtml(b.metaTitle || b.meta_title || '') : ''}">
            </div>
            <div class="form-group">
              <label for="f-meta-description">Meta Description</label>
              <textarea id="f-meta-description" placeholder="SEO description">${isEdit ? Admin.escapeHtml(b.metaDescription || b.meta_description || '') : ''}</textarea>
            </div>
            <div class="form-group">
              <label for="f-meta-keywords">Meta Keywords</label>
              <input type="text" id="f-meta-keywords" placeholder="comma, separated, keywords" value="${isEdit ? Admin.escapeHtml(b.metaKeywords || b.meta_keywords || '') : ''}">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="postFormSubmit">Save</button>
        </div>
      </form>
    `;
  }

  function toDatetimeLocal(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openCreatePostModal() {
    Admin.openModal(postFormHtml(null));
    wirePostModal(null);
  }

  function openEditPostModal(b) {
    Admin.openModal(postFormHtml(b));
    wirePostModal(b);
  }

  function wirePostModal(b) {
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

    const imgInput = backdrop.querySelector('#f-image');
    imgInput.addEventListener('change', () => {
      const preview = backdrop.querySelector('#imgPreview');
      if (imgInput.files[0]) {
        preview.innerHTML = `<img src="${URL.createObjectURL(imgInput.files[0])}" alt="">`;
      }
    });

    const removeBtn = backdrop.querySelector('#btnRemoveImage');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const ok = await Admin.confirmAction({ title: 'Remove featured image?', confirmLabel: 'Remove', danger: true });
        if (!ok) return;
        try {
          await Admin.api.del(API.removeImage(b.id));
          Admin.toast('Featured image removed', 'success');
          backdrop.querySelector('#imgPreview').innerHTML = '';
          removeBtn.remove();
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
    }

    backdrop.querySelector('#postForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('postFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('postFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const fd = new FormData();
      fd.append('title', document.getElementById('f-title').value.trim());
      fd.append('category_id', document.getElementById('f-category').value);
      fd.append('status', document.getElementById('f-status').value);
      fd.append('published_at', document.getElementById('f-published-at').value);
      fd.append('author_id', document.getElementById('f-author-id').value.trim());
      fd.append('author_name_override', document.getElementById('f-author-name').value.trim());
      fd.append('excerpt', document.getElementById('f-excerpt').value.trim());
      fd.append('content', document.getElementById('f-content').value);
      fd.append('slug', document.getElementById('f-slug').value.trim());
      fd.append('tags', document.getElementById('f-tags').value.trim());
      fd.append('meta_title', document.getElementById('f-meta-title').value.trim());
      fd.append('meta_description', document.getElementById('f-meta-description').value.trim());
      fd.append('meta_keywords', document.getElementById('f-meta-keywords').value.trim());
      if (imgInput.files[0]) fd.append('featured_image', imgInput.files[0]);

      try {
        if (b) {
          await Admin.api.uploadForm(API.update(b.id), fd, { method: 'PATCH' });
          Admin.toast('Blog post updated', 'success');
        } else {
          await Admin.api.uploadForm(API.list, fd);
          Admin.toast('Blog post created', 'success');
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

  // ---- New Category modal (goes through the generic /categories domain) ---

  async function resolveBlogCategoryType() {
    if (blogCategoryType) return blogCategoryType;
    try {
      const res = await Admin.api.get(GENERIC_CATEGORIES.types);
      const types = res.data.types || [];
      blogCategoryType = types.find((t) => String(t.id).toUpperCase() === 'BLOG')
        || types.find((t) => (t.typeLabel || '').toLowerCase().includes('blog'))
        || null;
      return blogCategoryType;
    } catch (err) {
      Admin.toastError(err);
      return null;
    }
  }

  function parentOptionsHtml(parents) {
    const opts = ['<option value="">— None (top level) —</option>']
      .concat(parents.map((p) => `<option value="${p.id}">${Admin.escapeHtml(p.name)}</option>`));
    return opts.join('');
  }

  function categoryFormHtml(parents) {
    return `
      <div class="modal-header"><h3>New Category</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="catForm">
        <div class="modal-body">
          <div id="catFormErrors"></div>
          <div class="form-group">
            <label for="f-name">Name <span style="color:var(--coral);">*</span></label>
            <input type="text" id="f-name" placeholder="e.g. Industry News" required>
          </div>
          <div class="form-group">
            <label for="f-description">Description</label>
            <textarea id="f-description" placeholder=""></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-parent">Parent Category</label>
              <select id="f-parent">${parentOptionsHtml(parents)}</select>
            </div>
            <div class="form-group">
              <label for="f-status">Status</label>
              <select id="f-status">
                <option value="1" selected>Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="catFormSubmit">Save</button>
        </div>
      </form>
    `;
  }

  async function openCreateCategoryModal() {
    const type = await resolveBlogCategoryType();
    if (!type) {
      Admin.toast('No "Blog" category type found yet — create one on the Categories page first.', 'error', 6000);
      return;
    }
    let parents = [];
    try {
      const res = await Admin.api.get(GENERIC_CATEGORIES.list + Admin.qs({ type: type.id, perPage: 100, page: 1 }));
      parents = (res.data.categories || []).map(normCategory);
    } catch (err) { Admin.toastError(err); }

    Admin.openModal(categoryFormHtml(parents));
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#catForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('catFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('catFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const payload = {
        name: document.getElementById('f-name').value.trim(),
        category_type_id: type.id,
        parent_id: document.getElementById('f-parent').value || null,
        is_active: Number(document.getElementById('f-status').value),
        description: document.getElementById('f-description').value.trim() || null,
      };

      try {
        await Admin.api.post(GENERIC_CATEGORIES.list, payload);
        Admin.toast('Category created', 'success');
        Admin.closeModal();
        await loadCategories();
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
