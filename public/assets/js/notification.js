/**
 * notification.js — Notifications page (maps to /notification).
 *
 * Templates tab:
 *   GET/POST   /notification/templates
 *   GET/PUT    /notification/templates/:id
 *   PATCH      /notification/templates/:id/activate | /deactivate
 *   DELETE     /notification/templates/:id
 *   GET/POST   /notification/templates/:id/variables
 *   DELETE     /notification/templates/:id/variables/:name
 *   GET/POST   /notification/templates/:id/limits
 *   GET/POST   /notification/templates/:id/translations
 *   DELETE     /notification/templates/:id/translations/:lang
 *
 * Delivery Logs tab:
 *   GET /notification/logs, GET /notification/logs/:id
 *
 * Send Test tab:
 *   POST /notification/send-sms, POST /notification/send-email
 *   (there is no send-web-push route in the API yet)
 */
(function () {
  const ICON = {
    view: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    toggle: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 5.2A6 6 0 1 0 14 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-8A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14H6" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  const TYPE_ICON = {
    SMS: '<svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V5Z"/></svg>',
    EMAIL: '<svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4h16v12H2V4Zm1.2 1.3L10 10l6.8-4.7"/></svg>',
    WEB_PUSH: '<svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5a1.4 1.4 0 0 0-1.4 1.4v.6C6 4.1 4.4 6.1 4.4 8.6v3.3L2.7 14.5c-.3.5.1 1.1.7 1.1h13.2c.6 0 1-.6.7-1.1l-1.7-2.6V8.6c0-2.5-1.6-4.5-4.2-5.1v-.6A1.4 1.4 0 0 0 10 1.5Zm0 17a2.2 2.2 0 0 0 2.2-2H7.8A2.2 2.2 0 0 0 10 18.5Z"/></svg>',
  };
  const TYPE_LABEL = { SMS: 'SMS', EMAIL: 'EMAIL', WEB_PUSH: 'WEB PUSH' };
  const VAR_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'LOOP'];

  function typeBadge(type) {
    return `<span class="badge badge-type-${(type || '').toLowerCase()}">${TYPE_LABEL[type] || type}</span>`;
  }

  // ============================= Tabs ====================================
  function initTabs() {
    document.querySelectorAll('.tabstrip-btn').forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
    const initial = ['logs', 'send'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'templates';
    activateTab(initial);
  }
  let logsLoaded = false, sendLoaded = false;
  function activateTab(name) {
    document.querySelectorAll('.tabstrip-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
    history.replaceState(null, '', name === 'templates' ? location.pathname : `#${name}`);
    if (name === 'logs' && !logsLoaded) { logsLoaded = true; Logs.init(); }
    if (name === 'send' && !sendLoaded) { sendLoaded = true; Send.init(); }
  }

  // ============================= Templates ====================================
  const Templates = (function () {
    let state = { page: 1, pageSize: 20, templateType: '', isActive: '', search: '', allVersions: false };

    function init() {
      document.getElementById('btnNewTemplate').addEventListener('click', () => openFormModal(null));
      document.getElementById('btnRefreshTemplates').addEventListener('click', load);
      document.getElementById('tmplSearch').addEventListener('input', Admin.debounce((e) => {
        state.search = e.target.value.trim(); state.page = 1; load();
      }, 350));
      document.getElementById('tmplStatusFilter').addEventListener('change', (e) => { state.isActive = e.target.value; state.page = 1; load(); });
      document.getElementById('tmplAllVersions').addEventListener('change', (e) => { state.allVersions = e.target.checked; state.page = 1; load(); });
      document.querySelectorAll('#typeFilterGroup button').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#typeFilterGroup button').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          state.templateType = btn.dataset.type; state.page = 1; load();
        });
      });
      load();
    }

    async function load() {
      const grid = document.getElementById('templatesGrid');
      grid.innerHTML = `<div class="table-empty">Loading templates…</div>`;
      try {
        const query = Admin.qs({
          templateType: state.templateType, isActive: state.isActive, search: state.search,
          allVersions: state.allVersions ? 'true' : '', page: state.page, perPage: state.pageSize,
        });
        const res = await Admin.api.get('/notification/templates' + query);
        renderGrid(res.data);
        renderPagination(res.meta && res.meta.pagination);
        document.getElementById('templateCount').textContent = `${(res.meta && res.meta.pagination.total) || res.data.length} template${res.data.length === 1 ? '' : 's'}`;
      } catch (err) {
        grid.innerHTML = `<div class="table-empty">Couldn't load templates.</div>`;
        Admin.toastError(err);
      }
    }

    function renderGrid(rows) {
      const grid = document.getElementById('templatesGrid');
      if (!rows.length) {
        grid.innerHTML = `<div class="table-empty">No templates match your filters.</div>`;
        return;
      }
      grid.innerHTML = rows.map((t) => `
        <div class="tmpl-card" data-id="${t.id}">
          <div class="tmpl-card-top">
            <div class="tmpl-card-icon icon-${t.templateType.toLowerCase()}">${TYPE_ICON[t.templateType] || ''}</div>
            <div class="tmpl-card-meta">
              <div class="tmpl-card-title">
                ${Admin.escapeHtml(t.templateName)}
                ${typeBadge(t.templateType)}
                <span class="version-chip">v${t.version}</span>
                ${Admin.badge(t.isActive)}
              </div>
              ${t.subject ? `<div class="tmpl-card-subject">Subject: ${Admin.escapeHtml(t.subject)}</div>` : ''}
            </div>
          </div>
          <div class="tmpl-card-body">${Admin.escapeHtml(t.bodyText || '')}</div>
          <div class="tmpl-card-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View details">${ICON.view}</button>
            <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
            <button class="icon-action icon-action-toggle" data-act="toggle" title="${t.isActive ? 'Deactivate' : 'Activate'}">${ICON.toggle}</button>
            <button class="icon-action icon-action-copy" data-act="duplicate" title="Duplicate as new template">${ICON.copy}</button>
            <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.tmpl-card').forEach((card) => {
        const id = card.dataset.id;
        const row = rows.find((r) => String(r.id) === id);
        card.querySelector('[data-act="view"]').addEventListener('click', () => openDetailModal(row.id, 'content'));
        card.querySelector('[data-act="edit"]').addEventListener('click', () => openDetailModal(row.id, 'content'));
        card.querySelector('[data-act="toggle"]').addEventListener('click', () => toggleActive(row));
        card.querySelector('[data-act="duplicate"]').addEventListener('click', () => openFormModal(row, true));
        card.querySelector('[data-act="delete"]').addEventListener('click', () => deleteTemplate(row));
      });
    }

    function renderPagination(pagination) {
      const el = document.getElementById('templatesPagination');
      if (!pagination) { el.innerHTML = ''; return; }
      const { page, perPage, total, pages } = pagination;
      el.innerHTML = `
        <span>${total} template${total === 1 ? '' : 's'} · page ${page} of ${Math.max(pages, 1)}</span>
        <div class="flex-gap">
          <button class="btn btn-secondary btn-sm" id="tmplPrev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
          <button class="btn btn-secondary btn-sm" id="tmplNext" ${page >= pages ? 'disabled' : ''}>Next</button>
        </div>`;
      document.getElementById('tmplPrev')?.addEventListener('click', () => { state.page--; load(); });
      document.getElementById('tmplNext')?.addEventListener('click', () => { state.page++; load(); });
    }

    async function toggleActive(t) {
      try {
        await Admin.api.patch(`/notification/templates/${t.id}/${t.isActive ? 'deactivate' : 'activate'}`);
        Admin.toast(t.isActive ? 'Template deactivated' : 'Template activated', 'success');
        load();
      } catch (err) { Admin.toastError(err); }
    }

    async function deleteTemplate(t) {
      const ok = await Admin.confirmAction({
        title: 'Delete template?',
        body: `This permanently deletes <strong>${Admin.escapeHtml(t.templateName)}</strong> (v${t.version}, ${t.templateType}) along with its variables, rate limits and translations. This can't be undone.`,
        confirmLabel: 'Delete template', danger: true,
      });
      if (!ok) return;
      try {
        await Admin.api.del(`/notification/templates/${t.id}`);
        Admin.toast('Template deleted', 'success');
        load();
      } catch (err) { Admin.toastError(err); }
    }

    // ---- Create / Duplicate modal -------------------------------------------
    function formHtml(source, isDuplicate) {
      const t = source || {};
      return `
        <div class="modal-header"><h3>${isDuplicate ? 'Duplicate template' : 'New template'}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
        <form id="tmplForm">
          <div class="modal-body">
            <div id="tmplFormErrors"></div>
            ${isDuplicate ? `<div class="callout callout-amber">Saving with the same name + type as an existing template creates a new version and automatically demotes the current default.</div>` : ''}
            <div class="form-row">
              <div class="form-group">
                <label for="f-templateName">Template name</label>
                <input type="text" id="f-templateName" value="${Admin.escapeHtml(t.templateName || '')}" placeholder="e.g. OTP, INVOICE" required>
              </div>
              <div class="form-group">
                <label for="f-templateType">Type</label>
                <select id="f-templateType" required>
                  <option value="SMS" ${t.templateType === 'SMS' ? 'selected' : ''}>SMS</option>
                  <option value="EMAIL" ${t.templateType === 'EMAIL' ? 'selected' : ''}>EMAIL</option>
                  <option value="WEB_PUSH" ${t.templateType === 'WEB_PUSH' ? 'selected' : ''}>WEB_PUSH</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="f-templateId">Provider template ID <span class="hint" style="display:inline;">(optional — e.g. DLT template ID for SMS)</span></label>
              <input type="text" id="f-templateId" value="${Admin.escapeHtml(t.templateId || '')}">
            </div>
            <div class="form-group">
              <label for="f-subject">Subject <span class="hint" style="display:inline;">(Email only)</span></label>
              <input type="text" id="f-subject" value="${Admin.escapeHtml(t.subject || '')}" placeholder="Supports {{variables}}">
            </div>
            <div class="form-group">
              <label for="f-bodyText">Body text</label>
              <textarea id="f-bodyText" rows="5" placeholder="Supports {{var}}, {{#if var}}…{{/if}}, {{#loop}}…{{/loop}}" required>${Admin.escapeHtml(t.bodyText || '')}</textarea>
            </div>
            <div class="form-group">
              <label for="f-bodyHtml">Body HTML <span class="hint" style="display:inline;">(Email only, optional)</span></label>
              <textarea id="f-bodyHtml" rows="4">${Admin.escapeHtml(t.bodyHtml || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
            <button type="submit" class="btn btn-primary" id="tmplFormSubmit">Create template</button>
          </div>
        </form>`;
    }

    function openFormModal(source, isDuplicate) {
      Admin.openModal(formHtml(source, isDuplicate));
      const backdrop = document.getElementById('modalBackdrop');
      backdrop.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
      backdrop.querySelector('#tmplForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = document.getElementById('tmplFormErrors');
        errBox.innerHTML = '';
        const btn = document.getElementById('tmplFormSubmit');
        Admin.setButtonLoading(btn, true, 'Creating…');
        try {
          await Admin.api.post('/notification/templates', {
            templateName: document.getElementById('f-templateName').value.trim(),
            templateType: document.getElementById('f-templateType').value,
            templateId: document.getElementById('f-templateId').value.trim() || undefined,
            subject: document.getElementById('f-subject').value.trim() || undefined,
            bodyText: document.getElementById('f-bodyText').value,
            bodyHtml: document.getElementById('f-bodyHtml').value.trim() || undefined,
          });
          Admin.toast('Template created', 'success');
          Admin.closeModal();
          load();
        } catch (err) {
          errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong>${
            err.errors ? `<ul>${err.errors.map((m) => `<li>${Admin.escapeHtml(m)}</li>`).join('')}</ul>` : ''
          }</div>`;
        } finally {
          Admin.setButtonLoading(btn, false);
        }
      });
    }

    // ---- Detail modal (content / variables / limits / translations) --------
    async function openDetailModal(id, startTab) {
      Admin.openModal(`<div class="modal-body"><span class="spinner spinner-dark"></span> Loading template…</div>`);
      try {
        const res = await Admin.api.get(`/notification/templates/${id}`);
        renderDetailModal(res.data, startTab || 'content');
      } catch (err) {
        Admin.closeModal();
        Admin.toastError(err);
      }
    }

    function renderDetailModal(t, startTab) {
      const backdrop = document.getElementById('modalBackdrop');
      backdrop.innerHTML = `<div class="modal modal-lg">
        <div class="modal-header">
          <h3>${Admin.escapeHtml(t.templateName)} ${typeBadge(t.templateType)} <span class="version-chip">v${t.version}</span></h3>
          <button class="btn btn-ghost btn-icon" data-act="close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="tabs" style="margin-bottom:16px;">
            <button class="tab-btn" data-dtab="content">Content</button>
            <button class="tab-btn" data-dtab="variables">Variables (${t.variables.length})</button>
            <button class="tab-btn" data-dtab="limits">Rate Limits</button>
            <button class="tab-btn" data-dtab="translations">Translations (${t.translations.length})</button>
          </div>
          <div class="dtab-panel" data-dpanel="content"></div>
          <div class="dtab-panel" data-dpanel="variables"></div>
          <div class="dtab-panel" data-dpanel="limits"></div>
          <div class="dtab-panel" data-dpanel="translations"></div>
        </div>
      </div>`;
      backdrop.classList.add('is-open');
      backdrop.onclick = (e) => { if (e.target === backdrop) Admin.closeModal(); };
      backdrop.querySelector('[data-act="close"]').addEventListener('click', Admin.closeModal);

      backdrop.querySelectorAll('[data-dtab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          backdrop.querySelectorAll('[data-dtab]').forEach((b) => b.classList.toggle('is-active', b === btn));
          backdrop.querySelectorAll('.dtab-panel').forEach((p) => {
            p.style.display = p.dataset.dpanel === btn.dataset.dtab ? 'block' : 'none';
          });
        });
      });

      renderContentPanel(t);
      renderVariablesPanel(t);
      renderLimitsPanel(t);
      renderTranslationsPanel(t);

      backdrop.querySelector(`[data-dtab="${startTab}"]`).click();
    }

    function renderContentPanel(t) {
      const panel = document.querySelector('[data-dpanel="content"]');
      panel.innerHTML = `
        <div id="contentFormErrors"></div>
        <div class="form-group">
          <label>Provider template ID</label>
          <input type="text" id="d-templateId" value="${Admin.escapeHtml(t.templateId || '')}">
        </div>
        <div class="form-group">
          <label>Subject ${t.templateType !== 'EMAIL' ? '<span class="hint" style="display:inline;">(Email only)</span>' : ''}</label>
          <input type="text" id="d-subject" value="${Admin.escapeHtml(t.subject || '')}">
        </div>
        <div class="form-group">
          <label>Body text</label>
          <textarea id="d-bodyText" rows="5">${Admin.escapeHtml(t.bodyText || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Body HTML</label>
          <textarea id="d-bodyHtml" rows="4">${Admin.escapeHtml(t.bodyHtml || '')}</textarea>
        </div>
        <label class="checkbox-row" style="margin-bottom:16px;">
          <input type="checkbox" id="d-isActive" ${t.isActive ? 'checked' : ''}> Active
        </label>
        <button class="btn btn-primary" id="btnSaveContent">Save changes</button>
      `;
      panel.querySelector('#btnSaveContent').addEventListener('click', async () => {
        const btn = panel.querySelector('#btnSaveContent');
        const errBox = panel.querySelector('#contentFormErrors');
        errBox.innerHTML = '';
        Admin.setButtonLoading(btn, true, 'Saving…');
        try {
          await Admin.api.put(`/notification/templates/${t.id}`, {
            templateId: panel.querySelector('#d-templateId').value.trim() || null,
            subject: panel.querySelector('#d-subject').value.trim() || null,
            bodyText: panel.querySelector('#d-bodyText').value,
            bodyHtml: panel.querySelector('#d-bodyHtml').value.trim() || null,
            isActive: panel.querySelector('#d-isActive').checked,
          });
          Admin.toast('Template content saved', 'success');
          load();
        } catch (err) {
          errBox.innerHTML = `<div class="form-errors"><strong>${Admin.escapeHtml(err.message)}</strong></div>`;
        } finally {
          Admin.setButtonLoading(btn, false);
        }
      });
    }

    function renderVariablesPanel(t) {
      const panel = document.querySelector('[data-dpanel="variables"]');
      let rows = t.variables.map((v) => ({ ...v }));

      function draw() {
        panel.innerHTML = `
          <p class="hint" style="margin-bottom:12px;">Used inside the body as <code>{{variableName}}</code>. LOOP variables must resolve to an array and render with <code>{{#name}}…{{/name}}</code>.</p>
          <div class="var-row var-row-head">
            <span>Name</span><span>Type</span><span style="text-align:center;">Required</span><span>Default</span><span>Description</span><span></span>
          </div>
          <div id="varRows"></div>
          <div class="flex-gap" style="margin-top:12px;">
            <button class="btn btn-secondary btn-sm" id="btnAddVarRow" type="button">+ Add variable</button>
            <button class="btn btn-primary btn-sm" id="btnSaveVars" type="button">Save variables</button>
          </div>
        `;
        const rowsEl = panel.querySelector('#varRows');
        rowsEl.innerHTML = rows.map((v, i) => `
          <div class="var-row" data-idx="${i}">
            <input type="text" class="v-name" value="${Admin.escapeHtml(v.variableName || '')}" placeholder="variableName">
            <select class="v-type">${VAR_TYPES.map((ty) => `<option value="${ty}" ${v.variableType === ty ? 'selected' : ''}>${ty}</option>`).join('')}</select>
            <span class="var-row-check"><input type="checkbox" class="v-required" ${v.isRequired ? 'checked' : ''}></span>
            <input type="text" class="v-default" value="${Admin.escapeHtml(v.defaultValue || '')}" placeholder="—">
            <input type="text" class="v-desc" value="${Admin.escapeHtml(v.description || '')}" placeholder="—">
            <button class="icon-action icon-action-delete" data-act="remove-var" title="Remove" type="button">${ICON.trash}</button>
          </div>
        `).join('') || `<p class="hint">No variables yet.</p>`;

        rowsEl.querySelectorAll('[data-act="remove-var"]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const idx = Number(btn.closest('.var-row').dataset.idx);
            const v = rows[idx];
            if (v.variableName && v.id) {
              const ok = await Admin.confirmAction({ title: 'Remove variable?', body: `Delete <strong>${Admin.escapeHtml(v.variableName)}</strong>? This can't be undone.`, confirmLabel: 'Remove', danger: true });
              if (!ok) return;
              try {
                await Admin.api.del(`/notification/templates/${t.id}/variables/${encodeURIComponent(v.variableName)}`);
                Admin.toast('Variable removed', 'success');
              } catch (err) { Admin.toastError(err); return; }
            }
            rows.splice(idx, 1);
            draw();
          });
        });

        panel.querySelector('#btnAddVarRow').addEventListener('click', () => {
          syncFromInputs();
          rows.push({ variableName: '', variableType: 'TEXT', isRequired: false, defaultValue: '', description: '' });
          draw();
        });
        panel.querySelector('#btnSaveVars').addEventListener('click', async () => {
          syncFromInputs();
          const clean = rows.filter((v) => v.variableName && v.variableName.trim());
          const btn = panel.querySelector('#btnSaveVars');
          Admin.setButtonLoading(btn, true, 'Saving…');
          try {
            await Admin.api.post(`/notification/templates/${t.id}/variables`, { variables: clean });
            Admin.toast('Variables saved', 'success');
          } catch (err) {
            Admin.toastError(err);
          } finally {
            Admin.setButtonLoading(btn, false);
          }
        });
      }

      function syncFromInputs() {
        panel.querySelectorAll('.var-row[data-idx]').forEach((rowEl) => {
          const idx = Number(rowEl.dataset.idx);
          rows[idx] = {
            ...rows[idx],
            variableName: rowEl.querySelector('.v-name').value.trim(),
            variableType: rowEl.querySelector('.v-type').value,
            isRequired: rowEl.querySelector('.v-required').checked,
            defaultValue: rowEl.querySelector('.v-default').value.trim() || null,
            description: rowEl.querySelector('.v-desc').value.trim() || null,
          };
        });
      }

      draw();
    }

    function renderLimitsPanel(t) {
      const panel = document.querySelector('[data-dpanel="limits"]');
      const l = t.limits || { maxPerHour: 3, maxPerDay: 10, cooldownSeconds: 60 };
      panel.innerHTML = `
        <p class="hint" style="margin-bottom:14px;">Applies per-recipient. A recipient hitting any of these limits gets a 429 from the send endpoint until it clears.</p>
        <div class="form-row">
          <div class="form-group">
            <label>Max per hour</label>
            <input type="number" id="l-maxPerHour" min="1" value="${l.maxPerHour ?? 3}">
          </div>
          <div class="form-group">
            <label>Max per day</label>
            <input type="number" id="l-maxPerDay" min="1" value="${l.maxPerDay ?? 10}">
          </div>
        </div>
        <div class="form-group">
          <label>Cooldown between sends (seconds)</label>
          <input type="number" id="l-cooldownSeconds" min="0" value="${l.cooldownSeconds ?? 60}">
        </div>
        <button class="btn btn-primary" id="btnSaveLimits">Save rate limits</button>
      `;
      panel.querySelector('#btnSaveLimits').addEventListener('click', async () => {
        const btn = panel.querySelector('#btnSaveLimits');
        Admin.setButtonLoading(btn, true, 'Saving…');
        try {
          await Admin.api.post(`/notification/templates/${t.id}/limits`, {
            maxPerHour: Number(panel.querySelector('#l-maxPerHour').value) || 3,
            maxPerDay: Number(panel.querySelector('#l-maxPerDay').value) || 10,
            cooldownSeconds: Number(panel.querySelector('#l-cooldownSeconds').value) || 0,
          });
          Admin.toast('Rate limits saved', 'success');
        } catch (err) {
          Admin.toastError(err);
        } finally {
          Admin.setButtonLoading(btn, false);
        }
      });
    }

    function renderTranslationsPanel(t) {
      const panel = document.querySelector('[data-dpanel="translations"]');
      let translations = t.translations.map((x) => ({ ...x }));
      let activeLang = translations[0] ? translations[0].languageCode : null;

      function draw() {
        panel.innerHTML = `
          <div class="lang-pill-row" id="langPillRow"></div>
          <div id="langForm"></div>
        `;
        const pillRow = panel.querySelector('#langPillRow');
        pillRow.innerHTML = translations.map((tr) => `
          <span class="lang-pill ${tr.languageCode === activeLang ? 'is-active' : ''}" data-lang="${Admin.escapeHtml(tr.languageCode)}">
            ${Admin.escapeHtml(tr.languageCode)} <span class="lang-pill-x" data-act="remove-lang">&times;</span>
          </span>
        `).join('') + `<span class="lang-pill" id="addLangPill">+ Add language</span>`;

        pillRow.querySelectorAll('.lang-pill[data-lang]').forEach((pill) => {
          pill.addEventListener('click', (e) => {
            if (e.target.dataset.act === 'remove-lang') return;
            activeLang = pill.dataset.lang;
            draw();
          });
          pill.querySelector('[data-act="remove-lang"]').addEventListener('click', async (e) => {
            e.stopPropagation();
            const lang = pill.dataset.lang;
            const ok = await Admin.confirmAction({ title: 'Delete translation?', body: `Remove the <strong>${Admin.escapeHtml(lang)}</strong> translation?`, confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            try {
              await Admin.api.del(`/notification/templates/${t.id}/translations/${encodeURIComponent(lang)}`);
              translations = translations.filter((x) => x.languageCode !== lang);
              activeLang = translations[0] ? translations[0].languageCode : null;
              Admin.toast('Translation deleted', 'success');
              draw();
            } catch (err) { Admin.toastError(err); }
          });
        });
        pillRow.querySelector('#addLangPill').addEventListener('click', () => {
          activeLang = '__new__';
          draw();
        });

        renderForm();
      }

      function renderForm() {
        const formEl = panel.querySelector('#langForm');
        if (activeLang === null) {
          formEl.innerHTML = `<p class="hint">No translations yet — click "+ Add language" to add one.</p>`;
          return;
        }
        const isNew = activeLang === '__new__';
        const tr = isNew ? {} : translations.find((x) => x.languageCode === activeLang) || {};
        formEl.innerHTML = `
          <div class="form-group">
            <label>Language code</label>
            <input type="text" id="tr-lang" value="${isNew ? '' : Admin.escapeHtml(tr.languageCode)}" placeholder="e.g. en, hi, mr" ${isNew ? '' : 'readonly'} maxlength="8">
          </div>
          <div class="form-group">
            <label>Subject ${t.templateType !== 'EMAIL' ? '<span class="hint" style="display:inline;">(Email only)</span>' : ''}</label>
            <input type="text" id="tr-subject" value="${Admin.escapeHtml(tr.subject || '')}">
          </div>
          <div class="form-group">
            <label>Body text</label>
            <textarea id="tr-bodyText" rows="4">${Admin.escapeHtml(tr.bodyText || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Body HTML</label>
            <textarea id="tr-bodyHtml" rows="3">${Admin.escapeHtml(tr.bodyHtml || '')}</textarea>
          </div>
          <label class="checkbox-row" style="margin-bottom:16px;">
            <input type="checkbox" id="tr-isActive" ${tr.isActive !== false ? 'checked' : ''}> Active
          </label>
          <button class="btn btn-primary" id="btnSaveTranslation">${isNew ? 'Add translation' : 'Save translation'}</button>
        `;
        formEl.querySelector('#btnSaveTranslation').addEventListener('click', async () => {
          const btn = formEl.querySelector('#btnSaveTranslation');
          const languageCode = formEl.querySelector('#tr-lang').value.trim();
          if (!languageCode) { Admin.toast('Language code is required', 'error'); return; }
          const bodyText = formEl.querySelector('#tr-bodyText').value;
          if (!bodyText) { Admin.toast('Body text is required', 'error'); return; }
          Admin.setButtonLoading(btn, true, 'Saving…');
          try {
            await Admin.api.post(`/notification/templates/${t.id}/translations`, {
              languageCode,
              subject: formEl.querySelector('#tr-subject').value.trim() || null,
              bodyText,
              bodyHtml: formEl.querySelector('#tr-bodyHtml').value.trim() || null,
              isActive: formEl.querySelector('#tr-isActive').checked,
            });
            Admin.toast('Translation saved', 'success');
            const saved = { languageCode, subject: formEl.querySelector('#tr-subject').value.trim(), bodyText, bodyHtml: formEl.querySelector('#tr-bodyHtml').value.trim(), isActive: formEl.querySelector('#tr-isActive').checked };
            const existingIdx = translations.findIndex((x) => x.languageCode === languageCode);
            if (existingIdx >= 0) translations[existingIdx] = saved; else translations.push(saved);
            activeLang = languageCode;
            draw();
          } catch (err) {
            Admin.toastError(err);
          } finally {
            Admin.setButtonLoading(btn, false);
          }
        });
      }

      draw();
    }

    return { init, load };
  })();

  // ============================= Delivery Logs ====================================
  const Logs = (function () {
    let state = { page: 1, pageSize: 20, notificationType: '', status: '', recipient: '', fromDate: '', toDate: '' };

    function init() {
      document.getElementById('btnRefreshLogs').addEventListener('click', load);
      document.getElementById('logTypeFilter').addEventListener('change', (e) => { state.notificationType = e.target.value; state.page = 1; load(); });
      document.getElementById('logStatusFilter').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
      document.getElementById('logRecipientFilter').addEventListener('input', Admin.debounce((e) => { state.recipient = e.target.value.trim(); state.page = 1; load(); }, 350));
      document.getElementById('logFromDate').addEventListener('change', (e) => { state.fromDate = e.target.value; state.page = 1; load(); });
      document.getElementById('logToDate').addEventListener('change', (e) => { state.toDate = e.target.value; state.page = 1; load(); });
      load();
    }

    async function load() {
      const body = document.getElementById('logsTableBody');
      body.innerHTML = `<tr><td colspan="9" class="table-empty">Loading delivery logs…</td></tr>`;
      try {
        const query = Admin.qs({ ...state, pageSize: undefined, perPage: state.pageSize, page: state.page });
        const res = await Admin.api.get('/notification/logs' + query);
        renderTable(res.data);
        renderPagination(res.meta && res.meta.pagination);
        document.getElementById('logCount').textContent = `${(res.meta && res.meta.pagination.total) || res.data.length} entries`;
      } catch (err) {
        body.innerHTML = `<tr><td colspan="9" class="table-empty">Couldn't load delivery logs.</td></tr>`;
        Admin.toastError(err);
      }
    }

    function renderTable(rows) {
      const body = document.getElementById('logsTableBody');
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="9" class="table-empty">No delivery logs match your filters.</td></tr>`;
        return;
      }
      body.innerHTML = rows.map((l) => `
        <tr data-id="${l.id}">
          <td class="cell-muted">${l.id}</td>
          <td>${typeBadge(l.notificationType)}</td>
          <td>${Admin.escapeHtml(l.templateName || '—')}</td>
          <td><span class="cell-recipient" title="${Admin.escapeHtml(l.recipient || '')}">${Admin.escapeHtml(l.recipient || '—')}</span></td>
          <td class="cell-muted">${Admin.escapeHtml(l.subject || '—')}</td>
          <td>${l.status === 'SENT' ? '<span class="badge badge-green"><span class="badge-dot"></span>SENT</span>' : '<span class="badge badge-coral"><span class="badge-dot"></span>FAILED</span>'}</td>
          <td class="cell-muted">${l.retryCount ?? 0}</td>
          <td class="cell-muted">${Admin.formatDate(l.sentAt || l.createdAt)}</td>
          <td class="cell-actions">
            <button class="icon-action icon-action-view" data-act="view" title="View">${ICON.view}</button>
          </td>
        </tr>
      `).join('');
      body.querySelectorAll('tr').forEach((tr) => {
        const id = tr.dataset.id;
        const row = rows.find((r) => String(r.id) === id);
        tr.querySelector('[data-act="view"]').addEventListener('click', () => openLogDetail(row.id));
      });
    }

    function renderPagination(pagination) {
      const el = document.getElementById('logsPagination');
      if (!pagination) { el.innerHTML = ''; return; }
      const { page, total, pages } = pagination;
      el.innerHTML = `
        <span>${total} entr${total === 1 ? 'y' : 'ies'} · page ${page} of ${Math.max(pages, 1)}</span>
        <div class="flex-gap">
          <button class="btn btn-secondary btn-sm" id="logPrev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
          <button class="btn btn-secondary btn-sm" id="logNext" ${page >= pages ? 'disabled' : ''}>Next</button>
        </div>`;
      document.getElementById('logPrev')?.addEventListener('click', () => { state.page--; load(); });
      document.getElementById('logNext')?.addEventListener('click', () => { state.page++; load(); });
    }

    async function openLogDetail(id) {
      Admin.openModal(`<div class="modal-body"><span class="spinner spinner-dark"></span> Loading log entry…</div>`);
      try {
        const res = await Admin.api.get(`/notification/logs/${id}`);
        const l = res.data;
        Admin.openModal(`
          <div class="modal-header"><h3>Delivery log #${l.id}</h3><button class="btn btn-ghost btn-icon" data-act="close">&times;</button></div>
          <div class="modal-body">
            ${l.status !== 'SENT' && l.errorMessage ? `<div class="callout" style="background:var(--coral-tint); color:#a3282c;"><strong>Error:</strong> ${Admin.escapeHtml(l.errorMessage)}</div>` : ''}
            <div class="form-row">
              <div class="form-group"><label>Type</label><div>${typeBadge(l.notificationType)}</div></div>
              <div class="form-group"><label>Status</label><div>${l.status === 'SENT' ? Admin.badge(true, 'SENT', 'FAILED') : Admin.badge(false, 'SENT', 'FAILED')}</div></div>
            </div>
            <div class="form-group"><label>Template</label><div>${Admin.escapeHtml(l.templateName || '—')}</div></div>
            <div class="form-group"><label>Recipient</label><div class="mono" style="word-break:break-all;">${Admin.escapeHtml(l.recipient || '—')}</div></div>
            ${l.subject ? `<div class="form-group"><label>Subject</label><div>${Admin.escapeHtml(l.subject)}</div></div>` : ''}
            <div class="form-group"><label>Rendered body</label><div class="log-body-pre">${Admin.escapeHtml(l.renderedBody || '—')}</div></div>
            <div class="form-row">
              <div class="form-group"><label>Provider message ID</label><div class="mono cell-muted">${Admin.escapeHtml(l.providerMsgId || '—')}</div></div>
              <div class="form-group"><label>Retry count</label><div>${l.retryCount ?? 0}</div></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Sent at</label><div class="cell-muted">${Admin.formatDate(l.sentAt)}</div></div>
              <div class="form-group"><label>Delivered at</label><div class="cell-muted">${Admin.formatDate(l.deliveredAt)}</div></div>
            </div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" data-act="close">Close</button></div>
        `);
        document.querySelectorAll('#modalBackdrop [data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
      } catch (err) {
        Admin.closeModal();
        Admin.toastError(err);
      }
    }

    return { init };
  })();

  // ============================= Send Test ====================================
  const Send = (function () {
    async function init() {
      await Promise.all([populateSelect('smsTemplate', 'SMS'), populateSelect('emailTemplate', 'EMAIL')]);
      document.getElementById('smsTemplate').addEventListener('change', (e) => renderVars('sms', e.target.value));
      document.getElementById('emailTemplate').addEventListener('change', (e) => renderVars('email', e.target.value));
      document.getElementById('smsForm').addEventListener('submit', (e) => { e.preventDefault(); submitSend('sms'); });
      document.getElementById('emailForm').addEventListener('submit', (e) => { e.preventDefault(); submitSend('email'); });
    }

    let cache = {};

    async function populateSelect(selectId, type) {
      const sel = document.getElementById(selectId);
      try {
        const res = await Admin.api.get(`/notification/templates${Admin.qs({ templateType: type, isActive: 'true', perPage: 100 })}`);
        res.data.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.templateName} (v${t.version})`;
          sel.appendChild(opt);
        });
      } catch (err) {
        Admin.toastError(err);
      }
    }

    async function fetchTemplate(id) {
      if (cache[id]) return cache[id];
      const res = await Admin.api.get(`/notification/templates/${id}`);
      cache[id] = res.data;
      return res.data;
    }

    async function renderVars(prefix, templateId) {
      const container = document.getElementById(`${prefix}VarsContainer`);
      if (!templateId) { container.innerHTML = ''; return; }
      container.innerHTML = `<div class="dvar-group"><span class="spinner spinner-dark"></span> Loading variables…</div>`;
      try {
        const t = await fetchTemplate(templateId);
        if (!t.variables.length) {
          container.innerHTML = `<div class="dvar-group"><div class="dvar-empty">This template has no declared variables.</div></div>`;
          return;
        }
        container.innerHTML = `<div class="dvar-group">
          <div class="dvar-group-title">Template variables</div>
          ${t.variables.map((v) => `
            <div class="form-group">
              <label>${Admin.escapeHtml(v.variableName)}${v.isRequired ? ' <span style="color:var(--coral);">*</span>' : ''} <span class="hint" style="display:inline;">(${v.variableType})</span></label>
              ${v.variableType === 'LOOP'
                ? `<textarea class="dvar-input" data-var="${Admin.escapeHtml(v.variableName)}" data-type="LOOP" rows="2" placeholder='JSON array, e.g. [{"item":"A"}]'>${v.defaultValue ? Admin.escapeHtml(v.defaultValue) : ''}</textarea>`
                : `<input type="text" class="dvar-input" data-var="${Admin.escapeHtml(v.variableName)}" data-type="${v.variableType}" value="${Admin.escapeHtml(v.defaultValue || '')}" placeholder="${v.isRequired ? 'Required' : 'Optional'}">`
              }
            </div>
          `).join('')}
        </div>`;
      } catch (err) {
        container.innerHTML = '';
        Admin.toastError(err);
      }
    }

    function collectVars(prefix) {
      const params = {};
      document.querySelectorAll(`#${prefix}VarsContainer .dvar-input`).forEach((el) => {
        const name = el.dataset.var;
        if (el.dataset.type === 'LOOP') {
          if (el.value.trim()) {
            try { params[name] = JSON.parse(el.value); }
            catch (e) { throw new Error(`Variable "${name}" must be valid JSON array`); }
          }
        } else if (el.value !== '') {
          params[name] = el.value;
        }
      });
      return params;
    }

    async function submitSend(prefix) {
      const resultEl = document.getElementById(`${prefix}Result`);
      const btn = document.getElementById(`${prefix}SubmitBtn`);
      resultEl.innerHTML = '';
      const templateSel = document.getElementById(`${prefix}Template`);
      const template = templateSel.options[templateSel.selectedIndex]?.text || '';
      let params;
      try {
        params = collectVars(prefix);
      } catch (err) {
        resultEl.innerHTML = `<div class="result-box result-err"><div class="result-box-title">Invalid variables</div>${Admin.escapeHtml(err.message)}</div>`;
        return;
      }
      const payload = { templateName: (template.split(' (')[0] || '').trim(), language: document.getElementById(`${prefix}Language`).value, ...params };
      if (prefix === 'sms') payload.mobile = document.getElementById('smsMobile').value.trim();
      if (prefix === 'email') payload.email = document.getElementById('emailAddress').value.trim();

      Admin.setButtonLoading(btn, true, 'Sending…');
      try {
        const res = await Admin.api.post(`/notification/send-${prefix === 'sms' ? 'sms' : 'email'}`, payload);
        resultEl.innerHTML = `
          <div class="result-box result-ok">
            <div class="result-box-title">✓ ${Admin.escapeHtml(res.message || 'Sent')}</div>
            <pre>${Admin.escapeHtml(JSON.stringify(res.data, null, 2))}</pre>
          </div>`;
        Admin.toast(res.message || 'Sent', 'success');
      } catch (err) {
        resultEl.innerHTML = `<div class="result-box result-err"><div class="result-box-title">✕ ${Admin.escapeHtml(err.message)}</div>${
          err.errors ? `<pre>${Admin.escapeHtml(err.errors.join('\n'))}</pre>` : ''
        }</div>`;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    }

    return { init };
  })();

  async function init() {
    await Admin.requireAuth();
    initTabs();
    Templates.init();
  }

  init();
})();
