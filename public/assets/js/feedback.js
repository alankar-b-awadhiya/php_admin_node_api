/**
 * feedback.js — Feedback & Testimonials page (maps to /feedback, per the
 * Feedback section of the API reference: aba_main_db `feedback`. Public
 * submissions/testimonials + admin moderation).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/feedback/v1/feedback.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.stats        - aggregate stats for the header pills (pending/testimonials/featured)
 *   GET    API.list         - list/filter (?status,?is_testimonial,?is_featured,?sort,?search,?page,?perPage)
 *   GET    API.get(id)      - get one feedback entry
 *   POST   API.create       - admin: seed/create feedback directly (used by "Add Feedback")
 *   PATCH  API.moderate(id) - moderate: status / rejectionReason / isTestimonial / isFeatured / displayOrder
 *   PATCH  API.bulkStatus   - { ids, status } bulk update
 *   DELETE API.remove(id)   - delete a feedback entry
 *
 * NOTE: field names below are read defensively across camelCase and
 * snake_case (isTestimonial/is_testimonial, displayOrder/display_order,
 * etc.) since this document doesn't pin down the exact `feedback.service.js`
 * formatter — adjust the exact keys here if your real formatter differs.
 */
(function () {
  const API = {
    stats: '/feedback/stats',
    list: '/feedback',
    get: (id) => `/feedback/${id}`,
    create: '/feedback',
    moderate: (id) => `/feedback/${id}`,
    bulkStatus: '/feedback/bulk-status',
    remove: (id) => `/feedback/${id}`,
  };

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    starFull: '<svg width="14" height="14" viewBox="0 0 20 20" fill="#e8a33d"><path d="M10 2.2l2.36 4.78 5.28.77-3.82 3.72.9 5.26L10 14.27l-4.72 2.48.9-5.26L2.36 7.75l5.28-.77L10 2.2Z"/></svg>',
    starEmpty: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#cbd2e1" stroke-width="1.3"><path d="M10 2.2l2.36 4.78 5.28.77-3.82 3.72.9 5.26L10 14.27l-4.72 2.48.9-5.26L2.36 7.75l5.28-.77L10 2.2Z"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4L16 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let rows = [];
  let selectedIds = new Set();
  let state = { status: '', testimonial: '', featured: '', sort: '', search: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnRefreshFeedback').addEventListener('click', () => { loadStats(); loadList(true); });
    document.getElementById('btnAddFeedback').addEventListener('click', openCreateModal);
    document.getElementById('btnApplyFilter').addEventListener('click', applyFilters);
    document.getElementById('btnClearFilter').addEventListener('click', clearFilters);
    document.getElementById('perPageSelect').addEventListener('change', (e) => {
      state.perPage = Number(e.target.value); state.page = 1; loadList();
    });
    document.getElementById('fbSearchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim(); state.page = 1; loadList();
    }, 350));
    document.getElementById('checkAll').addEventListener('change', (e) => {
      selectedIds = e.target.checked ? new Set(rows.map((r) => r.id)) : new Set();
      renderTable();
      updateBulkBar();
    });
    document.getElementById('btnBulkApply').addEventListener('click', bulkUpdateStatus);

    await loadStats();
    await loadList();
  }

  function applyFilters() {
    state.status = document.getElementById('statusFilter').value;
    state.testimonial = document.getElementById('testimonialFilter').value;
    state.featured = document.getElementById('featuredFilter').value;
    state.sort = document.getElementById('sortFilter').value;
    state.page = 1;
    loadList();
  }

  function clearFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('testimonialFilter').value = '';
    document.getElementById('featuredFilter').value = '';
    document.getElementById('sortFilter').value = '';
    document.getElementById('fbSearchInput').value = '';
    state = { status: '', testimonial: '', featured: '', sort: '', search: '', page: 1, perPage: state.perPage };
    loadList();
  }

  // ---- Header pills -----------------------------------------------------

  async function loadStats() {
    try {
      const res = await Admin.api.get(API.stats);
      const s = res.data || {};
      setText('pillPending', `${s.pending ?? s.pendingCount ?? 0} pending`);
      setText('pillTestimonials', `${s.testimonials ?? s.testimonialCount ?? s.testimonialsCount ?? 0} testimonials`);
      setText('pillFeatured', `${s.featured ?? s.featuredCount ?? 0} featured`);
    } catch (err) {
      Admin.toastError(err);
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ---- Bulk action bar ----------------------------------------------------

  function updateBulkBar() {
    document.getElementById('selectedCountLabel').textContent = `${selectedIds.size} selected`;
    document.getElementById('btnBulkApply').disabled = selectedIds.size === 0;
  }

  async function bulkUpdateStatus() {
    if (!selectedIds.size) return;
    const status = document.getElementById('bulkStatusSelect').value;
    try {
      await Admin.api.patch(API.bulkStatus, { ids: Array.from(selectedIds), status });
      Admin.toast(`${selectedIds.size} feedback entry(ies) updated`, 'success');
      selectedIds = new Set();
      document.getElementById('checkAll').checked = false;
      updateBulkBar();
      loadStats();
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- List / table -----------------------------------------------------

  async function loadList(spin) {
    const body = document.getElementById('feedbackTableBody');
    const refreshBtn = document.getElementById('btnRefreshFeedback');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="8" class="table-empty">Loading feedback…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        status: state.status,
        is_testimonial: state.testimonial,
        is_featured: state.featured,
        sort: state.sort,
        search: state.search,
        page: state.page,
        perPage: state.perPage,
      }));
      rows = res.data.feedback || res.data.items || (Array.isArray(res.data) ? res.data : []) || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">Couldn't load feedback.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function statusBadge(s) {
    const v = (s || 'pending').toLowerCase();
    const map = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-coral', archived: 'badge-dark' };
    const cls = map[v] || 'badge-gray';
    return `<span class="badge ${cls}">${Admin.escapeHtml(titleCase(v))}</span>`;
  }

  function renderStars(rating) {
    const r = Math.round(Number(rating) || 0);
    let html = '<span class="fb-stars">';
    for (let i = 1; i <= 5; i++) html += i <= r ? ICON.starFull : ICON.starEmpty;
    html += '</span>';
    return html;
  }

  function truncate(str, n) {
    str = str || '';
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }
  function titleCase(s) {
    return String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderTable() {
    const body = document.getElementById('feedbackTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8" class="table-empty">No feedback found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((r) => {
      const name = r.name || r.fullName || '—';
      const company = r.companyName || r.company_name || r.company || '';
      const rating = r.rating || 0;
      const title = r.title || '(no title)';
      const message = r.message || '';
      const isTestimonial = r.isTestimonial ?? r.is_testimonial ?? false;
      const isFeatured = r.isFeatured ?? r.is_featured ?? false;
      const date = r.submittedAt || r.submitted_at || r.createdAt || r.created_at;
      return `
        <tr data-id="${r.id}">
          <td><input type="checkbox" class="row-check" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''}></td>
          <td>
            <div class="enq-from-name">${Admin.escapeHtml(name)}</div>
            ${company ? `<div class="enq-from-sub">${Admin.escapeHtml(company)}</div>` : ''}
          </td>
          <td>${renderStars(rating)}</td>
          <td>
            <div class="enq-msg-subject">${Admin.escapeHtml(title)}</div>
            <div class="enq-msg-sub">${Admin.escapeHtml(truncate(message, 50))}</div>
          </td>
          <td>${statusBadge(r.status)}</td>
          <td>
            ${isTestimonial ? `<span class="badge badge-green">${ICON.check} Testimonial</span>` : `<span class="badge badge-gray">No</span>`}
            ${isFeatured ? `<span class="client-name-star" title="Featured">${ICON.starFull}</span>` : ''}
          </td>
          <td class="cell-muted">${Admin.formatDate(date)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const r = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelectorAll('[data-act="view"]').forEach((el) => el.addEventListener('click', () => openViewModal(r)));
      tr.querySelector('.row-check')?.addEventListener('change', (e) => {
        if (e.target.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
        document.getElementById('checkAll').checked = selectedIds.size === rows.length;
        updateBulkBar();
      });
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('feedbackPagination');
    document.getElementById('totalItemsPill').textContent = `${(pagination && pagination.total) ?? rows.length} items`;
    if (!pagination) { el.innerHTML = `<span>Showing 1 to ${rows.length} of ${rows.length} entries</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="fbPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="fbNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('fbPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('fbNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  // ---- Add Feedback modal (seed fake feedback) ---------------------------

  function openCreateModal() {
    Admin.openModal(`
      <div class="modal-header"><h3>Add Feedback</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="fbCreateForm">
        <div class="modal-body">
          <div id="fbCreateErrors"></div>
          <div class="form-row">
            <div class="form-group">
              <label for="c-name">Name *</label>
              <input type="text" id="c-name" required placeholder="Sandeep Patil">
            </div>
            <div class="form-group">
              <label for="c-email">Email</label>
              <input type="email" id="c-email" placeholder="Optional">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="c-company">Company</label>
              <input type="text" id="c-company" placeholder="Patil Industrial Supplies">
            </div>
            <div class="form-group">
              <label for="c-designation">Designation</label>
              <input type="text" id="c-designation" placeholder="General Manager">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="c-rating">Rating *</label>
              <select id="c-rating" required>
                <option value="5" selected>5 — Excellent</option>
                <option value="4">4 — Good</option>
                <option value="3">3 — Average</option>
                <option value="2">2 — Poor</option>
                <option value="1">1 — Very Poor</option>
              </select>
            </div>
            <div class="form-group">
              <label for="c-status">Status</label>
              <select id="c-status">
                <option value="approved" selected>Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="c-title">Title *</label>
            <input type="text" id="c-title" required placeholder="Ethical, transparent business dealings">
          </div>
          <div class="form-group">
            <label for="c-message">Message *</label>
            <textarea id="c-message" required placeholder="What stands out most is..."></textarea>
          </div>
          <div class="form-row">
            <div class="form-group" style="display:flex;align-items:center;gap:10px;margin-top:6px;">
              <label class="switch"><input type="checkbox" id="c-testimonial" checked><span class="slider"></span></label>
              <label style="margin:0;" for="c-testimonial">Publish as Testimonial</label>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:10px;margin-top:6px;">
              <label class="switch"><input type="checkbox" id="c-featured"><span class="slider"></span></label>
              <label style="margin:0;" for="c-featured">Featured</label>
            </div>
          </div>
          <div class="form-group">
            <label for="c-order">Display Order</label>
            <input type="number" id="c-order" value="0">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="fbCreateSubmit">Save Feedback</button>
        </div>
      </form>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#fbCreateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('fbCreateErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('fbCreateSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      const payload = {
        name: document.getElementById('c-name').value.trim(),
        email: document.getElementById('c-email').value.trim() || null,
        company_name: document.getElementById('c-company').value.trim() || null,
        designation: document.getElementById('c-designation').value.trim() || null,
        rating: Number(document.getElementById('c-rating').value),
        status: document.getElementById('c-status').value,
        title: document.getElementById('c-title').value.trim(),
        message: document.getElementById('c-message').value.trim(),
        is_testimonial: document.getElementById('c-testimonial').checked,
        is_featured: document.getElementById('c-featured').checked,
        display_order: Number(document.getElementById('c-order').value) || 0,
      };
      try {
        await Admin.api.post(API.create, payload);
        Admin.toast('Feedback added', 'success');
        Admin.closeModal();
        loadStats();
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

  // ---- View / moderate modal ---------------------------------------------

  async function openViewModal(row) {
    Admin.openModal(`
      <div class="modal-header"><h3>Loading…</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body"><div class="table-empty">Loading feedback…</div></div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    let full = row;
    try {
      const res = await Admin.api.get(API.get(row.id));
      full = res.data.feedback || res.data || row;
    } catch (err) {
      Admin.toastError(err);
    }
    renderViewModal(full);
  }

  function renderViewModal(r) {
    const name = r.name || r.fullName || '—';
    const company = r.companyName || r.company_name || r.company || '';
    const designation = r.designation || '';
    const rating = r.rating || 0;
    const title = r.title || '(no title)';
    const message = r.message || '';
    const isTestimonial = r.isTestimonial ?? r.is_testimonial ?? false;
    const isFeatured = r.isFeatured ?? r.is_featured ?? false;
    const publicConsent = r.publicDisplayConsent ?? r.public_display_consent;
    const nameConsent = r.nameDisplayConsent ?? r.name_display_consent;
    const submittedAt = r.submittedAt || r.submitted_at || r.createdAt || r.created_at;
    const moderatedAt = r.moderatedAt || r.moderated_at;

    Admin.openModal(`
      <div class="modal-header"><h3>Feedback Detail</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 220px;gap:18px;margin-bottom:16px;">
          <div>
            <p style="margin:0 0 4px;font-weight:650;font-size:14.5px;color:var(--text);">${Admin.escapeHtml(title)}</p>
            ${renderStars(rating)}
            <div class="log-body-pre" style="margin-top:10px;">${Admin.escapeHtml(message)}</div>
            ${(publicConsent !== undefined || nameConsent !== undefined) ? `
              <div class="flex-gap" style="margin-top:12px;">
                ${publicConsent ? `<span class="badge badge-green">${ICON.check} Public display consent</span>` : ''}
                ${nameConsent ? `<span class="badge badge-green">${ICON.check} Name display consent</span>` : ''}
              </div>` : ''}
          </div>
          <div style="background:var(--porcelain);border:1px solid var(--line);border-radius:var(--radius-md);padding:12px 14px;">
            <p style="margin:0 0 4px;font-weight:650;font-size:13.5px;color:var(--text);">${Admin.escapeHtml(name)}</p>
            ${company ? `<p style="margin:0 0 3px;font-size:12.3px;">${Admin.escapeHtml(company)}</p>` : ''}
            ${designation ? `<p style="margin:0 0 10px;font-size:12.3px;">${Admin.escapeHtml(designation)}</p>` : ''}
            <p style="margin:8px 0 0;font-size:11.5px;color:var(--text-faint);">Submitted: ${Admin.formatDate(submittedAt)}</p>
            ${moderatedAt ? `<p style="margin:2px 0 0;font-size:11.5px;color:var(--text-faint);">Moderated: ${Admin.formatDate(moderatedAt)}</p>` : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="v-status">Moderation Status</label>
            <select id="v-status">
              ${['pending', 'approved', 'rejected', 'archived'].map((s) => `<option value="${s}" ${String(r.status).toLowerCase() === s ? 'selected' : ''}>${titleCase(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="v-reason">Rejection Reason</label>
            <input type="text" id="v-reason" placeholder="Only used when status = Rejected" value="${Admin.escapeHtml(r.rejectionReason || r.rejection_reason || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="display:flex;align-items:center;gap:10px;">
            <label class="switch"><input type="checkbox" id="v-testimonial" ${isTestimonial ? 'checked' : ''}><span class="slider"></span></label>
            <label style="margin:0;" for="v-testimonial">Publish as Testimonial</label>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px;">
            <label class="switch"><input type="checkbox" id="v-featured" ${isFeatured ? 'checked' : ''}><span class="slider"></span></label>
            <label style="margin:0;" for="v-featured">Featured</label>
          </div>
        </div>
        <div class="form-group">
          <label for="v-order">Display Order</label>
          <input type="number" id="v-order" value="${r.displayOrder ?? r.display_order ?? 0}">
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button type="button" class="btn btn-danger" id="btnDeleteFeedback">
          ${ICON.trash} Delete
        </button>
        <div class="flex-gap">
          <button type="button" class="btn btn-secondary" data-act="close">Close</button>
          <button type="button" class="btn btn-primary" id="btnSaveFeedback">
            ${ICON.check} Save
          </button>
        </div>
      </div>
    `);

    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    backdrop.querySelector('#btnSaveFeedback').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        await Admin.api.patch(API.moderate(r.id), {
          status: document.getElementById('v-status').value,
          rejection_reason: document.getElementById('v-reason').value.trim() || null,
          is_testimonial: document.getElementById('v-testimonial').checked,
          is_featured: document.getElementById('v-featured').checked,
          display_order: Number(document.getElementById('v-order').value) || 0,
        });
        Admin.toast('Feedback updated', 'success');
        Admin.closeModal();
        loadStats();
        loadList();
      } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
    });

    backdrop.querySelector('#btnDeleteFeedback').addEventListener('click', async () => {
      const ok = await Admin.confirmAction({
        title: 'Delete feedback?',
        body: `Delete the feedback from <strong>${Admin.escapeHtml(name)}</strong>? This can't be undone.`,
        confirmLabel: 'Delete feedback',
        danger: true,
      });
      if (!ok) return;
      try {
        await Admin.api.del(API.remove(r.id));
        Admin.toast('Feedback deleted', 'success');
        Admin.closeModal();
        loadStats();
        loadList();
      } catch (err) { Admin.toastError(err); }
    });
  }

  init();
})();
