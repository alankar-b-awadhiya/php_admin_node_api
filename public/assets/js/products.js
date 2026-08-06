/**
 * products.js — Products page (maps to /products[...]), per the Products
 * section of the API reference: aba_ecom_db (`products`, `product_images`,
 * `product_attributes`, `product_attribute_values`, `product_variants`,
 * `product_variant_attribute_values`, `sellers`, `product_sellers`) +
 * aba_master_db (`master_categories`, type=PRODUCT). Bearer required on
 * every route.
 *
 * v2 schema notes (moved out of aba_main_db as part of the ecommerce-db
 * split — see database/ecommerce_db_migration.sql):
 *   - `products` no longer has price/sale_price/stock fields or sku - catalog fields
 *     only. Every product always has at least one variant (a "default"
 *     variant even for simple products).
 *   - `product_variants` no longer has price/sale_price/stock* either - it
 *     now carries sku/tax_rate/dimensions (catalog-owned). tax_rate and
 *     weight/length/width/height moved DOWN from products to here.
 *   - Price/stock live on `product_sellers` ("listings") - one row per
 *     (variant, seller). A variant can have zero, one, or many listings
 *     (multi-seller/Amazon-style). `is_buybox_winner` marks the
 *     default/best offer shown on the product page.
 *   - Product list/get responses expose an aggregated `priceRange` and
 *     `stockStatus` computed across all of a product's active listings,
 *     not a single price/stock field.
 *   - There is no sellers-list API yet (sellers CRUD/UI is a separate,
 *     not-yet-built domain) - the "Add Listing" form below asks for a raw
 *     numeric Seller ID until that exists. Revisit once /sellers ships.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v2/index.js, src/domains/products/v2/products.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.categories                 - list categories (?active)
 *   GET    API.list                       - list/filter/paginate
 *   GET    API.get(id)                    - get one, with images + variants (+ each variant's listings) nested
 *   POST   API.list                       - create (JSON). Always creates a default variant;
 *                                            pass seller_id + price/stock to also create its first listing.
 *   PATCH  API.update(id)                 - update catalog fields only (JSON) - no price/stock/sku here anymore
 *   PATCH  API.status(id)                 - { status }
 *   DELETE API.remove(id)                 - soft delete
 *   GET    API.images(id)                 - list a product's images
 *   POST   API.images(id)                 - upload images (multipart: images[], alt_text)
 *   PATCH  API.imageUpdate(imageId)       - { alt_text, sort_order, variant_id }
 *   PATCH  API.imagePrimary(imageId)      - set as primary
 *   DELETE API.imageDelete(imageId)       - delete an image
 *   GET    API.attributes                 - list attributes (?search) — used to build the variant form
 *   GET    API.attributeValues(attrId)    - list one attribute's values
 *   GET    API.variants(id)               - list a product's variants (each with nested `listings`)
 *   POST   API.variants(id)               - create a variant ({ sku, variant_name, tax_rate, weight, length, width, height, is_default, status, attribute_value_ids })
 *   PATCH  API.variantUpdate(variantId)   - update a variant (same fields as create, no price/stock)
 *   PATCH  API.variantDefault(variantId)  - set as the product's default variant
 *   DELETE API.variantDelete(variantId)   - delete a variant (hard delete — no undo; cascades its listings)
 *   GET    API.listings(variantId)        - list a variant's seller listings
 *   POST   API.listings(variantId)        - create a listing ({ seller_id, seller_sku, currency_code, price, sale_price, stock_quantity, stock_status, condition_type, status })
 *   PATCH  API.listingUpdate(listingId)   - update a listing (same fields, all optional)
 *   PATCH  API.listingBuybox(listingId)   - mark this listing as the default/best offer for its variant
 *   DELETE API.listingDelete(listingId)   - soft delete a listing
 *
 * Note: `products` has no `restore` affordance here because GET /products
 * (list) always filters deleted_at IS NULL server-side — a soft-deleted
 * product can never resurface in this UI to be restored from, so building a
 * "Restore" button would be a dead end. Deletion is presented as permanent.
 */
