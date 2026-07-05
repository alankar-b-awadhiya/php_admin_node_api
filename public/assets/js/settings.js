/**
 * settings.js — Site Settings page (maps to /settings).
 *
 * ---------------------------------------------------------------------------
 * API map — every endpoint this file calls. Update paths here ONLY; nothing
 * else in this file should hardcode a URL. Keep this in sync with:
 *   Node API: src/api/v1/index.js, src/domains/settings/settings.routes.js
 * ---------------------------------------------------------------------------
 *
 *   GET    API.list          - all settings rows (?group= optional filter, unused here — we fetch all and group client-side)
 *   PATCH  API.update        - batch update: { settings: { key: value, ... } }
 *   POST   API.uploadLogo    - multipart upload for logo_main / logo_favicon: { file, type }
 *
 * This page is entirely data-driven off whatever rows the API returns —
 * groups, labels, types, and fields are never hardcoded, so a new setting
 * or group added on the backend shows up here automatically.
 */
(function () {
  const API = {
    list: '/settings',
    update: '/settings',
    uploadLogo: '/settings/upload-logo',
  };

  // Settings whose "image" type is backed by the dedicated logo upload
  // endpoint rather than a plain URL text field (mirrors ALLOWED_LOGO_TYPES
  // in settings.validation.js).
  const LOGO_KEYS = ['logo_main', 'logo_favicon'];

  const API_ORIGIN = (window.API_BASE_URL || '').replace(/\/api\/v1\/?$/, '');
  function assetUrl(relPath) {
    return relPath ? API_ORIGIN + relPath : '';
  }

  const GROUP_ICON = {
    analytics: '<path d="M4 16V9M9 16V4M14 16v-6M4 16h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    email: '<path d="M3 5h14v10H3V5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 5.5 10 11l7-5.5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    features: '<circle cx="6" cy="6" r="2.4" stroke="currentColor" stroke-width="1.4"/><circle cx="14" cy="6" r="2.4" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="14" r="2.4" stroke="currentColor" stroke-width="1.4"/><circle cx="14" cy="14" r="2.4" stroke="currentColor" stroke-width="1.4"/>',
    general: '<circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.4"/><path d="M10 2.8c2.4 2 2.4 12.4 0 14.4M2.8 10h14.4" stroke="currentColor" stroke-width="1.2"/>',
    limits: '<path d="M3 6h14M3 10h10M3 14h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="10" r="1" fill="currentColor"/>',
    seo: '<circle cx="8.5" cy="8.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="m16 16-3.2-3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    social: '<circle cx="15" cy="4.5" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="15" cy="15.5" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="10" r="2" stroke="currentColor" stroke-width="1.3"/><path d="m6.7 9 6.6-3.6M6.7 11l6.6 3.6" stroke="currentColor" stroke-width="1.3"/>',
    theme: '<circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.4"/><path d="M10 2.8a7.2 7.2 0 0 0 0 14.4c1.6 0 1.6-1.6 0-2.4-1.4-.7-.6-2.4.8-2.4h1.2a3 3 0 0 0 3-3c0-3.6-2.7-6.6-5-6.6Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>',
    default: '<circle cx="10" cy="10" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M10 2.5v2.2M10 15.3v2.2M17.5 10h-2.2M4.7 10H2.5M15 5l-1.5 1.5M6.5 13.5 5 15M15 15l-1.5-1.5M6.5 6.5 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  };

  let rows = [];        // raw rows from GET /settings
  let byKey = {};        // setting_key -> row
  let groups = [];       // ordered distinct group names
  let dirty = {};         // setting_key -> pending new value (text/boolean/color/plain-image)
  let activeGroup = 'all';
  let canEdit = false;

  async function init() {
    await Admin.requireAuth();
    canEdit = Admin.isUsertype('SUPERADMIN');

    document.getElementById('btnSaveAll').addEventListener('click', saveAll);
    if (!canEdit) {
      document.getElementById('settingsToolbar').insertAdjacentHTML(
        'afterbegin',
        `<span class="settings-readonly-note">View only — SUPERADMIN required to make changes.</span>`
      );
    }

    await loadSettings();
  }

  async function loadSettings() {
    const container = document.getElementById('settingsGroups');
    container.innerHTML = `<div class="card"><div class="table-empty">Loading settings…</div></div>`;
    try {
      const res = await Admin.api.get(API.list);
      rows = res.data.settings || [];
      byKey = {};
      groups = [];
      rows.forEach((r) => {
        byKey[r.setting_key] = r;
        if (!groups.includes(r.group)) groups.push(r.group);
      });
      dirty = {};
      updateDirtyUi();
      renderTabs();
      renderGroups();
    } catch (err) {
      container.innerHTML = `<div class="card"><div class="table-empty">Couldn't load settings.</div></div>`;
      Admin.toastError(err);
    }
  }

  function renderTabs() {
    const el = document.getElementById('settingsTabs');
    const tabs = ['all', ...groups];
    el.innerHTML = tabs.map((g) => `
      <button class="tab-btn ${g === activeGroup ? 'is-active' : ''}" data-group="${Admin.escapeHtml(g)}">
        ${g === 'all' ? 'All' : Admin.escapeHtml(titleCase(g))}
      </button>
    `).join('');
    el.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeGroup = btn.dataset.group;
        renderTabs();
        renderGroups();
      });
    });
  }

  function titleCase(s) {
    return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderGroups() {
    const container = document.getElementById('settingsGroups');
    const visibleGroups = activeGroup === 'all' ? groups : [activeGroup];

    if (!rows.length) {
      container.innerHTML = `<div class="card"><div class="table-empty">No settings found.</div></div>`;
      return;
    }

    container.innerHTML = visibleGroups.map((g) => {
      const fieldsHtml = rows.filter((r) => r.group === g).map(fieldHtml).join('');
      const icon = GROUP_ICON[g.toLowerCase()] || GROUP_ICON.default;
      return `
        <div class="card settings-group-anchor" style="margin-bottom:20px;">
          <div class="card-header">
            <div class="card-header-lead">
              <span class="card-header-icon"><svg width="15" height="15" viewBox="0 0 20 20" fill="none">${icon}</svg></span>
              <h3>${Admin.escapeHtml(titleCase(g))}</h3>
            </div>
          </div>
          <div class="settings-grid">${fieldsHtml}</div>
        </div>
      `;
    }).join('');

    wireFieldEvents();
  }

  function fieldHtml(r) {
    const label = r.label || titleCase(r.setting_key);
    const hint = r.description ? `<p class="hint">${Admin.escapeHtml(r.description)}</p>` : '';
    const disabled = canEdit ? '' : 'disabled';
    const currentValue = Object.prototype.hasOwnProperty.call(dirty, r.setting_key) ? dirty[r.setting_key] : r.setting_value;

    let controlHtml;
    if (r.setting_type === 'boolean') {
      const checked = ['1', 'true', 'yes'].includes(String(currentValue).toLowerCase());
      controlHtml = `
        <label class="switch">
          <input type="checkbox" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="boolean" ${checked ? 'checked' : ''} ${disabled}>
          <span class="slider"></span>
        </label>
        <span class="bool-state-label" data-bool-label="${Admin.escapeHtml(r.setting_key)}" style="margin-left:8px;font-size:13px;color:var(--text-muted);">${checked ? 'Enabled' : 'Disabled'}</span>
      `;
    } else if (r.setting_type === 'color') {
      const value = currentValue || '#000000';
      controlHtml = `
        <div class="settings-color-row">
          <input type="color" class="settings-color-swatch" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="color-swatch" value="${Admin.escapeHtml(value)}" ${disabled}>
          <input type="text" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="color-text" value="${Admin.escapeHtml(value)}" ${disabled}>
        </div>
      `;
    } else if (r.setting_type === 'image' && LOGO_KEYS.includes(r.setting_key)) {
      const previewSrc = assetUrl(r.setting_value);
      controlHtml = `
        <div class="settings-image-row">
          <div class="settings-image-preview">${previewSrc ? `<img src="${previewSrc}" alt="${Admin.escapeHtml(label)}">` : ''}</div>
          <div class="settings-image-controls">
            <input type="file" accept="image/*" data-logo-input="${Admin.escapeHtml(r.setting_key)}" ${disabled}>
            ${canEdit ? `<button type="button" class="btn btn-success btn-sm" data-logo-upload="${Admin.escapeHtml(r.setting_key)}">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              Upload ${r.setting_key === 'logo_favicon' ? 'Favicon' : 'Logo'}
            </button>` : ''}
            <span class="settings-path-readout" data-path-readout="${Admin.escapeHtml(r.setting_key)}">${Admin.escapeHtml(r.setting_value || '')}</span>
          </div>
        </div>
      `;
    } else {
      const value = currentValue || '';
      const useTextarea = value.includes('\n') || value.length > 80;
      controlHtml = useTextarea
        ? `<textarea data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="text" ${disabled}>${Admin.escapeHtml(value)}</textarea>`
        : `<input type="text" data-key="${Admin.escapeHtml(r.setting_key)}" data-kind="text" value="${Admin.escapeHtml(value)}" ${disabled}>`;
    }

    return `
      <div class="form-group settings-field">
        <div class="settings-field-label">
          <span>${Admin.escapeHtml(label)}</span>
          <span class="settings-type-badge">${Admin.escapeHtml(r.setting_type)}</span>
        </div>
        ${controlHtml}
        ${hint}
      </div>
    `;
  }

  function wireFieldEvents() {
    if (!canEdit) return;
    const container = document.getElementById('settingsGroups');

    container.querySelectorAll('[data-kind="text"]').forEach((el) => {
      el.addEventListener('input', () => markDirty(el.dataset.key, el.value));
    });

    container.querySelectorAll('[data-kind="boolean"]').forEach((el) => {
      el.addEventListener('change', () => {
        markDirty(el.dataset.key, el.checked ? '1' : '0');
        const label = container.querySelector(`[data-bool-label="${cssEscape(el.dataset.key)}"]`);
        if (label) label.textContent = el.checked ? 'Enabled' : 'Disabled';
      });
    });

    container.querySelectorAll('[data-kind="color-swatch"]').forEach((el) => {
      el.addEventListener('input', () => {
        markDirty(el.dataset.key, el.value);
        const twin = container.querySelector(`[data-kind="color-text"][data-key="${cssEscape(el.dataset.key)}"]`);
        if (twin) twin.value = el.value;
      });
    });
    container.querySelectorAll('[data-kind="color-text"]').forEach((el) => {
      el.addEventListener('input', () => {
        markDirty(el.dataset.key, el.value);
        const twin = container.querySelector(`[data-kind="color-swatch"][data-key="${cssEscape(el.dataset.key)}"]`);
        if (twin && /^#[0-9a-fA-F]{6}$/.test(el.value)) twin.value = el.value;
      });
    });

    container.querySelectorAll('[data-logo-upload]').forEach((btn) => {
      btn.addEventListener('click', () => uploadLogo(btn.dataset.logoUpload));
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
      await Admin.api.patch(API.update, { settings: dirty });
      Admin.toast('Settings saved', 'success');
      dirty = {};
      await loadSettings();
    } catch (err) {
      Admin.toastError(err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  async function uploadLogo(key) {
    const input = document.querySelector(`[data-logo-input="${cssEscape(key)}"]`);
    if (!input.files.length) {
      Admin.toast('Choose a file first', 'error');
      return;
    }
    const btn = document.querySelector(`[data-logo-upload="${cssEscape(key)}"]`);
    Admin.setButtonLoading(btn, true, 'Uploading…');
    const fd = new FormData();
    fd.append('file', input.files[0]);
    fd.append('type', key);
    try {
      const res = await Admin.api.uploadForm(API.uploadLogo, fd);
      Admin.toast('Uploaded', 'success');
      const url = res.data.url;
      if (byKey[key]) byKey[key].setting_value = url;
      const idx = rows.findIndex((r) => r.setting_key === key);
      if (idx > -1) rows[idx].setting_value = url;
      renderGroups();
    } catch (err) {
      Admin.toastError(err);
    } finally {
      Admin.setButtonLoading(btn, false);
    }
  }

  init();
})();
