/**
 * calendar.js — Calendar page (maps to /calendar): month grid of scheduled
 * + published posts across every connected account, filterable by client.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/posts/v1/posts.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET API.clients               - social clients, for the selector
 *   GET API.calendar(clientId, month, year) - { items, byDate } for that month
 *   GET API.accounts(clientId)     - connected accounts for a client, used by the Sync button
 *   POST API.syncPosts(accountId)  - pulls that account's recent posts straight from the platform
 *   PATCH API.updateSyncedPost(accountId, platformPostId) - { caption } - only works when the item's isEditable is true
 *
 * mediaType is numeric 1-6, target status numeric 1-6 (PENDING/SCHEDULED/
 * PUBLISHING/PUBLISHED/FAILED/CANCELED) — see posts.service.js formatCalendarItem.
 * Items with isNative:true came from social_synced_posts (published
 * directly on the platform, not through this app) - they have no targetId
 * and only support editing when isEditable is also true.
 */
(function () {
  const API = {
    clients: '/social-clients',
    calendar: (socialClientId, month, year) => `/posts/calendar${Admin.qs({ social_client_id: socialClientId || undefined, month, year })}`,
    accounts: (socialClientId) => `/social-accounts${Admin.qs({ social_client_id: socialClientId, status: 1 })}`,
    syncPosts: (accountId) => `/social-accounts/${accountId}/sync-posts`,
    updateSyncedPost: (accountId, platformPostId) => `/social-accounts/${accountId}/synced-posts/${encodeURIComponent(platformPostId)}`,
  };

  const PLATFORM_COLORS = {
    facebook: '#1877F2', instagram: '#C13584', linkedin: '#0A66C2', youtube: '#FF0000',
    twitter: '#000000', pinterest: '#E60023', tiktok: '#000000', threads: '#000000',
    whatsapp: '#25D366', bluesky: '#0085FF',
  };

  const TARGET_STATUS_BADGE = { 1: 'badge-gray', 2: 'badge-indigo', 3: 'badge-amber', 4: 'badge-green', 5: 'badge-coral', 6: 'badge-gray' };
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MAX_ITEMS_PER_CELL = 3;

  let clients = [];
  let byDate = {};
  const today = new Date();
  let view = { socialClientId: '', month: today.getMonth() + 1, year: today.getFullYear() };

  async function init() {
    await Admin.requireAuth();
    await loadClients();

    document.getElementById('clientSelect').addEventListener('change', (e) => {
      view.socialClientId = e.target.value;
      loadCalendar();
    });
    document.getElementById('btnPrevMonth').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('btnNextMonth').addEventListener('click', () => shiftMonth(1));
    document.getElementById('btnToday').addEventListener('click', () => {
      view.month = today.getMonth() + 1;
      view.year = today.getFullYear();
      loadCalendar();
    });
    document.getElementById('btnRefreshCalendar').addEventListener('click', () => loadCalendar());
    document.getElementById('btnSyncPosts').addEventListener('click', syncAllAccounts);

    loadCalendar();
  }

  // Syncs every connected account under the selected client (pulls each
  // account's recent posts straight from the platform into
  // social_synced_posts), then reloads the month. Requires a specific
  // client to be picked - "All clients" is disabled for this since it could
  // mean syncing dozens of accounts across every client in one click.
  async function syncAllAccounts() {
    const btn = document.getElementById('btnSyncPosts');
    if (!view.socialClientId) {
      Admin.toast('Pick a specific client first to sync its accounts', 'error');
      return;
    }
    Admin.setButtonLoading(btn, true, 'Syncing…');
    try {
      const res = await Admin.api.get(API.accounts(view.socialClientId));
      const accounts = res.data.accounts || [];
      let synced = 0;
      let skipped = 0;
      for (const acc of accounts) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await Admin.api.post(API.syncPosts(acc.id), {});
          synced++;
        } catch (err) {
          skipped++; // e.g. platform doesn't support syncing (WhatsApp) - not a real failure
        }
      }
      Admin.toast(`Synced ${synced} account(s)${skipped ? `, skipped ${skipped}` : ''}`, 'success');
      loadCalendar();
    } catch (err) {
      Admin.toastError(err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  function shiftMonth(delta) {
    let m = view.month + delta;
    let y = view.year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    view.month = m;
    view.year = y;
    loadCalendar();
  }

  async function loadClients() {
    const sel = document.getElementById('clientSelect');
    try {
      const res = await Admin.api.get(API.clients + Admin.qs({ per_page: 100, status: 1 }));
      clients = res.data.clients || [];
      sel.innerHTML = '<option value="">All clients</option>' +
        clients.map((c) => `<option value="${c.id}">${Admin.escapeHtml(c.businessName)}</option>`).join('');
    } catch (err) { Admin.toastError(err); }
  }

  async function loadCalendar() {
    document.getElementById('monthLabel').textContent = `${MONTH_NAMES[view.month - 1]} ${view.year}`;
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '<div class="table-empty" style="padding:40px;grid-column:1/-1;">Loading…</div>';
    try {
      const res = await Admin.api.get(API.calendar(view.socialClientId, view.month, view.year));
      byDate = res.data.byDate || {};
      renderGrid();
    } catch (err) {
      Admin.toastError(err);
      grid.innerHTML = '<div class="table-empty" style="padding:40px;grid-column:1/-1;">Failed to load calendar.</div>';
    }
  }

  function dateKey(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function renderGrid() {
    const grid = document.getElementById('calendarGrid');
    const firstOfMonth = new Date(view.year, view.month - 1, 1);
    const startWeekday = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(view.year, view.month, 0).getDate();
    const daysInPrevMonth = new Date(view.year, view.month - 1, 0).getDate();
    const isCurrentMonthToday = view.month === today.getMonth() + 1 && view.year === today.getFullYear();

    const cells = [];
    // Leading days from previous month, to fill the first week.
    for (let i = startWeekday - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, outside: true, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, outside: false, dateStr: dateKey(view.year, view.month, d), isToday: isCurrentMonthToday && d === today.getDate() });
    }
    // Trailing days to complete the last week (grid = 7 columns).
    let trailing = 1;
    while (cells.length % 7 !== 0) { cells.push({ day: trailing++, outside: true, dateStr: null }); }

    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdaysHtml = weekdayLabels.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');

    const cellsHtml = cells.map((c) => {
      const items = c.dateStr ? (byDate[c.dateStr] || []) : [];
      const visible = items.slice(0, MAX_ITEMS_PER_CELL);
      const extra = items.length - visible.length;
      const itemsHtml = visible.map((item) => `
        <div class="calendar-item ${item.isNative ? 'is-native' : ''}" data-item-key="${itemKey(item)}" style="--pchip:${PLATFORM_COLORS[item.platform] || '#666'}" title="${Admin.escapeHtml((item.isNative ? '[Native] ' : '') + (item.title || item.caption || item.platform))}">
          ${Admin.escapeHtml(item.title || item.caption || item.accountName || item.platform)}
        </div>
      `).join('');
      const moreHtml = extra > 0 ? `<div class="calendar-item-more" data-date="${c.dateStr}">+${extra} more</div>` : '';

      return `
        <div class="calendar-day ${c.outside ? 'is-outside' : ''} ${c.isToday ? 'is-today' : ''}" ${c.dateStr ? `data-date="${c.dateStr}"` : ''}>
          <div class="calendar-day-num">${c.day}</div>
          <div class="calendar-day-items">${itemsHtml}${moreHtml}</div>
        </div>
      `;
    }).join('');

    grid.innerHTML = weekdaysHtml + cellsHtml;

    grid.querySelectorAll('.calendar-item').forEach((el) => {
      el.addEventListener('click', () => openItemDetail(el.dataset.itemKey));
    });
    grid.querySelectorAll('.calendar-item-more, .calendar-day').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.calendar-item')) return; // let the item's own handler fire
        const date = el.dataset.date;
        if (date) openDayList(date);
      });
    });
  }

  // Own (scheduler) items have a real targetId; native/synced items don't,
  // so they're keyed by accountId+platformPostId instead. Same key format
  // is used in HTML data-attributes and for lookups in findItem().
  function itemKey(item) {
    return item.isNative ? `s:${item.accountId}:${item.platformPostId}` : `t:${item.targetId}`;
  }

  function findItem(key) {
    for (const date in byDate) {
      const found = byDate[date].find((i) => itemKey(i) === key);
      if (found) return found;
    }
    return null;
  }

  function openDayList(dateStr) {
    const items = byDate[dateStr] || [];
    const label = new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    Admin.openModal(`
      <div class="modal-header"><h3>${Admin.escapeHtml(label)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="calendar-day-list">
          ${items.length ? items.map((item) => `
            <div class="calendar-day-list-row" data-item-key="${itemKey(item)}" style="cursor:pointer;">
              <span class="platform-chip" style="--pchip:${PLATFORM_COLORS[item.platform] || '#666'}">${Admin.escapeHtml(item.platform)}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:650;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.isNative ? '<span class="hint" style="margin-right:4px;">[Native]</span>' : ''}${Admin.escapeHtml(item.title || item.caption || '(no caption)')}</div>
                <div style="font-size:11.5px;color:var(--text-faint);margin-top:2px;">${Admin.escapeHtml(item.accountName || item.accountUsername || '')} · ${item.effectiveAt ? new Date(item.effectiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
              </div>
              <span class="badge ${TARGET_STATUS_BADGE[item.targetStatus] || 'badge-gray'}">${Admin.escapeHtml(item.targetStatusLabel || '')}</span>
            </div>
          `).join('') : '<p class="hint">No posts on this date.</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelectorAll('.calendar-day-list-row').forEach((row) => {
      row.addEventListener('click', () => openItemDetail(row.dataset.itemKey));
    });
  }

  function openItemDetail(key) {
    const item = findItem(key);
    if (!item) return;

    Admin.openModal(`
      <div class="modal-header"><h3>Post details</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span class="platform-chip" style="--pchip:${PLATFORM_COLORS[item.platform] || '#666'}">${Admin.escapeHtml(item.platform)}</span>
          ${item.isNative
            ? `<span class="badge badge-indigo">Native (not from this app)</span>`
            : `<span class="badge ${TARGET_STATUS_BADGE[item.targetStatus] || 'badge-gray'}">${Admin.escapeHtml(item.targetStatusLabel || '')}</span>`}
        </div>
        ${item.title ? `<p style="font-weight:650;margin:0 0 6px;">${Admin.escapeHtml(item.title)}</p>` : ''}
        ${item.isNative && item.isEditable ? `
          <div class="form-group">
            <label for="itemCaptionEdit">Caption</label>
            <textarea id="itemCaptionEdit" rows="3">${Admin.escapeHtml(item.caption || '')}</textarea>
            <p class="hint">Saving updates this directly on ${Admin.escapeHtml(item.platform)}.</p>
          </div>
        ` : item.caption ? `<p style="white-space:pre-wrap;color:var(--text-muted);font-size:13px;margin:0 0 12px;">${Admin.escapeHtml(item.caption)}</p>` : ''}
        ${item.isNative && !item.isEditable ? `<p class="hint" style="margin-bottom:12px;">${Admin.escapeHtml(item.platform)} doesn't support editing posts after they're published — view only.</p>` : ''}
        <div class="form-row">
          <div class="form-group"><label>Account</label><p style="margin:0;font-size:13px;">${Admin.escapeHtml(item.accountName || item.accountUsername || '—')}</p></div>
          <div class="form-group"><label>Media type</label><p style="margin:0;font-size:13px;">${Admin.escapeHtml(item.mediaTypeLabel || '—')}</p></div>
        </div>
        ${!item.isNative ? `
        <div class="form-row">
          <div class="form-group"><label>Scheduled at</label><p style="margin:0;font-size:13px;">${item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '—'}</p></div>
          <div class="form-group"><label>Published at</label><p style="margin:0;font-size:13px;">${item.publishedAt ? new Date(item.publishedAt).toLocaleString() : '—'}</p></div>
        </div>` : `
        <div class="form-group"><label>Published at</label><p style="margin:0;font-size:13px;">${item.publishedAt ? new Date(item.publishedAt).toLocaleString() : '—'}</p></div>`}
        ${item.platformPostUrl ? `<a href="${Admin.escapeHtml(item.platformPostUrl)}" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-top:8px;">View on ${Admin.escapeHtml(item.platform)}</a>` : ''}
        <div id="itemDetailErrors"></div>
      </div>
      <div class="modal-footer">
        ${!item.isNative ? '<a href="posts.php" class="btn btn-secondary">Open in Posts</a>' : ''}
        ${item.isNative && item.isEditable ? '<button type="button" class="btn btn-primary" id="btnSaveCaption">Save</button>' : ''}
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    const saveBtn = document.getElementById('btnSaveCaption');
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        const errBox = document.getElementById('itemDetailErrors');
        errBox.innerHTML = '';
        const caption = document.getElementById('itemCaptionEdit').value;
        Admin.setButtonLoading(e.target, true, 'Saving…');
        try {
          await Admin.api.patch(API.updateSyncedPost(item.accountId, item.platformPostId), { caption });
          Admin.toast('Post updated', 'success');
          Admin.closeModal();
          loadCalendar();
        } catch (err) {
          errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
        } finally {
          Admin.setButtonLoading(e.target, false);
        }
      });
    }
  }

  init();
})();
