/**
 * report-sources.js — API Sources page (report-sources.php).
 *
 * ---------------------------------------------------------------------------
 * Endpoints used (paths live in reports-common.js -> Reports.API.sources):
 *   GET    list                      ?search&status&auth_type&is_internal&page&per_page
 *   GET    one(id)                   full definition + params (no secrets, only authMeta)
 *   POST   list                      create            -> { data: { id } }
 *   PATCH  one(id)                   update            -> { data: { id, changed } }
 *   DELETE one(id)
 *   PATCH  status(id)                { is_active }
 *   POST   testDraft                 the form's "Test API": runs the UNSAVED form, stores nothing
 *   POST   test(id)                  saved-source test: updates "last tested" + field catalogue
 *   PUT    params(id)                { params: [...] }   replaces the declared params (detail modal, Params tab)
 *   PUT    fields(id)                { fields: [...] }   edits the field catalogue (detail modal, Fields tab)
 *   GET    runs(id)                  ?limit=   recent run log (detail modal, Cache & runs tab)
 *   DELETE cache(id)                 forgets cached responses of the source
 *
 * Write-only credentials: the API never returns a saved secret. The form shows
 * "Credential saved" and only sends `auth` when the user types a new secret.
 *
 * Clearing a JSON field (query/headers/body) is done by sending an empty
 * string, NOT null: the server reads `input.x ?? input.x_json`, and null would
 * fall through to "keep the existing value".
 * ---------------------------------------------------------------------------
 */
