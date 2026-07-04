/**
 * webpush.js — Web Push Notifications page (maps to /webpush).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY; nothing
 * else in this file should hardcode a URL. Keep this in sync with:
 *   Node API: src/api/v1/index.js, src/domains/webpush/webpush.routes.js
 * ---------------------------------------------------------------------------
 *
 * Subscribers tab:
 *   GET API.stats, GET API.subscriptions, GET API.usertypes
 *   POST API.unsubscribe (admin override — removes one row's endpoint)
 *
 * Send Notification tab:
 *   GET  API.usertypes, API.userIds, API.emails
 *   POST API.sendToUser, API.sendToUsers, API.broadcast
 *
 * My Device tab (this browser's own subscription):
 *   POST API.subscribe, POST API.unsubscribe (scope=endpoint, self)
 *   Uses the browser Push API + /sw.js service worker. Needs window.VAPID_PUBLIC_KEY
 *   (set in header.php from app/config/config.php).
 */
(function () {
  const API = {
    usertypes: '/webpush/user-types',          // GET  - distinct user types that currently have subscriptions

    stats: '/webpush/stats',                   // GET  - overall + by-usertype delivery stats
    subscriptions: '/webpush/subscriptions',   // GET  - paginated subscriber list (?userType, ?userId, ?page, ?perPage)
    unsubscribe: '/webpush/unsubscribe',       // POST - remove a subscription (admin override / self / guest-by-email)
    subscribe: '/webpush/subscribe',           // POST - register this browser's push subscription (authenticated)
    emails: '/webpush/emails',                 // GET  - distinct guest emails with a subscription (targeting guests)
    userIds: '/webpush/user-ids',              // GET  - distinct registered user IDs with a subscription
    sendToUser: '/webpush/send-to-user',       // POST - single-target send
    sendToUsers: '/webpush/send-to-users',     // POST - multi-target send
    broadcast: '/webpush/broadcast',           // POST - send to all (optionally filtered by userType)
  };

  const GUEST_TYPES = ['guest', 'anonymous'];
  // Guest/Anonymous subscribers might not show up in API.usertypes yet (that
  // endpoint only returns types with an EXISTING subscription) - append them
  // manually so the admin can always target/filter by guest or anonymous.
  const GUEST_OPTIONS = ['guest', 'anonymous'];

  // Shared loader: /webpush/user-types (distinct types with subscriptions) +
  // guest/anonymous. Cached at module scope since both Subscribers and Send
  // tabs need it. Returns a flat array of lowercase type strings.
  let usertypesPromise = null;
  function loadUsertypeOptions() {
    if (!usertypesPromise) {
      usertypesPromise = Admin.api.get(API.usertypes)
        .then((res) => {
          const fromApi = res.data || [];
          const merged = fromApi.slice();
          GUEST_OPTIONS.forEach((g) => { if (!merged.includes(g)) merged.push(g); });
          return merged;
        })
        .catch((err) => { usertypesPromise = null; throw err; });
    }
    return usertypesPromise;
  }

  // Cosmetic only — dropdown VALUE stays exactly as returned by the API
  // (e.g. "superadmin"); this just capitalizes the visible label.
  function formatTypeLabel(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  // ============================= Tabs ====================================
  function initTabs() {
    document.querySelectorAll('.tabstrip-btn').forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
    const initial = ['send', 'device'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'subscribers';
    activateTab(initial);
  }
  let sendLoaded = false, deviceLoaded = false;
  function activateTab(name) {
    document.querySelectorAll('.tabstrip-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
    history.replaceState(null, '', name === 'subscribers' ? location.pathname : `#${name}`);
    if (name === 'send' && !sendLoaded) { sendLoaded = true; Send.init(); }
    if (name === 'device' && !deviceLoaded) { deviceLoaded = true; Device.init(); }
  }

  // ============================= Subscribers ==============================
  const Subscribers = (function () {
    let state = { page: 1, perPage: 20, userType: '', userId: '' };
    let userTypesCache = [];

    function init() {
      document.getElementById('btnRefreshWebpush').addEventListener('click', () => { loadStats(); loadList(); });
      document.getElementById('subTypeFilter').addEventListener('change', (e) => { state.userType = e.target.value; state.page = 1; loadList(); });
      document.getElementById('subUserIdFilter').addEventListener('input', Admin.debounce((e) => {
        state.userId = e.target.value.trim(); state.page = 1; loadList();
      }, 350));

      loadUserTypes();
      loadStats();
      loadList();
    }

    async function loadUserTypes() {
      try {
        userTypesCache = await loadUsertypeOptions();
        const sel = document.getElementById('subTypeFilter');
        sel.innerHTML = `<option value="">All types</option>` + userTypesCache.map((t) => `<option value="${Admin.escapeHtml(t)}">${Admin.escapeHtml(formatTypeLabel(t))}</option>`).join('');
      } catch (err) { /* non-fatal — filters just stay empty */ }
    }

    async function loadStats() {
      try {
        const res = await Admin.api.get(API.stats);
        const { overall, byUserType } = res.data;
        document.getElementById('statTotal').textContent = overall.subscriptions.total;
        document.getElementById('statUnique').textContent = overall.subscriptions.uniqueUsers;
        document.getElementById('statSent').textContent = overall.delivery.sent;
        document.getElementById('statRemoved').textContent = overall.subscriptions.inactive;

        const byTypeCard = document.getElementById('byTypeCard');
        if (byUserType && byUserType.length) {
          byTypeCard.style.display = '';
          document.getElementById('byTypeTableBody').innerHTML = byUserType.map((row) => `
            <tr>
              <td><span class="badge badge-indigo">${Admin.escapeHtml(row.userType)}</span></td>
              <td>${row.subscriptions.active}</td>
              <td>${row.subscriptions.inactive}</td>
              <td>${row.subscriptions.uniqueUsers}</td>
              <td>${row.delivery.sent}</td>
              <td>${row.delivery.failed}</td>
              <td>${row.delivery.successRate}%</td>
            </tr>`).join('');
        } else {
          byTypeCard.style.display = 'none';
        }
      } catch (err) { Admin.toastError(err); }
    }

    async function loadList() {
      const tbody = document.getElementById('subsTableBody');
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Loading subscriptions…</td></tr>`;
      try {
        const query = Admin.qs({ userType: state.userType, userId: state.userId, page: state.page, perPage: state.perPage });
        const res = await Admin.api.get(API.subscriptions + query);
        renderRows(res.data);
        renderPagination(res.meta && res.meta.pagination);
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Couldn't load subscriptions.</td></tr>`;
        Admin.toastError(err);
      }
    }

    function renderRows(rows) {
      const tbody = document.getElementById('subsTableBody');
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">No active subscribers found.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map((r, i) => `
        <tr data-endpoint="${Admin.escapeHtml(r.endpoint)}">
          <td>${(state.page - 1) * state.perPage + i + 1}</td>
          <td>${r.userId ?? '—'}</td>
          <td>${Admin.escapeHtml(r.email || '—')}</td>
          <td><span class="badge badge-indigo">${Admin.escapeHtml(r.userType)}</span></td>
          <td class="mono-cell" title="${Admin.escapeHtml(r.endpoint)}">${Admin.escapeHtml(r.endpoint.slice(0, 42))}…</td>
          <td class="mono-cell" title="${Admin.escapeHtml(r.userAgent || '')}">${Admin.escapeHtml((r.userAgent || '—').slice(0, 28))}</td>
          <td>${Admin.formatDate(r.createdAt)}</td>
          <td>${Admin.formatDate(r.updatedAt)}</td>
          <td>${Admin.badge(r.isActive)}</td>
          <td style="text-align:right;"><button class="btn btn-danger btn-sm" data-act="remove">Remove</button></td>
        </tr>`).join('');

      tbody.querySelectorAll('[data-act="remove"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const tr = e.target.closest('tr');
          const row = rows.find((r) => r.endpoint === tr.dataset.endpoint);
          removeSubscription(row);
        });
      });
    }

    function renderPagination(pagination) {
      const el = document.getElementById('subsPagination');
      if (!pagination) { el.innerHTML = ''; return; }
      const { page, perPage, total, pages } = pagination;
      el.innerHTML = `
        <span>Total: ${total}</span>
        <div class="flex-gap">
          <button class="btn btn-secondary btn-sm" id="subsPrev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
          <button class="btn btn-secondary btn-sm" id="subsNext" ${page >= pages ? 'disabled' : ''}>Next</button>
        </div>`;
      document.getElementById('subsPrev')?.addEventListener('click', () => { state.page--; loadList(); });
      document.getElementById('subsNext')?.addEventListener('click', () => { state.page++; loadList(); });
    }

    async function removeSubscription(row) {
      const ok = await Admin.confirmAction({
        title: 'Remove subscription?',
        body: `This device (${Admin.escapeHtml(row.userType)}${row.userId ? `, user #${row.userId}` : ''}) will stop receiving push notifications.`,
        confirmLabel: 'Remove', danger: true,
      });
      if (!ok) return;
      try {
        await Admin.api.post(API.unsubscribe, {
          scope: 'endpoint',
          endpoint: row.endpoint,
          userId: row.userId,
          userType: row.userType,
          email: row.email,
        });
        Admin.toast('Subscription removed', 'success');
        loadList();
        loadStats();
      } catch (err) { Admin.toastError(err); }
    }

    return { init, loadStats, loadList };
  })();

  // ============================= Send Notification ========================
  const Send = (function () {
    let userTypesCache = [];
    let userIdsCache = [];
    let emailsCache = [];

    function init() {
      document.querySelectorAll('.wp-compose-tabs button').forEach((btn) => {
        btn.addEventListener('click', () => activateCompose(btn.dataset.compose));
      });
      document.querySelectorAll('.wp-toggle').forEach((group) => {
        group.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            group.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            group.dataset.value = btn.dataset.val;
          });
        });
      });

      document.getElementById('singleUserType').addEventListener('change', (e) => populateTargetDropdown(e.target.value));
      document.getElementById('selectedUserType').addEventListener('change', (e) => populateTargetMultiselect(e.target.value));

      document.getElementById('wpFormSingle').addEventListener('submit', onSendSingle);
      document.getElementById('wpFormSelected').addEventListener('submit', onSendSelected);
      document.getElementById('wpFormBroadcast').addEventListener('submit', onSendBroadcast);

      loadUserTypes();
    }

    function activateCompose(name) {
      document.querySelectorAll('.wp-compose-tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.compose === name));
      document.querySelectorAll('.wp-compose-form').forEach((f) => f.classList.toggle('is-active', f.dataset.composePanel === name));
    }

    async function loadUserTypes() {
      try {
        userTypesCache = await loadUsertypeOptions();
        const opts = userTypesCache.map((t) => `<option value="${Admin.escapeHtml(t)}">${Admin.escapeHtml(formatTypeLabel(t))}</option>`).join('');
        document.getElementById('singleUserType').innerHTML = `<option value="">Select a type…</option>` + opts;
        document.getElementById('selectedUserType').innerHTML = `<option value="">Select a type…</option>` + opts;
        document.getElementById('broadcastUserType').innerHTML = `<option value="">All subscribers</option>` + opts;
      } catch (err) { Admin.toastError(err); }
    }

    async function ensureUserIds() {
      if (userIdsCache.length) return userIdsCache;
      try {
        const res = await Admin.api.get(API.userIds);
        userIdsCache = res.data || [];
      } catch (err) { Admin.toastError(err); }
      return userIdsCache;
    }

    async function ensureEmails() {
      if (emailsCache.length) return emailsCache;
      try {
        const res = await Admin.api.get(API.emails);
        emailsCache = res.data || [];
      } catch (err) { Admin.toastError(err); }
      return emailsCache;
    }

    async function populateTargetDropdown(userType) {
      const sel = document.getElementById('singleTarget');
      sel.innerHTML = `<option value="">Loading…</option>`;
      const isGuest = GUEST_TYPES.includes(userType);
      const list = isGuest ? await ensureEmails() : await ensureUserIds();
      sel.dataset.mode = isGuest ? 'email' : 'userId';
      sel.innerHTML = list.length
        ? `<option value="">Select ${isGuest ? 'an email' : 'a user ID'}…</option>` + list.map((v) => `<option value="${Admin.escapeHtml(String(v))}">${Admin.escapeHtml(String(v))}</option>`).join('')
        : `<option value="">No ${isGuest ? 'emails' : 'user IDs'} found</option>`;
    }

    async function populateTargetMultiselect(userType) {
      const sel = document.getElementById('selectedTargets');
      sel.innerHTML = `<option>Loading…</option>`;
      const isGuest = GUEST_TYPES.includes(userType);
      const list = isGuest ? await ensureEmails() : await ensureUserIds();
      sel.dataset.mode = isGuest ? 'email' : 'userId';
      sel.innerHTML = list.length
        ? list.map((v) => `<option value="${Admin.escapeHtml(String(v))}">${Admin.escapeHtml(String(v))}</option>`).join('')
        : `<option disabled>No ${isGuest ? 'emails' : 'user IDs'} found</option>`;
    }

    function readPayload(prefix) {
      const payload = {
        title: document.getElementById(`${prefix}Title`).value.trim(),
        body: document.getElementById(`${prefix}Body`).value.trim(),
      };
      const icon = document.getElementById(`${prefix}Icon`)?.value.trim();
      const url = document.getElementById(`${prefix}Url`)?.value.trim();
      const tag = document.getElementById(`${prefix}Tag`)?.value.trim();
      if (icon) payload.icon = icon;
      if (url) payload.url = url;
      if (tag) payload.tag = tag;

      const toggle = document.querySelector(`#wpForm${prefix[0].toUpperCase()}${prefix.slice(1)} .wp-toggle`);
      if (toggle) payload.requireInteraction = toggle.dataset.value === 'true';

      return payload;
    }

    async function onSendSingle(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSendSingle');
      const userType = document.getElementById('singleUserType').value;
      const targetSel = document.getElementById('singleTarget');
      const target = targetSel.value;
      if (!userType || !target) { Admin.toast('Select a user type and target', 'error'); return; }

      const payload = { userType, ...readPayload('single') };
      if (targetSel.dataset.mode === 'email') payload.targetEmail = target;
      else payload.targetUserId = parseInt(target, 10);

      Admin.setButtonLoading(btn, true, 'Sending…');
      try {
        const res = await Admin.api.post(API.sendToUser, payload);
        Admin.toast(res.message || 'Notification processing complete', 'success');
        pushFeedItem({ title: payload.title, target: `${userType} · ${target}`, result: res.data, kind: 'single' });
        e.target.reset();
      } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
    }

    async function onSendSelected(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSendSelected');
      const userType = document.getElementById('selectedUserType').value;
      const targetSel = document.getElementById('selectedTargets');
      const selected = Array.from(targetSel.selectedOptions).map((o) => o.value);
      if (!userType || !selected.length) { Admin.toast('Select a user type and at least one target', 'error'); return; }

      const payload = { userType, ...readPayload('selected') };
      if (targetSel.dataset.mode === 'email') payload.emails = selected;
      else payload.userIds = selected.map((v) => parseInt(v, 10));

      Admin.setButtonLoading(btn, true, 'Sending…');
      try {
        const res = await Admin.api.post(API.sendToUsers, payload);
        Admin.toast(res.message || 'Notification processing complete', 'success');
        pushFeedItem({ title: payload.title, target: `${userType} · ${selected.length} target(s)`, result: res.data, kind: 'selected' });
        e.target.reset();
      } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
    }

    async function onSendBroadcast(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSendBroadcast');
      const userType = document.getElementById('broadcastUserType').value;
      const urgency = document.getElementById('broadcastUrgency').value;

      const ok = await Admin.confirmAction({
        title: 'Broadcast to all subscribers?',
        body: `This pushes to ${userType ? `every <strong>${Admin.escapeHtml(userType)}</strong> subscriber` : 'every active subscriber'}. This can't be undone.`,
        confirmLabel: 'Broadcast', danger: true,
      });
      if (!ok) return;

      const payload = { ...readPayload('broadcast') };
      if (userType) payload.userType = userType;
      if (urgency) payload.urgency = urgency;

      Admin.setButtonLoading(btn, true, 'Broadcasting…');
      try {
        const res = await Admin.api.post(API.broadcast, payload);
        Admin.toast(res.message || 'Broadcast complete', 'success');
        pushFeedItem({ title: payload.title, target: userType ? `Broadcast · ${userType}` : 'Broadcast · all subscribers', result: res.data, kind: 'broadcast' });
        e.target.reset();
      } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
    }

    function pushFeedItem({ title, target, result, kind }) {
      const feed = document.getElementById('wpFeed');
      const empty = feed.querySelector('.wp-feed-empty');
      if (empty) empty.remove();

      const sent = result.sentCount ?? result.totalSent ?? 0;
      const failed = result.failCount ?? result.totalFailed ?? 0;
      const item = document.createElement('div');
      item.className = 'wp-feed-item';
      item.innerHTML = `
        <div class="wp-feed-item-top">
          <span class="badge ${failed && !sent ? 'badge-coral' : 'badge-green'}">${sent} sent${failed ? ` · ${failed} failed` : ''}</span>
          <span class="wp-feed-time">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="wp-feed-item-title">${Admin.escapeHtml(title)}</div>
        <div class="wp-feed-item-target">${Admin.escapeHtml(target)}</div>`;
      feed.prepend(item);
    }

    return { init };
  })();

  // ============================= My Device =================================
  const Device = (function () {
    async function init() {
      renderPermission();
      const btn = document.getElementById('btnDeviceToggle');
      btn.disabled = false;

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus(false, 'Push notifications are not supported in this browser.');
        btn.disabled = true;
        return;
      }

      const existing = await getExistingSubscription();
      setStatus(!!existing, existing ? 'This browser is subscribed' : 'This browser is not subscribed');
      btn.textContent = existing ? 'Unsubscribe' : 'Subscribe';
      btn.className = existing ? 'btn btn-danger' : 'btn btn-primary';
      btn.onclick = () => (existing ? doUnsubscribe() : doSubscribe());
    }

    function renderPermission() {
      const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
      const badge = document.getElementById('permBadge');
      const title = document.getElementById('permTitle');
      const sub = document.getElementById('permSub');

      const map = {
        granted: { badge: 'badge-green', label: 'Granted', title: 'Granted', sub: 'Browser will show notifications' },
        denied: { badge: 'badge-coral', label: 'Denied', title: 'Denied', sub: 'Notifications are blocked in browser settings' },
        default: { badge: 'badge-gray', label: 'Not requested', title: 'Not requested', sub: 'Permission has not been asked for yet' },
        unsupported: { badge: 'badge-gray', label: 'Unsupported', title: 'Unsupported', sub: 'This browser does not support notifications' },
      };
      const m = map[perm] || map.unsupported;
      badge.className = `badge ${m.badge}`;
      badge.innerHTML = `<span class="badge-dot"></span>${m.label}`;
      title.textContent = m.title;
      sub.textContent = m.sub;
    }

    function setStatus(subscribed, text) {
      const badge = document.getElementById('deviceStatusBadge');
      badge.className = `badge ${subscribed ? 'badge-green' : 'badge-gray'}`;
      badge.innerHTML = `<span class="badge-dot"></span>${subscribed ? 'Subscribed' : 'Not subscribed'}`;
      document.getElementById('deviceStatusText').textContent = text;
      document.getElementById('deviceStatusRow').classList.toggle('is-on', subscribed);
    }

    async function getExistingSubscription() {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        return await reg.pushManager.getSubscription();
      } catch (err) {
        return null;
      }
    }

    async function doSubscribe() {
      const btn = document.getElementById('btnDeviceToggle');
      Admin.setButtonLoading(btn, true, 'Subscribing…');
      try {
        if (!window.VAPID_PUBLIC_KEY) throw new Error('VAPID_PUBLIC_KEY is not configured — set it in app/config/config.php');

        const permission = await Notification.requestPermission();
        renderPermission();
        if (permission !== 'granted') throw new Error('Notification permission was not granted');

        const reg = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY),
        });

        const me = Admin.getMe();
        await Admin.api.post(API.subscribe, {
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        });

        Admin.toast('Subscribed successfully', 'success');
        init();
      } catch (err) {
        Admin.toastError(err);
        Admin.setButtonLoading(btn, false);
      }
    }

    async function doUnsubscribe() {
      const btn = document.getElementById('btnDeviceToggle');
      Admin.setButtonLoading(btn, true, 'Unsubscribing…');
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        const subscription = await reg.pushManager.getSubscription();
        if (subscription) {
          await Admin.api.post(API.unsubscribe, { scope: 'endpoint', endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        Admin.toast('Unsubscribed successfully', 'success');
        init();
      } catch (err) {
        Admin.toastError(err);
        Admin.setButtonLoading(btn, false);
      }
    }

    // VAPID public key (URL-safe base64) -> Uint8Array, as required by pushManager.subscribe().
    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    }

    return { init };
  })();

  async function init() {
    await Admin.requireAuth();
    initTabs();
    Subscribers.init();
  }

  init();
})();