/**
 * products.js — Products page (maps to /products[...]), per the Products
 * section of the API reference: aba_main_db (`products`, `product_images`,
 * `product_attributes`, `product_attribute_values`, `product_variants`,
 * `product_variant_attribute_values`) + aba_master_db (`master_categories`,
 * type=PRODUCT). Bearer required on every route.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/products/v1/products.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.categories                 - list categories (?active)
 *   GET    API.list                       - list/filter/paginate
 *   GET    API.get(id)                    - get one, with images + variants nested
 *   POST   API.list                       - create (JSON — no file upload here)
 *   PATCH  API.update(id)                 - update (JSON)
 *   PATCH  API.status(id)                 - { status }
 *   DELETE API.remove(id)                 - soft delete
 *   GET    API.images(id)                 - list a product's images
 *   POST   API.images(id)                 - upload images (multipart: images[], alt_text)
 *   PATCH  API.imageUpdate(imageId)       - { alt_text, sort_order, variant_id }
 *   PATCH  API.imagePrimary(imageId)      - set as primary
 *   DELETE API.imageDelete(imageId)       - delete an image
 *   GET    API.attributes                 - list attributes (?search) — used to build the variant form
 *   GET    API.attributeValues(attrId)    - list one attribute's values
 *   GET    API.variants(id)               - list a product's variants
 *   POST   API.variants(id)               - create a variant
 *   PATCH  API.variantUpdate(variantId)   - update a variant
 *   PATCH  API.variantDefault(variantId)  - set as the product's default variant
 *   DELETE API.variantDelete(variantId)   - delete a variant (hard delete — no undo)
 *
 * Note: `products` has no `restore` affordance here because GET /products
 * (list) always filters deleted_at IS NULL server-side — a soft-deleted
 * product can never resurface in this UI to be restored from, so building a
 * "Restore" button would be a dead end. Deletion is presented as permanent.
 */
