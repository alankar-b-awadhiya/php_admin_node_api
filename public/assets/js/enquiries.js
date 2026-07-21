/**
 * enquiries.js — Enquiries page (maps to /enquiries, per the Enquiries
 * section of the API reference: aba_main_db `enquiries`, `enquiry_replies`.
 * Public contact form + admin inbox).
 *
 * Reply threads now carry a `direction`: 'outbound' (admin reply - actually
 * emailed to the lead via SMTP) or 'inbound' (lead replied by email; picked
 * up by the IMAP poller at POST /enquiries/poll-replies, run on a server
 * cron - nothing to trigger from this page, it just shows up in the thread
 * once it lands). Admin replies can also be marked `is_internal` - a note
 * for the team that's saved but never emailed out.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/enquiries/v1/enquiries.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET   API.stats              - aggregate stats for the dashboard cards
 *   GET   API.list               - list/filter (?status,?type,?priority,?date_from,?date_to,?search,?page,?perPage)
 *   GET   API.get(id)            - get an enquiry (auto-marks as read server-side)
 *   PATCH API.update(id)         - update status / priority / assignment
 *   PATCH API.markSpam(id)       - mark as spam
 *   PATCH API.bulkStatus         - { ids, status } bulk update
 *   POST  API.reply              - { enquiry_id, message, is_internal } reply to an enquiry
 *                                   (is_internal=false actually sends an email to the lead)
 *   DELETE API.remove(id)        - delete an enquiry
 *
 * NOTE: the README's samples for this domain (submit/track) come back in
 * snake_case (ref_no, createdAt mixed), unlike the camelCase used by other
 * domains (blogs, categories). Field reads below are written defensively
 * across both conventions so this keeps working either way; adjust the
 * exact keys here if your real `enquiries.service.js` formatter differs.
 */
