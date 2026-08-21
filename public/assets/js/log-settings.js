/**
 * log-settings.js — Log Settings page (maps to /log-settings.php).
 *
 * ---------------------------------------------------------------------------
 * API map — Node API: src/domains/systemLogs/v1/systemLogs.routes.js
 * ---------------------------------------------------------------------------
 *   GET   /system-logs/settings   - { data: { settings: [{setting_key, setting_value, setting_type, label, description}, ...] } }
 *   PATCH /system-logs/settings   - body { settings: [{ key, value }, ...] }
 *
 * log_settings has no `group` column (unlike site_settings), so groups here
 * are a client-side convenience purely for layout — grouping logic lives in
 * GROUPS below, matched by key prefix. A new setting_key that doesn't match
 * any prefix still shows up, under "Other".
 */
(function () {
  const API = {
    list: '/system-logs/settings',
    update: '/system-logs/settings',
  };

  // JSON-array settings that get a dedicated widget instead of a raw
  // textarea of JSON. Everything else with setting_type 'json' falls back
  // to a newline-per-item textarea (exclude_paths, sensitive_paths).
  const MODE_CHECKBOX_KEY = 'api_request_logging_mode';
  const MODE_OPTIONS = [
    { value: 'all', label: 'All requests (subject to sample rate)' },
    { value: 'errors', label: 'Errors (status \u2265 400)' },
    { value: 'slow', label: 'Slow requests' },
    { value: 'sensitive_routes', label: 'Sensitive routes only' },
  ];
  // alert_recipients is an array of OBJECTS ({mobile, email, userId}), not
  // an array of strings like exclude_paths/alert_channels - it needs raw
  // JSON editing, not the line-per-item textarea the generic 'json' case
  // uses (which would render "[object Object]" for each line).
  const RAW_JSON_KEYS = ['alert_recipients'];

  const GROUPS = [
    { title: 'Master Toggles', match: (k) => k === 'debug_logging_enabled' || k === 'api_request_logging_enabled' },
    { title: 'API Request Logging', match: (k) => k.startsWith('api_request_logging_') },
    { title: 'Thresholds & Windows', match: (k) => k.startsWith('failed_login_burst_') || k.startsWith('otp_brute_force_') || k.startsWith('permission_denied_') || k === 'slow_query_threshold_seconds' },
    { title: 'Alert Dispatch', match: (k) => k.startsWith('alert_') },
    { title: 'Retention (days)', match: (k) => k.startsWith('log_retention_days_') },
  ];

  let rows = [];
  let dirty = {}; // setting_key -> new raw value (string, already JSON-encoded where relevant)
  let canEdit = false;

  async function init() {
    await Admin.requireAuth();
    canEdit = Admin.isUsertype('SUPERADMIN');

    document.getElementById('btnSaveAll').addEventListener('click', saveAll);
    document.getElementById('btnTestAlert').addEventListener('click', sendTestAlert);
    if (!canEdit) {
      document.getElementById('logSettingsToolbar').insertAdjacentHTML(
        'beforeend',
        `<span class="settings-readonly-note">View only — SUPERADMIN required to make changes.</span>`
      );
    }

    await load();
  }

  async function load() {
    const container = document.getElementById('logSettingsGroups');
    container.innerHTML = `<div class="card"><div class="table-empty">Loading settings…</div></div>`;
    try {
      const res = await Admin.api.get(API.list);
      rows = res.data.settings || [];
      dirty = {};
      updateDirtyUi();
      render();
    } catch (err) {
      container.innerHTML = `<div class="card"><div class="table-empty">Couldn't load log settings. Run the seed migration if this is a fresh install.</div></div>`;
      Admin.toastError(err);
    }
  }

  function groupFor(key) {
    const g = GROUPS.find((g) => g.match(key));
    return g ? g.title : 'Other';
  }

  function titleCase(s) {
    return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function render() {
    const container = document.getElementById('logSettingsGroups');
    if (!rows.length) {
      container.innerHTML = `<div class="card"><div class="table-empty">No log settings found. Run the seed migration first.</div></div>`;
      return;
    }

    const buckets = {};
    GROUPS.forEach((g) => (buckets[g.title] = []));
    buckets.Other = [];
    rows.forEach((r) => buckets[groupFor(r.setting_key)].push(r));

    const order = [...GROUPS.map((g) => g.title), 'Other'];
    container.innerHTML = order
      .filter((title) => buckets[title] && buckets[title].length)
      .map((title) => `
        <div class="card" style="margin-bottom:20px;">
          <div class="card-header">
            <div class="card-header-lead"><h3>${Admin.escapeHtml(title)}</h3></div>
          </div>
          <div class="settings-grid">${buckets[title].map(fieldHtml).join('')}</div>
        </div>
      `).join('');

    wireEvents();
  }

  function currentValue(r) {
    return Object.prototype.hasOwnProperty.call(dirty, r.setting_key) ? dirty[r.setting_key] : r.setting_value;
  }

  function parseJsonArray(raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function fieldHtml(r) {
    const label = r.label || titleCase(r.setting_key);
    const hint = r.description ? `<p class="hint">${Admin.escapeHtml(r.description)}</p>` : '';
    const disabled = canEdit ? '' : 'disabled';
    const value = currentValue(r);

    let controlHtml;

    if (r.setting_type === 'boolean') {
      const checked = ['1', 'true', 'yes'].includes(String(value).toLowerCase());
      controlHtml = `
        <label class="switch">
          <input type="checkbox" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="boolean" ${checked ? 'checked' : ''} ${disabled}>
          <span class="slider"></span>
        </label>
        <span class="bool-state-label" data-bool-label="${Admin.escapeHtml(r.setting_key)}" style="margin-left:8px;font-size:13px;color:var(--text-muted);">${checked ? 'Enabled' : 'Disabled'}</span>
      `;
    } else if (r.setting_type === 'number') {
      controlHtml = `<input type="number" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="number" value="${Admin.escapeHtml(value ?? '')}" ${disabled}>`;
    } else if (r.setting_key === MODE_CHECKBOX_KEY) {
      const selected = parseJsonArray(value);
      controlHtml = `
        <div class="checkbox-list" data-mode-group="${Admin.escapeHtml(r.setting_key)}">
          ${MODE_OPTIONS.map((o) => `
            <label class="checkbox-row">
              <input type="checkbox" value="${o.value}" ${selected.includes(o.value) ? 'checked' : ''} ${disabled}>
              <span>${Admin.escapeHtml(o.label)}</span>
            </label>
          `).join('')}
        </div>
      `;
    } else if (r.setting_type === 'json' && RAW_JSON_KEYS.includes(r.setting_key)) {
      let pretty = value;
      try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch (e) { /* leave as-is if not valid JSON yet */ }
      controlHtml = `<textarea data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="raw-json" rows="5" placeholder='[{"mobile":"+91...","email":"..."}]' ${disabled}>${Admin.escapeHtml(pretty || '[]')}</textarea>
        <p class="hint" id="rawjson-err-${Admin.escapeHtml(r.setting_key)}" style="color:var(--danger,#c0392b);display:none;"></p>`;
    } else if (r.setting_type === 'json') {
      const items = parseJsonArray(value);
      controlHtml = `<textarea data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="json-lines" rows="3" placeholder="One value per line" ${disabled}>${Admin.escapeHtml(items.join('\n'))}</textarea>`;
    } else {
      controlHtml = `<input type="text" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="text" value="${Admin.escapeHtml(value || '')}" ${disabled}>`;
    }

    return `
      <div class="form-group settings-field">
        <div class="settings-field-label">
          <span>${Admin.escapeHtml(label)}</span>
          <span class="settings-type-badge">${Admin.escapeHtml(r.setting_type)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-history-key="${Admin.escapeHtml(r.setting_key)}" style="margin-left:auto;">History</button>
        </div>
        ${controlHtml}
        ${hint}
      </div>
    `;
  }

  function wireEvents() {
    // History is view-only info, available regardless of canEdit.
    document.getElementById('logSettingsGroups').querySelectorAll('[data-history-key]').forEach((btn) => {
      btn.addEventListener('click', () => openHistoryModal(btn.dataset.historyKey));
    });

    if (!canEdit) return;
    const container = document.getElementById('logSettingsGroups');

    container.querySelectorAll('[data-kind="text"]').forEach((el) => {
      el.addEventListener('input', () => markDirty(el.dataset.key, el.value));
    });

    container.querySelectorAll('[data-kind="number"]').forEach((el) => {
      el.addEventListener('input', () => markDirty(el.dataset.key, el.value));
    });

    container.querySelectorAll('[data-kind="boolean"]').forEach((el) => {
      el.addEventListener('change', () => {
        markDirty(el.dataset.key, el.checked ? '1' : '0');
        const lbl = container.querySelector(`[data-bool-label="${cssEscape(el.dataset.key)}"]`);
        if (lbl) lbl.textContent = el.checked ? 'Enabled' : 'Disabled';
      });
    });

    container.querySelectorAll('[data-kind="json-lines"]').forEach((el) => {
      el.addEventListener('input', () => {
        const items = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        markDirty(el.dataset.key, JSON.stringify(items));
      });
    });

    container.querySelectorAll('[data-kind="raw-json"]').forEach((el) => {
      el.addEventListener('input', () => {
        const errEl = document.getElementById(`rawjson-err-${cssEscape(el.dataset.key)}`);
        try {
          const parsed = JSON.parse(el.value);
          if (errEl) errEl.style.display = 'none';
          markDirty(el.dataset.key, JSON.stringify(parsed));
        } catch (e) {
          // Don't mark dirty on invalid JSON - Save All would send broken
          // data. Show the parse error instead so the admin can fix it.
          if (errEl) { errEl.textContent = 'Invalid JSON: ' + e.message; errEl.style.display = ''; }
        }
      });
    });

    container.querySelectorAll('[data-mode-group]').forEach((group) => {
      const key = group.dataset.modeGroup;
      group.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const selected = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
          markDirty(key, JSON.stringify(selected));
        });
      });
    });
  }

  function cssEscape(s) {
    return String(s).replace(/(["\\])/g, '\\$1');
  }

  function markDirty(key, value) {
    dirty[key] = value;
    updateDirtyUi();
  }

  function updateDirtyUi() {
    const count = Object.keys(dirty).length;
    document.getElementById('dirtyIndicator').style.display = count ? '' : 'none';
    document.getElementById('dirtyIndicator').textContent = `${count} unsaved change${count === 1 ? '' : 's'}`;
    document.getElementById('btnSaveAll').disabled = count === 0;
  }

  async function saveAll() {
    if (!Object.keys(dirty).length) return;
    const btn = document.getElementById('btnSaveAll');
    Admin.setButtonLoading(btn, true, 'Saving…');
    try {
      const settings = Object.entries(dirty).map(([key, value]) => ({ key, value }));
      await Admin.api.patch(API.update, { settings });
      Admin.toast('Log settings saved — takes effect immediately', 'success');
      dirty = {};
      await load();
    } catch (err) {
      Admin.toastError(err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  // ---- Change history (2.1) ------------------------------------------------
  // GET /system-logs/settings/history?key=... -> old_value/new_value/who/when,
  // newest first. Every PATCH /system-logs/settings write auto-creates a row
  // here (see systemLogs.service.js) - nothing to do on save, just display.
  async function openHistoryModal(key) {
    Admin.openModal(`
      <div class="modal-header"><h3>History — ${Admin.escapeHtml(key)}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
      <div class="modal-body" id="historyModalBody"><p class="cell-muted">Loading history…</p></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>
    `, 'modal-lg');
    document.getElementById('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((el) => el.addEventListener('click', Admin.closeModal));

    const body = document.getElementById('historyModalBody');
    try {
      const res = await Admin.api.get(`/system-logs/settings/history?key=${encodeURIComponent(key)}`);
      const items = res.data || [];
      if (!items.length) {
        body.innerHTML = `<p class="cell-muted">No changes recorded yet for this setting.</p>`;
        return;
      }
      body.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Old value</th><th>New value</th><th>Changed by</th><th>When</th></tr></thead>
            <tbody>
              ${items.map((h) => `
                <tr>
                  <td class="cell-muted">${h.old_value === null ? '<em>(none)</em>' : `<code>${Admin.escapeHtml(String(h.old_value))}</code>`}</td>
                  <td><code>${Admin.escapeHtml(String(h.new_value ?? ''))}</code></td>
                  <td class="cell-muted">${h.changed_by != null ? '#' + h.changed_by : '—'}</td>
                  <td class="cell-muted">${Admin.formatDate(h.changed_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<p class="cell-muted">Couldn't load history for this setting.</p>`;
      Admin.toastError(err);
    }
  }

  // ---- Send Test Alert -----------------------------------------------------
  // POST /system-logs/settings/test-alert - fires a synthetic critical alert
  // through the configured webhook (bypasses alert_dispatch_enabled and the
  // severity threshold server-side) so unsaved form edits don't matter here -
  // it always tests against the LAST SAVED settings, same as a real event
  // would use. Save first if you just changed the webhook URL/secret.
  async function sendTestAlert() {
    const btn = document.getElementById('btnTestAlert');
    Admin.setButtonLoading(btn, true, 'Sending…');
    try {
      const res = await Admin.api.post('/system-logs/settings/test-alert');
      Admin.toast(
        res.data.success ? 'Test alert delivered successfully' : `Webhook responded with an error (HTTP ${res.data.statusCode ?? '—'})`,
        res.data.success ? 'success' : 'error'
      );
    } catch (err) {
      Admin.toastError(err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  init();
})();