(function () {
  const API = {
    categories: '/products/categories',
    list: '/products',
    get: (id) => `/products/${id}`,
    update: (id) => `/products/${id}`,
    status: (id) => `/products/${id}/status`,
    remove: (id) => `/products/${id}`,
    images: (id) => `/products/${id}/images`,
    imageUpdate: (imageId) => `/products/images/${imageId}`,
    imagePrimary: (imageId) => `/products/images/${imageId}/primary`,
    imageDelete: (imageId) => `/products/images/${imageId}`,
    attributes: '/products/attributes',
    attributeValues: (attrId) => `/products/attributes/${attrId}/values`,
    variants: (id) => `/products/${id}/variants`,
    variantUpdate: (variantId) => `/products/variants/${variantId}`,
    variantDefault: (variantId) => `/products/variants/${variantId}/default`,
    variantDelete: (variantId) => `/products/variants/${variantId}`,
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
    star: '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.2l2.36 4.78 5.28.77-3.82 3.72.9 5.26L10 14.27l-4.72 2.48.9-5.26L2.36 7.75l5.28-.77L10 2.2Z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    box: '<svg width="30" height="30" viewBox="0 0 20 20" fill="none"><path d="M10 1.5 18 6l-8 4.5L2 6l8-4.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 7.7v7.2l6.3 3.6V11.2L3 7.7Zm14 0-6.3 3.5v7.3L17 14.9V7.7Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    plus: '<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    upload: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    lock: '<svg width="30" height="30" viewBox="0 0 20 20" fill="none"><rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M6.5 9V6a3.5 3.5 0 0 1 7 0v3" stroke="currentColor" stroke-width="1.3"/></svg>',
  };

  const STOCK_LABEL = { in_stock: 'In Stock', out_of_stock: 'Out of Stock', backorder: 'Backorder' };
  const STATUS_LABEL = { draft: 'Draft', active: 'Active', inactive: 'Inactive', discontinued: 'Discontinued' };

  let rows = [];
  let categories = [];
  let attributesCache = null; // [{attributeId, name, values:[{attributeValueId, value, sortOrder}]}]
  let state = { search: '', category: '', status: '', stock: '', featured: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnAddProduct').addEventListener('click', openCreateModal);
    document.getElementById('btnRefreshProducts').addEventListener('click', () => { loadList(true); loadStats(); });

    document.getElementById('searchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim(); state.page = 1; loadList();
    }, 350));
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      state.category = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.status = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('stockFilter').addEventListener('change', (e) => {
      state.stock = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('featuredFilter').addEventListener('change', (e) => {
      state.featured = e.target.value; state.page = 1; loadList();
    });

    await loadCategories();
    await loadList();
    loadStats();
  }

  async function loadCategories() {
    const sel = document.getElementById('categoryFilter');
    try {
      const res = await Admin.api.get(API.categories);
      categories = res.data.categories || [];
      sel.innerHTML = '<option value="">All Categories</option>' +
        categories.map((c) => `<option value="${c.category_id}">${Admin.escapeHtml(c.name)}</option>`).join('');
    } catch (err) {
      Admin.toastError(err);
    }
  }

  function categoryOptionsHtml(selectedId) {
    return '<option value="">— No category —</option>' +
      categories.map((c) => `<option value="${c.category_id}" ${Number(selectedId) === c.category_id ? 'selected' : ''}>${Admin.escapeHtml(c.name)}</option>`).join('');
  }

  async function loadStats() {
    try {
      const [total, active, draft, oos] = await Promise.all([
        Admin.api.get(API.list + Admin.qs({ per_page: 10 })),
        Admin.api.get(API.list + Admin.qs({ status: 'active', per_page: 10 })),
        Admin.api.get(API.list + Admin.qs({ status: 'draft', per_page: 10 })),
        Admin.api.get(API.list + Admin.qs({ stock_status: 'out_of_stock', per_page: 10 })),
      ]);
      setText('statTotal', total.meta?.pagination?.total ?? '—');
      setText('statActive', active.meta?.pagination?.total ?? '—');
      setText('statDraft', draft.meta?.pagination?.total ?? '—');
      setText('statOutOfStock', oos.meta?.pagination?.total ?? '—');
    } catch (err) { /* non-fatal - stat cards just stay blank */ }
  }
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  // ---- List / filter / paginate --------------------------------------------

  async function loadList(spin) {
    const body = document.getElementById('productsTableBody');
    const refreshBtn = document.getElementById('btnRefreshProducts');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading products…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        search: state.search,
        category_id: state.category,
        status: state.status,
        stock_status: state.stock,
        is_featured: state.featured,
        page: state.page,
        per_page: state.perPage,
      }));
      rows = res.data.products || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('productsCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} product${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load products.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('productsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">No products found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((p) => {
      const thumb = p.primaryImage
        ? `<img class="product-thumb" src="${assetUrl(p.primaryImage)}" alt="">`
        : `<div class="product-thumb product-thumb-empty">${ICON.box}</div>`;
      const priceHtml = p.salePrice !== null && p.salePrice !== undefined
        ? `<span class="price-now">₹${fmtMoney(p.salePrice)}</span><span class="price-strike">₹${fmtMoney(p.price)}</span>`
        : `<span class="price-now">₹${fmtMoney(p.price)}</span>`;
      return `
        <tr data-id="${p.productId}">
          <td>
            <div class="flex-gap" style="align-items:center;flex-wrap:nowrap;">
              ${thumb}
              <div style="min-width:0;">
                <strong>${Admin.escapeHtml(p.name)}</strong>${p.isFeatured ? `<span class="client-name-star">${ICON.star}</span>` : ''}
                <div class="product-name-sub">${p.sku ? Admin.escapeHtml(p.sku) : '<span class="opt-label">no SKU</span>'}</div>
              </div>
            </div>
          </td>
          <td class="cell-muted">${Admin.escapeHtml(p.categoryName || '—')}</td>
          <td><div class="price-cell">${priceHtml}</div></td>
          <td>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
              <span class="stock-pill ${p.stockStatus}">${STOCK_LABEL[p.stockStatus] || p.stockStatus}</span>
              ${p.manageStock ? `<span class="opt-label">${p.stockQuantity} in stock</span>` : ''}
            </div>
          </td>
          <td>${p.hasVariants ? `<span class="count-pill-soft">${p.variantCount} variant${p.variantCount === 1 ? '' : 's'}</span>` : '<span class="cell-muted">—</span>'}</td>
          <td>
            <select class="status-select st-${p.status}" data-act="status">
              ${Object.keys(STATUS_LABEL).map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
            </select>
          </td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
            <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
            <button class="icon-action icon-action-star ${p.isFeatured ? 'is-on' : ''}" data-act="featured" title="${p.isFeatured ? 'Unfeature' : 'Feature'}">${ICON.star}</button>
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const p = rows.find((x) => String(x.productId) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(p));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(p));
      tr.querySelector('[data-act="featured"]')?.addEventListener('click', () => toggleFeatured(p));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removeProduct(p));
      tr.querySelector('[data-act="status"]')?.addEventListener('change', (e) => changeStatus(p, e.target.value));
    });
  }

  function fmtMoney(n) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('productsPagination');
    if (!pagination) { el.innerHTML = `<span>Total: ${rows.length}</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="prodPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="prodNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('prodPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('prodNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  // ---- Row actions: status / featured / delete -----------------------------

  async function changeStatus(p, status) {
    try {
      await Admin.api.patch(API.status(p.productId), { status });
      Admin.toast('Status updated', 'success');
      p.status = status;
      loadStats();
    } catch (err) {
      Admin.toastError(err);
      loadList();
    }
  }

  async function toggleFeatured(p) {
    try {
      await Admin.api.patch(API.update(p.productId), { is_featured: p.isFeatured ? 0 : 1 });
      Admin.toast(p.isFeatured ? 'Removed from featured' : 'Marked as featured', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removeProduct(p) {
    const ok = await Admin.confirmAction({
      title: 'Delete product?',
      body: `Delete <strong>${Admin.escapeHtml(p.name)}</strong>? This can't be undone from this screen.`,
      confirmLabel: 'Delete product',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(p.productId));
      Admin.toast('Product deleted', 'success');
      loadList();
      loadStats();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- View modal (read-only summary) ---------------------------------------

  function openViewModal(p) {
    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(p.name)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        ${p.primaryImage ? `<img src="${assetUrl(p.primaryImage)}" alt="" style="max-height:140px;max-width:100%;object-fit:contain;border-radius:10px;margin-bottom:14px;border:1px solid var(--line);">` : ''}
        <div class="flex-gap" style="margin-bottom:12px;">
          ${Admin.badge(p.status === 'active', STATUS_LABEL[p.status] || p.status, STATUS_LABEL[p.status] || p.status)}
          <span class="stock-pill ${p.stockStatus}">${STOCK_LABEL[p.stockStatus] || p.stockStatus}</span>
          ${p.isFeatured ? '<span class="badge badge-indigo"><span class="badge-dot"></span>featured</span>' : ''}
          <span class="badge-outline">${Admin.escapeHtml(p.categoryName || 'Uncategorized')}</span>
        </div>
        <p><strong>SKU:</strong> ${p.sku ? Admin.escapeHtml(p.sku) : '—'} &nbsp; <strong>Price:</strong> ₹${fmtMoney(p.salePrice ?? p.price)}${p.salePrice !== null && p.salePrice !== undefined ? ` <span class="price-strike">₹${fmtMoney(p.price)}</span>` : ''}</p>
        <p style="color:var(--text-muted);font-size:13.5px;">${Admin.escapeHtml(p.shortDescription || 'No short description.')}</p>
        ${p.tags && p.tags.length ? `<div class="flex-gap">${p.tags.map((t) => `<span class="attr-chip">${Admin.escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
        <button type="button" class="btn btn-primary" data-act="edit">Edit Product</button>
      </div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('[data-act="edit"]').addEventListener('click', () => openEditModal(p));
  }

  // ---- Add / Edit modal (tabbed) --------------------------------------------

  function productFormTabsHtml(p) {
    const isEdit = !!p;
    return `
      <div class="tabs" id="productTabs">
        <button type="button" class="tab-btn is-active" data-tab="basic">Basic Info</button>
        <button type="button" class="tab-btn" data-tab="pricing">Pricing &amp; Inventory</button>
        <button type="button" class="tab-btn" data-tab="seo">SEO &amp; Tags</button>
        <button type="button" class="tab-btn" data-tab="images">Images${isEdit ? '' : ' 🔒'}</button>
        <button type="button" class="tab-btn" data-tab="variants">Variants${isEdit ? '' : ' 🔒'}</button>
      </div>
    `;
  }

  function basicInfoPanelHtml(p) {
    const isEdit = !!p;
    return `
      <div class="tab-panel is-active" data-panel="basic">
        ${isEdit ? `<div class="flex-gap" style="margin-bottom:14px;">${p.hasVariants ? '<span class="badge badge-indigo"><span class="badge-dot"></span>Has variants</span>' : '<span class="badge badge-gray"><span class="badge-dot"></span>Simple product (no variants)</span>'}</div>` : ''}
        <div class="form-row">
          <div class="form-group">
            <label for="f-name">Product Name <span style="color:var(--coral);">*</span></label>
            <input type="text" id="f-name" placeholder="e.g. Classic Cotton Tee" value="${isEdit ? Admin.escapeHtml(p.name) : ''}" required>
          </div>
          <div class="form-group">
            <label for="f-slug">Slug</label>
            <input type="text" id="f-slug" placeholder="auto-generated if blank" value="${isEdit ? Admin.escapeHtml(p.slug || '') : ''}" ${isEdit ? 'disabled' : ''}>
            <p class="hint">${isEdit ? "Slug can't be changed after creation from here" : 'Leave blank to auto-generate from name'}</p>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-sku">SKU</label>
            <input type="text" id="f-sku" placeholder="e.g. TEE-001" value="${isEdit ? Admin.escapeHtml(p.sku || '') : ''}">
          </div>
          <div class="form-group">
            <label for="f-category">Category</label>
            <select id="f-category">${categoryOptionsHtml(isEdit ? p.categoryId : null)}</select>
          </div>
        </div>
        <div class="form-group">
          <label for="f-short-desc">Short Description</label>
          <textarea id="f-short-desc" placeholder="One-liner shown in listings...">${isEdit ? Admin.escapeHtml(p.shortDescription || '') : ''}</textarea>
        </div>
        <div class="form-group">
          <label for="f-description">Full Description</label>
          <textarea id="f-description" style="min-height:120px;" placeholder="Detailed product description — supports HTML...">${isEdit ? Admin.escapeHtml(p.description || '') : ''}</textarea>
        </div>
      </div>
    `;
  }

  function pricingPanelHtml(p) {
    const isEdit = !!p;
    const v = (key, def = '') => (isEdit && p[key] !== null && p[key] !== undefined ? p[key] : def);
    return `
      <div class="tab-panel" data-panel="pricing">
        <div class="form-row">
          <div class="form-group">
            <label for="f-currency">Currency Code</label>
            <input type="text" id="f-currency" maxlength="3" style="text-transform:uppercase;" value="${isEdit ? Admin.escapeHtml(p.currencyCode || 'INR') : 'INR'}">
          </div>
          <div class="form-group">
            <label for="f-tax-rate">Tax Rate (%)</label>
            <input type="number" id="f-tax-rate" step="0.01" min="0" value="${v('taxRate', 0)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-price">Price <span style="color:var(--coral);">*</span></label>
            <input type="number" id="f-price" step="0.01" min="0" value="${v('price', 0)}" required>
          </div>
          <div class="form-group">
            <label for="f-sale-price">Sale Price</label>
            <input type="number" id="f-sale-price" step="0.01" min="0" placeholder="Leave blank if not on sale" value="${v('salePrice', '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-stock-qty">Stock Quantity</label>
            <input type="number" id="f-stock-qty" min="0" value="${v('stockQuantity', 0)}">
          </div>
          <div class="form-group">
            <label for="f-stock-status">Stock Status</label>
            <select id="f-stock-status">
              ${Object.keys(STOCK_LABEL).map((s) => `<option value="${s}" ${(isEdit ? p.stockStatus : 'in_stock') === s ? 'selected' : ''}>${STOCK_LABEL[s]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-low-stock">Low Stock Alert</label>
            <input type="number" id="f-low-stock" min="0" value="${v('lowStockAlert', 5)}">
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;">
            <label class="checkbox-row"><input type="checkbox" id="f-manage-stock" ${isEdit ? (p.manageStock ? 'checked' : '') : ''}><span>Manage stock for this product</span></label>
          </div>
        </div>
        <div class="form-group">
          <label>Dimensions &amp; Weight <span class="opt-label">(kg / cm, optional)</span></label>
          <div class="dim-row">
            <input type="number" id="f-weight" step="0.001" min="0" placeholder="Weight (kg)" value="${v('weight', '')}">
            <input type="number" id="f-length" step="0.01" min="0" placeholder="Length (cm)" value="${v('length', '')}">
            <input type="number" id="f-width" step="0.01" min="0" placeholder="Width (cm)" value="${v('width', '')}">
          </div>
          <div class="dim-row" style="margin-top:8px;grid-template-columns:1fr;max-width:33%;">
            <input type="number" id="f-height" step="0.01" min="0" placeholder="Height (cm)" value="${v('height', '')}">
          </div>
        </div>
      </div>
    `;
  }

  function seoPanelHtml(p) {
    const isEdit = !!p;
    return `
      <div class="tab-panel" data-panel="seo">
        <div class="form-group">
          <label for="f-meta-title">Meta Title</label>
          <input type="text" id="f-meta-title" value="${isEdit ? Admin.escapeHtml(p.metaTitle || '') : ''}">
        </div>
        <div class="form-group">
          <label for="f-meta-desc">Meta Description</label>
          <textarea id="f-meta-desc" maxlength="500">${isEdit ? Admin.escapeHtml(p.metaDescription || '') : ''}</textarea>
        </div>
        <div class="form-group">
          <label for="f-tags">Tags</label>
          <input type="text" id="f-tags" placeholder="comma, separated, tags" value="${isEdit && p.tags ? Admin.escapeHtml(p.tags.join(', ')) : ''}">
          <p class="hint">Comma-separated — stored as a list</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-sort-order">Sort Order</label>
            <input type="number" id="f-sort-order" value="${isEdit ? p.sortOrder : 0}">
          </div>
          <div class="form-group">
            <label for="f-status">Status</label>
            <select id="f-status">
              ${Object.keys(STATUS_LABEL).map((s) => `<option value="${s}" ${(isEdit ? p.status : 'draft') === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
            </select>
          </div>
        </div>
        <label class="checkbox-row"><input type="checkbox" id="f-featured" ${isEdit && p.isFeatured ? 'checked' : ''}><span>Featured product</span></label>
      </div>
    `;
  }

  function lockedPanelHtml(tab, label) {
    return `
      <div class="tab-panel" data-panel="${tab}">
        <div class="tab-lock-note">
          ${ICON.lock}
          <p><strong>Save the product first</strong><br>${label} can be managed once the product exists.</p>
        </div>
      </div>
    `;
  }

  function productFormHtml(p) {
    const isEdit = !!p;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Product' : 'Add Product'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      ${productFormTabsHtml(p)}
      <form id="productForm">
        <div class="modal-body">
          <div id="productFormErrors"></div>
          ${basicInfoPanelHtml(p)}
          ${pricingPanelHtml(p)}
          ${seoPanelHtml(p)}
          ${isEdit ? `<div class="tab-panel" data-panel="images"><div id="imagesPanelBody"><div class="attr-manage-empty">Loading…</div></div></div>`
                    : lockedPanelHtml('images', 'Images')}
          ${isEdit ? `<div class="tab-panel" data-panel="variants"><div id="variantsPanelBody"><div class="attr-manage-empty">Loading…</div></div></div>`
                    : lockedPanelHtml('variants', 'Variants')}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="productFormSubmit">${isEdit ? 'Save Changes' : 'Create Product'}</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() {
    Admin.openModal(productFormHtml(null));
    document.querySelector('#modalBackdrop .modal').classList.add('modal-xl');
    wireProductModal(null);
  }

  async function openEditModal(pSummary) {
    // Row data doesn't include full description/dims/etc — fetch the full record.
    let p;
    try {
      const res = await Admin.api.get(API.get(pSummary.productId));
      p = res.data.product;
    } catch (err) {
      Admin.toastError(err);
      return;
    }
    Admin.openModal(productFormHtml(p));
    document.querySelector('#modalBackdrop .modal').classList.add('modal-xl');
    wireProductModal(p);
  }

  function wireProductModal(p) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    let imagesLoaded = false;
    let variantsLoaded = false;

    backdrop.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('is-active'));
        backdrop.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('is-active'));
        btn.classList.add('is-active');
        backdrop.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('is-active');

        if (p && btn.dataset.tab === 'images' && !imagesLoaded) {
          imagesLoaded = true;
          loadImagesPanel(p);
        }
        if (p && btn.dataset.tab === 'variants' && !variantsLoaded) {
          variantsLoaded = true;
          loadVariantsPanel(p);
        }
      });
    });

    backdrop.querySelector('#productForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('productFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('productFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const tags = document.getElementById('f-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
      const payload = {
        name: document.getElementById('f-name').value.trim(),
        sku: document.getElementById('f-sku').value.trim() || null,
        category_id: document.getElementById('f-category').value || '',
        short_description: document.getElementById('f-short-desc').value.trim() || null,
        description: document.getElementById('f-description').value.trim() || null,
        currency_code: document.getElementById('f-currency').value.trim().toUpperCase() || 'INR',
        tax_rate: document.getElementById('f-tax-rate').value || 0,
        price: document.getElementById('f-price').value || 0,
        sale_price: document.getElementById('f-sale-price').value || '',
        stock_quantity: document.getElementById('f-stock-qty').value || 0,
        stock_status: document.getElementById('f-stock-status').value,
        low_stock_alert: document.getElementById('f-low-stock').value || '',
        manage_stock: document.getElementById('f-manage-stock').checked ? 1 : 0,
        weight: document.getElementById('f-weight').value || '',
        length: document.getElementById('f-length').value || '',
        width: document.getElementById('f-width').value || '',
        height: document.getElementById('f-height').value || '',
        meta_title: document.getElementById('f-meta-title').value.trim() || null,
        meta_description: document.getElementById('f-meta-desc').value.trim() || null,
        tags,
        sort_order: document.getElementById('f-sort-order').value || 0,
        status: document.getElementById('f-status').value,
        is_featured: document.getElementById('f-featured').checked ? 1 : 0,
      };
      if (!p) {
        const slug = document.getElementById('f-slug').value.trim();
        if (slug) payload.slug = slug;
      }

      try {
        if (p) {
          await Admin.api.patch(API.update(p.productId), payload);
          Admin.toast('Product updated', 'success');
          Admin.closeModal();
        } else {
          await Admin.api.post(API.list, payload);
          Admin.toast('Product created — open Edit to add images & variants', 'success');
          Admin.closeModal();
        }
        loadList();
        loadStats();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  // ---- Images panel (inside the Edit modal) ---------------------------------

  async function loadImagesPanel(p) {
    const body = document.getElementById('imagesPanelBody');
    try {
      const res = await Admin.api.get(API.images(p.productId));
      renderImagesPanel(p, res.data.images || []);
    } catch (err) {
      body.innerHTML = `<div class="attr-manage-empty">Couldn't load images.</div>`;
      Admin.toastError(err);
    }
  }

  function renderImagesPanel(p, images) {
    const body = document.getElementById('imagesPanelBody');
    body.innerHTML = `
      <div class="section-title-row">
        <div>
          <h4>Product Images</h4>
          <div class="section-hint">First image or the one marked ★ shows in listings. Max 10 per upload, JPG/PNG/GIF/WebP.</div>
        </div>
      </div>
      <div class="media-grid" id="imagesGrid" style="padding:0;"></div>
      <input type="file" id="imageFileInput" accept="image/*" multiple style="display:none;">
    `;
    const grid = document.getElementById('imagesGrid');
    grid.innerHTML = `
      <div class="gallery-upload-tile" id="uploadTile">${ICON.upload}<span>Upload Images</span></div>
      ${images.map((img) => `
        <div class="media-tile gallery-tile" data-id="${img.imageId}">
          ${img.isPrimary ? `<span class="gallery-tile-primary-badge">Primary</span>` : ''}
          <img class="media-thumb" src="${assetUrl(img.thumbPath || img.filePath)}" alt="${Admin.escapeHtml(img.altText || '')}" loading="lazy">
          <div class="media-tile-body">
            <input type="text" class="img-alt-input" placeholder="Alt text" value="${Admin.escapeHtml(img.altText || '')}" style="font-size:12px;padding:5px 7px;margin-bottom:8px;">
            <div class="media-tile-actions">
              <button class="icon-action icon-action-star ${img.isPrimary ? 'is-on' : ''}" data-act="primary" title="${img.isPrimary ? 'Primary image' : 'Set as primary'}" ${img.isPrimary ? 'disabled' : ''}>${ICON.star}</button>
              <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
            </div>
          </div>
        </div>
      `).join('')}
    `;

    document.getElementById('uploadTile').addEventListener('click', () => document.getElementById('imageFileInput').click());
    document.getElementById('imageFileInput').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const tile = document.getElementById('uploadTile');
      const original = tile.innerHTML;
      tile.innerHTML = `<span class="spinner spinner-dark"></span><span>Uploading…</span>`;
      try {
        const fd = new FormData();
        files.forEach((f) => fd.append('images', f));
        await Admin.api.uploadForm(API.images(p.productId), fd);
        Admin.toast('Images uploaded', 'success');
        loadImagesPanel(p);
        loadList();
      } catch (err) {
        Admin.toastError(err);
        tile.innerHTML = original;
      } finally {
        e.target.value = '';
      }
    });

    grid.querySelectorAll('.gallery-tile').forEach((tile) => {
      const img = images.find((x) => String(x.imageId) === tile.dataset.id);
      const altInput = tile.querySelector('.img-alt-input');
      altInput.addEventListener('change', async () => {
        try {
          await Admin.api.patch(API.imageUpdate(img.imageId), { alt_text: altInput.value.trim() });
          Admin.toast('Alt text saved', 'success');
        } catch (err) { Admin.toastError(err); }
      });
      tile.querySelector('[data-act="primary"]')?.addEventListener('click', async () => {
        try {
          await Admin.api.patch(API.imagePrimary(img.imageId));
          Admin.toast('Primary image updated', 'success');
          loadImagesPanel(p);
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
      tile.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
        const ok = await Admin.confirmAction({ title: 'Delete image?', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try {
          await Admin.api.del(API.imageDelete(img.imageId));
          Admin.toast('Image deleted', 'success');
          loadImagesPanel(p);
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
    });
  }

  // ---- Variants panel (inside the Edit modal) --------------------------------

  async function ensureAttributesCache() {
    if (attributesCache) return attributesCache;
    const res = await Admin.api.get(API.attributes);
    const list = res.data.attributes || [];
    attributesCache = await Promise.all(list.map(async (a) => {
      const vres = await Admin.api.get(API.attributeValues(a.attributeId));
      return { ...a, values: vres.data.values || [] };
    }));
    return attributesCache;
  }

  async function loadVariantsPanel(p) {
    const body = document.getElementById('variantsPanelBody');
    try {
      const res = await Admin.api.get(API.variants(p.productId));
      renderVariantsPanel(p, res.data.variants || []);
    } catch (err) {
      body.innerHTML = `<div class="attr-manage-empty">Couldn't load variants.</div>`;
      Admin.toastError(err);
    }
  }

  function renderVariantsPanel(p, variants) {
    const body = document.getElementById('variantsPanelBody');
    body.innerHTML = `
      <div class="section-title-row">
        <div>
          <h4>Variants</h4>
          <div class="section-hint">Each variant needs a unique combination of attribute values (e.g. Red + Large).</div>
        </div>
        <button type="button" class="btn btn-success btn-sm" id="btnAddVariant">${ICON.plus} Add Variant</button>
      </div>
      <div id="variantFormWrap"></div>
      <div id="variantsList">
        ${variants.length ? '' : '<div class="attr-manage-empty">No variants yet.</div>'}
      </div>
    `;

    const list = document.getElementById('variantsList');
    if (variants.length) {
      list.innerHTML = variants.map((v) => `
        <div class="variant-card ${v.isDefault ? 'is-default' : ''}" data-id="${v.variantId}">
          <div class="variant-card-top">
            <div>
              <div class="variant-card-title">
                ${Admin.escapeHtml(v.variantName || v.sku || ('Variant #' + v.variantId))}
                ${v.isDefault ? '<span class="badge badge-indigo"><span class="badge-dot"></span>default</span>' : ''}
                ${v.status !== 'active' ? '<span class="badge badge-gray"><span class="badge-dot"></span>inactive</span>' : ''}
              </div>
              <div>${(v.attributeValues || []).map((av) => `<span class="attr-chip">${Admin.escapeHtml(av.attributeName)}: ${Admin.escapeHtml(av.value)}</span>`).join('')}</div>
              <div class="variant-card-meta">
                <span>SKU: <strong>${v.sku ? Admin.escapeHtml(v.sku) : '—'}</strong></span>
                <span>Price: <strong>₹${fmtMoney(v.salePrice ?? v.price)}</strong>${v.salePrice !== null ? ` <span class="price-strike">₹${fmtMoney(v.price)}</span>` : ''}</span>
                <span class="stock-pill ${v.stockStatus}">${STOCK_LABEL[v.stockStatus] || v.stockStatus} · ${v.stockQuantity}</span>
              </div>
            </div>
            <div class="variant-card-actions">
              ${!v.isDefault ? `<button class="icon-action icon-action-star" data-act="default" title="Set as default">${ICON.star}</button>` : ''}
              <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
              <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
            </div>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.variant-card').forEach((card) => {
        const v = variants.find((x) => String(x.variantId) === card.dataset.id);
        card.querySelector('[data-act="default"]')?.addEventListener('click', async () => {
          try {
            await Admin.api.patch(API.variantDefault(v.variantId));
            Admin.toast('Default variant updated', 'success');
            loadVariantsPanel(p);
          } catch (err) { Admin.toastError(err); }
        });
        card.querySelector('[data-act="edit"]').addEventListener('click', () => openVariantForm(p, v));
        card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          const ok = await Admin.confirmAction({
            title: 'Delete variant?',
            body: `Delete <strong>${Admin.escapeHtml(v.variantName || v.sku || ('Variant #' + v.variantId))}</strong>? This permanently removes it and its images — it can't be undone.`,
            confirmLabel: 'Delete variant',
            danger: true,
          });
          if (!ok) return;
          try {
            await Admin.api.del(API.variantDelete(v.variantId));
            Admin.toast('Variant deleted', 'success');
            loadVariantsPanel(p);
            loadList();
          } catch (err) { Admin.toastError(err); }
        });
      });
    }

    document.getElementById('btnAddVariant').addEventListener('click', () => openVariantForm(p, null));
  }

  async function openVariantForm(p, v) {
    const wrap = document.getElementById('variantFormWrap');
    wrap.innerHTML = `<div class="attr-manage-empty">Loading attributes…</div>`;
    let attrs;
    try {
      attrs = await ensureAttributesCache();
    } catch (err) {
      Admin.toastError(err);
      wrap.innerHTML = '';
      return;
    }

    const isEdit = !!v;
    const selectedIds = new Set((v?.attributeValues || []).map((av) => av.attributeValueId));

    wrap.innerHTML = `
      <div class="card" style="margin-bottom:18px;border-color:var(--indigo);">
        <div class="card-header"><h3>${isEdit ? 'Edit Variant' : 'New Variant'}</h3></div>
        <div class="card-body">
          <div id="variantFormErrors"></div>
          <div class="form-row">
            <div class="form-group">
              <label for="v-sku">SKU</label>
              <input type="text" id="v-sku" value="${isEdit ? Admin.escapeHtml(v.sku || '') : ''}">
            </div>
            <div class="form-group">
              <label for="v-name">Variant Name</label>
              <input type="text" id="v-name" placeholder="auto from attributes if blank" value="${isEdit ? Admin.escapeHtml(v.variantName || '') : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="v-price">Price</label>
              <input type="number" id="v-price" step="0.01" min="0" placeholder="defaults to product price" value="${isEdit ? v.price : ''}">
            </div>
            <div class="form-group">
              <label for="v-sale-price">Sale Price</label>
              <input type="number" id="v-sale-price" step="0.01" min="0" value="${isEdit && v.salePrice !== null ? v.salePrice : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="v-stock-qty">Stock Quantity</label>
              <input type="number" id="v-stock-qty" min="0" value="${isEdit ? v.stockQuantity : 0}">
            </div>
            <div class="form-group">
              <label for="v-stock-status">Stock Status</label>
              <select id="v-stock-status">
                ${Object.keys(STOCK_LABEL).map((s) => `<option value="${s}" ${(isEdit ? v.stockStatus : 'in_stock') === s ? 'selected' : ''}>${STOCK_LABEL[s]}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Attribute Values</label>
            ${attrs.length ? attrs.map((a) => `
              <div class="attr-group-title">${Admin.escapeHtml(a.name)}</div>
              <div class="checkbox-grid">
                ${a.values.map((av) => `
                  <label class="checkbox-pill ${selectedIds.has(av.attributeValueId) ? 'is-checked' : ''}">
                    <input type="checkbox" value="${av.attributeValueId}" ${selectedIds.has(av.attributeValueId) ? 'checked' : ''}>
                    <span>${Admin.escapeHtml(av.value)}</span>
                  </label>
                `).join('')}
              </div>
            `).join('') : `<p class="hint">No attributes defined yet. <a href="product-attributes.php" target="_blank" style="color:var(--indigo);">Create some</a> (e.g. Color, Size) to build combinations.</p>`}
          </div>
          <div class="form-row">
            <div class="form-group" style="display:flex;align-items:center;">
              <label class="checkbox-row"><input type="checkbox" id="v-default" ${isEdit && v.isDefault ? 'checked' : ''}><span>Default variant</span></label>
            </div>
            <div class="form-group">
              <label for="v-status">Status</label>
              <select id="v-status">
                <option value="active" ${(isEdit ? v.status : 'active') === 'active' ? 'selected' : ''}>Active</option>
                <option value="inactive" ${isEdit && v.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
          </div>
          <div class="flex-gap" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" id="btnCancelVariant">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="btnSaveVariant">${isEdit ? 'Save Variant' : 'Add Variant'}</button>
          </div>
        </div>
      </div>
    `;

    wrap.querySelectorAll('.checkbox-pill').forEach((label) => {
      const input = label.querySelector('input');
      input.addEventListener('change', () => label.classList.toggle('is-checked', input.checked));
    });

    document.getElementById('btnCancelVariant').addEventListener('click', () => { wrap.innerHTML = ''; });
    document.getElementById('btnSaveVariant').addEventListener('click', async () => {
      const errBox = document.getElementById('variantFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('btnSaveVariant');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const attributeValueIds = Array.from(wrap.querySelectorAll('.checkbox-pill input:checked')).map((el) => Number(el.value));
      const payload = {
        sku: document.getElementById('v-sku').value.trim() || null,
        variant_name: document.getElementById('v-name').value.trim() || null,
        price: document.getElementById('v-price').value || undefined,
        sale_price: document.getElementById('v-sale-price').value || '',
        stock_quantity: document.getElementById('v-stock-qty').value || 0,
        stock_status: document.getElementById('v-stock-status').value,
        is_default: document.getElementById('v-default').checked ? 1 : 0,
        status: document.getElementById('v-status').value,
        attribute_value_ids: attributeValueIds,
      };

      try {
        if (isEdit) {
          await Admin.api.patch(API.variantUpdate(v.variantId), payload);
          Admin.toast('Variant updated', 'success');
        } else {
          await Admin.api.post(API.variants(p.productId), payload);
          Admin.toast('Variant created', 'success');
        }
        wrap.innerHTML = '';
        loadVariantsPanel(p);
        loadList();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
          err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });

    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  init();
})();
