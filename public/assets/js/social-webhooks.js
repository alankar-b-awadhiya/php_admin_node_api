/**
 * social-webhooks.js — Webhook Events page (maps to /social-webhooks,
 * aba_social_db `social_webhook_events`). Admin-facing log/replay view of
 * the raw inbound receiver — POST /social-webhooks/:platform itself is
 * called by each platform directly, not from this UI.
 *
 * ---------------------------------------------------------------------------
 * API map — Node API: src/domains/socialWebhooks/v1/socialWebhooks.routes.js
 * ---------------------------------------------------------------------------
 *   GET  API.list                 - list/filter (?platform,?processed,?page,?per_page)
 *   GET  API.get(id)              - full event incl. raw payload
 *   POST API.reprocess(id)        - marks the event processed
 */
(function () {
  const API = {
    list: '/social-webhooks',
    get: (id) => `/social-webhooks/${id}`,
    reprocess: (id) => `/social-webhooks/${id}/reprocess`,
  };
  const PLATFORMS_API = '/social-platforms';

  let rows = [];
  let state = { platform: '', processed: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnRefreshEvents').addEventListener('click', () => loadList(true));
    document.getElementById('platformFilter').addEventListener('change', (e) => { state.platform = e.target.value; state.page = 1; loadList(); });
    document.getElementById('processedFilter').addEventListener('change', (e) => { state.processed = e.target.value; state.page = 1; loadList(); });

    await loadPlatforms();
    await loadList();
  }

  async function loadPlatforms() {
    const sel = document.getElementById('platformFilter');
    try {
      const res = await Admin.api.get(PLATFORMS_API);
      const platforms = res.data.platforms || [];
      sel.innerHTML = '<option value="">All Platforms</option>' +
        platforms.map((p) => `<option value="${Admin.escapeHtml(p.code)}">${Admin.escapeHtml(p.name)}</option>`).join('');
    } catch (err) { /* filter still works without this, just empty */ }
  }

  async function loadList(spin) {
    const body = document.getElementById('eventsTableBody');
    const refreshBtn = document.getElementById('btnRefreshEvents');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading events…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        platform: state.platform, processed: state.processed, page: state.page, per_page: state.perPage,
      }));
      rows = res.data.events || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('eventsCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} event${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load events.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('eventsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">No webhook events found.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((ev) => `
      <tr data-id="${ev.id}">
        <td><span class="badge-outline">${Admin.escapeHtml(ev.platform)}</span></td>
        <td class="cell-muted">${Admin.escapeHtml(ev.eventType || '—')}</td>
        <td class="cell-muted">${ev.accountId ?? '<span class="cell-muted">—</span>'}</td>
        <td>${Admin.badge(ev.signatureValid, 'Verified', 'Unverified')}</td>
        <td>${Admin.badge(ev.processed, 'Processed', 'Pending')}</td>
        <td class="cell-muted">${Admin.timeAgo(ev.receivedAt)}</td>
        <td class="cell-actions">
          <button class="btn btn-secondary btn-sm" data-act="view">View</button>
          ${!ev.processed ? `<button class="btn btn-secondary btn-sm" data-act="reprocess">Mark Processed</button>` : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const ev = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openViewModal(ev));
      tr.querySelector('[data-act="reprocess"]')?.addEventListener('click', () => reprocess(ev));
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('eventsPagination');
    if (!pagination) { el.innerHTML = `<span>Total: ${rows.length}</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="evPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="evNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('evPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('evNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  async function reprocess(ev) {
    try {
      await Admin.api.post(API.reprocess(ev.id));
      Admin.toast('Marked processed', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function openViewModal(ev) {
    Admin.openModal(`
      <div class="modal-header"><h3>Webhook Event #${ev.id}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="eventViewBody"><div class="flex-gap"><span class="spinner spinner-dark"></span> Loading…</div></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    try {
      const res = await Admin.api.get(API.get(ev.id));
      const full = res.data.event;
      const body = document.getElementById('eventViewBody');
      if (!body) return;
      body.innerHTML = `
        <div class="flex-gap" style="margin-bottom:12px;">
          <span class="badge-outline">${Admin.escapeHtml(full.platform)}</span>
          ${Admin.badge(full.signatureValid, 'Signature Verified', 'Signature Unverified')}
          ${Admin.badge(full.processed, 'Processed', 'Pending')}
        </div>
        ${full.errorMessage ? `<div class="form-errors"><strong>${Admin.escapeHtml(full.errorMessage)}</strong></div>` : ''}
        <p class="hint">Received ${Admin.formatDate(full.receivedAt)}${full.processedAt ? ` · Processed ${Admin.formatDate(full.processedAt)}` : ''}</p>
        <label style="font-weight:650;font-size:13px;">Raw Payload</label>
        <pre class="log-body-pre">${Admin.escapeHtml(JSON.stringify(full.payload, null, 2))}</pre>
      `;
    } catch (err) {
      Admin.toastError(err);
      Admin.closeModal();
    }
  }

  init();
})();
