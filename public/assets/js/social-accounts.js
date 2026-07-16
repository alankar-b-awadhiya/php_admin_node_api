/**
 * social-accounts.js — Connected Accounts page (maps to /social-accounts).
 *
 * social_client_id is REQUIRED to list accounts (same constraint hit
 * earlier in social-inbox) so this page always starts with a client
 * selector; the accounts table stays empty/disabled until one is picked.
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY.
 *   Node API: src/api/v1/index.js, src/domains/socialAccounts/v1/socialAccounts.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.clients                - social clients, for the selector (reuses /social-clients)
 *   GET    API.connect(platform)      - ?social_client_id= -> { authUrl } for OAuth platforms
 *   POST   API.manualConnect          - { social_client_id, platform, credentials } for whatsapp/bluesky
 *   GET    API.list                   - ?social_client_id=&platform=&status=
 *   POST   API.refreshToken(id)       - re-run the platform's refresh grant
 *   PATCH  API.updateMeta(id)         - { meta: {...} }
 *   DELETE API.disconnect(id)
 *
 * Platform support comes straight from src/utils/socialPlatforms/index.js -
 * OAuth: facebook, instagram, linkedin, youtube, twitter, pinterest, tiktok,
 * threads. Manual (no OAuth dialog): whatsapp, bluesky. NOTE: the original
 * plan assumed only whatsapp was manual and bluesky used OAuth - the actual
 * adapter code (bluesky.js: `manual = true`) says otherwise, so this file
 * follows the code, not the plan.
 */