(function () {
  const API = {
    stats: '/enquiries/stats',
    list: '/enquiries',
    get: (id) => `/enquiries/${id}`,
    update: (id) => `/enquiries/${id}`,
    markSpam: (id) => `/enquiries/${id}/mark-spam`,
    bulkStatus: '/enquiries/bulk-status',
    reply: '/enquiries/reply',
    remove: (id) => `/enquiries/${id}`,
  };

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let rows = [];
  let selectedIds = new Set();
  let state = { status: '', type: '', priority: '', dateFrom: '', dateTo: '', search: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnRefreshEnquiries').addEventListener('click', () => { loadStats(); loadList(true); });
    document.getElementById('btnApplyFilter').addEventListener('click', applyFilters);
    document.getElementById('btnClearFilter').addEventListener('click', clearFilters);
    document.getElementById('perPageSelect').addEventListener('change', (e) => {
      state.perPage = Number(e.target.value); state.page = 1; loadList();
    });
    document.getElementById('tableSearchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim(); state.page = 1; loadList();
    }, 350));
    document.getElementById('checkAll').addEventListener('change', (e) => {
      selectedIds = e.target.checked ? new Set(rows.map((r) => r.id)) : new Set();
      renderTable();
      updateBulkButton();
    });

    wireBulkDropdown();

    await loadStats();
    await loadList();
  }

  function applyFilters() {
    state.status = document.getElementById('statusFilter').value;
    state.type = document.getElementById('typeFilter').value;
    state.priority = document.getElementById('priorityFilter').value;
    state.dateFrom = document.getElementById('fromDate').value;
    state.dateTo = document.getElementById('toDate').value;
    state.page = 1;
    loadList();
  }

  function clearFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('priorityFilter').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    document.getElementById('tableSearchInput').value = '';
    state = { status: '', type: '', priority: '', dateFrom: '', dateTo: '', search: '', page: 1, perPage: state.perPage };
    loadList();
  }

  // ---- Stat cards -----------------------------------------------------

  async function loadStats() {
    try {
      const res = await Admin.api.get(API.stats);
      const s = res.data || {};
      setText('statUnread', s.unread ?? s.unreadCount ?? 0);
      setText('statInProgress', s.inProgress ?? s.in_progress ?? 0);
      setText('statResolved', s.resolved ?? s.resolvedCount ?? 0);
      setText('statUrgent', s.urgent ?? s.urgentCount ?? 0);
      setText('statToday', s.today ?? s.todayCount ?? 0);
      const label = document.getElementById('statTodayLabel');
      if (label) label.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short' });
    } catch (err) {
      Admin.toastError(err);
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ---- Bulk actions dropdown -------------------------------------------

  function wireBulkDropdown() {
    const wrap = document.getElementById('bulkActionsDropdown');
    const btn = document.getElementById('btnBulkActions');
    const menu = document.getElementById('bulkActionsMenu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      menu.classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) menu.classList.remove('is-open');
    });
    menu.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        menu.classList.remove('is-open');
        bulkUpdateStatus(item.dataset.status);
      });
    });
  }

  function updateBulkButton() {
    document.getElementById('btnBulkActions').disabled = selectedIds.size === 0;
  }

  async function bulkUpdateStatus(status) {
    if (!selectedIds.size) return;
    try {
      await Admin.api.patch(API.bulkStatus, { ids: Array.from(selectedIds), status });
      Admin.toast(`${selectedIds.size} enquiry(ies) updated`, 'success');
      selectedIds = new Set();
      document.getElementById('checkAll').checked = false;
      loadStats();
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- List / table -----------------------------------------------------

  async function loadList(spin) {
    const body = document.getElementById('enquiriesTableBody');
    const refreshBtn = document.getElementById('btnRefreshEnquiries');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="10" class="table-empty">Loading enquiries…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        status: state.status,
        type: state.type,
        priority: state.priority,
        date_from: state.dateFrom,
        date_to: state.dateTo,
        search: state.search,
        page: state.page,
        perPage: state.perPage,
      }));
      rows = res.data.enquiries || res.data.items || (Array.isArray(res.data) ? res.data : []) || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="10" class="table-empty">Couldn't load enquiries.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function priorityBadge(p) {
    const v = (p || 'medium').toLowerCase();
    if (v === 'low') return `<span class="badge badge-gray">Low</span>`;
    if (v === 'high') return `<span class="badge badge-coral">High</span>`;
    if (v === 'urgent') return `<span class="badge badge-solid-coral">Urgent</span>`;
    return `<span class="badge badge-amber">Medium</span>`;
  }

  function statusBadge(s) {
    const v = (s || 'new').toLowerCase();
    const map = {
      new: 'badge-indigo', read: 'badge-sky', in_progress: 'badge-amber',
      resolved: 'badge-green', spam: 'badge-coral', closed: 'badge-dark',
    };
    const cls = map[v] || 'badge-gray';
    return `<span class="badge ${cls}">${Admin.escapeHtml(v.replace('_', ' '))}</span>`;
  }

  function renderTable() {
    const body = document.getElementById('enquiriesTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="10" class="table-empty">No enquiries found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((r) => {
      const ref = r.refNo || r.ref_no || r.id;
      const name = r.name || r.fullName || r.full_name || '—';
      const email = r.email || '';
      const phone = r.phone || r.mobile || '';
      const subject = r.subject || '(no subject)';
      const message = r.message || '';
      const type = r.type || r.enquiryType || 'contact';
      const replies = r.repliesCount ?? r.replies_count ?? (Array.isArray(r.replies) ? r.replies.length : 0);
      const date = r.createdAt || r.created_at;
      return `
        <tr data-id="${r.id}">
          <td><input type="checkbox" class="row-check" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''}></td>
          <td><button type="button" class="enq-ref-link" data-act="view">${Admin.escapeHtml(String(ref))}</button></td>
          <td>
            <div class="enq-from-name">${Admin.escapeHtml(name)}</div>
            ${email ? `<div class="enq-from-sub">${Admin.escapeHtml(email)}</div>` : ''}
            ${phone ? `<div class="enq-from-sub">${Admin.escapeHtml(phone)}</div>` : ''}
          </td>
          <td>
            <div class="enq-msg-subject">${Admin.escapeHtml(subject)}</div>
            <div class="enq-msg-sub">${Admin.escapeHtml(truncate(message, 40))}</div>
          </td>
          <td><span class="badge-outline-dark">${Admin.escapeHtml(titleCase(type))}</span></td>
          <td>${priorityBadge(r.priority)}</td>
          <td>${statusBadge(r.status)}</td>
          <td><span class="count-pill-soft">${replies}</span></td>
          <td class="cell-muted">${Admin.formatDate(date)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const r = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelectorAll('[data-act="view"]').forEach((el) => el.addEventListener('click', () => openViewModal(r)));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removeEnquiry(r));
      tr.querySelector('.row-check')?.addEventListener('change', (e) => {
        if (e.target.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
        document.getElementById('checkAll').checked = selectedIds.size === rows.length;
        updateBulkButton();
      });
    });
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }
  function titleCase(s) {
    return String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderPagination(pagination) {
    const el = document.getElementById('enquiriesPagination');
    if (!pagination) { el.innerHTML = `<span>Showing 1 to ${rows.length} of ${rows.length} entries</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="enqPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="enqNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('enqPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('enqNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  async function removeEnquiry(r) {
    const ok = await Admin.confirmAction({
      title: 'Delete enquiry?',
      body: `Delete the enquiry from <strong>${Admin.escapeHtml(r.name || r.email || 'this contact')}</strong>? This can't be undone.`,
      confirmLabel: 'Delete enquiry',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(r.id));
      Admin.toast('Enquiry deleted', 'success');
      loadStats();
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- View / reply / status modal ---------------------------------------

  async function openViewModal(row) {
    Admin.openModal(`
      <div class="modal-header"><h3>Loading…</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body"><div class="table-empty">Loading enquiry…</div></div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    let full = row;
    try {
      const res = await Admin.api.get(API.get(row.id)); // also marks it read server-side
      full = res.data.enquiry || res.data || row;
    } catch (err) {
      Admin.toastError(err);
    }
    renderViewModal(full);
    loadList(); // reflect the auto-mark-as-read
  }

  function renderReplyItem(rep) {
    const direction = rep.direction || 'outbound';
    const isInternal = Boolean(rep.isInternal ?? rep.is_internal);
    const fromEmail = rep.fromEmail || rep.from_email || '';
    const author = direction === 'inbound'
      ? (fromEmail || 'Lead')
      : (rep.authorName || rep.author_name || 'Admin');
    const classes = ['enq-reply-item'];
    if (direction === 'inbound') classes.push('is-inbound');
    else if (isInternal) classes.push('is-internal');

    let tag = '';
    if (direction === 'inbound') tag = '<span class="enq-reply-tag tag-inbound">Lead replied</span>';
    else if (isInternal) tag = '<span class="enq-reply-tag tag-internal">Internal note</span>';

    return `
      <div class="${classes.join(' ')}">
        <div class="enq-reply-meta">${tag}${Admin.escapeHtml(author)} · ${Admin.formatDate(rep.createdAt || rep.created_at)}</div>
        <div>${Admin.escapeHtml(rep.message || rep.body || '')}</div>
      </div>
    `;
  }

  function renderViewModal(r) {
    const ref = r.refNo || r.ref_no || r.id;
    const name = r.name || r.fullName || r.full_name || '—';
    const email = r.email || '';
    const phone = r.phone || r.mobile || '';
    const message = r.message || '';
    const replies = r.replies || [];

    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(String(ref))}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="flex-gap" style="margin-bottom:12px;">
          ${statusBadge(r.status)} ${priorityBadge(r.priority)} <span class="badge-outline-dark">${Admin.escapeHtml(titleCase(r.type || r.enquiryType || 'contact'))}</span>
        </div>
        <p style="margin:0 0 4px;"><strong>${Admin.escapeHtml(name)}</strong></p>
        <p style="margin:0 0 12px;font-size:12.8px;">${Admin.escapeHtml(email)}${phone ? ' · ' + Admin.escapeHtml(phone) : ''}</p>
        <p style="margin:0 0 4px;font-weight:650;font-size:13.5px;">${Admin.escapeHtml(r.subject || '(no subject)')}</p>
        <div class="log-body-pre" style="margin-bottom:16px;">${Admin.escapeHtml(message)}</div>

        <div class="form-row">
          <div class="form-group">
            <label for="v-status">Status</label>
            <select id="v-status">
              ${['new','read','in_progress','resolved','spam','closed'].map((s) => `<option value="${s}" ${String(r.status).toLowerCase() === s ? 'selected' : ''}>${titleCase(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="v-priority">Priority</label>
            <select id="v-priority">
              ${['low','medium','high','urgent'].map((p) => `<option value="${p}" ${String(r.priority).toLowerCase() === p ? 'selected' : ''}>${titleCase(p)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="v-assigned">Assigned To</label>
          <input type="text" id="v-assigned" placeholder="Optional user ID / name" value="${Admin.escapeHtml(r.assignedTo || r.assigned_to || '')}">
        </div>
        <div class="flex-gap" style="margin-bottom:18px;">
          <button type="button" class="btn btn-primary btn-sm" id="btnSaveEnq">Save changes</button>
          <button type="button" class="btn btn-outline-red btn-sm" id="btnMarkSpam">Mark as Spam</button>
        </div>

        <h3 style="font-size:13.5px;margin-bottom:10px;">Replies</h3>
        <div id="repliesList">
          ${replies.length ? replies.map(renderReplyItem).join('') : '<p class="hint">No replies yet.</p>'}
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label for="v-reply">Reply</label>
          <textarea id="v-reply" placeholder="Write a reply..."></textarea>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-muted);margin-top:6px;">
          <input type="checkbox" id="v-reply-internal">
          Internal note only (don't email the lead)
        </label>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
        <button type="button" class="btn btn-primary" id="btnSendReply">Send Reply</button>
      </div>
    `);

    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    backdrop.querySelector('#btnSaveEnq').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        await Admin.api.patch(API.update(r.id), {
          status: document.getElementById('v-status').value,
          priority: document.getElementById('v-priority').value,
          assigned_to: document.getElementById('v-assigned').value.trim() || null,
        });
        Admin.toast('Enquiry updated', 'success');
        loadStats();
        loadList();
      } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
    });

    backdrop.querySelector('#btnMarkSpam').addEventListener('click', async (e) => {
      const ok = await Admin.confirmAction({ title: 'Mark as spam?', confirmLabel: 'Mark as Spam', danger: true });
      if (!ok) return;
      try {
        await Admin.api.patch(API.markSpam(r.id));
        Admin.toast('Marked as spam', 'success');
        Admin.closeModal();
        loadStats();
        loadList();
      } catch (err) { Admin.toastError(err); }
    });

    backdrop.querySelector('#btnSendReply').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const message = document.getElementById('v-reply').value.trim();
      const isInternal = document.getElementById('v-reply-internal').checked;
      if (!message) { Admin.toast('Write a reply first', 'error'); return; }
      Admin.setButtonLoading(btn, true, 'Sending…');
      try {
        await Admin.api.post(API.reply, { enquiry_id: r.id, message, is_internal: isInternal });
        Admin.toast(isInternal ? 'Internal note saved' : 'Reply sent — emailed to the lead', 'success');
        openViewModal(r); // reload with the new reply
      } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
    });
  }

  init();
})();
