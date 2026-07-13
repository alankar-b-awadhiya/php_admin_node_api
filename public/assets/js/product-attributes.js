/**
 * product-attributes.js — Product Attributes page (maps to
 * /products/attributes[...]), per the Products section of the API
 * reference: aba_main_db `product_attributes` + `product_attribute_values`.
 * Bearer required on every route.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/products/v1/products.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.list                  - list attributes (?search)
 *   GET    API.get(id)               - get one attribute WITH its values nested
 *   POST   API.list                  - create an attribute ({ name })
 *   PATCH  API.update(id)            - update an attribute ({ name })
 *   DELETE API.remove(id)            - delete (422 if it still has values)
 *   GET    API.values(id)            - list an attribute's values
 *   POST   API.values(id)            - create a value ({ value, sort_order })
 *   PATCH  API.valueUpdate(valueId)  - update a value ({ value, sort_order })
 *   DELETE API.valueDelete(valueId)  - delete (422 if assigned to a variant)
 */
(function () {
  const API = {
    list: '/products/attributes',
    get: (id) => `/products/attributes/${id}`,
    update: (id) => `/products/attributes/${id}`,
    remove: (id) => `/products/attributes/${id}`,
    values: (id) => `/products/attributes/${id}/values`,
    valueUpdate: (valueId) => `/products/attribute-values/${valueId}`,
    valueDelete: (valueId) => `/products/attribute-values/${valueId}`,
  };

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list: '<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };

  let rows = [];
  let state = { search: '' };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnAddAttribute').addEventListener('click', openCreateAttrModal);
    document.getElementById('btnRefreshAttributes').addEventListener('click', loadList);
    document.getElementById('searchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim();
      loadList();
    }, 350));

    await loadList();
  }

  async function loadList() {
    const body = document.getElementById('attributesTableBody');
    body.innerHTML = `<tr><td colspan="4" class="table-empty">Loading attributes…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({ search: state.search }));
      rows = res.data.attributes || [];
      renderTable();
      document.getElementById('attributesCount').textContent = `${rows.length} attribute${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4" class="table-empty">Couldn't load attributes.</td></tr>`;
      Admin.toastError(err);
    }
  }

  function renderTable() {
    const body = document.getElementById('attributesTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4" class="table-empty">No attributes yet. Use "Add Attribute" to create one (e.g. Color, Size).</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((a) => `
      <tr data-id="${a.attributeId}">
        <td><strong>${Admin.escapeHtml(a.name)}</strong></td>
        <td class="mono-cell">${Admin.escapeHtml(a.slug)}</td>
        <td><span class="count-pill-soft" id="valcount-${a.attributeId}">…</span></td>
        <td class="cell-actions">
          <button class="btn btn-outline-indigo btn-sm" data-act="values">${ICON.list} Manage Values</button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const a = rows.find((x) => String(x.attributeId) === tr.dataset.id);
      tr.querySelector('[data-act="values"]').addEventListener('click', () => openValuesModal(a));
      tr.querySelector('[data-act="edit"]').addEventListener('click', () => openEditAttrModal(a));
      tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteAttribute(a));
      loadValueCount(a);
    });
  }

  async function loadValueCount(a) {
    try {
      const res = await Admin.api.get(API.values(a.attributeId));
      const values = res.data.values || [];
      const el = document.getElementById(`valcount-${a.attributeId}`);
      if (el) el.textContent = `${values.length} value${values.length === 1 ? '' : 's'}`;
    } catch (err) { /* non-fatal - leave the placeholder */ }
  }

  // ---- Add / Edit attribute (name only, slug auto-generated server-side) --

  function attrFormHtml(a) {
    const isEdit = !!a;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Attribute' : 'Add Attribute'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="attrForm">
        <div class="modal-body">
          <div id="attrFormErrors"></div>
          <div class="form-group">
            <label for="f-attr-name">Attribute Name <span style="color:var(--coral);">*</span></label>
            <input type="text" id="f-attr-name" placeholder="e.g. Color, Size, Material" value="${isEdit ? Admin.escapeHtml(a.name) : ''}" required autofocus>
            <p class="hint">Values (Red, Large, ...) are added separately after saving</p>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="attrFormSubmit">Save</button>
        </div>
      </form>
    `;
  }

  function openCreateAttrModal() {
    Admin.openModal(attrFormHtml(null));
    wireAttrModal(null);
  }

  function openEditAttrModal(a) {
    Admin.openModal(attrFormHtml(a));
    wireAttrModal(a);
  }

  function wireAttrModal(a) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#attrForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('attrFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('attrFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        const payload = { name: document.getElementById('f-attr-name').value.trim() };
        if (a) {
          await Admin.api.patch(API.update(a.attributeId), payload);
          Admin.toast('Attribute updated', 'success');
        } else {
          await Admin.api.post(API.list, payload);
          Admin.toast('Attribute created', 'success');
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

  async function deleteAttribute(a) {
    const ok = await Admin.confirmAction({
      title: 'Delete attribute?',
      body: `Delete <strong>${Admin.escapeHtml(a.name)}</strong>? This is blocked if it still has values — delete those first.`,
      confirmLabel: 'Delete attribute',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(a.attributeId));
      Admin.toast('Attribute deleted', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Manage Values modal --------------------------------------------------

  let currentValues = [];

  async function openValuesModal(a) {
    Admin.openModal(`
      <div class="modal-header"><h3>Values — ${Admin.escapeHtml(a.name)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div id="valuesFormErrors"></div>
        <div id="valuesList"><div class="attr-manage-empty">Loading…</div></div>

        <div class="attr-group-title" style="margin-top:18px;">Add a value</div>
        <form id="addValueForm" class="form-row" style="align-items:flex-end;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="f-new-value">Value</label>
            <input type="text" id="f-new-value" placeholder="e.g. Red" required>
          </div>
          <div class="form-group" style="margin-bottom:0;display:flex;gap:8px;align-items:flex-end;">
            <div style="flex:1;">
              <label for="f-new-value-order">Sort Order</label>
              <input type="number" id="f-new-value-order" value="0">
            </div>
            <button type="submit" class="btn btn-primary" id="addValueSubmit">Add</button>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    backdrop.querySelector('#addValueForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('valuesFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('addValueSubmit');
      Admin.setButtonLoading(btn, true, 'Adding…');
      try {
        await Admin.api.post(API.values(a.attributeId), {
          value: document.getElementById('f-new-value').value.trim(),
          sort_order: Number(document.getElementById('f-new-value-order').value) || 0,
        });
        document.getElementById('f-new-value').value = '';
        document.getElementById('f-new-value-order').value = 0;
        Admin.toast('Value added', 'success');
        await loadValuesList(a);
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });

    await loadValuesList(a);
  }

  async function loadValuesList(a) {
    const el = document.getElementById('valuesList');
    if (!el) return;
    try {
      const res = await Admin.api.get(API.values(a.attributeId));
      currentValues = res.data.values || [];
      renderValuesList(a);
    } catch (err) {
      el.innerHTML = `<div class="attr-manage-empty">Couldn't load values.</div>`;
      Admin.toastError(err);
    }
  }

  function renderValuesList(a) {
    const el = document.getElementById('valuesList');
    if (!currentValues.length) {
      el.innerHTML = `<div class="attr-manage-empty">No values yet — add one below (e.g. Red, Large).</div>`;
      return;
    }
    el.innerHTML = currentValues.map((v) => `
      <div class="attrval-row" data-id="${v.attributeValueId}">
        <div class="attrval-row-lead">
          <span class="attrval-order">${v.sortOrder}</span>
          <span>${Admin.escapeHtml(v.value)}</span>
        </div>
        <div class="cell-actions">
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.attrval-row').forEach((row) => {
      const v = currentValues.find((x) => String(x.attributeValueId) === row.dataset.id);
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editValueInline(row, v, a));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteValue(v, a));
    });
  }

  function editValueInline(row, v, a) {
    row.innerHTML = `
      <div class="attrval-row-lead" style="flex:1;gap:8px;">
        <input type="text" class="inline-edit-value" value="${Admin.escapeHtml(v.value)}" style="max-width:180px;">
        <input type="number" class="inline-edit-order" value="${v.sortOrder}" style="max-width:80px;">
      </div>
      <div class="cell-actions">
        <button class="btn btn-primary btn-sm" data-act="save">Save</button>
        <button class="btn btn-secondary btn-sm" data-act="cancel">Cancel</button>
      </div>
    `;
    row.querySelector('[data-act="cancel"]').addEventListener('click', () => renderValuesList(a));
    row.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const newValue = row.querySelector('.inline-edit-value').value.trim();
      const newOrder = Number(row.querySelector('.inline-edit-order').value) || 0;
      try {
        await Admin.api.patch(API.valueUpdate(v.attributeValueId), { value: newValue, sort_order: newOrder });
        Admin.toast('Value updated', 'success');
        await loadValuesList(a);
      } catch (err) { Admin.toastError(err); }
    });
  }

  async function deleteValue(v, a) {
    const ok = await Admin.confirmAction({
      title: 'Delete value?',
      body: `Delete <strong>${Admin.escapeHtml(v.value)}</strong>? This is blocked if it's still assigned to a product variant.`,
      confirmLabel: 'Delete value',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.valueDelete(v.attributeValueId));
      Admin.toast('Value deleted', 'success');
      await loadValuesList(a);
      loadValueCount(a);
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