(function () {
  const API = {
    clients: '/social-clients',
    connect: (platform) => `/social-accounts/connect/${platform}`,
    manualConnect: '/social-accounts/manual-connect',
    list: '/social-accounts',
    refreshToken: (id) => `/social-accounts/${id}/refresh-token`,
    updateMeta: (id) => `/social-accounts/${id}/meta`,
    disconnect: (id) => `/social-accounts/${id}`,
  };

  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    if (!relPath) return '';
    if (/^https?:\/\//i.test(relPath)) return relPath;
    return API_ORIGIN + relPath;
  }

  // code -> { label, color, manual, fields (for manual connect forms) }
  const PLATFORMS = {
    facebook:  { label: 'Facebook',  color: '#1877F2' },
    instagram: { label: 'Instagram', color: '#C13584' },
    linkedin:  { label: 'LinkedIn',  color: '#0A66C2' },
    youtube:   { label: 'YouTube',   color: '#FF0000' },
    twitter:   { label: 'X (Twitter)', color: '#000000' },
    pinterest: { label: 'Pinterest', color: '#E60023' },
    tiktok:    { label: 'TikTok',    color: '#000000' },
    threads:   { label: 'Threads',   color: '#000000' },
    whatsapp:  {
      label: 'WhatsApp', color: '#25D366', manual: true,
      fields: [
        { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'From Meta Business Manager', required: true },
        { key: 'wabaId', label: 'WABA ID', placeholder: 'WhatsApp Business Account ID', required: true },
        { key: 'systemUserToken', label: 'System User Token', placeholder: 'Permanent access token', required: true, type: 'password' },
        { key: 'displayPhoneNumber', label: 'Display Phone Number', placeholder: '+91XXXXXXXXXX', required: false },
      ],
    },
    bluesky: {
      label: 'Bluesky', color: '#0085FF', manual: true,
      fields: [
        { key: 'handle', label: 'Handle', placeholder: 'yourname.bsky.social', required: true },
        { key: 'appPassword', label: 'App Password', placeholder: 'Generated in Bluesky settings', required: true, type: 'password' },
      ],
    },
  };
  const PLATFORM_ORDER = ['facebook', 'instagram', 'threads', 'linkedin', 'youtube', 'twitter', 'pinterest', 'tiktok', 'whatsapp', 'bluesky'];

  const CONN_STATUS_LABELS = { 0: 'Pending', 1: 'Active', 2: 'Expired', 3: 'Revoked', 4: 'Error' };
  const CONN_STATUS_BADGE = { 0: 'badge-gray', 1: 'badge-green', 2: 'badge-amber', 3: 'badge-gray', 4: 'badge-coral' };

  const ICON = {
    refresh: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    settings: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 6.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" stroke="currentColor" stroke-width="1.4"/><path d="M10 2v2.3M10 15.7V18M4.2 5.2l1.6 1.6M14.2 13.2l1.6 1.6M2 10h2.3M15.7 10H18M4.2 14.8l1.6-1.6M14.2 6.8l1.6-1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    activity: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M2 10h3l2-6 3 12 2-9 1.5 3H18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const ACCOUNT_API = {
    tokenAudit: (id) => `/social-accounts/${id}/token-audit`,
    insights: (id) => `/social-accounts/${id}/insights`,
  };

  let rows = [];
  let clients = [];
  let state = { socialClientId: '', platform: '', status: '' };

  async function init() {
    await Admin.requireAuth();

    populatePlatformFilter();
    await loadClients();

    document.getElementById('clientSelect').addEventListener('change', (e) => {
      state.socialClientId = e.target.value;
      document.getElementById('btnConnectAccount').disabled = !state.socialClientId;
      loadList();
    });
    document.getElementById('platformFilter').addEventListener('change', (e) => {
      state.platform = e.target.value; loadList();
    });
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.status = e.target.value; loadList();
    });
    document.getElementById('btnRefreshAccounts').addEventListener('click', () => loadList(true));
    document.getElementById('btnConnectAccount').addEventListener('click', openPlatformGrid);
  }

  function populatePlatformFilter() {
    const sel = document.getElementById('platformFilter');
    sel.innerHTML = '<option value="">All Platforms</option>' +
      PLATFORM_ORDER.map((p) => `<option value="${p}">${PLATFORMS[p].label}</option>`).join('');
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

  async function loadList(spin) {
    const body = document.getElementById('accountsTableBody');
    const refreshBtn = document.getElementById('btnRefreshAccounts');
    if (!state.socialClientId) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">Select a client above to view connected accounts.</td></tr>';
      document.getElementById('accountsCount').textContent = '0 accounts';
      return;
    }
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading accounts…</td></tr>';
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        social_client_id: state.socialClientId,
        platform: state.platform,
        status: state.status,
      }));
      rows = res.data.accounts || [];
      renderTable();
      document.getElementById('accountsCount').textContent = `${rows.length} account${rows.length === 1 ? '' : 's'}`;
    } catch (err) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">Couldn\'t load accounts.</td></tr>';
      Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('accountsTableBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">No accounts connected yet for this client.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((a) => {
      const p = PLATFORMS[a.platform] || { label: a.platform, color: '#666' };
      return `
        <tr data-id="${a.id}">
          <td><span class="platform-chip" style="--pchip:${p.color}">${Admin.escapeHtml(p.label)}</span></td>
          <td>
            <div class="flex-gap">
              ${a.profilePictureUrl ? `<img class="client-logo" style="width:28px;height:28px;" src="${assetUrl(a.profilePictureUrl)}" alt="">` : ''}
              <div>
                <strong>${Admin.escapeHtml(a.accountName || '—')}</strong>
                ${a.accountUsername ? `<div class="cell-muted" style="font-size:11.5px;">@${Admin.escapeHtml(a.accountUsername)}</div>` : ''}
              </div>
            </div>
            ${a.lastError ? `<div class="cell-muted" style="font-size:11px;color:var(--coral);margin-top:4px;">${Admin.escapeHtml(a.lastError)}</div>` : ''}
          </td>
          <td><span class="badge ${CONN_STATUS_BADGE[a.connectionStatus] || 'badge-gray'}"><span class="badge-dot"></span>${CONN_STATUS_LABELS[a.connectionStatus] || 'Unknown'}</span></td>
          <td class="cell-muted">${a.tokenExpiresAt ? Admin.formatDate(a.tokenExpiresAt) : '—'}</td>
          <td class="cell-muted">${a.lastSyncedAt ? Admin.timeAgo(a.lastSyncedAt) : '—'}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-toggle" data-act="refresh" title="Refresh token">${ICON.refresh}</button>
            <button class="icon-action icon-action-view" data-act="activity" title="Insights &amp; token history">${ICON.activity}</button>
            <button class="icon-action icon-action-edit" data-act="meta" title="Edit settings">${ICON.settings}</button>
            <button class="icon-action icon-action-delete" data-act="disconnect" title="Disconnect">${ICON.trash}</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('tr').forEach((tr) => {
      const a = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-act="refresh"]')?.addEventListener('click', () => refreshToken(a));
      tr.querySelector('[data-act="activity"]')?.addEventListener('click', () => openActivityModal(a));
      tr.querySelector('[data-act="meta"]')?.addEventListener('click', () => openMetaModal(a));
      tr.querySelector('[data-act="disconnect"]')?.addEventListener('click', () => disconnect(a));
    });
  }

  // ---- Insights & token audit modal (Phase 2) ---------------------------

  function activityModalHtml(a) {
    return `
      <div class="modal-header"><h3>Activity — ${Admin.escapeHtml(a.accountName || a.platform)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="tabs" id="activityTabs">
        <button type="button" class="tab-btn is-active" data-tab="insights">Insights</button>
        <button type="button" class="tab-btn" data-tab="audit">Token History</button>
      </div>
      <div class="modal-body">
        <div class="tab-panel is-active" data-panel="insights" id="insightsPanel">
          <div class="flex-gap"><span class="spinner spinner-dark"></span> Loading…</div>
        </div>
        <div class="tab-panel" data-panel="audit" id="auditPanel">
          <div class="flex-gap"><span class="spinner spinner-dark"></span> Loading…</div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
      </div>
    `;
  }

  async function openActivityModal(a) {
    Admin.openModal(activityModalHtml(a));
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('is-active'));
        backdrop.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('is-active'));
        btn.classList.add('is-active');
        backdrop.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('is-active');
      });
    });

    try {
      const res = await Admin.api.get(ACCOUNT_API.insights(a.id));
      const history = res.data.insights || [];
      const panel = document.getElementById('insightsPanel');
      if (!panel) return;
      if (!history.length) {
        panel.innerHTML = `<p class="cell-muted">No insight snapshots recorded yet.</p>`;
      } else {
        panel.innerHTML = `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Followers</th><th>Following</th><th>Profile Views</th></tr></thead>
              <tbody>
                ${history.slice().reverse().map((h) => `
                  <tr>
                    <td>${Admin.escapeHtml(h.metricDate)}</td>
                    <td>${h.followersCount ?? '—'}</td>
                    <td>${h.followingCount ?? '—'}</td>
                    <td>${h.profileViews ?? '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      const panel = document.getElementById('insightsPanel');
      if (panel) panel.innerHTML = `<p class="cell-muted">Couldn't load insights.</p>`;
    }

    try {
      const res = await Admin.api.get(ACCOUNT_API.tokenAudit(a.id));
      const events = res.data.events || [];
      const panel = document.getElementById('auditPanel');
      if (!panel) return;
      if (!events.length) {
        panel.innerHTML = `<p class="cell-muted">No token events recorded yet.</p>`;
      } else {
        const EVENT_BADGE = { issued: 'badge-green', refreshed: 'badge-green', refresh_failed: 'badge-coral', revoked: 'badge-gray', expired: 'badge-amber' };
        panel.innerHTML = `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Triggered By</th><th>When</th></tr></thead>
              <tbody>
                ${events.map((e) => `
                  <tr>
                    <td>
                      <span class="badge ${EVENT_BADGE[e.eventType] || 'badge-gray'}"><span class="badge-dot"></span>${Admin.escapeHtml(e.eventType)}</span>
                      ${e.errorMessage ? `<div class="cell-muted" style="font-size:11px;margin-top:3px;">${Admin.escapeHtml(e.errorMessage)}</div>` : ''}
                    </td>
                    <td class="cell-muted">${Admin.escapeHtml(e.triggeredBy)}</td>
                    <td class="cell-muted">${Admin.timeAgo(e.createdAt)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      const panel = document.getElementById('auditPanel');
      if (panel) panel.innerHTML = `<p class="cell-muted">Couldn't load token history.</p>`;
    }
  }

  // ---- Refresh / meta / disconnect -------------------------------------

  async function refreshToken(a) {
    try {
      await Admin.api.post(API.refreshToken(a.id));
      Admin.toast('Token refreshed', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function disconnect(a) {
    const ok = await Admin.confirmAction({
      title: 'Disconnect account?',
      body: `Disconnect <strong>${Admin.escapeHtml(a.accountName || a.platform)}</strong>? Any scheduled posts targeting it will fail to publish. This can't be undone.`,
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.disconnect(a.id));
      Admin.toast('Account disconnected', 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  function openMetaModal(a) {
    const metaJson = JSON.stringify(a.meta || {}, null, 2);
    Admin.openModal(`
      <div class="modal-header"><h3>Account Settings</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="metaForm">
        <div class="modal-body">
          <div id="metaFormErrors"></div>
          <p class="hint" style="margin-bottom:10px;">${a.platform === 'whatsapp'
            ? 'Set <code>defaultRecipient</code> (E.164 phone number) so posts to this account know who to message.'
            : 'Raw JSON settings stored against this connected account.'}</p>
          <div class="form-group">
            <label for="f-meta">Meta (JSON)</label>
            <textarea id="f-meta" style="min-height:160px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;">${Admin.escapeHtml(metaJson)}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="metaFormSubmit">Save</button>
        </div>
      </form>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#metaForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('metaFormErrors');
      errBox.innerHTML = '';
      let meta;
      try {
        meta = JSON.parse(document.getElementById('f-meta').value || '{}');
      } catch (err) {
        errBox.innerHTML = '<div class="form-errors"><strong>Invalid JSON</strong></div>';
        return;
      }
      const btn = document.getElementById('metaFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        await Admin.api.patch(API.updateMeta(a.id), { meta });
        Admin.toast('Account settings updated', 'success');
        Admin.closeModal();
        loadList();
      } catch (err) {
        errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  // ---- Connect: platform picker grid -----------------------------------

  function openPlatformGrid() {
    if (!state.socialClientId) { Admin.toast('Select a client first', 'error'); return; }
    const selectedClient = clients.find((c) => String(c.id) === state.socialClientId);
    Admin.openModal(`
      <div class="modal-header"><h3>Connect Account</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:14px;">Pick a platform to connect for <strong>${Admin.escapeHtml(selectedClient ? selectedClient.businessName : 'this client')}</strong>.</p>
        <div class="platform-grid">
          ${PLATFORM_ORDER.map((p) => `
            <button type="button" class="platform-tile" data-platform="${p}" style="--pchip:${PLATFORMS[p].color}">
              <span class="platform-tile-dot"></span>
              <span>${PLATFORMS[p].label}</span>
              ${PLATFORMS[p].manual ? '<span class="platform-tile-manual">Manual</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
      </div>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelectorAll('.platform-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const platform = tile.dataset.platform;
        if (PLATFORMS[platform].manual) {
          openManualConnectForm(platform);
        } else {
          beginOAuthConnect(platform);
        }
      });
    });
  }

  async function beginOAuthConnect(platform) {
    try {
      const res = await Admin.api.get(API.connect(platform) + Admin.qs({ social_client_id: state.socialClientId }));
      const authUrl = res.data.authUrl;
      if (!authUrl) throw new Error('No authorize URL returned');
      window.location.href = authUrl;
    } catch (err) { Admin.toastError(err); }
  }

  function openManualConnectForm(platform) {
    const p = PLATFORMS[platform];
    Admin.openModal(`
      <div class="modal-header"><h3>Connect ${Admin.escapeHtml(p.label)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <form id="manualConnectForm">
        <div class="modal-body">
          <div id="manualConnectErrors"></div>
          ${p.fields.map((f) => `
            <div class="form-group">
              <label for="mf-${f.key}">${Admin.escapeHtml(f.label)} ${f.required ? '<span style="color:var(--coral);">*</span>' : ''}</label>
              <input type="${f.type || 'text'}" id="mf-${f.key}" placeholder="${Admin.escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}>
            </div>
          `).join('')}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary" id="manualConnectSubmit">Connect</button>
        </div>
      </form>
    `);
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));
    backdrop.querySelector('#manualConnectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('manualConnectErrors');
      errBox.innerHTML = '';
      const credentials = {};
      p.fields.forEach((f) => { credentials[f.key] = document.getElementById(`mf-${f.key}`).value.trim(); });

      const btn = document.getElementById('manualConnectSubmit');
      Admin.setButtonLoading(btn, true, 'Connecting…');
      try {
        await Admin.api.post(API.manualConnect, {
          social_client_id: Number(state.socialClientId),
          platform,
          credentials,
        });
        Admin.toast(`${p.label} account connected`, 'success');
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

  init();
})();