(function () {
  // All product-domain data now lives in aba_ecom_db, served under /api/v2.
  const API_V2_BASE = Admin.apiBase('v2');
  const apiV2 = {
    get: (path) => Admin.api.get(path, { base: API_V2_BASE }),
    post: (path, body) => Admin.api.post(path, body, { base: API_V2_BASE }),
    patch: (path, body) => Admin.api.patch(path, body, { base: API_V2_BASE }),
    del: (path) => Admin.api.del(path, { base: API_V2_BASE }),
    uploadForm: (path, formData) => Admin.api.uploadForm(path, formData, { base: API_V2_BASE }),
  };

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
    listings: (variantId) => `/products/variants/${variantId}/listings`,
    listingUpdate: (listingId) => `/products/listings/${listingId}`,
    listingBuybox: (listingId) => `/products/listings/${listingId}/buybox`,
    listingDelete: (listingId) => `/products/listings/${listingId}`,
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
      const res = await apiV2.get(API.categories);
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
        apiV2.get(API.list + Admin.qs({ per_page: 10 })),
        apiV2.get(API.list + Admin.qs({ status: 'active', per_page: 10 })),
        apiV2.get(API.list + Admin.qs({ status: 'draft', per_page: 10 })),
        apiV2.get(API.list + Admin.qs({ stock_status: 'out_of_stock', per_page: 10 })),
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
      const res = await apiV2.get(API.list + Admin.qs({
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
      const priceHtml = priceRangeHtml(p.priceRange);
      return `
        <tr data-id="${p.productId}">
          <td>
            <div class="flex-gap" style="align-items:center;flex-wrap:nowrap;">
              ${thumb}
              <div style="min-width:0;">
                <strong>${Admin.escapeHtml(p.name)}</strong>${p.isFeatured ? `<span class="client-name-star">${ICON.star}</span>` : ''}
                <div class="product-name-sub">${p.sellerCount ? `${p.sellerCount} seller${p.sellerCount === 1 ? '' : 's'}` : '<span class="opt-label">no sellers yet</span>'}</div>
              </div>
            </div>
          </td>
          <td class="cell-muted">${Admin.escapeHtml(p.categoryName || '—')}</td>
          <td><div class="price-cell">${priceHtml}</div></td>
          <td>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
              ${p.stockStatus ? `<span class="stock-pill ${p.stockStatus}">${STOCK_LABEL[p.stockStatus] || p.stockStatus}</span>` : '<span class="opt-label">—</span>'}
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

  /** priceRange = { min, max } aggregated across all of a product's active listings — may be all-null if no seller has listed it yet. */
  function priceRangeHtml(range) {
    if (!range || range.min === null || range.min === undefined) {
      return '<span class="opt-label">Not listed by any seller</span>';
    }
    if (range.min === range.max) {
      return `<span class="price-now">₹${fmtMoney(range.min)}</span>`;
    }
    return `<span class="price-now">₹${fmtMoney(range.min)} – ₹${fmtMoney(range.max)}</span>`;
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
      await apiV2.patch(API.status(p.productId), { status });
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
      await apiV2.patch(API.update(p.productId), { is_featured: p.isFeatured ? 0 : 1 });
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
      await apiV2.del(API.remove(p.productId));
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
          ${p.stockStatus ? `<span class="stock-pill ${p.stockStatus}">${STOCK_LABEL[p.stockStatus] || p.stockStatus}</span>` : ''}
          ${p.isFeatured ? '<span class="badge badge-indigo"><span class="badge-dot"></span>featured</span>' : ''}
          <span class="badge-outline">${Admin.escapeHtml(p.categoryName || 'Uncategorized')}</span>
        </div>
        <p><strong>Price:</strong> ${priceRangeHtml(p.priceRange)} &nbsp; <strong>Sellers:</strong> ${p.sellerCount || 0}</p>
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
        ${isEdit ? '' : '<button type="button" class="tab-btn" data-tab="pricing">Initial Listing</button>'}
        <button type="button" class="tab-btn" data-tab="seo">SEO &amp; Tags</button>
        <button type="button" class="tab-btn" data-tab="images">Images${isEdit ? '' : ' 🔒'}</button>
        <button type="button" class="tab-btn" data-tab="variants">Variants &amp; Pricing${isEdit ? '' : ' 🔒'}</button>
      </div>
    `;
  }

  function basicInfoPanelHtml(p) {
    const isEdit = !!p;
    return `
      <div class="tab-panel is-active" data-panel="basic">
        ${isEdit ? `<div class="flex-gap" style="margin-bottom:14px;">${p.hasVariants ? '<span class="badge badge-indigo"><span class="badge-dot"></span>Has variants</span>' : '<span class="badge badge-gray"><span class="badge-dot"></span>Simple product (one default variant)</span>'}</div>` : ''}
        <div class="form-row">
          <div class="form-group">
            <label for="f-name">Product Name <span style="color:var(--coral);">*</span></label>
            <input type="text" id="f-name" placeholder="e.g. Classic Cotton Tee" value="${isEdit ? Admin.escapeHtml(p.name) : ''}" required>
          </div>
          <div class="form-group">
            <label for="f-slug">Slug</label>
            <input type="text" id="f-slug" value="${isEdit ? Admin.escapeHtml(p.slug || '') : ''}" placeholder="auto-generated from name" disabled>
            <p class="hint">Always auto-generated from the name — can't be set manually.</p>
          </div>
        </div>
        <div class="form-row">
          ${isEdit ? '' : `
          <div class="form-group">
            <label for="f-sku">Default Variant SKU</label>
            <input type="text" id="f-sku" placeholder="e.g. TEE-001">
            <p class="hint">Every product gets one variant automatically — this sets its SKU. Additional variants/SKUs can be added after saving.</p>
          </div>
          `}
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

  /**
   * CREATE-ONLY tab. Price/stock now live on `product_sellers` (a seller's
   * listing against a variant), so a brand-new product with no seller
   * attached yet has nothing to price. This panel lets you optionally
   * create the first listing (for a specific seller) in the same request
   * that creates the product — leave Seller ID blank to skip it and add
   * listings later from the Variants tab once the product exists.
   *
   * NOTE: there's no sellers picker yet (no /sellers list API exists) — the
   * Seller ID field is a raw numeric input for now. Swap this for a proper
   * dropdown once that endpoint ships.
   */
  function pricingPanelHtml(p) {
    if (p) return ''; // never rendered on edit — see productFormTabsHtml
    return `
      <div class="tab-panel" data-panel="pricing">
        <p class="hint" style="margin-bottom:14px;">Optional — fill this in to also create the first seller listing for this product. Leave Seller ID blank to just save the catalog entry and add listings later.</p>
        <div class="form-group">
          <label for="f-seller-id">Seller ID <span class="opt-label">(leave blank to skip)</span></label>
          <input type="number" id="f-seller-id" min="1" placeholder="e.g. 4">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-seller-sku">Seller SKU</label>
            <input type="text" id="f-seller-sku" placeholder="defaults to the variant SKU above">
          </div>
          <div class="form-group">
            <label for="f-currency">Currency Code</label>
            <input type="text" id="f-currency" maxlength="3" style="text-transform:uppercase;" value="INR">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-price">Price</label>
            <input type="number" id="f-price" step="0.01" min="0" value="0">
          </div>
          <div class="form-group">
            <label for="f-sale-price">Sale Price</label>
            <input type="number" id="f-sale-price" step="0.01" min="0" placeholder="Leave blank if not on sale">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-stock-qty">Stock Quantity</label>
            <input type="number" id="f-stock-qty" min="0" value="0">
          </div>
          <div class="form-group">
            <label for="f-stock-status">Stock Status</label>
            <select id="f-stock-status">
              ${Object.keys(STOCK_LABEL).map((s) => `<option value="${s}" ${s === 'in_stock' ? 'selected' : ''}>${STOCK_LABEL[s]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="f-tax-rate">Tax Rate (%) <span class="opt-label">(variant-level, not seller-specific)</span></label>
          <input type="number" id="f-tax-rate" step="0.01" min="0" value="0">
        </div>
        <div class="form-group">
          <label>Dimensions &amp; Weight <span class="opt-label">(kg / cm, optional — variant-level)</span></label>
          <div class="dim-row">
            <input type="number" id="f-weight" step="0.001" min="0" placeholder="Weight (kg)">
            <input type="number" id="f-length" step="0.01" min="0" placeholder="Length (cm)">
            <input type="number" id="f-width" step="0.01" min="0" placeholder="Width (cm)">
          </div>
          <div class="dim-row" style="margin-top:8px;grid-template-columns:1fr;max-width:33%;">
            <input type="number" id="f-height" step="0.01" min="0" placeholder="Height (cm)">
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
                    : lockedPanelHtml('variants', 'Variants & pricing')}
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
      const res = await apiV2.get(API.get(pSummary.productId));
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

      // Catalog fields — accepted by both PATCH /products/:id and POST /products.
      const payload = {
        name: document.getElementById('f-name').value.trim(),
        category_id: document.getElementById('f-category').value || '',
        short_description: document.getElementById('f-short-desc').value.trim() || null,
        description: document.getElementById('f-description').value.trim() || null,
        meta_title: document.getElementById('f-meta-title').value.trim() || null,
        meta_description: document.getElementById('f-meta-desc').value.trim() || null,
        tags,
        sort_order: document.getElementById('f-sort-order').value || 0,
        status: document.getElementById('f-status').value,
        is_featured: document.getElementById('f-featured').checked ? 1 : 0,
      };

      if (!p) {
        // CREATE-only: default variant fields + optional initial listing.
        // (slug is always auto-generated server-side from name — no client override.)
        payload.sku = document.getElementById('f-sku').value.trim() || null;
        payload.tax_rate = document.getElementById('f-tax-rate').value || 0;
        payload.weight = document.getElementById('f-weight').value || '';
        payload.length = document.getElementById('f-length').value || '';
        payload.width = document.getElementById('f-width').value || '';
        payload.height = document.getElementById('f-height').value || '';

        const sellerId = document.getElementById('f-seller-id').value.trim();
        if (sellerId) {
          payload.seller_id = sellerId;
          payload.seller_sku = document.getElementById('f-seller-sku').value.trim() || null;
          payload.currency_code = document.getElementById('f-currency').value.trim().toUpperCase() || 'INR';
          payload.price = document.getElementById('f-price').value || 0;
          payload.sale_price = document.getElementById('f-sale-price').value || '';
          payload.stock_quantity = document.getElementById('f-stock-qty').value || 0;
          payload.stock_status = document.getElementById('f-stock-status').value;
        }
      }

      try {
        if (p) {
          await apiV2.patch(API.update(p.productId), payload);
          Admin.toast('Product updated', 'success');
          Admin.closeModal();
        } else {
          await apiV2.post(API.list, payload);
          Admin.toast('Product created — open Edit to add images & manage variant pricing', 'success');
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
      const res = await apiV2.get(API.images(p.productId));
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
        await apiV2.uploadForm(API.images(p.productId), fd);
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
          await apiV2.patch(API.imageUpdate(img.imageId), { alt_text: altInput.value.trim() });
          Admin.toast('Alt text saved', 'success');
        } catch (err) { Admin.toastError(err); }
      });
      tile.querySelector('[data-act="primary"]')?.addEventListener('click', async () => {
        try {
          await apiV2.patch(API.imagePrimary(img.imageId));
          Admin.toast('Primary image updated', 'success');
          loadImagesPanel(p);
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
      tile.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
        const ok = await Admin.confirmAction({ title: 'Delete image?', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try {
          await apiV2.del(API.imageDelete(img.imageId));
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
    const res = await apiV2.get(API.attributes);
    const list = res.data.attributes || [];
    attributesCache = await Promise.all(list.map(async (a) => {
      const vres = await apiV2.get(API.attributeValues(a.attributeId));
      return { ...a, values: vres.data.values || [] };
    }));
    return attributesCache;
  }

  async function loadVariantsPanel(p) {
    const body = document.getElementById('variantsPanelBody');
    try {
      const res = await apiV2.get(API.variants(p.productId));
      renderVariantsPanel(p, res.data.variants || []);
    } catch (err) {
      body.innerHTML = `<div class="attr-manage-empty">Couldn't load variants.</div>`;
      Admin.toastError(err);
    }
  }

  /** Aggregates a variant's active listings into a min–max price range (₹ text), same idea as priceRangeHtml() for products. */
  function variantPriceRangeHtml(v) {
    const activePrices = (v.listings || [])
      .filter((l) => l.status === 'active')
      .map((l) => l.salePrice ?? l.price);
    if (!activePrices.length) return '<span class="opt-label">No active listings</span>';
    const min = Math.min(...activePrices);
    const max = Math.max(...activePrices);
    return min === max ? `<strong>₹${fmtMoney(min)}</strong>` : `<strong>₹${fmtMoney(min)} – ₹${fmtMoney(max)}</strong>`;
  }

  function variantStockHtml(v) {
    const active = (v.listings || []).filter((l) => l.status === 'active');
    if (!active.length) return '<span class="opt-label">Not listed</span>';
    const inStock = active.some((l) => l.stockStatus === 'in_stock');
    const status = inStock ? 'in_stock' : 'out_of_stock';
    return `<span class="stock-pill ${status}">${STOCK_LABEL[status]} · ${active.length} listing${active.length === 1 ? '' : 's'}</span>`;
  }

  function renderVariantsPanel(p, variants) {
    const body = document.getElementById('variantsPanelBody');
    body.innerHTML = `
      <div class="section-title-row">
        <div>
          <h4>Variants</h4>
          <div class="section-hint">Each variant needs a unique combination of attribute values (e.g. Red + Large). Price and stock are set per seller under "Listings" on each variant.</div>
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
                <span>Price: ${variantPriceRangeHtml(v)}</span>
                ${variantStockHtml(v)}
              </div>
            </div>
            <div class="variant-card-actions">
              ${!v.isDefault ? `<button class="icon-action icon-action-star" data-act="default" title="Set as default">${ICON.star}</button>` : ''}
              <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
              <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
            </div>
          </div>
          <div class="variant-card-listings-toggle">
            <button type="button" class="btn btn-outline-indigo btn-sm" data-act="toggle-listings">${ICON.list || ''} Manage Listings (${(v.listings || []).length})</button>
          </div>
          <div class="variant-listings-wrap" id="listingsWrap-${v.variantId}" style="display:none;"></div>
        </div>
      `).join('');

      list.querySelectorAll('.variant-card').forEach((card) => {
        const v = variants.find((x) => String(x.variantId) === card.dataset.id);
        card.querySelector('[data-act="default"]')?.addEventListener('click', async () => {
          try {
            await apiV2.patch(API.variantDefault(v.variantId));
            Admin.toast('Default variant updated', 'success');
            loadVariantsPanel(p);
          } catch (err) { Admin.toastError(err); }
        });
        card.querySelector('[data-act="edit"]').addEventListener('click', () => openVariantForm(p, v));
        card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          const ok = await Admin.confirmAction({
            title: 'Delete variant?',
            body: `Delete <strong>${Admin.escapeHtml(v.variantName || v.sku || ('Variant #' + v.variantId))}</strong>? This permanently removes it, its images and all of its seller listings — it can't be undone.`,
            confirmLabel: 'Delete variant',
            danger: true,
          });
          if (!ok) return;
          try {
            await apiV2.del(API.variantDelete(v.variantId));
            Admin.toast('Variant deleted', 'success');
            loadVariantsPanel(p);
            loadList();
          } catch (err) { Admin.toastError(err); }
        });

        let listingsOpen = false;
        card.querySelector('[data-act="toggle-listings"]').addEventListener('click', (e) => {
          const wrap = document.getElementById(`listingsWrap-${v.variantId}`);
          listingsOpen = !listingsOpen;
          wrap.style.display = listingsOpen ? '' : 'none';
          e.target.closest('button').textContent = listingsOpen
            ? 'Hide Listings'
            : `Manage Listings (${(v.listings || []).length})`;
          if (listingsOpen) renderListingsPanel(p, v);
        });
      });
    }

    document.getElementById('btnAddVariant').addEventListener('click', () => openVariantForm(p, null));
  }

  // ---- Listings sub-panel (per variant) --------------------------------------
  // Price/stock live here now, one row per seller. No sellers-list API exists
  // yet, so Seller ID is a plain numeric field for now — swap for a real
  // picker once /sellers ships.

  async function loadListingsPanel(p, v) {
    try {
      const res = await apiV2.get(API.listings(v.variantId));
      v.listings = res.data.listings || [];
      renderListingsPanel(p, v);
    } catch (err) {
      Admin.toastError(err);
    }
  }

  function renderListingsPanel(p, v) {
    const wrap = document.getElementById(`listingsWrap-${v.variantId}`);
    if (!wrap) return;
    const listings = v.listings || [];
    wrap.innerHTML = `
      <div class="listings-table-wrap">
        ${listings.length ? `
          <table class="listings-table">
            <thead>
              <tr><th>Seller</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th></th><th></th></tr>
            </thead>
            <tbody>
              ${listings.map((l) => `
                <tr data-id="${l.listingId}">
                  <td>${Admin.escapeHtml(l.sellerBusinessName || ('Seller #' + l.sellerId))}</td>
                  <td class="mono-cell">${l.sellerSku ? Admin.escapeHtml(l.sellerSku) : '—'}</td>
                  <td>
                    ${l.salePrice !== null && l.salePrice !== undefined
                      ? `<span class="price-now">₹${fmtMoney(l.salePrice)}</span> <span class="price-strike">₹${fmtMoney(l.price)}</span>`
                      : `<span class="price-now">₹${fmtMoney(l.price)}</span>`}
                  </td>
                  <td><span class="stock-pill ${l.stockStatus}">${STOCK_LABEL[l.stockStatus] || l.stockStatus}</span> ${l.stockQuantity}</td>
                  <td>${Admin.escapeHtml(l.status)}${l.isBuyboxWinner ? ' <span class="badge badge-indigo"><span class="badge-dot"></span>buybox</span>' : ''}</td>
                  <td>${!l.isBuyboxWinner ? `<button class="icon-action icon-action-star" data-act="buybox" title="Make this the buybox listing">${ICON.star}</button>` : ''}</td>
                  <td class="cell-actions">
                    <button class="icon-action icon-action-edit" data-act="edit-listing" title="Edit">${ICON.edit}</button>
                    <button class="icon-action icon-action-delete" data-act="delete-listing" title="Delete">${ICON.trash}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="attr-manage-empty">No sellers listing this variant yet.</div>'}
      </div>
      <div id="listingFormWrap-${v.variantId}"></div>
      <button type="button" class="btn btn-secondary btn-sm" id="btnAddListing-${v.variantId}" style="margin-top:10px;">${ICON.plus} Add Listing</button>
    `;

    wrap.querySelectorAll('tbody tr').forEach((row) => {
      const l = listings.find((x) => String(x.listingId) === row.dataset.id);
      row.querySelector('[data-act="buybox"]')?.addEventListener('click', async () => {
        try {
          await apiV2.patch(API.listingBuybox(l.listingId));
          Admin.toast('Buybox listing updated', 'success');
          await loadListingsPanel(p, v);
        } catch (err) { Admin.toastError(err); }
      });
      row.querySelector('[data-act="edit-listing"]').addEventListener('click', () => openListingForm(p, v, l));
      row.querySelector('[data-act="delete-listing"]').addEventListener('click', async () => {
        const ok = await Admin.confirmAction({
          title: 'Delete listing?',
          body: `Remove <strong>${Admin.escapeHtml(l.sellerBusinessName || ('Seller #' + l.sellerId))}</strong>'s listing for this variant?`,
          confirmLabel: 'Delete listing',
          danger: true,
        });
        if (!ok) return;
        try {
          await apiV2.del(API.listingDelete(l.listingId));
          Admin.toast('Listing deleted', 'success');
          await loadListingsPanel(p, v);
          loadVariantsPanel(p);
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
    });

    document.getElementById(`btnAddListing-${v.variantId}`).addEventListener('click', () => openListingForm(p, v, null));
  }

  function openListingForm(p, v, l) {
    const isEdit = !!l;
    const formWrap = document.getElementById(`listingFormWrap-${v.variantId}`);
    formWrap.innerHTML = `
      <div class="card" style="margin:12px 0;border-color:var(--indigo);">
        <div class="card-body">
          <div id="listingFormErrors-${v.variantId}"></div>
          ${!isEdit ? `
          <div class="form-group">
            <label for="l-seller-id-${v.variantId}">Seller ID <span style="color:var(--coral);">*</span></label>
            <input type="number" id="l-seller-id-${v.variantId}" min="1" required>
            <p class="hint">No seller picker yet — enter the numeric seller ID. Update this once a sellers list API exists.</p>
          </div>
          ` : ''}
          <div class="form-row">
            <div class="form-group">
              <label for="l-seller-sku-${v.variantId}">Seller SKU</label>
              <input type="text" id="l-seller-sku-${v.variantId}" value="${isEdit ? Admin.escapeHtml(l.sellerSku || '') : ''}">
            </div>
            <div class="form-group">
              <label for="l-currency-${v.variantId}">Currency</label>
              <input type="text" id="l-currency-${v.variantId}" maxlength="3" style="text-transform:uppercase;" value="${isEdit ? Admin.escapeHtml(l.currencyCode || 'INR') : 'INR'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="l-price-${v.variantId}">Price</label>
              <input type="number" id="l-price-${v.variantId}" step="0.01" min="0" value="${isEdit ? l.price : 0}">
            </div>
            <div class="form-group">
              <label for="l-sale-price-${v.variantId}">Sale Price</label>
              <input type="number" id="l-sale-price-${v.variantId}" step="0.01" min="0" value="${isEdit && l.salePrice !== null ? l.salePrice : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="l-stock-qty-${v.variantId}">Stock Quantity</label>
              <input type="number" id="l-stock-qty-${v.variantId}" min="0" value="${isEdit ? l.stockQuantity : 0}">
            </div>
            <div class="form-group">
              <label for="l-stock-status-${v.variantId}">Stock Status</label>
              <select id="l-stock-status-${v.variantId}">
                ${Object.keys(STOCK_LABEL).map((s) => `<option value="${s}" ${(isEdit ? l.stockStatus : 'in_stock') === s ? 'selected' : ''}>${STOCK_LABEL[s]}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="l-condition-${v.variantId}">Condition</label>
              <select id="l-condition-${v.variantId}">
                ${['new', 'used', 'refurbished'].map((c) => `<option value="${c}" ${(isEdit ? l.conditionType : 'new') === c ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="l-status-${v.variantId}">Status</label>
              <select id="l-status-${v.variantId}">
                ${['active', 'inactive', 'pending_approval'].map((s) => `<option value="${s}" ${(isEdit ? l.status : 'pending_approval') === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="flex-gap" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" data-act="cancel-listing">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" data-act="save-listing">${isEdit ? 'Save Listing' : 'Add Listing'}</button>
          </div>
        </div>
      </div>
    `;

    formWrap.querySelector('[data-act="cancel-listing"]').addEventListener('click', () => { formWrap.innerHTML = ''; });
    formWrap.querySelector('[data-act="save-listing"]').addEventListener('click', async () => {
      const errBox = document.getElementById(`listingFormErrors-${v.variantId}`);
      errBox.innerHTML = '';
      const btn = formWrap.querySelector('[data-act="save-listing"]');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const payload = {
        seller_sku: document.getElementById(`l-seller-sku-${v.variantId}`).value.trim() || null,
        currency_code: document.getElementById(`l-currency-${v.variantId}`).value.trim().toUpperCase() || 'INR',
        price: document.getElementById(`l-price-${v.variantId}`).value || 0,
        sale_price: document.getElementById(`l-sale-price-${v.variantId}`).value || '',
        stock_quantity: document.getElementById(`l-stock-qty-${v.variantId}`).value || 0,
        stock_status: document.getElementById(`l-stock-status-${v.variantId}`).value,
        condition_type: document.getElementById(`l-condition-${v.variantId}`).value,
        status: document.getElementById(`l-status-${v.variantId}`).value,
      };
      if (!isEdit) payload.seller_id = document.getElementById(`l-seller-id-${v.variantId}`).value;

      try {
        if (isEdit) {
          await apiV2.patch(API.listingUpdate(l.listingId), payload);
          Admin.toast('Listing updated', 'success');
        } else {
          await apiV2.post(API.listings(v.variantId), payload);
          Admin.toast('Listing added', 'success');
        }
        formWrap.innerHTML = '';
        await loadListingsPanel(p, v);
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
              <label for="v-tax-rate">Tax Rate (%)</label>
              <input type="number" id="v-tax-rate" step="0.01" min="0" value="${isEdit ? v.taxRate : 0}">
            </div>
            <div class="form-group" style="display:flex;align-items:center;">
              <p class="hint" style="margin:0;">Price and stock are managed per seller — use "Manage Listings" on the variant card after saving.</p>
            </div>
          </div>
          <div class="form-group">
            <label>Dimensions &amp; Weight <span class="opt-label">(kg / cm, optional)</span></label>
            <div class="dim-row">
              <input type="number" id="v-weight" step="0.001" min="0" placeholder="Weight (kg)" value="${isEdit && v.weight !== null ? v.weight : ''}">
              <input type="number" id="v-length" step="0.01" min="0" placeholder="Length (cm)" value="${isEdit && v.length !== null ? v.length : ''}">
              <input type="number" id="v-width" step="0.01" min="0" placeholder="Width (cm)" value="${isEdit && v.width !== null ? v.width : ''}">
            </div>
            <div class="dim-row" style="margin-top:8px;grid-template-columns:1fr;max-width:33%;">
              <input type="number" id="v-height" step="0.01" min="0" placeholder="Height (cm)" value="${isEdit && v.height !== null ? v.height : ''}">
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
        tax_rate: document.getElementById('v-tax-rate').value || 0,
        weight: document.getElementById('v-weight').value || '',
        length: document.getElementById('v-length').value || '',
        width: document.getElementById('v-width').value || '',
        height: document.getElementById('v-height').value || '',
        is_default: document.getElementById('v-default').checked ? 1 : 0,
        status: document.getElementById('v-status').value,
        attribute_value_ids: attributeValueIds,
      };

      try {
        if (isEdit) {
          await apiV2.patch(API.variantUpdate(v.variantId), payload);
          Admin.toast('Variant updated', 'success');
        } else {
          await apiV2.post(API.variants(p.productId), payload);
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
