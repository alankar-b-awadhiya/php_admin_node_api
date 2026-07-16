/**
 * posts.js — Posts page (maps to /posts): composer/scheduler. One post can
 * fan out to multiple connected accounts (targets); publish now or
 * schedule; per-target analytics refresh + history.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/posts/v1/posts.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.clients                    - social clients, for the selector
 *   GET    API.accounts                   - ?social_client_id= connected accounts, for the target picker
 *   GET    API.media                      - media library, for the "pick existing media" picker
 *   GET    API.list                       - ?social_client_id=&status=&media_type=&search=&page=&per_page=
 *   GET    API.get(id)                    - full post incl. media + targets + latest analytics
 *   POST   API.list                       - create { social_client_id, title, caption, media_type, media_ids, targets }
 *   PATCH  API.update(id)                 - { title, caption }
 *   DELETE API.remove(id)
 *   POST   API.publishPost(id)            - publish every pending/scheduled/failed target now
 *   POST   API.refreshPostAnalytics(id)   - refresh insights for every published target
 *   POST   API.publishTarget(targetId)    - publish a single target now
 *   DELETE API.cancelTarget(targetId)     - cancel a pending/scheduled target
 *   POST   API.refreshTargetAnalytics(targetId)
 *
 * media_type is numeric 1-6 (TEXT/IMAGE/VIDEO/CAROUSEL/REEL/STORY), status
 * numeric 1-6 (DRAFT/SCHEDULED/PUBLISHING/PUBLISHED/FAILED/PARTIALLY_PUBLISHED),
 * target status numeric 1-6 (PENDING/SCHEDULED/PUBLISHING/PUBLISHED/FAILED/CANCELED)
 * — all per posts.service.js.
 */
