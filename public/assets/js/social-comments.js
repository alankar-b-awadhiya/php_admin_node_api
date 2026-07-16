/**
 * social-comments.js — Comments page (maps to /social-comments,
 * aba_social_db `social_comments`). Read + moderate synced comments per
 * published post_target — actually posting a reply goes through a platform
 * adapter (not built), this is view/hide/mark-replied only.
 *
 * ---------------------------------------------------------------------------
 * API map — Node API: src/domains/socialComments/v1/socialComments.routes.js
 * ---------------------------------------------------------------------------
 *   GET   API.list                - list/filter (?target_id,?is_hidden,?page,?per_page)
 *   GET   API.get(id)             - single comment
 *   PATCH API.update(id)          - { is_hidden?, is_replied_by_us? }
 */
(function () {
  const API = {
    list: '/social-comments',
    get: (id) => `/social-comments/${id}`,
    update: (id) => `/social-comments/${id}`,
  };

  const ICON = {
    hide: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="currentColor" stroke-width="1.5"/><path d="M3 3l14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    show: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10.5 8 14l8-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let rows = [];
  let state = { targetId: '', isHidden: '', page: 1, perPage: 25 };

  async function init() {
    await Admin.requireAuth();

    document.getElementById('btnRefreshComments').addEventListener('click', () => loadList(true));
    document.getElementById('targetIdFilter').addEventListener('input', Admin.debounce((e) => {
      state.targetId = e.target.value.trim(); state.page = 1; loadList();
    }, 350));
    document.getElementById('hiddenFilter').addEventListener('change', (e) => { state.isHidden = e.target.value; state.page = 1; loadList(); });

    await loadList();
  }

  async function loadList(spin) {
    const body = document.getElementById('commentsTableBody');
    const refreshBtn = document.getElementById('btnRefreshComments');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="6" class="table-empty">Loading comments…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        target_id: state.targetId, is_hidden: state.isHidden, page: state.page, per_page: state.perPage,
      }));
      rows = res.data.comments || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('commentsCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} comment${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">Couldn't load comments.</td></tr>`;
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('commentsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">No comments found.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((c) => `
      <tr data-id="${c.id}">
        <td><strong>${Admin.escapeHtml(c.authorName || 'Unknown')}</strong></td>
        <td class="cell-muted" style="max-width:320px;">${Admin.escapeHtml(c.message || '')}</td>
        <td class="cell-muted"><code>#${c.targetId}</code></td>
        <td class="cell-muted">${Admin.timeAgo(c.postedAt)}</td>
        <td>
          ${Admin.badge(!c.isHidden, 'Visible', 'Hidden')}
          ${c.isRepliedByUs ? `<span class="badge badge-indigo" style="margin-left:4px;"><span class="badge-dot"></span>Replied</span>` : ''}
        </td>
        <td class="cell-actions">
          <button class="icon-action ${c.isHidden ? 'icon-action-view' : 'icon-action-toggle'}" data-act="hide" title="${c.isHidden ? 'Unhide' : 'Hide'}">${c.isHidden ? ICON.show : ICON.hide}</button>
          ${!c.isRepliedByUs ? `<button class="icon-action icon-action-toggle" data-act="replied" title="Mark replied">${ICON.check}</button>` : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const c = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="hide"]')?.addEventListener('click', () => toggleHidden(c));
      tr.querySelector('[data-act="replied"]')?.addEventListener('click', () => markReplied(c));
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('commentsPagination');
    if (!pagination) { el.innerHTML = `<span>Total: ${rows.length}</span>`; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="cmPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="cmNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('cmPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('cmNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  async function toggleHidden(c) {
    try {
      await Admin.api.patch(API.update(c.id), { is_hidden: c.isHidden ? 0 : 1 });
      Admin.toast(c.isHidden ? 'Comment unhidden' : 'Comment hidden', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function markReplied(c) {
    try {
      await Admin.api.patch(API.update(c.id), { is_replied_by_us: 1 });
      Admin.toast('Marked replied', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  init();
})();
