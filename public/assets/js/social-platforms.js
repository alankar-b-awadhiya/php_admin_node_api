/**
 * social-platforms.js — Social Platforms page (maps to /social-platforms,
 * aba_social_db `social_platforms` + `social_oauth_apps`). Platform registry
 * that replaces the hardcoded SUPPORTED_PLATFORMS list — lets you add a
 * platform's auth endpoints + OAuth app credentials without a code deploy.
 *
 * ---------------------------------------------------------------------------
 * API map — Node API: src/domains/socialPlatforms/v1/socialPlatforms.routes.js
 * ---------------------------------------------------------------------------
 *   GET    API.list                    - list all platforms (?active=1 to filter)
 *   GET    API.get(id)                 - get one
 *   POST   API.list                    - create
 *   PATCH  API.update(id)              - update
 *   PATCH  API.status(id)              - { is_active }
 *   GET    API.apps(id)                - list OAuth apps for a platform
 *   POST   API.apps(id)                - create an OAuth app
 *   PATCH  API.app(appId)              - update an OAuth app
 *   DELETE API.app(appId)              - delete an OAuth app
 */
(function () {
  const API = {
    list: '/social-platforms',
    get: (id) => `/social-platforms/${id}`,
    update: (id) => `/social-platforms/${id}`,
    status: (id) => `/social-platforms/${id}/status`,
    apps: (id) => `/social-platforms/${id}/oauth-apps`,
    app: (appId) => `/social-platforms/oauth-apps/${appId}`,
    appDefault: (appId) => `/social-platforms/oauth-apps/${appId}/default`,
  };

  const AUTH_TYPE_LABELS = { oauth2: 'OAuth 2.0', oauth1: 'OAuth 1.0a', manual: 'Manual' };
  const ENV_LABELS = { production: 'Production', sandbox: 'Sandbox' };

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    key: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13 2a5 5 0 0 0-4.8 6.4L2 14.6V18h3.4l1-1v-1.5H8V14h1.5v-1.5L11 11h1.6A5 5 0 1 0 13 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  };

  let rows = [];

  async function init() {
    await Admin.requireAuth();
    document.getElementById('btnAddPlatform').addEventListener('click', openCreateModal);
    await loadList();
  }

  async function loadList() {
    const body = document.getElementById('platformsTableBody');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading platforms…</td></tr>`;
    try {
      const res = await Admin.api.get(API.list);
      rows = res.data.platforms || [];
      renderTable();
      document.getElementById('platformsCount').textContent = `${rows.length} platform${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load platforms.</td></tr>`;
      Admin.toastError(err);
    }
  }

  function renderTable() {
    const body = document.getElementById('platformsTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">No platforms yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((p) => `
      <tr data-id="${p.id}">
        <td><strong>${Admin.escapeHtml(p.name)}</strong></td>
        <td class="cell-muted"><code>${Admin.escapeHtml(p.code)}</code></td>
        <td><span class="badge-outline">${Admin.escapeHtml(AUTH_TYPE_LABELS[p.authType] || p.authType)}</span></td>
        <td>${(p.capabilities || []).map((c) => `<span class="badge-outline" style="margin:0 3px 3px 0;">${Admin.escapeHtml(c)}</span>`).join('') || '<span class="cell-muted">—</span>'}</td>
        <td><button class="btn btn-secondary btn-sm" data-act="apps">Manage Apps</button></td>
        <td>${Admin.badge(p.isActive)}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          <button class="icon-action icon-action-toggle" data-act="status" title="${p.isActive ? 'Deactivate' : 'Activate'}">${ICON.toggle}</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const p = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="apps"]')?.addEventListener('click', () => openAppsModal(p));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditModal(p));
      tr.querySelector('[data-act="status"]')?.addEventListener('click', () => toggleStatus(p));
    });
  }

  async function toggleStatus(p) {
    try {
      await Admin.api.patch(API.status(p.id), { is_active: p.isActive ? 0 : 1 });
      Admin.toast('Status updated', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Add / Edit platform modal ----------------------------------------

  function platformFormHtml(p) {
    const isEdit = !!p;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit Platform' : 'Add Platform'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="platformForm">
        <div class="modal-body">
          <div id="platformFormErrors"></div>
          <div class="form-row">
            <div class="form-group">
              <label for="pf-code">Platform Code <span style="color:var(--coral);">*</span></label>
              <input type="text" id="pf-code" placeholder="e.g. FACEBOOK" value="${isEdit ? Admin.escapeHtml(p.code) : ''}" ${isEdit ? 'disabled' : ''} required>
              ${isEdit ? '<p class="hint">Code can\'t be changed after creation.</p>' : ''}
            </div>
            <div class="form-group">
              <label for="pf-name">Platform Name <span style="color:var(--coral);">*</span></label>
              <input type="text" id="pf-name" placeholder="e.g. Facebook" value="${isEdit ? Admin.escapeHtml(p.name) : ''}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="pf-auth-type">Auth Type</label>
              <select id="pf-auth-type">
                ${Object.entries(AUTH_TYPE_LABELS).map(([v, l]) => `<option value="${v}" ${isEdit && p.authType === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="pf-icon">Icon URL</label>
              <input type="text" id="pf-icon" value="${isEdit ? Admin.escapeHtml(p.iconUrl || '') : ''}">
            </div>
          </div>
          <div class="form-group">
            <label for="pf-auth-base">Auth Base URL</label>
            <input type="text" id="pf-auth-base" placeholder="https://www.facebook.com/v19.0/dialog/oauth" value="${isEdit ? Admin.escapeHtml(p.authBaseUrl || '') : ''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="pf-token-url">Token URL</label>
              <input type="text" id="pf-token-url" value="${isEdit ? Admin.escapeHtml(p.tokenUrl || '') : ''}">
            </div>
            <div class="form-group">
              <label for="pf-api-base">API Base URL</label>
              <input type="text" id="pf-api-base" value="${isEdit ? Admin.escapeHtml(p.apiBaseUrl || '') : ''}">
            </div>
          </div>
          <div class="form-group">
            <label for="pf-capabilities">Capabilities (comma-separated)</label>
            <input type="text" id="pf-capabilities" placeholder="publish_post, insights, inbox, comments" value="${isEdit ? Admin.escapeHtml((p.capabilities || []).join(', ')) : ''}">
          </div>
          <div class="form-group">
            <label for="pf-scopes">Default OAuth Scopes (comma-separated)</label>
            <input type="text" id="pf-scopes" value="${isEdit ? Admin.escapeHtml((p.scopesDefault || []).join(', ')) : ''}">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="platformFormSubmit">Save</button>
        </div>
      </form>
    `;
  }

  function openCreateModal() {
    Admin.openModal(platformFormHtml(null));
    wirePlatformModal(null);
  }
  function openEditModal(p) {
    Admin.openModal(platformFormHtml(p));
    wirePlatformModal(p);
  }

  function wirePlatformModal(p) {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    backdrop.querySelector('#platformForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('platformFormErrors');
      errBox.innerHTML = '';
      const btn = document.getElementById('platformFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');

      const toList = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
      const payload = {
        platform_name: document.getElementById('pf-name').value.trim(),
        auth_type: document.getElementById('pf-auth-type').value,
        icon_url: document.getElementById('pf-icon').value.trim() || null,
        auth_base_url: document.getElementById('pf-auth-base').value.trim() || null,
        token_url: document.getElementById('pf-token-url').value.trim() || null,
        api_base_url: document.getElementById('pf-api-base').value.trim() || null,
        capabilities: toList(document.getElementById('pf-capabilities').value),
        scopes_default: toList(document.getElementById('pf-scopes').value),
      };
      if (!p) payload.platform_code = document.getElementById('pf-code').value.trim();

      try {
        if (p) {
          await Admin.api.patch(API.update(p.id), payload);
          Admin.toast('Platform updated', 'success');
        } else {
          await Admin.api.post(API.list, payload);
          Admin.toast('Platform created', 'success');
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

  // ---- Manage OAuth Apps modal ------------------------------------------

  async function openAppsModal(p) {
    Admin.openModal(`
      <div class="modal-header"><h3>OAuth Apps — ${Admin.escapeHtml(p.name)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="table-wrap" style="margin-bottom:18px;">
          <table>
            <thead><tr><th>Label</th><th>Client ID</th><th>Redirect URI</th><th>Env</th><th>Default</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody id="appsTableBody"><tr><td colspan="7" class="table-empty">Loading…</td></tr></tbody>
          </table>
        </div>
        <h4 style="margin:0 0 10px;">Add OAuth App</h4>
        <div id="appFormErrors"></div>
        <div class="form-row">
          <div class="form-group"><label for="app-label">Label <span style="color:var(--coral);">*</span></label><input type="text" id="app-label" placeholder="Production"></div>
          <div class="form-group"><label for="app-env">Environment</label>
            <select id="app-env">${Object.entries(ENV_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="app-client-id">Client ID <span style="color:var(--coral);">*</span></label><input type="text" id="app-client-id"></div>
          <div class="form-group"><label for="app-client-secret">Client Secret <span style="color:var(--coral);">*</span></label><input type="password" id="app-client-secret" autocomplete="new-password"></div>
        </div>
        <div class="form-group"><label for="app-redirect">Redirect URI <span style="color:var(--coral);">*</span></label><input type="text" id="app-redirect" placeholder="https://yourapp.com/social-oauth-callback.php"></div>
        <div class="form-group">
          <label for="app-redirect">Redirect URI <span style="color:var(--coral);">*</span></label>
          <input type="text" id="app-redirect" placeholder="https://yourapp.com/social-oauth-callback.php">
        </div>
        <div class="form-group">
          <label for="app-config-id">Config ID <span class="cell-muted" style="font-weight:400;">(optional — Facebook Login for Business)</span></label>
          <input type="text" id="app-config-id" placeholder="e.g. 1324846843050760">
        </div>
        <div class="form-group">
          <label class="checkbox-row"><input type="checkbox" id="app-is-default"> Set as default for this environment</label>
        </div>
        <button type="button" class="btn btn-primary" id="btnAddApp">Add OAuth App</button>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    document.getElementById('btnAddApp').addEventListener('click', async (e) => {
      const errBox = document.getElementById('appFormErrors');
      errBox.innerHTML = '';
      const configId = document.getElementById('app-config-id').value.trim();
      const payload = {
        app_label: document.getElementById('app-label').value.trim(),
        environment: document.getElementById('app-env').value,
        client_id: document.getElementById('app-client-id').value.trim(),
        client_secret: document.getElementById('app-client-secret').value,
        redirect_uri: document.getElementById('app-redirect').value.trim(),
        is_default: document.getElementById('app-is-default').checked ? 1 : 0,
        extra: configId ? { config_id: configId } : null,
      };
      Admin.setButtonLoading(e.target, true, 'Adding…');
      try {
        await Admin.api.post(API.apps(p.id), payload);
        Admin.toast('OAuth app added', 'success');
        ['app-label', 'app-client-id', 'app-client-secret', 'app-redirect', 'app-config-id'].forEach((id) => { document.getElementById(id).value = ''; });
        document.getElementById('app-is-default').checked = false;
        loadApps(p.id);
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
      } finally {
        Admin.setButtonLoading(e.target, false);
      }
    });

    loadApps(p.id);
  }

  async function loadApps(platformId) {
    const body = document.getElementById('appsTableBody');
    if (!body) return;
    try {
      const res = await Admin.api.get(API.apps(platformId));
      const apps = res.data.apps || [];
      if (!apps.length) {
        body.innerHTML = `<tr><td colspan="7" class="table-empty">No OAuth apps yet.</td></tr>`;
        return;
      }
      body.innerHTML = apps.map((a) => `
        <tr data-id="${a.id}">
          <td><strong>${Admin.escapeHtml(a.appLabel)}</strong></td>
          <td class="cell-muted"><code>${Admin.escapeHtml(a.clientId)}</code></td>
          <td class="cell-muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Admin.escapeHtml(a.redirectUri)}</td>
          <td><span class="badge-outline">${Admin.escapeHtml(ENV_LABELS[a.environment] || a.environment)}</span></td>
          <td><strong>${Admin.escapeHtml(a.appLabel)}</strong>${a.extra?.config_id ? `<br><span class="cell-muted" style="font-size:11px;">config_id: ${Admin.escapeHtml(a.extra.config_id)}</span>` : ''}</td>
          <td>${a.isDefault
            ? '<span class="badge badge-green"><span class="badge-dot"></span>Default</span>'
            : `<button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:12px;" data-act="set-default">Set default</button>`}</td>
          <td>${Admin.badge(a.isActive)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </td>
        </tr>
      `).join('');
      body.querySelectorAll('[data-act="set-default"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          try {
            await Admin.api.patch(API.appDefault(tr.dataset.id));
            Admin.toast('Default OAuth app updated', 'success');
            loadApps(platformId);
          } catch (err) { Admin.toastError(err); }
        });
      });
      body.querySelectorAll('[data-act="delete"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const ok = await Admin.confirmAction({ title: 'Delete OAuth app?', body: 'Any accounts connected through it will fail to refresh their token afterwards.', confirmLabel: 'Delete', danger: true });
          if (!ok) return;
          try {
            await Admin.api.del(API.app(tr.dataset.id));
            Admin.toast('OAuth app deleted', 'success');
            loadApps(platformId);
          } catch (err) { Admin.toastError(err); }
        });
      });
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">Couldn't load OAuth apps.</td></tr>`;
      Admin.toastError(err);
    }
  }

  init();
})();
