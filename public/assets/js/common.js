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
  async function request(path, { method = 'GET', body, retry = true, base } = {}) {
    const root = base || BASE;
    const opts = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(root + path, opts);
    } catch (e) {
      throw new ApiError(0, 'Could not reach the API. Check your connection or the API_BASE_URL in config.php.');
    }

    if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
      const ok = await silentRefresh();
      if (ok) return request(path, { method, body, retry: false, base });
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
  // Every verb accepts an optional trailing `opts` ({ base }) to target a
  // different API version than the page default (e.g. products/attributes
  // pages target v2 - see apiBase() below). Omit it and behavior is
  // unchanged from before.
  const api = {
    get: (path, opts) => request(path, opts),
    post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
    put: (path, body, opts) => request(path, { method: 'PUT', body, ...opts }),
    patch: (path, body, opts) => request(path, { method: 'PATCH', body, ...opts }),
    del: (path, opts) => request(path, { method: 'DELETE', ...opts }),
  };

  /** Builds an absolute API root for a specific version, e.g. apiBase('v2') -> 'http://host/api/v2'. Falls back to swapping the version segment on the default BASE. */
  function apiBase(version) {
    return BASE.replace(/\/v\d+$/, '/' + version);
  }

  /**
   * Multipart form upload (file inputs). Unlike request(), this does NOT set
   * Content-Type: application/json or JSON.stringify the body — the browser
   * sets the correct multipart boundary for a FormData body automatically.
   * Shares the same cookie-based auth + one-time silent-refresh-and-retry
   * behavior as request().
   */
  async function requestForm(path, formData, { method = 'POST', retry = true, base } = {}) {
    const root = base || BASE;
    let res;
    try {
      res = await fetch(root + path, { method, credentials: 'include', body: formData });
    } catch (e) {
      throw new ApiError(0, 'Could not reach the API. Check your connection or the API_BASE_URL in config.php.');
    }

    if (res.status === 401 && retry) {
      const ok = await silentRefresh();
      if (ok) return requestForm(path, formData, { method, retry: false, base });
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
  api.uploadForm = (path, formData, opts = {}) => requestForm(path, formData, { method: 'POST', ...opts });

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
    api, apiBase, requireAuth, getMe, isUsertype, logout,
    toast, toastError, openModal, closeModal, confirmAction,
    escapeHtml, formatDate, timeAgo, badge, debounce, qs, setButtonLoading,
    ApiError,
  };
})();