(function () {
  const API = {
    clients: '/social-clients',
    accounts: '/social-accounts',
    media: '/media',
    list: '/posts',
    get: (id) => `/posts/${id}`,
    update: (id) => `/posts/${id}`,
    remove: (id) => `/posts/${id}`,
    publishPost: (id) => `/posts/${id}/publish`,
    refreshPostAnalytics: (id) => `/posts/${id}/refresh-analytics`,
    publishTarget: (targetId) => `/posts/targets/${targetId}/publish`,
    cancelTarget: (targetId) => `/posts/targets/${targetId}`,
    refreshTargetAnalytics: (targetId) => `/posts/targets/${targetId}/refresh-analytics`,
  };

  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    if (!relPath) return '';
    if (/^https?:\/\//i.test(relPath)) return relPath;
    return API_ORIGIN + relPath;
  }

  const MEDIA_TYPE_LABELS = { 1: 'Text', 2: 'Image', 3: 'Video', 4: 'Carousel', 5: 'Reel', 6: 'Story' };
  const POST_STATUS_LABELS = { 1: 'Draft', 2: 'Scheduled', 3: 'Publishing', 4: 'Published', 5: 'Failed', 6: 'Partially Published' };
  const POST_STATUS_BADGE = { 1: 'badge-gray', 2: 'badge-indigo', 3: 'badge-amber', 4: 'badge-green', 5: 'badge-coral', 6: 'badge-amber' };
  const TARGET_STATUS_LABELS = { 1: 'Pending', 2: 'Scheduled', 3: 'Publishing', 4: 'Published', 5: 'Failed', 6: 'Canceled' };
  const TARGET_STATUS_BADGE = { 1: 'badge-gray', 2: 'badge-indigo', 3: 'badge-amber', 4: 'badge-green', 5: 'badge-coral', 6: 'badge-gray' };
  const PLATFORM_COLORS = {
    facebook: '#1877F2', instagram: '#C13584', linkedin: '#0A66C2', youtube: '#FF0000',
    twitter: '#000000', pinterest: '#E60023', tiktok: '#000000', threads: '#000000',
    whatsapp: '#25D366', bluesky: '#0085FF',
  };

  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/></svg>',
    send: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M17.5 2.5 2.5 8.8l5.6 2.2 2 5.7 3-4.3M8.1 11l9.4-8.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let rows = [];
  let clients = [];
  let accountsForClient = [];
  let state = { socialClientId: '', search: '', status: '', mediaType: '', page: 1, perPage: 24 };

  // ---- Composer (create modal) working state ---------------------------
  let composer = { mediaType: 1, selectedMedia: [], mediaLibrary: [], mediaPage: 1, mediaSearch: '' };

  async function init() {
    await Admin.requireAuth();
    await loadClients();

    document.getElementById('clientSelect').addEventListener('change', async (e) => {
      state.socialClientId = e.target.value;
      state.page = 1;
      document.getElementById('btnNewPost').disabled = !state.socialClientId;
      if (state.socialClientId) await loadAccountsForClient();
      loadList();
    });
    document.getElementById('searchInput').addEventListener('input', Admin.debounce((e) => {
      state.search = e.target.value.trim(); state.page = 1; loadList();
    }, 350));
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.status = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('mediaTypeFilter').addEventListener('change', (e) => {
      state.mediaType = e.target.value; state.page = 1; loadList();
    });
    document.getElementById('btnRefreshPosts').addEventListener('click', () => loadList(true));
    document.getElementById('btnNewPost').addEventListener('click', openComposer);
  }

  async function loadClients() {
    const sel = document.getElementById('clientSelect');
    try {
      const res = await Admin.api.get(API.clients + Admin.qs({ per_page: 100, status: 1 }));
      clients = res.data.clients || [];
      sel.innerHTML = '<option value="">Select a client…</option>' +
        clients.map((c) => `<option value="${c.id}">${Admin.escapeHtml(c.businessName)}</option>`).join('');
    } catch (err) { Admin.toastError(err); }
  }

  async function loadAccountsForClient() {
    try {
      const res = await Admin.api.get(API.accounts + Admin.qs({ social_client_id: state.socialClientId, status: 1 }));
      accountsForClient = res.data.accounts || [];
    } catch (err) { Admin.toastError(err); accountsForClient = []; }
  }

  async function loadList(spin) {
    const body = document.getElementById('postsTableBody');
    const refreshBtn = document.getElementById('btnRefreshPosts');
    if (!state.socialClientId) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">Select a client above to view posts.</td></tr>';
      document.getElementById('postsCount').textContent = '0 posts';
      renderPagination(null);
      return;
    }
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading posts…</td></tr>';
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        social_client_id: state.socialClientId,
        status: state.status,
        media_type: state.mediaType,
        search: state.search,
        page: state.page,
        per_page: state.perPage,
      }));
      rows = res.data.posts || [];
      renderTable();
      renderPagination(res.meta && res.meta.pagination);
      document.getElementById('postsCount').textContent =
        `${(res.meta && res.meta.pagination && res.meta.pagination.total) ?? rows.length} post${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">Couldn\'t load posts.</td></tr>';
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('postsTableBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">No posts yet for this client.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((p) => {
      const canPublish = [1, 2, 5, 6].includes(p.status);
      return `
        <tr data-id="${p.id}">
          <td>
            <strong>${Admin.escapeHtml(p.title || '(untitled)')}</strong>
            <div class="cell-muted" style="font-size:12px;margin-top:2px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Admin.escapeHtml(p.caption || '')}</div>
          </td>
          <td><span class="badge-outline">${MEDIA_TYPE_LABELS[p.mediaType] || '—'}</span></td>
          <td><span class="count-pill-soft">${p.publishedCount ?? 0} / ${p.targetCount ?? 0}</span></td>
          <td><span class="badge ${POST_STATUS_BADGE[p.status] || 'badge-gray'}"><span class="badge-dot"></span>${POST_STATUS_LABELS[p.status] || 'Unknown'}</span></td>
          <td class="cell-muted">${Admin.formatDate(p.createdAt)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View / manage">${ICON.view}</button>
            ${canPublish ? `<button class="icon-action icon-action-toggle" data-act="publish" title="Publish now">${ICON.send}</button>` : ''}
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const p = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="view"]')?.addEventListener('click', () => openDetailModal(p.id));
      tr.querySelector('[data-act="publish"]')?.addEventListener('click', () => publishPost(p));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removePost(p));
    });
  }

  function renderPagination(pagination) {
    const el = document.getElementById('postsPagination');
    if (!pagination) { el.innerHTML = ''; return; }
    const { page, perPage, total, pages } = pagination;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    el.innerHTML = `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" id="postPrev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page}</span>
        <button class="btn btn-secondary btn-sm" id="postNext" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    document.getElementById('postPrev')?.addEventListener('click', () => { state.page--; loadList(); });
    document.getElementById('postNext')?.addEventListener('click', () => { state.page++; loadList(); });
  }

  // ---- List row actions ------------------------------------------------

  async function publishPost(p) {
    const ok = await Admin.confirmAction({
      title: 'Publish now?',
      body: `Publish every pending/scheduled target of <strong>${Admin.escapeHtml(p.title || 'this post')}</strong> right now, ignoring their scheduled time?`,
      confirmLabel: 'Publish now',
    });
    if (!ok) return;
    try {
      const res = await Admin.api.post(API.publishPost(p.id));
      const failed = (res.data.outcomes || []).filter((o) => !o.ok).length;
      Admin.toast(failed ? `Published with ${failed} failure(s) — check target errors` : 'Published', failed ? 'error' : 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removePost(p) {
    const ok = await Admin.confirmAction({
      title: 'Delete post?',
      body: `Delete <strong>${Admin.escapeHtml(p.title || 'this post')}</strong>? Pending/scheduled targets will be canceled. This can't be undone.`,
      confirmLabel: 'Delete post',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.remove(p.id));
      Admin.toast('Post deleted', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ======================================================================
  // Composer (create) modal — tabbed: Content / Media / Targets & Schedule
  // ======================================================================

  function openComposer() {
    if (!state.socialClientId) { Admin.toast('Select a client first', 'error'); return; }
    composer = { mediaType: 1, selectedMedia: [], mediaLibrary: [], mediaPage: 1, mediaSearch: '' };

    Admin.openModal(`
      <div class="modal-header"><h3>New Post</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="tabs" id="postTabs">
        <button type="button" class="tab-btn is-active" data-tab="content">Content</button>
        <button type="button" class="tab-btn" data-tab="media">Media</button>
        <button type="button" class="tab-btn" data-tab="targets">Targets &amp; Schedule</button>
      </div>
      <form id="postForm">
        <div class="modal-body">
          <div id="postFormErrors"></div>

          <div class="tab-panel is-active" data-panel="content">
            <div class="form-group">
              <label for="f-title">Title <span class="hint" style="display:inline;">(internal reference, not posted)</span></label>
              <input type="text" id="f-title" placeholder="e.g. Diwali sale announcement">
            </div>
            <div class="form-group">
              <label for="f-caption">Caption</label>
              <textarea id="f-caption" style="min-height:120px;" placeholder="What do you want to say?"></textarea>
            </div>
            <div class="form-group">
              <label for="f-media-type">Media Type</label>
              <select id="f-media-type">
                ${Object.entries(MEDIA_TYPE_LABELS).map(([v, l]) => `<option value="${v}" ${Number(v) === 1 ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
              <p class="hint">Text posts don't need media. Any other type needs at least one item picked in the Media tab.</p>
            </div>
          </div>

          <div class="tab-panel" data-panel="media">
            <div class="flex-gap" style="margin-bottom:12px;">
              <input type="search" id="mediaSearchInput" placeholder="Search media library..." style="flex:1;min-width:200px;">
            </div>
            <div id="selectedMediaStrip" class="flex-gap" style="margin-bottom:12px;"></div>
            <div class="media-grid" id="mediaPickerGrid" style="padding:0;max-height:320px;overflow-y:auto;"></div>
            <div class="flex-gap" style="justify-content:center;margin-top:12px;">
              <button type="button" class="btn btn-secondary btn-sm" id="mediaLoadMore">Load more</button>
            </div>
          </div>

          <div class="tab-panel" data-panel="targets">
            <div class="form-group">
              <label>Target Accounts <span style="color:var(--coral);">*</span></label>
              <div id="targetAccountList" class="flex-gap" style="align-items:stretch;"></div>
              ${!accountsForClient.length ? '<p class="hint">No active connected accounts for this client yet — connect one on the Connected Accounts page first.</p>' : ''}
            </div>
            <div class="form-group">
              <label class="checkbox-row">
                <input type="checkbox" id="f-schedule-toggle">
                <span>Schedule for later (otherwise queued to publish immediately when you hit Publish)</span>
              </label>
              <input type="datetime-local" id="f-schedule-at" style="display:none;margin-top:8px;">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="postFormSubmit">Create Post</button>
        </div>
      </form>
    `);
    wireComposer();
  }

  function wireComposer() {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    backdrop.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('is-active'));
        backdrop.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('is-active'));
        btn.classList.add('is-active');
        backdrop.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('is-active');
        if (btn.dataset.tab === 'media' && !composer.mediaLibrary.length) loadMediaPicker(true);
      });
    });

    document.getElementById('f-schedule-toggle').addEventListener('change', (e) => {
      document.getElementById('f-schedule-at').style.display = e.target.checked ? 'block' : 'none';
    });

    renderTargetAccountList();

    document.getElementById('mediaSearchInput').addEventListener('input', Admin.debounce((e) => {
      composer.mediaSearch = e.target.value.trim();
      loadMediaPicker(true);
    }, 350));
    document.getElementById('mediaLoadMore').addEventListener('click', () => loadMediaPicker(false));

    document.getElementById('postForm').addEventListener('submit', submitComposer);
  }

  function renderTargetAccountList() {
    const el = document.getElementById('targetAccountList');
    if (!el) return;
    if (!accountsForClient.length) { el.innerHTML = ''; return; }
    el.innerHTML = accountsForClient.map((a) => `
      <label class="checkbox-row" style="border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 12px;width:100%;">
        <input type="checkbox" class="target-account-checkbox" value="${a.id}">
        <span class="platform-chip" style="--pchip:${PLATFORM_COLORS[a.platform] || '#666'}">${Admin.escapeHtml(a.platform)}</span>
        <span>${Admin.escapeHtml(a.accountName || a.accountUsername || 'Account #' + a.id)}</span>
      </label>
    `).join('');
  }

  async function loadMediaPicker(reset) {
    if (reset) { composer.mediaPage = 1; composer.mediaLibrary = []; }
    const grid = document.getElementById('mediaPickerGrid');
    if (reset) grid.innerHTML = '<p class="hint">Loading…</p>';
    try {
      const res = await Admin.api.get(API.media + Admin.qs({ search: composer.mediaSearch, page: composer.mediaPage, per_page: 24 }));
      const items = res.data.items || [];
      composer.mediaLibrary = reset ? items : composer.mediaLibrary.concat(items);
      renderMediaPickerGrid();
      composer.mediaPage++;
    } catch (err) { Admin.toastError(err); }
  }

  function renderMediaPickerGrid() {
    const grid = document.getElementById('mediaPickerGrid');
    if (!composer.mediaLibrary.length) { grid.innerHTML = '<p class="hint">No media found.</p>'; return; }
    grid.innerHTML = composer.mediaLibrary.map((m) => {
      const isSelected = composer.selectedMedia.some((s) => s.mediaId === m.mediaId);
      return `
        <div class="media-tile gallery-tile ${isSelected ? 'is-selected' : ''}" data-id="${m.mediaId}" style="cursor:pointer;${isSelected ? 'outline:2px solid var(--indigo);' : ''}">
          <img class="media-thumb" src="${assetUrl(m.thumbnailPath || m.filePath)}" alt="${Admin.escapeHtml(m.altText || '')}" loading="lazy">
          <div class="media-tile-body">
            <div class="media-tile-title">${Admin.escapeHtml(m.title || m.originalName || 'Untitled')}</div>
          </div>
        </div>
      `;
    }).join('');
    grid.querySelectorAll('.media-tile').forEach((tile) => {
      tile.addEventListener('click', () => toggleMediaSelection(Number(tile.dataset.id)));
    });
  }

  function toggleMediaSelection(mediaId) {
    const idx = composer.selectedMedia.findIndex((s) => s.mediaId === mediaId);
    if (idx >= 0) {
      composer.selectedMedia.splice(idx, 1);
    } else {
      const item = composer.mediaLibrary.find((m) => m.mediaId === mediaId);
      if (item) composer.selectedMedia.push(item);
    }
    renderMediaPickerGrid();
    renderSelectedMediaStrip();
  }

  function renderSelectedMediaStrip() {
    const el = document.getElementById('selectedMediaStrip');
    if (!el) return;
    if (!composer.selectedMedia.length) { el.innerHTML = '<p class="hint">No media selected yet.</p>'; return; }
    el.innerHTML = composer.selectedMedia.map((m, i) => `
      <span class="badge-outline" style="display:inline-flex;align-items:center;gap:6px;">
        #${i + 1} ${Admin.escapeHtml(m.title || m.originalName || 'Untitled')}
        <button type="button" data-remove="${m.mediaId}" style="border:none;background:none;cursor:pointer;color:var(--coral);font-weight:700;">&times;</button>
      </span>
    `).join('');
    el.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => toggleMediaSelection(Number(btn.dataset.remove)));
    });
  }

  async function submitComposer(e) {
    e.preventDefault();
    const errBox = document.getElementById('postFormErrors');
    errBox.innerHTML = '';

    const mediaType = Number(document.getElementById('f-media-type').value);
    const scheduleOn = document.getElementById('f-schedule-toggle').checked;
    const scheduleAtRaw = document.getElementById('f-schedule-at').value;
    const accountIds = Array.from(document.querySelectorAll('.target-account-checkbox:checked')).map((cb) => Number(cb.value));

    const errors = [];
    if (mediaType !== 1 && !composer.selectedMedia.length) errors.push('Pick at least one media item for a non-text post');
    if (!accountIds.length) errors.push('Select at least one target account');
    if (scheduleOn && !scheduleAtRaw) errors.push('Pick a date/time or turn off scheduling');
    if (errors.length) {
      errBox.innerHTML = `<div class="form-errors"><ul>${errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul></div>`;
      return;
    }

    const scheduledAt = scheduleOn ? new Date(scheduleAtRaw).toISOString() : null;

    const payload = {
      social_client_id: Number(state.socialClientId),
      title: document.getElementById('f-title').value.trim(),
      caption: document.getElementById('f-caption').value.trim(),
      media_type: mediaType,
      media_ids: composer.selectedMedia.map((m) => m.mediaId),
      targets: accountIds.map((accountId) => ({ account_id: accountId, scheduled_at: scheduledAt })),
    };

    const btn = document.getElementById('postFormSubmit');
    Admin.setButtonLoading(btn, true, 'Creating…');
    try {
      await Admin.api.post(API.list, payload);
      Admin.toast('Post created', 'success');
      Admin.closeModal();
      loadList();
    } catch (err) {
      errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
        err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
      }</div>`;
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  // ======================================================================
  // Detail / manage modal — targets + per-target publish/cancel/analytics
  // ======================================================================

  async function openDetailModal(id) {
    Admin.openModal(`
      <div class="modal-header"><h3>Post Details</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="postDetailBody"><div class="flex-gap"><span class="spinner spinner-dark"></span> Loading…</div></div>
      <div class="modal-footer" id="postDetailFooter"></div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    await renderDetail(id);
  }

  async function renderDetail(id) {
    try {
      const res = await Admin.api.get(API.get(id));
      const post = res.data.post;
      const body = document.getElementById('postDetailBody');
      const footer = document.getElementById('postDetailFooter');
      if (!body) return;

      body.innerHTML = `
        <div class="flex-gap" style="margin-bottom:12px;">
          <span class="badge ${POST_STATUS_BADGE[post.status] || 'badge-gray'}"><span class="badge-dot"></span>${POST_STATUS_LABELS[post.status] || 'Unknown'}</span>
          <span class="badge-outline">${MEDIA_TYPE_LABELS[post.mediaType] || '—'}</span>
        </div>
        <h3 style="margin-bottom:6px;">${Admin.escapeHtml(post.title || '(untitled)')}</h3>
        <p style="color:var(--text-muted);font-size:13.5px;white-space:pre-wrap;">${Admin.escapeHtml(post.caption || '')}</p>
        ${post.media && post.media.length ? `
          <div class="media-grid" style="padding:0;margin:14px 0;">
            ${post.media.map((m) => `<div class="media-tile"><img class="media-thumb" src="${assetUrl(m.thumbnailPath || m.filePath)}" alt=""></div>`).join('')}
          </div>
        ` : ''}
        <h4 style="margin:18px 0 10px;font-size:13.5px;">Targets</h4>
        <div class="table-wrap" style="border:1px solid var(--line-soft);border-radius:var(--radius-md);">
          <table>
            <thead><tr><th>Platform</th><th>Account</th><th>Status</th><th>Scheduled / Published</th><th>Analytics</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody>
              ${post.targets.map((t) => renderTargetRow(t)).join('')}
            </tbody>
          </table>
        </div>
      `;

      footer.innerHTML = `
        <button type="button" class="btn btn-secondary" data-act="refresh-analytics">Refresh All Analytics</button>
        <button type="button" class="btn btn-primary" data-act="publish-all">Publish Due Targets Now</button>
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      `;
      footer.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
      footer.querySelector('[data-act="publish-all"]').addEventListener('click', async () => {
        try {
          const r = await Admin.api.post(API.publishPost(id));
          const failed = (r.data.outcomes || []).filter((o) => !o.ok).length;
          Admin.toast(failed ? `Published with ${failed} failure(s)` : 'Published', failed ? 'error' : 'success');
          renderDetail(id);
          loadList();
        } catch (err) { Admin.toastError(err); }
      });
      footer.querySelector('[data-act="refresh-analytics"]').addEventListener('click', async () => {
        try {
          await Admin.api.post(API.refreshPostAnalytics(id));
          Admin.toast('Analytics refreshed', 'success');
          renderDetail(id);
        } catch (err) { Admin.toastError(err); }
      });

      body.querySelectorAll('[data-target-act]').forEach((btn) => {
        const targetId = Number(btn.dataset.targetId);
        const act = btn.dataset.targetAct;
        btn.addEventListener('click', async () => {
          try {
            if (act === 'publish') await Admin.api.post(API.publishTarget(targetId));
            if (act === 'cancel') await Admin.api.del(API.cancelTarget(targetId));
            if (act === 'refresh') await Admin.api.post(API.refreshTargetAnalytics(targetId));
            Admin.toast('Done', 'success');
            renderDetail(id);
            loadList();
          } catch (err) { Admin.toastError(err); }
        });
      });
    } catch (err) {
      Admin.toastError(err);
      Admin.closeModal();
    }
  }

  function renderTargetRow(t) {
    const analytics = t.latestAnalytics;
    const canPublish = [1, 2, 5].includes(t.status);
    const canCancel = [1, 2].includes(t.status);
    const canRefresh = t.status === 4;
    return `
      <tr>
        <td><span class="platform-chip" style="--pchip:${PLATFORM_COLORS[t.platform] || '#666'}">${Admin.escapeHtml(t.platform)}</span></td>
        <td>
          <div>${Admin.escapeHtml(t.accountName || t.accountUsername || '—')}</div>
          ${t.errorMessage ? `<div class="cell-muted" style="font-size:11px;color:var(--coral);">${Admin.escapeHtml(t.errorMessage)}</div>` : ''}
          ${t.platformPostUrl ? `<a href="${assetUrl(t.platformPostUrl)}" target="_blank" rel="noopener" style="font-size:11.5px;">View live post</a>` : ''}
        </td>
        <td><span class="badge ${TARGET_STATUS_BADGE[t.status] || 'badge-gray'}"><span class="badge-dot"></span>${TARGET_STATUS_LABELS[t.status] || 'Unknown'}</span></td>
        <td class="cell-muted">${t.publishedAt ? Admin.formatDate(t.publishedAt) : (t.scheduledAt ? Admin.formatDate(t.scheduledAt) : '—')}</td>
        <td class="cell-muted">${analytics ? `❤ ${analytics.likes} · 💬 ${analytics.comments} · ↗ ${analytics.shares} · 👁 ${analytics.views}` : '—'}</td>
        <td class="cell-actions">
          ${canPublish ? `<button type="button" class="icon-action icon-action-toggle" data-target-act="publish" data-target-id="${t.id}" title="Publish now">${ICON.send}</button>` : ''}
          ${canCancel ? `<button type="button" class="icon-action icon-action-delete" data-target-act="cancel" data-target-id="${t.id}" title="Cancel">${ICON.trash}</button>` : ''}
          ${canRefresh ? `<button type="button" class="icon-action icon-action-edit" data-target-act="refresh" data-target-id="${t.id}" title="Refresh analytics">${ICON.refresh}</button>` : ''}
        </td>
      </tr>
    `;
  }

  init();
})();