(function () {
  const esc = Admin.escapeHtml;
  const API = Reports.API.sources;

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="6" y="4.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="11" y="4.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor"/></svg>',
    list: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 5.5h12M4 10h12M4 14.5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    bolt: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M11 2 4.5 11H10l-1 7 6.5-9H10l1-7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  };

  const state = { search: '', status: '', isInternal: '', authType: '', page: 1, perPage: 20 };
  let rows = [];

  // =========================================================================
  // LIST
  // =========================================================================

  function filtersActive() {
    return !!(state.search || state.status || state.isInternal !== '' || state.authType);
  }

  async function loadList(spin) {
    const body = document.getElementById('srcTableBody');
    const refreshBtn = document.getElementById('btnRefresh');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = `<tr><td colspan="7" class="table-empty">Loading API sources\u2026</td></tr>`;
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        search: state.search,
        status: state.status,
        auth_type: state.authType,
        is_internal: state.isInternal,
        page: state.page,
        per_page: state.perPage,
      }));
      rows = (res.data && res.data.sources) || [];
      const pg = res.meta && res.meta.pagination;
      const total = pg ? pg.total : rows.length;
      document.getElementById('srcCount').textContent = `${total} source${total === 1 ? '' : 's'}`;
      if (!filtersActive()) document.getElementById('rptStatTotal').textContent = Reports.fmtNumber(total);
      renderTable();
      Reports.renderPager(document.getElementById('srcPagination'), pg, (p) => { state.page = p; loadList(); });
    } catch (err) {
      const st = Reports.errorState(err);
      body.innerHTML = `<tr><td colspan="7" class="table-empty">${Reports.stateHtml(st.kind, st.message, st.hint)}</td></tr>`;
      document.getElementById('srcPagination').innerHTML = '';
      document.getElementById('srcCount').textContent = '\u2014';
      if (st.kind !== 'forbidden') Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function authCell(s) {
    const label = Reports.labelOf(Reports.AUTH_TYPES, s.authType).replace(/ \(.*\)$/, '');
    if (s.authType === 'none' || s.authType === 'user_token') return `<span class="cell-muted">${esc(label)}</span>`;
    return `${esc(label)} ${s.authConfigured
      ? '<span class="badge badge-green" title="A credential is stored (never shown again)">saved</span>'
      : '<span class="badge badge-amber" title="No credential stored yet">missing</span>'}`;
  }

  function testedCell(s) {
    if (!s.lastTestedAt) return '<span class="badge badge-gray">Never tested</span>';
    const ok = s.lastTestStatus === 'success';
    return `<span class="badge ${ok ? 'badge-green' : 'badge-coral'}"><span class="badge-dot"></span>${ok ? 'Passed' : 'Failed'}</span>
      <div class="rpt-hint" style="margin-top:2px;" title="${esc(Admin.formatDate(s.lastTestedAt))}">${esc(Admin.timeAgo(s.lastTestedAt))}</div>`;
  }

  function renderTable() {
    const body = document.getElementById('srcTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="table-empty">${filtersActive()
        ? 'No API sources match these filters.'
        : 'No API sources yet. Click \u201cNew API Source\u201d to register one.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((s) => `
      <tr data-id="${s.id}">
        <td>
          <a href="#" class="rpt-link" data-act="detail" title="Open fields, params, cache and run log">${esc(s.name)}</a>
          <div><span class="rpt-code">${esc(s.code)}</span></div>
        </td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span class="rpt-chip">${esc(s.method)}</span>
            ${Reports.internalBadge(s.isInternal)}
          </div>
          <div class="rpt-mono cell-muted rpt-url" title="${esc(s.apiUrl)}">${esc(Reports.truncate(s.apiUrl, 56))}</div>
        </td>
        <td>${authCell(s)}</td>
        <td class="cell-muted" style="white-space:nowrap;">
          <span title="Detected response fields">${s.fieldCount} fields</span> \u00b7
          <span title="Declared {placeholders}">${s.paramCount} params</span> \u00b7
          <span title="Active widgets using this source">${s.widgetCount} widgets</span>
        </td>
        <td>${testedCell(s)}</td>
        <td>${Reports.activeBadge(s.isActive)}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-view" data-act="detail" title="Details: fields, params, cache, run log">${ICON.list}</button>
          <button class="icon-action icon-action-view" data-act="test" title="Test saved source (detects fields)">${ICON.bolt}</button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          ${s.isActive
            ? `<button class="icon-action icon-action-toggle" data-act="disable" title="Disable">${ICON.pause}</button>`
            : `<button class="icon-action icon-action-toggle" data-act="enable" title="Enable">${ICON.play}</button>`}
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>`).join('');

    body.querySelectorAll('tr[data-id]').forEach((tr) => {
      const s = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelectorAll('[data-act="detail"]').forEach((el) => el.addEventListener('click', (ev) => { ev.preventDefault(); openDetailModal(s); }));
      tr.querySelector('[data-act="test"]')?.addEventListener('click', () => openSavedTestModal(s));
      tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => openFormModal(s));
      tr.querySelector('[data-act="disable"]')?.addEventListener('click', () => setActive(s, false));
      tr.querySelector('[data-act="enable"]')?.addEventListener('click', () => setActive(s, true));
      tr.querySelector('[data-act="delete"]')?.addEventListener('click', () => removeSource(s));
    });
  }

  async function setActive(s, active) {
    try {
      await Admin.api.patch(API.status(s.id), { is_active: active });
      Admin.toast(active ? 'Source enabled' : 'Source disabled', 'success');
      loadList(true);
    } catch (err) { Admin.toastError(err); }
  }

  async function removeSource(s) {
    const ok = await Admin.confirmAction({
      title: 'Delete API source?',
      body: `Delete <strong>${esc(s.name)}</strong> (<span class="rpt-code">${esc(s.code)}</span>)? Its code stays reserved afterwards, and it cannot be deleted while widgets still use it.`,
      confirmLabel: 'Delete source',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.one(s.id));
      Admin.toast('Source deleted', 'success');
      if (rows.length === 1 && state.page > 1) state.page--;
      loadList(true);
    } catch (err) { Admin.toastError(err); }
  }

  // =========================================================================
  // TEST RESULT (shared by the form's Test API and the saved-source test)
  // =========================================================================

  function cellText(v) {
    if (v === null || v === undefined) return '<span class="cell-muted">\u2014</span>';
    if (typeof v === 'object') return `<span class="rpt-mono">${esc(Reports.truncate(JSON.stringify(v), 60))}</span>`;
    return esc(Reports.truncate(v, 60));
  }

  function previewTable(preview) {
    if (!Array.isArray(preview) || !preview.length) return '<div class="rpt-hint">No rows to preview.</div>';
    const cols = [];
    preview.forEach((r) => {
      if (r && typeof r === 'object' && !Array.isArray(r)) Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); });
    });
    if (!cols.length) {
      return `<div class="rpt-table-scroll"><table><tbody>${preview.map((v) => `<tr><td>${cellText(v)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    const shown = cols.slice(0, 12);
    return `<div class="rpt-table-scroll"><table>
      <thead><tr>${shown.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${preview.map((r) => `<tr>${shown.map((c) => `<td>${cellText(r ? r[c] : null)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>${cols.length > shown.length ? `<div class="rpt-hint">Showing the first ${shown.length} of ${cols.length} columns.</div>` : ''}`;
  }

  function fieldsTable(fields) {
    if (!Array.isArray(fields) || !fields.length) return '<div class="rpt-hint">No fields detected.</div>';
    return `<div class="rpt-table-scroll"><table>
      <thead><tr><th>Field path</th><th>Label</th><th>Type</th><th>Role</th><th>Sample</th></tr></thead>
      <tbody>${fields.map((f) => `<tr>
        <td><span class="rpt-code">${esc(f.field_path ?? f.fieldPath)}</span></td>
        <td>${esc(f.field_label ?? f.fieldLabel)}</td>
        <td class="cell-muted">${esc(f.data_type ?? f.dataType)}</td>
        <td><span class="rpt-chip">${esc(f.field_role ?? f.fieldRole)}</span></td>
        <td class="cell-muted">${esc(Reports.truncate(f.sample_value ?? f.sampleValue ?? '', 40))}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  /** result = data of POST /test: ok:true { rowCount, truncated, preview, fields, meta, fieldSync? } | ok:false { error } */
  function resultHtml(result) {
    if (!result) return '';
    if (!result.ok) {
      const e = result.error || {};
      const details = Array.isArray(e.details) && e.details.length ? `<ul>${e.details.map((d) => `<li>${esc(typeof d === 'string' ? d : JSON.stringify(d))}</li>`).join('')}</ul>` : '';
      return `<div class="form-errors" style="margin-top:14px;">
        <strong>Test failed${e.code ? ` \u00b7 ${esc(e.code)}` : ''}${e.httpStatus ? ` \u00b7 HTTP ${esc(e.httpStatus)}` : ''}</strong>
        <div>${esc(e.message || 'The API call did not succeed.')}</div>${details}</div>`;
    }
    const m = result.meta || {};
    const sync = result.fieldSync
      ? `<div class="rpt-hint">Field catalogue updated: ${result.fieldSync.added.length} new field(s) added${result.fieldSync.missing.length ? `, ${result.fieldSync.missing.length} saved field(s) not seen in this response` : ''}.</div>`
      : '';
    return `<div style="margin-top:14px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span class="badge badge-green"><span class="badge-dot"></span>API call succeeded</span>
        <span class="rpt-chip">HTTP ${esc(m.status ?? '\u2014')}</span>
        <span class="rpt-chip">${esc(Reports.fmtMs(m.ms))}</span>
        <span class="rpt-chip">${esc(Reports.fmtBytes(m.bytes))}</span>
        <span class="rpt-chip">${Reports.fmtNumber(result.rowCount)} row${result.rowCount === 1 ? '' : 's'}${result.truncated ? ' (truncated)' : ''}</span>
      </div>
      ${sync}
      <div class="rpt-section-title">Rows preview</div>
      ${previewTable(result.preview)}
      <div class="rpt-section-title">Detected fields</div>
      ${fieldsTable(result.fields)}
    </div>`;
  }

  // =========================================================================
  // FORM MODAL (create / edit + Test API)
  // =========================================================================

  /** Validates a JSON textarea, shows the problem under it, and returns Reports.parseJsonInput's result. */
  function readJsonField(id, label, opts) {
    const el = document.getElementById(id);
    const r = Reports.parseJsonInput(el.value, label, opts);
    const hint = document.getElementById(id + 'Err');
    if (hint) hint.textContent = r.error || '';
    el.style.borderColor = r.error ? 'var(--coral)' : '';
    return r;
  }

  function authFieldsHtml(type, meta, configured, sameType) {
    const broken = !!(meta && meta.error);
    const usable = configured && sameType && !broken;
    let note = '';
    if (usable) {
      note = '<div class="rpt-hint" style="margin:0 0 8px;"><span class="badge badge-green">Credential saved</span> Secrets are never shown again. Leave the secret field empty to keep it, or type a new value to replace it.</div>';
    } else if (configured && sameType && broken) {
      note = `<div class="form-errors">${esc(meta.error)}. Enter the credential again.</div>`;
    }
    const m = (usable && meta) || {};
    const ph = usable ? 'Saved \u2014 type to replace' : '';
    if (type === 'bearer') {
      return `${note}<div class="form-group"><label for="f-authToken">Bearer token <span style="color:var(--coral);">*</span></label>
        <input type="password" id="f-authToken" autocomplete="new-password" placeholder="${esc(ph || 'Paste the token')}"></div>`;
    }
    if (type === 'basic') {
      return `${note}<div class="form-row">
        <div class="form-group"><label for="f-authUser">Username <span style="color:var(--coral);">*</span></label>
          <input type="text" id="f-authUser" autocomplete="off" value="${esc(m.username || '')}"></div>
        <div class="form-group"><label for="f-authPass">Password <span style="color:var(--coral);">*</span></label>
          <input type="password" id="f-authPass" autocomplete="new-password" placeholder="${esc(ph)}"></div>
      </div>`;
    }
    if (type === 'api_key') {
      return `${note}<div class="form-row-3">
        <div class="form-group"><label for="f-authIn">Send in</label>
          <select id="f-authIn"><option value="header"${m.in !== 'query' ? ' selected' : ''}>Header</option><option value="query"${m.in === 'query' ? ' selected' : ''}>Query string</option></select></div>
        <div class="form-group"><label for="f-authName">Name <span style="color:var(--coral);">*</span></label>
          <input type="text" id="f-authName" autocomplete="off" placeholder="X-API-Key" value="${esc(m.name || '')}"></div>
        <div class="form-group"><label for="f-authValue">Value <span style="color:var(--coral);">*</span></label>
          <input type="password" id="f-authValue" autocomplete="new-password" placeholder="${esc(ph)}"></div>
      </div>`;
    }
    if (type === 'user_token') {
      return '<div class="rpt-hint">The logged-in user\u2019s own token is forwarded to the internal API, so that user\u2019s permissions decide what data they can see.</div>';
    }
    return '<div class="rpt-hint">The API is called without credentials.</div>';
  }

  function formHtml(s) {
    const isEdit = !!s;
    const v = s || {};
    const codeLocked = isEdit && Number(v.widgetCount) > 0;
    const cacheOn = isEdit ? v.cacheEnabled : true;
    return `
      <div class="modal-header"><h3>${isEdit ? 'Edit API Source' : 'New API Source'}</h3><button class="btn btn-ghost btn-icon" type="button" data-act="close">&times;</button></div>
      <form id="srcForm" novalidate>
        <div class="modal-body">
          <div id="srcFormErrors"></div>

          <div class="form-row">
            <div class="form-group">
              <label for="f-name">Source name <span style="color:var(--coral);">*</span></label>
              <input type="text" id="f-name" maxlength="150" placeholder="e.g. Monthly sales by region" value="${esc(v.name || '')}">
            </div>
            <div class="form-group">
              <label for="f-code">Source code <span style="color:var(--coral);">*</span></label>
              <input type="text" id="f-code" maxlength="80" placeholder="monthly_sales_by_region" value="${esc(v.code || '')}" ${codeLocked ? 'readonly' : ''}>
              <div class="field-hint">${codeLocked ? 'Locked: widgets use this source.' : 'Lowercase letters, digits and _ . The code stays reserved even after the source is deleted.'}</div>
            </div>
          </div>
          <div class="form-group">
            <label for="f-desc">Description</label>
            <input type="text" id="f-desc" maxlength="500" placeholder="Optional" value="${esc(v.description || '')}">
          </div>

          <div class="rpt-section-title">Endpoint</div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px;">
            <label class="switch"><input type="checkbox" id="f-internal" ${v.isInternal ? 'checked' : ''}><span class="slider"></span></label>
            <label style="margin:0;" for="f-internal">Internal API (this platform\u2019s own API, called with the logged-in user\u2019s token)</label>
          </div>
          <div style="display:grid;grid-template-columns:110px 1fr;gap:14px;">
            <div class="form-group">
              <label for="f-method">Method</label>
              <select id="f-method">${Reports.optionsHtml(Reports.HTTP_METHODS, v.method || 'GET')}</select>
            </div>
            <div class="form-group">
              <label for="f-url">API URL <span style="color:var(--coral);">*</span></label>
              <input type="text" id="f-url" maxlength="1000" value="${esc(v.apiUrl || '')}" autocomplete="off">
              <div class="field-hint" id="f-urlHint"></div>
            </div>
          </div>
          <div class="form-group">
            <label for="f-path">Response path</label>
            <input type="text" id="f-path" maxlength="200" placeholder="e.g. data.items  (leave empty if the response itself is the list)" value="${esc(v.responsePath || '')}">
          </div>

          <div class="rpt-section-title">Authentication</div>
          <div class="form-group">
            <label for="f-authType">Auth type</label>
            <select id="f-authType"></select>
          </div>
          <div id="authFields"></div>

          <div class="rpt-section-title">Request details</div>
          <div class="form-group">
            <label for="f-query">Query parameters (JSON)</label>
            <textarea id="f-query" class="rpt-mono" rows="3" placeholder='{ "from": "{month_start}", "to": "{today}", "region": "{region}" }'>${esc(Reports.prettyJson(v.queryParams))}</textarea>
            <div class="field-error" id="f-queryErr"></div>
          </div>
          <div class="form-group">
            <label for="f-headers">Extra headers (JSON)</label>
            <textarea id="f-headers" class="rpt-mono" rows="3" placeholder='{ "Accept": "application/json" }'>${esc(Reports.prettyJson(v.headers))}</textarea>
            <div class="field-hint">Credentials go under Authentication, not here.</div>
            <div class="field-error" id="f-headersErr"></div>
          </div>
          <div class="form-group" id="bodyGroup">
            <label for="f-body">Request body (JSON, POST only)</label>
            <textarea id="f-body" class="rpt-mono" rows="3" placeholder='{ "year": "{year}" }'>${esc(Reports.prettyJson(v.body))}</textarea>
            <div class="field-error" id="f-bodyErr"></div>
          </div>
          <div class="rpt-hint" id="placeholderHint"></div>

          <div class="rpt-section-title">Behaviour</div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-loading">Loading message</label>
              <input type="text" id="f-loading" maxlength="150" placeholder="Loading..." value="${esc(v.loadingMessage ?? '')}">
            </div>
            <div class="form-group">
              <label for="f-error">Error message</label>
              <input type="text" id="f-error" maxlength="250" placeholder="Unable to fetch data. Please try again." value="${esc(v.errorMessage ?? '')}">
            </div>
          </div>
          <div class="form-row-3">
            <div class="form-group">
              <label>Cache responses</label>
              <div style="display:flex;align-items:center;gap:10px;height:38px;">
                <label class="switch"><input type="checkbox" id="f-cache" ${cacheOn ? 'checked' : ''}><span class="slider"></span></label>
                <span class="cell-muted" id="f-cacheText">${cacheOn ? 'On' : 'Off'}</span>
              </div>
            </div>
            <div class="form-group">
              <label for="f-ttl">Cache time (seconds)</label>
              <input type="number" id="f-ttl" min="0" max="86400" step="1" placeholder="300" value="${isEdit ? esc(v.cacheTtlSec) : ''}">
            </div>
            <div class="form-group">
              <label for="f-timeout">Timeout (ms)</label>
              <input type="number" id="f-timeout" min="500" step="100" placeholder="server default" value="${isEdit && v.timeoutMs ? esc(v.timeoutMs) : ''}">
            </div>
          </div>
          <div class="form-group">
            <label for="f-maxkb">Max response size (KB)</label>
            <input type="number" id="f-maxkb" min="16" step="16" placeholder="server default" value="${isEdit && v.maxResponseKb ? esc(v.maxResponseKb) : ''}" style="max-width:200px;">
          </div>

          <div class="rpt-section-title">Params</div>
          <div class="rpt-hint" style="margin:-4px 0 10px;">Every <span class="rpt-code">{name}</span> used above must be declared here. Built-ins (<span class="rpt-code">{today}</span>, <span class="rpt-code">{month_start}</span>, <span class="rpt-code">{year}</span>, \u2026) need no declaration.</div>
          <div id="paramsMount"></div>

          ${!isEdit ? `<div class="form-group" style="display:flex;align-items:center;gap:10px;margin-top:6px;">
            <label class="switch"><input type="checkbox" id="f-detect" checked><span class="slider"></span></label>
            <label style="margin:0;" for="f-detect">After saving, call the API once to detect its fields</label>
          </div>` : ''}

          <div class="rpt-section-title">Test API</div>
          <div class="form-group">
            <label for="f-testvals">Test values (JSON, only if the URL uses {params})</label>
            <textarea id="f-testvals" class="rpt-mono" rows="2" placeholder='{ "region": "north" }'></textarea>
            <div class="field-error" id="f-testvalsErr"></div>
          </div>
          <div id="srcTestResult"></div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button type="button" class="btn btn-secondary" id="btnTestDraft">${ICON.bolt} Test API</button>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
            <button type="submit" class="btn btn-primary" id="srcFormSubmit">${isEdit ? 'Save changes' : 'Create source'}</button>
          </div>
        </div>
      </form>`;
  }

  function openFormModal(listRow) {
    if (!listRow) { showForm(null); return; }
    // Edit: the list row has no headers / params / auth metadata, so load the full definition first.
    Admin.api.get(API.one(listRow.id))
      .then((res) => showForm(res.data.source))
      .catch((err) => Admin.toastError(err));
  }

  function showForm(src) {
    const isEdit = !!src;
    Admin.openModal(formHtml(src), 'modal-lg');
    const root = document.getElementById('modalBackdrop');
    const $ = (id) => document.getElementById(id);
    root.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));

    let codeTouched = isEdit;

    // ---- declared params (visual editor) -------------------------------------------
    function usedNames() {
      const used = new Set();
      Reports.findPlaceholders($('f-url').value, used);
      [['f-query', 'object'], ['f-headers', 'object'], ['f-body', 'any']].forEach(([id, expect]) => {
        const r = Reports.parseJsonInput($(id).value, id, { expect });
        if (!r.error && r.value) Reports.findPlaceholders(r.value, used);
      });
      return used;
    }
    const pe = Reports.paramsEditor($('paramsMount'), {
      params: src ? src.params : [],
      getUsedNames: usedNames,
      onChange: () => refreshPlaceholderHint(),
    });

    // ---- auth type options depend on "internal" -----------------------------------
    function renderAuthOptions(keep) {
      const internal = $('f-internal').checked;
      const list = Reports.AUTH_TYPES.filter((a) => a.value !== 'user_token' || internal);
      let sel = keep || $('f-authType').value || (src ? src.authType : 'none');
      if (!list.some((a) => a.value === sel)) sel = internal ? 'user_token' : 'none';
      $('f-authType').innerHTML = Reports.optionsHtml(list, sel);
    }
    function renderAuthFields() {
      const type = $('f-authType').value;
      const sameType = !!src && src.authType === type;
      $('authFields').innerHTML = authFieldsHtml(type, src && src.authMeta, !!(src && src.authConfigured), sameType);
    }
    function refreshUrlHint() {
      const internal = $('f-internal').checked;
      $('f-url').placeholder = internal ? '/api/v1/clientele' : 'https://api.example.com/v1/sales';
      $('f-urlHint').textContent = internal
        ? 'A path on this platform, starting with /api/v1/. The caller\u2019s permissions apply.'
        : 'A full https:// URL. Private and local addresses are blocked by the server.';
    }
    function refreshBodyVisibility() {
      $('bodyGroup').hidden = $('f-method').value !== 'POST';
    }
    function refreshPlaceholderHint() {
      const names = [...usedNames()];
      const declared = pe.declaredKeys();
      const custom = names.filter((n) => !Reports.BUILTIN_TOKENS.includes(n));
      const missing = custom.filter((n) => !declared.has(n));
      const builtin = names.filter((n) => Reports.BUILTIN_TOKENS.includes(n));
      const code = (n) => `<span class="rpt-code">{${esc(n)}}</span>`;
      $('placeholderHint').innerHTML = names.length
        ? `Placeholders found: ${names.map(code).join(' ')}.
           ${missing.length ? `<strong style="color:var(--coral);">Not declared yet:</strong> ${missing.map(code).join(', ')} \u2014 use \u201cAdd from placeholders\u201d under Params.` : (custom.length ? 'All custom placeholders are declared.' : '')}
           ${builtin.length ? `Built-in (no declaration needed): ${builtin.map(code).join(' ')}.` : ''}`
        : 'Tip: use <span class="rpt-code">{today}</span>, <span class="rpt-code">{month_start}</span>, <span class="rpt-code">{year}</span> etc. for dates, or your own <span class="rpt-code">{param}</span> names.';
    }

    renderAuthOptions(src ? src.authType : 'none');
    renderAuthFields();
    refreshUrlHint();
    refreshBodyVisibility();
    refreshPlaceholderHint();

    $('f-internal').addEventListener('change', () => { renderAuthOptions(); renderAuthFields(); refreshUrlHint(); });
    $('f-authType').addEventListener('change', renderAuthFields);
    $('f-method').addEventListener('change', refreshBodyVisibility);
    $('f-cache').addEventListener('change', () => { $('f-cacheText').textContent = $('f-cache').checked ? 'On' : 'Off'; });
    ['f-url', 'f-query', 'f-headers', 'f-body'].forEach((id) => $(id).addEventListener('input', Admin.debounce(refreshPlaceholderHint, 250)));

    // JSON textareas: live validation
    [['f-query', 'Query parameters', 'object'], ['f-headers', 'Headers', 'object'], ['f-body', 'Request body', 'any'], ['f-testvals', 'Test values', 'object']]
      .forEach(([id, label, expect]) => $(id).addEventListener('input', Admin.debounce(() => readJsonField(id, label, { expect }), 350)));

    // name -> code suggestion (create only, until the user edits the code themselves)
    $('f-code').addEventListener('input', () => { codeTouched = true; });
    $('f-name').addEventListener('input', () => { if (!codeTouched) $('f-code').value = Reports.slugify($('f-name').value); });

    // ---- build the request body from the form -------------------------------------
    /**
     * collect({ forTest }) -> { payload } | { error: [messages] }
     * forTest leaves out code / name / description, which a draft run does not need.
     */
    function collect({ forTest }) {
      const problems = [];
      const val = (id) => $(id).value.trim();
      const type = $('f-authType').value;
      const method = $('f-method').value;

      const query = readJsonField('f-query', 'Query parameters', { expect: 'object' });
      const headers = readJsonField('f-headers', 'Headers', { expect: 'object' });
      const body = method === 'POST' ? readJsonField('f-body', 'Request body', { expect: 'any' }) : { value: null, empty: true, error: null };
      const pv = pe.getValue();
      [query, headers, body].forEach((r) => { if (r.error) problems.push(r.error); });
      pv.errors.forEach((m) => problems.push(m));

      if (!forTest) {
        if (!val('f-name')) problems.push('Source name is required.');
        if (!Reports.isCode(val('f-code'))) problems.push('Source code must be 2\u201380 characters: lowercase letters, digits and _, starting with a letter.');
      }
      if (!val('f-url')) problems.push('API URL is required.');

      // credentials: send `auth` only when a secret was typed (or the type changed and needs one)
      let auth;
      const sameType = !!src && src.authType === type;
      const hadSecret = !!(src && src.authConfigured) && sameType && !(src.authMeta && src.authMeta.error);
      if (type === 'bearer') {
        const token = $('f-authToken').value;
        if (token) auth = { token };
        else if (!hadSecret) problems.push('Bearer token is required.');
      } else if (type === 'basic') {
        const user = $('f-authUser').value.trim();
        const pass = $('f-authPass').value;
        if (pass) {
          if (!user) problems.push('Username is required.'); else auth = { username: user, password: pass };
        } else if (!hadSecret) problems.push('Username and password are required.');
        else if (user !== ((src.authMeta && src.authMeta.username) || '')) problems.push('To change the username, re-enter the password too.');
      } else if (type === 'api_key') {
        const name = $('f-authName').value.trim();
        const value = $('f-authValue').value;
        const where = $('f-authIn').value;
        if (value) {
          if (!name) problems.push('API key name is required.'); else auth = { in: where, name, value };
        } else if (!hadSecret) problems.push('API key name and value are required.');
        else if (name !== ((src.authMeta && src.authMeta.name) || '') || where !== ((src.authMeta && src.authMeta.in) || 'header')) problems.push('To change the key name or location, re-enter the key value too.');
      }

      if (problems.length) return { error: problems };

      // NB: an empty string (not null) is what makes the API clear a JSON field.
      const payload = {
        api_url: val('f-url'),
        http_method: method,
        is_internal: $('f-internal').checked ? 1 : 0,
        auth_type: type,
        response_path: val('f-path'),
        query_params: query.empty ? '' : query.value,
        headers: headers.empty ? '' : headers.value,
        body: method === 'POST' && !body.empty ? body.value : '',
        cache_enabled: $('f-cache').checked ? 1 : 0,
        loading_message: val('f-loading'),
        error_message: val('f-error'),
      };
      if (val('f-ttl') !== '') payload.cache_ttl_sec = Number(val('f-ttl'));
      if (val('f-timeout') !== '') payload.timeout_ms = Number(val('f-timeout'));
      if (val('f-maxkb') !== '') payload.max_response_kb = Number(val('f-maxkb'));
      if (auth) payload.auth = auth;
      // params replace the whole set on the server; the editor starts from the saved set, so this round-trips
      payload.params = pv.params;

      if (!forTest) {
        payload.source_name = val('f-name');
        payload.description = val('f-desc');
        if (!$('f-code').hasAttribute('readonly')) payload.source_code = val('f-code');
      }
      return { payload };
    }

    // ---- Test API (runs the unsaved form; nothing is stored) -----------------------
    $('btnTestDraft').addEventListener('click', async () => {
      const box = $('srcTestResult');
      $('srcFormErrors').innerHTML = '';
      const out = collect({ forTest: true });
      if (out.error) {
        $('srcFormErrors').innerHTML = Reports.formErrorsHtml({ message: 'Fix these before testing:', errors: out.error });
        root.querySelector('.modal-body').scrollTop = 0;
        return;
      }
      const vals = readJsonField('f-testvals', 'Test values', { expect: 'object' });
      if (vals.error) return;

      const payload = { ...out.payload, preview_rows: 10 };
      if (!vals.empty) payload.test_values = vals.value;
      if (isEdit) payload.source_id = src.id; // lets the server reuse the saved credential when no new secret was typed

      const btn = $('btnTestDraft');
      Admin.setButtonLoading(btn, true, 'Testing\u2026');
      box.innerHTML = Reports.stateHtml('loading', 'Calling the API\u2026');
      try {
        const res = await Admin.api.post(API.testDraft, payload);
        box.innerHTML = resultHtml(res.data);
      } catch (err) {
        box.innerHTML = Reports.formErrorsHtml(err);
      } finally {
        Admin.setButtonLoading(btn, false);
        if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    // ---- Save --------------------------------------------------------------------------
    $('srcForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('srcFormErrors').innerHTML = '';
      const out = collect({ forTest: false });
      if (out.error) {
        $('srcFormErrors').innerHTML = Reports.formErrorsHtml({ message: 'Please fix the following:', errors: out.error });
        root.querySelector('.modal-body').scrollTop = 0;
        return;
      }
      const btn = $('srcFormSubmit');
      Admin.setButtonLoading(btn, true, 'Saving\u2026');
      try {
        let id;
        if (isEdit) {
          await Admin.api.patch(API.one(src.id), out.payload);
          id = src.id;
          Admin.toast('API source updated', 'success');
        } else {
          const res = await Admin.api.post(API.list, out.payload);
          id = res.data.id;
          Admin.toast('API source created', 'success');
        }
        const detect = !isEdit && $('f-detect') && $('f-detect').checked;
        Admin.closeModal();
        await loadList(true);
        if (detect) detectFieldsAfterCreate(id);
      } catch (err) {
        $('srcFormErrors').innerHTML = Reports.formErrorsHtml(err);
        root.querySelector('.modal-body').scrollTop = 0;
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  /** Runs the saved-source test once right after create, so the field catalogue exists for the widget builder. */
  async function detectFieldsAfterCreate(id) {
    try {
      const res = await Admin.api.post(API.test(id), { save_fields: true, preview_rows: 10 });
      const r = res.data;
      if (r.ok) {
        const n = r.fieldSync ? r.fieldSync.added.length : (r.fields || []).length;
        Admin.toast(`Detected ${n} field${n === 1 ? '' : 's'}.`, 'success');
      } else {
        Admin.toast(`Source saved, but the test call failed: ${(r.error && r.error.message) || 'unknown error'}. Fix the settings, then use the bolt (Test) button on its row.`, 'error', 9000);
      }
      loadList(true);
    } catch (err) { Admin.toastError(err); }
  }

  // =========================================================================
  // SAVED-SOURCE TEST (row action): updates "last tested" and the field catalogue
  // =========================================================================

  function openSavedTestModal(s) {
    const needsValues = Number(s.paramCount) > 0;
    Admin.openModal(`
      <div class="modal-header"><h3>Test \u201c${esc(s.name)}\u201d</h3><button class="btn btn-ghost btn-icon" type="button" data-act="close">&times;</button></div>
      <div class="modal-body">
        <div class="rpt-hint" style="margin:0 0 10px;">Calls the saved API once, records the result, and adds any newly detected fields to this source\u2019s field catalogue (labels and roles you edited are kept).</div>
        ${needsValues ? `<div class="form-group"><label for="t-vals">Test values (JSON)</label>
          <textarea id="t-vals" class="rpt-mono" rows="2" placeholder='{ "region": "north" }'></textarea>
          <div class="field-hint">This source declares ${esc(s.paramCount)} param(s); params without a default need a value here.</div>
          <div class="field-error" id="t-valsErr"></div></div>` : ''}
        <div id="savedTestResult"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
        <button type="button" class="btn btn-primary" id="btnRunSaved">${ICON.bolt} Run test</button>
      </div>`, 'modal-lg');
    const root = document.getElementById('modalBackdrop');
    root.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));

    async function run() {
      const out = document.getElementById('savedTestResult');
      const body = { save_fields: true, preview_rows: 10 };
      if (needsValues) {
        const r = Reports.parseJsonInput(document.getElementById('t-vals').value, 'Test values', { expect: 'object' });
        document.getElementById('t-valsErr').textContent = r.error || '';
        if (r.error) return;
        if (!r.empty) body.test_values = r.value;
      }
      const btn = document.getElementById('btnRunSaved');
      Admin.setButtonLoading(btn, true, 'Testing\u2026');
      out.innerHTML = Reports.stateHtml('loading', 'Calling the API\u2026');
      try {
        const res = await Admin.api.post(API.test(s.id), body);
        out.innerHTML = resultHtml(res.data);
        loadList();
      } catch (err) {
        out.innerHTML = Reports.formErrorsHtml(err);
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    }
    document.getElementById('btnRunSaved').addEventListener('click', run);
    if (!needsValues) run();
  }

  // =========================================================================
  // DETAIL MODAL: Fields | Params | Cache & runs
  // =========================================================================

  const RUN_STATUS_BADGE = { success: 'badge-green', cache_hit: 'badge-sky', failed: 'badge-coral', timeout: 'badge-amber' };
  const RUN_STATUS_LABEL = { success: 'Success', cache_hit: 'From cache', failed: 'Failed', timeout: 'Timed out' };

  function openDetailModal(listRow) {
    Admin.api.get(API.one(listRow.id))
      .then((res) => showDetail(res.data.source))
      .catch((err) => Admin.toastError(err));
  }

  function showDetail(src) {
    const $ = (id) => document.getElementById(id);
    Admin.openModal(`
      <div class="modal-header">
        <div>
          <h3>${esc(src.name)}</h3>
          <div class="rpt-hint" style="margin:2px 0 0;"><span class="rpt-code">${esc(src.code)}</span> ${Reports.internalBadge(src.isInternal)} <span class="rpt-chip">${esc(src.method)}</span></div>
        </div>
        <button class="btn btn-ghost btn-icon" type="button" data-act="close">&times;</button>
      </div>
      <div class="modal-body" style="min-height:320px;">
        <div class="tabs" id="dtTabs">
          <button type="button" class="tab-btn is-active" data-tab="fields">Fields <span class="rpt-chip" id="dtFieldsCount"></span><span id="dtFieldsDot"></span></button>
          <button type="button" class="tab-btn" data-tab="params">Params <span class="rpt-chip" id="dtParamsCount"></span><span id="dtParamsDot"></span></button>
          <button type="button" class="tab-btn" data-tab="runs">Cache &amp; runs</button>
        </div>
        <div data-panel="fields"></div>
        <div data-panel="params" hidden></div>
        <div data-panel="runs" hidden></div>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-act="close">Close</button></div>`, 'rpt-modal-wide');
    const root = $('modalBackdrop');
    root.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    const panel = (name) => root.querySelector(`[data-panel="${name}"]`);

    const dirtyDot = (id, on) => { $(id).innerHTML = on ? ' <span title="Unsaved changes" style="color:var(--coral);">\u25cf</span>' : ''; };
    const built = { runs: false };

    function showTab(name) {
      root.querySelectorAll('#dtTabs .tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
      ['fields', 'params', 'runs'].forEach((n) => { panel(n).hidden = n !== name; });
      if (name === 'runs' && !built.runs) { built.runs = true; buildRuns(); }
    }
    root.querySelectorAll('#dtTabs .tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

    buildFields();
    buildParams();

    // ---------------------------------------------------------------- Fields tab
    function buildFields() {
      const box = panel('fields');
      let fields = (src.fields || []).map((f) => ({ ...f }));
      let saved = JSON.stringify(fields.map(snap));
      const needsValues = Number(src.params ? src.params.length : 0) > 0;

      function snap(f) { return { p: f.fieldPath, l: f.fieldLabel, t: f.dataType, r: f.fieldRole, d: f.displayFormat || '', v: !!f.isVisible }; }
      const isDirty = () => JSON.stringify(fields.map(snap)) !== saved;
      const editedPaths = () => {
        const before = new Map(JSON.parse(saved).map((x) => [x.p, JSON.stringify(x)]));
        return new Set(fields.filter((f) => before.get(f.fieldPath) !== JSON.stringify(snap(f))).map((f) => f.fieldPath));
      };

      box.innerHTML = `
        <div class="rpt-detail-bar">
          <div class="rpt-hint" style="margin:0;max-width:560px;">The field catalogue feeds the widget builder. Set each field\u2019s <strong>type</strong> and <strong>role</strong> (dimension = category, measure = number to add up, time = date/time axis). Detecting again keeps what you edited and only adds new fields.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="dtDetect">${ICON.bolt} Detect fields from API</button>
            <button type="button" class="btn btn-primary btn-sm" id="dtSaveFields" disabled>Save fields</button>
          </div>
        </div>
        ${needsValues ? `<div class="form-group" style="max-width:420px;"><label for="dtTestVals">Test values for detection (JSON)</label>
          <textarea id="dtTestVals" class="rpt-mono" rows="2" placeholder='{ "region": "north" }'></textarea>
          <div class="field-hint">This source declares params; those without a default need a value to run.</div>
          <div class="field-error" id="dtTestValsErr"></div></div>` : ''}
        <div id="dtFieldsMsg"></div>
        <div id="dtFieldsTable"></div>`;

      function renderTable() {
        $('dtFieldsCount').textContent = String(fields.length);
        dirtyDot('dtFieldsDot', isDirty());
        $('dtSaveFields').disabled = !isDirty();
        const wrap = $('dtFieldsTable');
        if (!fields.length) {
          wrap.innerHTML = Reports.stateHtml('empty', 'No fields yet.', 'Click \u201cDetect fields from API\u201d to call the saved source once and read its response.');
          return;
        }
        const edited = editedPaths();
        wrap.innerHTML = `<div class="rpt-table-scroll" style="max-height:380px;"><table class="rpt-fields-table">
          <thead><tr><th style="width:56px;">Show</th><th>Field path</th><th>Label</th><th>Type</th><th>Role</th><th>Format</th><th>Sample</th></tr></thead>
          <tbody>${fields.map((f, i) => `<tr data-i="${i}" class="${edited.has(f.fieldPath) ? 'is-edited' : ''}">
            <td><label class="switch"><input type="checkbox" data-k="isVisible" ${f.isVisible ? 'checked' : ''}><span class="slider"></span></label></td>
            <td><span class="rpt-code">${esc(f.fieldPath)}</span></td>
            <td><input type="text" data-k="fieldLabel" maxlength="150" value="${esc(f.fieldLabel)}"></td>
            <td><select data-k="dataType">${Reports.optionsHtml(Reports.FIELD_TYPES, f.dataType)}</select></td>
            <td><select data-k="fieldRole">${Reports.optionsHtml(Reports.FIELD_ROLES, f.fieldRole)}</select></td>
            <td><input type="text" data-k="displayFormat" maxlength="50" placeholder="optional" value="${esc(f.displayFormat || '')}"></td>
            <td class="cell-muted" title="${esc(f.sampleValue ?? '')}">${esc(Reports.truncate(f.sampleValue ?? '', 28))}</td>
          </tr>`).join('')}</tbody></table></div>`;
      }

      // edits: update the row in memory + flag it, without re-rendering (keeps focus while typing)
      $('dtFieldsTable').addEventListener('input', onFieldEdit);
      $('dtFieldsTable').addEventListener('change', onFieldEdit);
      function onFieldEdit(e) {
        const el = e.target.closest('[data-k]');
        if (!el) return;
        const tr = el.closest('tr');
        const f = fields[Number(tr.dataset.i)];
        f[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
        tr.classList.toggle('is-edited', editedPaths().has(f.fieldPath));
        $('dtSaveFields').disabled = !isDirty();
        dirtyDot('dtFieldsDot', isDirty());
      }

      $('dtSaveFields').addEventListener('click', async () => {
        $('dtFieldsMsg').innerHTML = '';
        const changedSet = editedPaths();
        const list = fields.filter((f) => changedSet.has(f.fieldPath));
        const bad = list.find((f) => !String(f.fieldLabel || '').trim());
        if (bad) { $('dtFieldsMsg').innerHTML = Reports.formErrorsHtml({ message: `Label cannot be empty (field ${bad.fieldPath}).` }); return; }
        const btn = $('dtSaveFields');
        Admin.setButtonLoading(btn, true, 'Saving\u2026');
        try {
          const res = await Admin.api.put(API.fields(src.id), {
            fields: list.map((f) => ({
              field_path: f.fieldPath,
              field_label: String(f.fieldLabel).trim(),
              data_type: f.dataType,
              field_role: f.fieldRole,
              display_format: String(f.displayFormat || '').trim(),
              is_visible: f.isVisible ? 1 : 0,
            })),
          });
          fields = (res.data.fields || []).map((f) => ({ ...f }));
          saved = JSON.stringify(fields.map(snap));
          Admin.toast(`Saved ${list.length} field${list.length === 1 ? '' : 's'}`, 'success');
          renderTable();
          loadList();
        } catch (err) {
          $('dtFieldsMsg').innerHTML = Reports.formErrorsHtml(err);
        } finally {
          Admin.setButtonLoading(btn, false);
          btn.disabled = !isDirty();
        }
      });

      $('dtDetect').addEventListener('click', async () => {
        const msg = $('dtFieldsMsg');
        if (isDirty()) { Admin.toast('Save your field edits first, then detect again.', 'error'); return; }
        const body = { save_fields: true, preview_rows: 5 };
        if (needsValues) {
          const r = Reports.parseJsonInput($('dtTestVals').value, 'Test values', { expect: 'object' });
          $('dtTestValsErr').textContent = r.error || '';
          if (r.error) return;
          if (!r.empty) body.test_values = r.value;
        }
        const btn = $('dtDetect');
        Admin.setButtonLoading(btn, true, 'Detecting\u2026');
        msg.innerHTML = Reports.stateHtml('loading', 'Calling the API\u2026');
        try {
          const res = await Admin.api.post(API.test(src.id), body);
          const r = res.data;
          if (!r.ok) { msg.innerHTML = resultHtml(r); return; }
          const sync = r.fieldSync || { added: [], missing: [] };
          msg.innerHTML = `<div class="rpt-hint" style="margin:0 0 10px;"><span class="badge badge-green"><span class="badge-dot"></span>API call succeeded</span>
            ${Reports.fmtNumber(r.rowCount)} row(s) \u00b7 ${sync.added.length} new field(s) added${sync.missing.length ? ` \u00b7 ${sync.missing.length} saved field(s) not seen in this response` : ''}.</div>`;
          const list = Array.isArray(r.savedFields) ? r.savedFields : ((await Admin.api.get(API.fields(src.id))).data.fields || []);
          fields = list.map((f) => ({ ...f }));
          saved = JSON.stringify(fields.map(snap));
          renderTable();
          loadList();
        } catch (err) {
          msg.innerHTML = Reports.formErrorsHtml(err);
        } finally {
          Admin.setButtonLoading(btn, false);
        }
      });

      renderTable();
    }

    // ---------------------------------------------------------------- Params tab
    function buildParams() {
      const box = panel('params');
      box.innerHTML = `
        <div class="rpt-hint" style="margin:0 0 12px;">Declare every <span class="rpt-code">{placeholder}</span> that the URL, query, headers or body of this source uses. Widgets and dashboard filters pass these values in. Removing a param that is still used in the request is rejected.</div>
        <div id="dtParamsMsg"></div>
        <div id="dtParamsMount"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
          <button type="button" class="btn btn-primary btn-sm" id="dtSaveParams" disabled>Save params</button>
        </div>`;
      const used = () => {
        const set = new Set();
        [src.apiUrl, src.queryParams, src.headers, src.body].forEach((v) => Reports.findPlaceholders(v, set));
        return set;
      };
      let pe;
      const sync = () => {
        $('dtParamsCount').textContent = String(pe ? pe.rowCount() : (src.params || []).length);
        const d = pe ? pe.isDirty() : false;
        dirtyDot('dtParamsDot', d);
        $('dtSaveParams').disabled = !d;
      };
      pe = Reports.paramsEditor($('dtParamsMount'), { params: src.params || [], getUsedNames: used, onChange: sync });
      sync();

      $('dtSaveParams').addEventListener('click', async () => {
        const msg = $('dtParamsMsg');
        msg.innerHTML = '';
        const v = pe.getValue();
        if (v.errors.length) { msg.innerHTML = Reports.formErrorsHtml({ message: 'Please fix the following:', errors: v.errors }); return; }
        const btn = $('dtSaveParams');
        Admin.setButtonLoading(btn, true, 'Saving\u2026');
        try {
          await Admin.api.put(API.params(src.id), { params: v.params });
          Admin.toast('Params saved', 'success');
          // re-open from the server copy so the editor's "unsaved" baseline is the saved state
          const fresh = await Admin.api.get(API.one(src.id));
          src.params = fresh.data.source.params || [];
          panel('params').innerHTML = '';
          buildParams();
          panel('params').hidden = false;
          loadList();
        } catch (err) {
          msg.innerHTML = Reports.formErrorsHtml(err);
          Admin.setButtonLoading(btn, false);
          btn.disabled = !pe.isDirty();
        }
      });
    }

    // ---------------------------------------------------------------- Cache & runs tab
    function buildRuns() {
      const box = panel('runs');
      const cacheLine = src.cacheEnabled
        ? `Caching is <strong>on</strong> (${esc(src.cacheTtlSec)} s). ${Number(src.cacheTtlSec) === 0 ? 'A cache time of 0 means responses are not kept.' : ''}`
        : 'Caching is <strong>off</strong> for this source.';
      box.innerHTML = `
        <div class="rpt-section-title" style="margin-top:0;">Cache</div>
        <div class="rpt-detail-bar">
          <div class="rpt-hint" style="margin:0;">${cacheLine} Clearing forgets every cached response of this source, so the next widget load calls the API again.${src.isInternal ? ' (Internal sources are cached per user.)' : ''}</div>
          <button type="button" class="btn btn-secondary btn-sm" id="dtClearCache">Clear cache</button>
        </div>
        <div class="rpt-section-title">Recent runs</div>
        <div class="rpt-detail-bar">
          <div class="rpt-hint" style="margin:0;">Tests, widget loads and dashboard loads of this source, newest first (last 25). Old entries are purged automatically.</div>
          <button type="button" class="btn btn-secondary btn-sm" id="dtReloadRuns">Refresh</button>
        </div>
        <div id="dtRuns"></div>`;

      $('dtClearCache').addEventListener('click', async () => {
        const btn = $('dtClearCache');
        Admin.setButtonLoading(btn, true, 'Clearing\u2026');
        try {
          const res = await Admin.api.del(API.cache(src.id));
          const n = res.data && res.data.deleted !== undefined ? Number(res.data.deleted) : null;
          Admin.toast(n === null ? 'Cache cleared' : `Cache cleared (${n} cached response${n === 1 ? '' : 's'} removed)`, 'success');
        } catch (err) { Admin.toastError(err); } finally { Admin.setButtonLoading(btn, false); }
      });
      $('dtReloadRuns').addEventListener('click', loadRuns);
      loadRuns();
    }

    async function loadRuns() {
      const wrap = $('dtRuns');
      wrap.innerHTML = Reports.stateHtml('loading', 'Loading runs\u2026');
      try {
        const res = await Admin.api.get(API.runs(src.id) + Admin.qs({ limit: 25 }));
        const runs = (res.data && res.data.runs) || [];
        if (!runs.length) { wrap.innerHTML = Reports.stateHtml('empty', 'No runs recorded yet.', 'Run a test, or load a widget that uses this source.'); return; }
        wrap.innerHTML = `<div class="rpt-table-scroll"><table>
          <thead><tr><th>When</th><th>Type</th><th>Result</th><th>HTTP</th><th>Time</th><th>Rows</th><th>Details</th></tr></thead>
          <tbody>${runs.map((r) => {
            const params = r.params && Object.keys(r.params).length ? JSON.stringify(r.params) : '';
            const detail = r.error
              ? `<span style="color:var(--coral);" title="${esc(r.error)}">${esc(Reports.truncate(r.error, 70))}</span>`
              : (params ? `<span class="rpt-mono cell-muted" title="${esc(params)}">${esc(Reports.truncate(params, 50))}</span>` : '<span class="cell-muted">\u2014</span>');
            return `<tr>
              <td style="white-space:nowrap;" title="${esc(Admin.formatDate(r.createdAt))}">${esc(Admin.timeAgo(r.createdAt))}</td>
              <td><span class="rpt-chip">${esc(r.runType)}</span></td>
              <td><span class="badge ${RUN_STATUS_BADGE[r.status] || 'badge-gray'}">${esc(RUN_STATUS_LABEL[r.status] || r.status)}</span></td>
              <td class="cell-muted">${r.httpStatus ?? '\u2014'}</td>
              <td class="cell-muted" style="white-space:nowrap;">${esc(Reports.fmtMs(r.durationMs))}</td>
              <td class="cell-muted">${r.rowCount === null ? '\u2014' : Reports.fmtNumber(r.rowCount)}</td>
              <td>${detail}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`;
      } catch (err) {
        const st = Reports.errorState(err);
        wrap.innerHTML = Reports.stateHtml(st.kind, st.message, st.hint);
      }
    }
  }

  // =========================================================================
  // INIT
  // =========================================================================

  async function init() {
    await Admin.requireAuth();

    document.getElementById('srcAuth').innerHTML = Reports.optionsHtml(Reports.AUTH_TYPES, '', { blank: 'All' });
    const newBtn = document.getElementById('btnNewSource');
    newBtn.hidden = false;
    newBtn.addEventListener('click', () => openFormModal(null));
    document.getElementById('btnRefresh').addEventListener('click', () => loadList(true));

    const apply = () => {
      state.search = document.getElementById('srcSearch').value.trim();
      state.status = document.getElementById('srcStatus').value;
      state.isInternal = document.getElementById('srcKind').value;
      state.authType = document.getElementById('srcAuth').value;
      state.page = 1;
      loadList();
    };
    document.getElementById('srcSearch').addEventListener('input', Admin.debounce(apply, 350));
    ['srcStatus', 'srcKind', 'srcAuth'].forEach((id) => document.getElementById(id).addEventListener('change', apply));

    await loadList();
  }

  init().catch((e) => Admin.toastError(e));
})();