// Sidebar toggle (mobile) + logout button — wired on every page via footer.php
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const logoutBtn = document.getElementById('logoutBtn');

  // Restore saved collapsed state (desktop only)
  try {
    if (sidebar && window.localStorage) {
      const collapsed = localStorage.getItem('sidebarCollapsed');
      if (collapsed === '1' && !window.matchMedia('(max-width:900px)').matches) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
      }
    }
  } catch (e) { /* ignore */ }

  if (toggle && sidebar) {
    toggle.addEventListener('click', (e) => {
      if (window.matchMedia('(max-width:900px)').matches) {
        // Mobile: slide-in panel
        sidebar.classList.toggle('is-open');
      } else {
        // Desktop: collapse to icon-only
        const isCollapsed = sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed', isCollapsed);
        try { localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0'); } catch (err) { /* ignore */ }
      }
    });

    // Click outside to close mobile sidebar
    document.addEventListener('click', (ev) => {
      if (!window.matchMedia('(max-width:900px)').matches) return;
      if (!sidebar.classList.contains('is-open')) return;
      if (sidebar.contains(ev.target) || toggle.contains(ev.target)) return;
      sidebar.classList.remove('is-open');
    });

    // Ensure mobile state resets on resize
    window.addEventListener('resize', () => {
      if (!window.matchMedia('(max-width:900px)').matches) {
        sidebar.classList.remove('is-open');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Admin.logout());
  }

  // ------ Sidebar groups: restore + persist open/collapse state -----
  try {
    const groups = document.querySelectorAll('.sidebar-group');
    groups.forEach((g) => {
      const key = g.dataset.group;
      const header = g.querySelector('.sidebar-group-header');
      if (!header) return;
      const collapsed = window.localStorage && localStorage.getItem('sidebarGroup_' + key) === '1';
      if (collapsed) {
        g.classList.add('collapsed');
        header.setAttribute('aria-expanded', 'false');
      }
      header.addEventListener('click', () => {
        const isCollapsed = g.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        try { localStorage.setItem('sidebarGroup_' + key, isCollapsed ? '1' : '0'); } catch (e) { /* ignore */ }
      });
    });
  } catch (e) { /* ignore */ }

  // ------ Theme panel: color pickers, apply and persist theme vars -----
  (function initThemePanel() {
    const themeToggle = document.getElementById('themeToggle');
    const themePanel = document.getElementById('themePanel');
    const themeClose = document.getElementById('themeClose');
    const primaryInput = document.getElementById('primaryColor');
    const secondaryInput = document.getElementById('secondaryColor');
    const snippetEl = document.getElementById('themeSnippet');
    const copyBtn = document.getElementById('copyThemeBtn');
    const resetBtn = document.getElementById('resetThemeBtn');

    function applyTheme(primary, secondary, persist = true) {
      if (!primary || !secondary) return;
      document.documentElement.style.setProperty('--primary', primary);
      document.documentElement.style.setProperty('--primary-dark', primary);
      document.documentElement.style.setProperty('--primary-tint', primary + '11');
      document.documentElement.style.setProperty('--secondary', secondary);
      document.documentElement.style.setProperty('--secondary-tint', secondary + '11');
      if (snippetEl) snippetEl.textContent = `:root { --primary: ${primary}; --secondary: ${secondary}; }`;
      if (persist) {
        try { localStorage.setItem('theme_primary', primary); localStorage.setItem('theme_secondary', secondary); } catch (e) { /* ignore */ }
      }
    }

    // Load saved theme
    try {
      const savedPrimary = localStorage.getItem('theme_primary');
      const savedSecondary = localStorage.getItem('theme_secondary');
      if (savedPrimary && savedSecondary) {
        if (primaryInput) primaryInput.value = savedPrimary;
        if (secondaryInput) secondaryInput.value = savedSecondary;
        applyTheme(savedPrimary, savedSecondary, false);
      }
    } catch (e) { /* ignore */ }

    if (primaryInput) primaryInput.addEventListener('change', (e) => {
      const p = e.target.value;
      const s = secondaryInput ? secondaryInput.value : '#7c3aed';
      applyTheme(p, s, true);
    });
    if (secondaryInput) secondaryInput.addEventListener('change', (e) => {
      const s = e.target.value;
      const p = primaryInput ? primaryInput.value : '#4f5dff';
      applyTheme(p, s, true);
    });

    if (themeToggle && themePanel) {
      themeToggle.addEventListener('click', () => {
        const open = themePanel.classList.toggle('is-open');
        themePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      });
    }
    if (themeClose && themePanel) {
      themeClose.addEventListener('click', () => { themePanel.classList.remove('is-open'); themePanel.setAttribute('aria-hidden', 'true'); });
    }

    if (copyBtn && snippetEl) {
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(snippetEl.textContent); Admin.toast('Theme CSS copied'); } catch (e) { Admin.toast('Could not copy to clipboard', 'error'); }
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try { localStorage.removeItem('theme_primary'); localStorage.removeItem('theme_secondary'); } catch (e) {}
        if (primaryInput) primaryInput.value = '#4f5dff';
        if (secondaryInput) secondaryInput.value = '#7c3aed';
        applyTheme('#4f5dff', '#7c3aed', true);
        Admin.toast('Theme reset');
      });
    }
  })();
});
