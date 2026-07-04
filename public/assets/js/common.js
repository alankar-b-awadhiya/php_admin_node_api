/**
 * common.js
 * Shared across every page: the API client, auth guard, toast/modal
 * helpers, and small DOM/format utilities. Page-specific scripts
 * (users.js, usertypes.js, ...) rely on the `Admin` global defined here.
 */

const Admin = (function () {
  const BASE = (window.API_BASE_URL || '/api/v1').replace(/\/$/, '');

  let refreshInFlight = null;

  /**
   * Low-level request wrapper. Always sends cookies (credentials:'include')
   * so the Node API's httpOnly access_token/refresh_token cookies flow
   * automatically. On a 401 from a non-auth endpoint it attempts exactly
   * one silent refresh (deduped across concurrent callers) before retrying
   * the original request once.
   */
  async function request(path, { method = 'GET', body, retry = true } = {}) {
    const opts = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (e) {
      throw new ApiError(0, 'Could not reach the API. Check your connection or the API_BASE_URL in config.php.');
    }

    if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
      const ok = await silentRefresh();
      if (ok) return request(path, { method, body, retry: false });
      goToLogin();
      throw new ApiError(401, 'Session expired');
    }

    let json = null;
    try { json = await res.json(); } catch (e) { /* empty/non-JSON body */ }

    if (!res.ok || (json && json.success === false)) {
      const message = (json && json.message) || `Request failed (${res.status})`;
      throw new ApiError(res.status, message, json && json.errors);
    }
    return json || { success: true, data: null };
  }

  function silentRefresh() {
    if (!refreshInFlight) {
      refreshInFlight = fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  function goToLogin() {
    const redirect = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    if (!location.pathname.endsWith('login.php')) {
      location.href = 'login.php?redirect=' + redirect;
    }
  }

  class ApiError extends Error {
    constructor(status, message, errors) {
      super(message);
      this.status = status;
      this.errors = errors || null;
    }
  }

  // ---- Public HTTP verbs ----------------------------------------------
  const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    del: (path) => request(path, { method: 'DELETE' }),
  };

  // ---- Auth guard --------------------------------------------------------
  let cachedMe = null;

  /**
   * Call at the top of every protected page. Resolves with the current
   * user's profile ({ id, fullName, usertype: {code, name, ...}, ... }),
   * redirecting to login.php if there is no valid session.
   */
  async function requireAuth() {
    try {
      const res = await api.get('/auth/me');
      cachedMe = res.data;
      renderTopbarUser(cachedMe);
      return cachedMe;
    } catch (e) {
      goToLogin();
      throw e;
    }
  }

  function renderTopbarUser(me) {
    const nameEl = document.getElementById('topbarUserName');
    const roleEl = document.getElementById('topbarUserRole');
    if (nameEl) nameEl.textContent = me.fullName || me.username || '';
    if (roleEl) roleEl.textContent = me.usertype ? me.usertype.name : '';
  }

  function getMe() { return cachedMe; }

  /** Restricts UI affordances to SUPERADMIN/ADMIN, mirrors requireUsertype() server-side. */
  function isUsertype(...codes) {
    return !!cachedMe && !!cachedMe.usertype && codes.includes(cachedMe.usertype.code);
  }

  async function logout() {
    try { await api.post('/auth/logout'); } catch (e) { /* ignore - clear cookies client-side regardless */ }
    location.href = 'login.php';
  }

  // ---- Toast ---------------------------------------------------------
  function toast(message, type = 'info', timeout = 4200) {
    const stack = document.getElementById('toastStack');
    if (!stack) { alert(message); return; }
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
    el.innerHTML = `<span>${escapeHtml(message)}</span><button class="toast-close" aria-label="Dismiss">&times;</button>`;
    el.querySelector('.toast-close').addEventListener('click', () => el.remove());
    stack.appendChild(el);
    if (timeout) setTimeout(() => el.remove(), timeout);
  }

  function toastError(err) {
    const base = err instanceof Error ? err.message : String(err);
    const extra = err && err.errors && err.errors.length ? ': ' + err.errors.join(', ') : '';
    toast(base + extra, 'error', 6000);
  }

  // ---- Modal -----------------------------------------------------------
  function openModal(innerHtml) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.innerHTML = `<div class="modal">${innerHtml}</div>`;
    backdrop.classList.add('is-open');
    backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
    document.addEventListener('keydown', escCloseOnce);
  }
  function escCloseOnce(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.classList.remove('is-open');
    backdrop.innerHTML = '';
    document.removeEventListener('keydown', escCloseOnce);
  }

  async function confirmAction({ title = 'Are you sure?', body = '', confirmLabel = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      openModal(`
        <div class="modal-header"><h3>${escapeHtml(title)}</h3></div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      `);
      const backdrop = document.getElementById('modalBackdrop');
      backdrop.querySelector('[data-act="cancel"]').onclick = () => { closeModal(); resolve(false); };
      backdrop.querySelector('[data-act="ok"]').onclick = () => { closeModal(); resolve(true); };
    });
  }

  // ---- Formatting / DOM utils -------------------------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(value) {
    if (!value) return '—';
    const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 0) return formatDate(value);
    const steps = [[60, 's'], [60, 'm'], [24, 'h'], [30, 'd'], [12, 'mo'], [Infinity, 'y']];
    let val = seconds, unit = 's';
    for (const [div, u] of steps) {
      if (val < div) { unit = u; break; }
      val = Math.floor(val / div);
      unit = u;
    }
    return val <= 0 ? 'just now' : `${val}${unit} ago`;
  }

  function badge(active, onText = 'Active', offText = 'Inactive') {
    return active
      ? `<span class="badge badge-green"><span class="badge-dot"></span>${onText}</span>`
      : `<span class="badge badge-gray"><span class="badge-dot"></span>${offText}</span>`;
  }

  function debounce(fn, wait = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  function qs(params) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') usp.set(k, v);
    });
    const s = usp.toString();
    return s ? '?' + s : '';
  }

  function setButtonLoading(btn, loading, loadingText = 'Working…') {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${escapeHtml(loadingText)}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
    }
  }

  return {
    api, requireAuth, getMe, isUsertype, logout,
    toast, toastError, openModal, closeModal, confirmAction,
    escapeHtml, formatDate, timeAgo, badge, debounce, qs, setButtonLoading,
    ApiError,
  };
})();

// Sidebar toggle (mobile) + logout button — wired on every page via footer.php
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('is-open'));
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Admin.logout());
  }
});
