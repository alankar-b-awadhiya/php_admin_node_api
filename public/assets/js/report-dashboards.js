/**
 * report-dashboards.js — Dashboards page (report-dashboards.php). Step 6A + 6B of the Reports plan.
 *
 * ---------------------------------------------------------------------------
 * Two modes, one page:
 *   report-dashboards.php            LIST   (6A) search / status filter / table, create + edit basics, on/off, delete
 *   report-dashboards.php?_d=<code>  VIEWER (6B) filter bar + widget grid, the filter values live in the URL
 *   ("_d" starts with an underscore on purpose: a filter_key must start with a letter, so it can never clash.)
 *
 * Endpoints used (paths live in reports-common.js -> Reports.API.dashboards.*):
 *   GET    list            ?search&status&page&per_page   -> { data: { dashboards: [...] }, meta.pagination }
 *   POST   list            create basics { dashboard_code, dashboard_title, description, grid_columns, refresh_interval_sec, permission_resource, is_active }
 *   PATCH  one(id)         update basics (same body)
 *   PATCH  status(id)      { is_active }
 *   DELETE one(id)
 *   GET    data(code)      ?<filter_key>=<value>&refresh=1  -> { dashboard, filters[{...,value}], widgets[], meta }
 *                           widgets[i] = { placementId, widgetId, widgetCode, grid{x,y,w,h}, title, ok,
 *                                          widget, data, meta, messages }   (ok)
 *                                      | { ..., ok:false, error:{ code, message, errors } }              (one widget failed)
 *   GET    one(code)       definition (filters + placements). Only used when /data answers 422 (a required filter is empty):
 *                           that answer carries no filter definitions, so the bar is built from here instead.
 *   GET    filterOptions(code, key)  ?<other filter values>  -> { options:[{value,label}], needsParent? }
 *
 * Viewer rules:
 *   - ONE /data call paints every widget. A widget with ok:false only turns its own frame into an error / forbidden state.
 *   - Filter changes are debounced (350 ms); a request counter drops answers that arrive late (a filter change also
 *     invalidates the request in flight, otherwise its older values would overwrite the new selection).
 *   - Changing a filter clears its descendants (parent_filter_key) and re-fetches their options.
 *   - "Refresh data" sends ?refresh=1 (cache bypass). Auto-refresh (dashboard interval, else the smallest widget
 *     interval) does NOT bypass the cache, and pauses while the tab is hidden.
 *   - "Retry" on a failed widget reloads the dashboard and repaints only the frames that had failed.
 *
 * Drawing is ReportsRender.renderWidget (reports-render.js) — the same function the widget builder uses.
 * The layout / filters builder (6C) lives in report-dashboard-builder.js and opens with ?_d=<code>&edit=1.
 * ---------------------------------------------------------------------------
 */
(function () {
  const esc = Admin.escapeHtml;
  const API = Reports.API.dashboards;
  const $ = (id) => document.getElementById(id);

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="6" y="4.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="11" y="4.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor"/></svg>',
    layout: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="3" y="3.5" width="14" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="10" width="6" height="6.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="10" width="6" height="6.5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
    open: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.3" stroke="currentColor" stroke-width="1.5"/></svg>',
  };

  const viewHref = (code) => `report-dashboards.php${Admin.qs({ _d: code })}`;
  const editHref = (code) => `report-dashboards.php${Admin.qs({ _d: code, edit: 1 })}`;

  // =========================================================================
  // LIST (6A)
  // =========================================================================

  const state = { search: '', status: '', page: 1, perPage: 20 };
  let rows = [];
  const filtersActive = () => !!(state.search || state.status);

  async function loadList(spin) {
    const body = $('dashTableBody');
    const refreshBtn = $('btnRefresh');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading dashboards…</td></tr>';
    try {
      const res = await Admin.api.get(API.list + Admin.qs({ search: state.search, status: state.status, page: state.page, per_page: state.perPage }));
      rows = (res.data && res.data.dashboards) || [];
      const pg = res.meta && res.meta.pagination;
      const total = pg ? pg.total : rows.length;
      $('dashCount').textContent = `${total} dashboard${total === 1 ? '' : 's'}`;
      if (!filtersActive()) $('rptStatTotal').textContent = Reports.fmtNumber(total);
      renderTable();
      Reports.renderPager($('dashPagination'), pg, (p) => { state.page = p; loadList(); });
    } catch (err) {
      const st = Reports.errorState(err);
      body.innerHTML = `<tr><td colspan="6" class="table-empty">${Reports.stateHtml(st.kind, st.message, st.hint)}</td></tr>`;
      $('dashPagination').innerHTML = '';
      $('dashCount').textContent = '—';
      if (!filtersActive()) $('rptStatTotal').textContent = '—';
      if (st.kind !== 'forbidden') Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = $('dashTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">${filtersActive()
        ? 'No dashboards match these filters.'
        : 'No dashboards yet. Click “New Dashboard” to create one.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((d) => {
      const title = d.isActive
        ? `<a href="${esc(viewHref(d.code))}" class="rpt-link" title="Open dashboard">${esc(d.title)}</a>`
        : `<span style="font-weight:600;">${esc(d.title)}</span>`;
      return `
      <tr data-id="${d.id}">
        <td>
          ${title}
          <div><span class="rpt-code">${esc(d.code)}</span>${d.description ? ` <span class="cell-muted">${esc(Reports.truncate(d.description, 70))}</span>` : ''}</div>
        </td>
        <td class="cell-muted">${Reports.fmtNumber(d.widgetCount)}</td>
        <td class="cell-muted">${Reports.fmtNumber(d.filterCount)}</td>
        <td class="cell-muted" style="white-space:nowrap;" title="${esc(Admin.formatDate(d.updatedAt))}">${esc(d.updatedAt ? Admin.timeAgo(d.updatedAt) : '—')}</td>
        <td>${Reports.activeBadge(d.isActive)}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-view" type="button" data-act="open" title="${d.isActive ? 'Open dashboard' : 'Switch it on to open it'}"${d.isActive ? '' : ' disabled'}>${ICON.open}</button>
          <button class="icon-action icon-action-edit" type="button" data-act="layout" title="Edit layout (widgets, filters)">${ICON.layout}</button>
          <button class="icon-action icon-action-edit" type="button" data-act="edit" title="Edit details">${ICON.edit}</button>
          ${d.isActive
            ? `<button class="icon-action icon-action-toggle" type="button" data-act="disable" title="Switch off">${ICON.pause}</button>`
            : `<button class="icon-action icon-action-toggle" type="button" data-act="enable" title="Switch on">${ICON.play}</button>`}
          <button class="icon-action icon-action-delete" type="button" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');

    body.querySelectorAll('tr[data-id]').forEach((tr) => {
      const d = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const act = el.dataset.act;
        if (act === 'open') location.href = viewHref(d.code);
        else if (act === 'layout') location.href = editHref(d.code);
        else if (act === 'edit') openBasics(d);
        else if (act === 'disable' || act === 'enable') setStatus(d, act === 'enable');
        else if (act === 'delete') removeDashboard(d);
      }));
    });
  }

  async function setStatus(d, on) {
    try {
      await Admin.api.patch(API.status(d.id), { is_active: on });
      Admin.toast(`Dashboard ${on ? 'switched on' : 'switched off'}.`, 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removeDashboard(d) {
    const ok = await Admin.confirmAction({
      title: 'Delete dashboard?',
      body: `<p>“${esc(d.title)}” and its layout will be removed. The code <span class="rpt-code">${esc(d.code)}</span> stays reserved. The widgets themselves are not deleted.</p>`,
      confirmLabel: 'Delete dashboard',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.one(d.id));
      Admin.toast('Dashboard deleted.', 'success');
      if (rows.length === 1 && state.page > 1) state.page -= 1;
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // ---- Create / edit the basics -------------------------------------------------

  function openBasics(d) {
    const editing = !!d;
    let codeTouched = editing;
    Admin.openModal(`
      <div class="modal-header">
        <h3>${editing ? 'Edit dashboard' : 'New dashboard'}</h3>
        <button class="btn btn-ghost btn-icon" type="button" data-act="close">&times;</button>
      </div>
      <div class="modal-body">
        <div id="db-err"></div>
        <div class="form-row">
          <div class="form-group"><label for="db-title">Title <span style="color:var(--coral);">*</span></label>
            <input type="text" id="db-title" maxlength="150" autocomplete="off" placeholder="Sales overview" value="${esc(editing ? d.title : '')}"></div>
          <div class="form-group"><label for="db-code">Code <span style="color:var(--coral);">*</span></label>
            <input type="text" id="db-code" class="rpt-mono" maxlength="80" autocomplete="off" placeholder="sales_overview" value="${esc(editing ? d.code : '')}">
            <div class="rpt-hint">Part of the dashboard link. Lowercase letters, digits and _ ${editing ? '— changing it breaks saved links.' : ''}</div></div>
        </div>
        <div class="form-group"><label for="db-desc">Description</label>
          <textarea id="db-desc" rows="2" maxlength="500" placeholder="Optional">${esc(editing && d.description ? d.description : '')}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label for="db-cols">Grid columns</label>
            <input type="number" id="db-cols" min="1" max="24" value="${editing ? d.gridColumns : 12}">
            <div class="rpt-hint">1–24. Widget widths are counted in these columns.</div></div>
          <div class="form-group"><label for="db-refresh">Auto-refresh (seconds)</label>
            <input type="number" id="db-refresh" min="5" max="86400" placeholder="Off" value="${editing && d.refreshIntervalSec ? d.refreshIntervalSec : ''}">
            <div class="rpt-hint">Blank = off. 5–86400.</div></div>
        </div>
        <div class="form-group"><label for="db-perm">Extra permission resource</label>
          <input type="text" id="db-perm" class="rpt-mono" maxlength="80" autocomplete="off" placeholder="optional" value="${esc(editing && d.permissionResource ? d.permissionResource : '')}">
          <div class="rpt-hint">If set, viewers also need “view” access to this RBAC resource.</div></div>
        <div class="form-group"><label>Active</label>
          <div style="display:flex;align-items:center;height:38px;"><label class="switch"><input type="checkbox" id="db-active" ${!editing || d.isActive ? 'checked' : ''}><span class="slider"></span></label></div></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
        <button type="button" class="btn btn-primary" id="db-save">${editing ? 'Save changes' : 'Create dashboard'}</button>
      </div>`);

    $('modalBackdrop').querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', Admin.closeModal));
    $('db-title').addEventListener('input', (e) => { if (!codeTouched) $('db-code').value = Reports.slugify(e.target.value); });
    $('db-code').addEventListener('input', () => { codeTouched = true; });
    $('db-title').focus();

    $('db-save').addEventListener('click', async () => {
      const title = $('db-title').value.trim();
      const code = $('db-code').value.trim().toLowerCase();
      const cols = $('db-cols').value.trim();
      const refresh = $('db-refresh').value.trim();
      const errs = [];
      if (!title) errs.push('Title is required.');
      if (!Reports.isCode(code)) errs.push('Code must be 2–80 characters: lowercase letters, digits and _ , starting with a letter.');
      if (!/^\d+$/.test(cols) || Number(cols) < 1 || Number(cols) > 24) errs.push('Grid columns must be a whole number from 1 to 24.');
      if (refresh && (!/^\d+$/.test(refresh) || Number(refresh) < 5 || Number(refresh) > 86400)) errs.push('Auto-refresh must be a whole number from 5 to 86400 seconds, or blank.');
      const box = $('db-err');
      if (errs.length) { box.innerHTML = Reports.formErrorsHtml({ message: 'Please fix the following:', errors: errs }); return; }
      box.innerHTML = '';

      const body = {
        dashboard_title: title,
        dashboard_code: code,
        description: $('db-desc').value.trim(),
        grid_columns: Number(cols),
        refresh_interval_sec: refresh ? Number(refresh) : null,
        permission_resource: $('db-perm').value.trim(),
        is_active: $('db-active').checked,
      };
      const btn = $('db-save');
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        if (editing) await Admin.api.patch(API.one(d.id), body);
        else await Admin.api.post(API.list, body);
        Admin.toast(editing ? 'Dashboard updated.' : 'Dashboard created.', 'success');
        Admin.closeModal();
        loadList();
      } catch (err) {
        box.innerHTML = Reports.formErrorsHtml(err);
        box.scrollIntoView({ block: 'nearest' });
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });
  }

  async function initList() {
    $('dashListView').hidden = false;
    const newBtn = $('btnNewDashboard');
    newBtn.hidden = !Reports.access.can('report-dashboards', 'create');
    newBtn.addEventListener('click', () => openBasics(null));
    $('btnRefresh').addEventListener('click', () => loadList(true));
    const apply = () => {
      state.search = $('dashSearch').value.trim();
      state.status = $('dashStatus').value;
      state.page = 1;
      loadList();
    };
    $('dashSearch').addEventListener('input', Admin.debounce(apply, 350));
    $('dashStatus').addEventListener('change', apply);
    await loadList();
  }

  // =========================================================================
  // VIEWER (6B)
  // =========================================================================

  function initViewer(code) {
    $('dashViewerView').hidden = false;
    const bodyEl = $('dvBody');
    const barEl = $('dvFilters');
    const refreshBtn = $('dvRefresh');

    const V = {
      filters: [],            // definitions: [{ key, label, dataType, options, optionsSourceId, parentKey, defaultValue, isRequired }]
      haveDefs: false,
      values: {},             // current filter values, key -> string ('' = empty)
      opts: {},               // select filter key -> [{ value, label }]
      optState: {},           // key -> 'ok' | 'loading' | 'needs-parent' | 'error'
      optSeq: {},             // key -> request counter
      frames: new Map(),      // placementId -> { cell, failed }
      seq: 0,                 // /data request counter
      timer: null,
      interval: null,
      pending: false,         // an auto-refresh came due while the tab was hidden
    };

    // Builder preview: ?draft=1 inside the embedded viewer runs the builder's unsaved state instead of the stored dashboard.
    const DRAFT = new URLSearchParams(location.search).get('draft') === '1' && typeof window.parent.__rptDraft === 'function';
    const draftFilters = (list) => list.map((f) => ({ key: f.filter_key, label: f.filter_label, dataType: f.data_type, parentKey: f.parent_filter_key || null, optionsSourceId: f.options_source_id || null, optionValueField: f.option_value_field || null, optionLabelField: f.option_label_field || null, options: f.options || null, defaultValue: f.default_value || null, isRequired: !!Number(f.is_required), sortOrder: 0 }));

    // Filter values may arrive in the link before we know which filters exist; keep them all, trim on the first answer.
    new URLSearchParams(location.search).forEach((v, k) => { if (k !== '_d' && k !== 'refresh' && k !== 'edit' && k !== 'embed' && k !== 'draft') V.values[k] = v; });

    const errList = (err) => (err && Array.isArray(err.errors) ? err.errors.filter((e) => typeof e === 'string' && !/^reason:/i.test(e)) : []);

    // ---- URL ------------------------------------------------------------------
    function syncUrl() {
      const q = { _d: code };
      if (new URLSearchParams(location.search).get('embed') === '1') q.embed = 1;
      if (DRAFT) q.draft = 1;
      Object.entries(V.values).forEach(([k, v]) => { if (v) q[k] = v; });
      try { history.replaceState(null, '', `${location.pathname}${Admin.qs(q)}`); } catch (e) { /* ignore */ }
    }

    // ---- Header ---------------------------------------------------------------
    function setHeader(dash) {
      const editBtn = $('dvEdit');
      editBtn.href = editHref(code);
      editBtn.hidden = false;
      $('dvTitle').textContent = dash.title || code;
      $('dvSub').textContent = dash.description || '';
    }

    // ---- Frames / grid --------------------------------------------------------
    function releaseAll() {
      V.frames.forEach((f) => ReportsRender.release(f.cell));
      V.frames.clear();
    }
    function showState(kind, message, hint, withRetry) {
      releaseAll();
      bodyEl.innerHTML = Reports.stateHtml(kind, message, hint);
      if (withRetry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary btn-sm';
        btn.textContent = 'Retry';
        btn.addEventListener('click', () => load({}));
        bodyEl.querySelector('.rpt-state').appendChild(btn);
      }
    }

    const sameIds = (widgets) => widgets.length === V.frames.size && widgets.every((w) => V.frames.has(w.placementId));

    /** Payload + options for one widget entry of the /data answer. */
    function framePayload(w) {
      if (w.ok) return { payload: { widget: w.widget, data: w.data, meta: w.meta, messages: w.messages }, opts: { title: w.title } };
      const e = w.error || {};
      const err = { message: e.message, errors: e.errors || [], status: e.code === 'forbidden' ? 403 : undefined };
      return { payload: { error: err }, opts: { title: w.title, onRetry: () => load({ onlyFailed: true }) } };
    }

    function renderGrid(dash, widgets, onlyFailed) {
      if (!widgets.length) {
        showState('empty', 'This dashboard has no widgets yet.', 'Widgets are placed on the grid in the layout builder.');
        return;
      }
      let grid = bodyEl.querySelector('.rpt-grid');
      if (!grid) {
        releaseAll();
        bodyEl.innerHTML = '<div class="rpt-grid"></div>';
        grid = bodyEl.querySelector('.rpt-grid');
      }
      grid.style.setProperty('--rpt-cols', String(dash.gridColumns || 12));
      const partial = onlyFailed && sameIds(widgets);

      const seen = new Set();
      widgets.forEach((w) => {
        seen.add(w.placementId);
        let f = V.frames.get(w.placementId);
        if (!f) {
          const cell = document.createElement('div');
          cell.className = 'rpt-cell';
          f = { cell, failed: false };
          V.frames.set(w.placementId, f);
        }
        const g = w.grid || { x: 0, y: 0, w: 6, h: 4 };
        f.cell.style.gridColumn = `${g.x + 1} / span ${g.w}`;
        f.cell.style.gridRow = `${g.y + 1} / span ${g.h}`;
        f.cell.style.setProperty('--rpt-h', String(g.h));
        grid.appendChild(f.cell); // appending an existing node just moves it, so the DOM order follows the answer
        if (!partial || f.failed) {
          const fp = framePayload(w);
          ReportsRender.renderWidget(f.cell, fp.payload, fp.opts);
        }
        f.failed = !w.ok && !(w.error && w.error.code === 'forbidden');
      });
      [...V.frames.keys()].forEach((id) => {
        if (seen.has(id)) return;
        const f = V.frames.get(id);
        ReportsRender.release(f.cell);
        f.cell.remove();
        V.frames.delete(id);
      });
    }

    function markFailedLoading() {
      V.frames.forEach((f) => { if (f.failed) ReportsRender.renderWidget(f.cell, { loading: true }, {}); });
    }

    // ---- Filter bar -------------------------------------------------------------
    const childrenOf = (key) => V.filters.filter((f) => f.parentKey === key);
    const filterByKey = (key) => V.filters.find((f) => f.key === key);
    const normOpts = (list) => (Array.isArray(list) ? list : []).map((o) => (o && typeof o === 'object' ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) }));

    function selectInner(f) {
      const st = V.optState[f.key];
      const cur = V.values[f.key] || '';
      if (st === 'loading') return { html: '<option value="">Loading…</option>', disabled: true };
      if (st === 'needs-parent') {
        const p = filterByKey(f.parentKey);
        return { html: `<option value="">Select ${esc(p ? p.label : 'the previous filter')} first</option>`, disabled: true };
      }
      if (st === 'error') return { html: '<option value="">Could not load options</option>', disabled: true };
      const list = (V.opts[f.key] || []).slice();
      if (cur && !list.some((o) => o.value === cur)) list.unshift({ value: cur, label: cur });
      return { html: Reports.optionsHtml(list, cur, { blank: f.isRequired ? 'Select…' : 'All' }), disabled: false };
    }

    function paintSelect(f) {
      const el = barEl.querySelector(`select[data-fk="${f.key}"]`);
      if (!el) return;
      const s = selectInner(f);
      el.innerHTML = s.html;
      el.disabled = s.disabled;
      el.title = V.optState[f.key] === 'error' ? 'Use “Refresh data” to try again.' : '';
    }

    function filterHtml(f) {
      const v = V.values[f.key] || '';
      const req = f.isRequired ? ' <span style="color:var(--coral);">*</span>' : '';
      let input;
      if (f.dataType === 'select') {
        const s = selectInner(f);
        input = `<select data-fk="${esc(f.key)}"${s.disabled ? ' disabled' : ''}>${s.html}</select>`;
      } else if (f.dataType === 'daterange') {
        const [from, to] = v.split(',');
        input = `<div style="display:flex;gap:6px;"><input type="date" data-fk="${esc(f.key)}" data-part="from" value="${esc(from || '')}" aria-label="${esc(f.label)} from"><input type="date" data-fk="${esc(f.key)}" data-part="to" value="${esc(to || '')}" aria-label="${esc(f.label)} to"></div>`;
      } else {
        const type = f.dataType === 'date' ? 'date' : f.dataType === 'number' ? 'number' : 'text';
        input = `<input type="${type}" data-fk="${esc(f.key)}" value="${esc(v)}" autocomplete="off"${type === 'number' ? ' step="any"' : ''}>`;
      }
      return `<div class="form-group"><label>${esc(f.label)}${req}</label>${input}</div>`;
    }

    function buildBar() {
      if (!V.filters.length) { barEl.hidden = true; barEl.innerHTML = ''; return; }
      barEl.hidden = false;
      barEl.innerHTML = `${V.filters.map(filterHtml).join('')}
        <div class="form-group"><button type="button" class="btn btn-ghost btn-sm" data-reset title="Clear all filters (defaults apply again)">Reset</button></div>`;
    }

    /** Pushes V.values into the existing inputs (after the server resolved defaults). */
    function syncInputs() {
      V.filters.forEach((f) => {
        if (f.dataType === 'select') { paintSelect(f); return; }
        const v = V.values[f.key] || '';
        if (f.dataType === 'daterange') {
          const [from, to] = v.split(',');
          const a = barEl.querySelector(`[data-fk="${f.key}"][data-part="from"]`);
          const b = barEl.querySelector(`[data-fk="${f.key}"][data-part="to"]`);
          if (a && b && (a.value && !b.value || !a.value && b.value)) return; // user is half-way through typing a range
          if (a && a.value !== (from || '')) a.value = from || '';
          if (b && b.value !== (to || '')) b.value = to || '';
        } else {
          const el = barEl.querySelector(`[data-fk="${f.key}"]`);
          if (el && el.value !== v) el.value = v;
        }
      });
    }

    function readInput(f) {
      if (f.dataType === 'daterange') {
        const a = barEl.querySelector(`[data-fk="${f.key}"][data-part="from"]`);
        const b = barEl.querySelector(`[data-fk="${f.key}"][data-part="to"]`);
        const from = a ? a.value : '';
        const to = b ? b.value : '';
        if (!from && !to) return '';
        if (!from || !to) return null; // half-filled: wait for the other date
        return `${from},${to}`;
      }
      const el = barEl.querySelector(`[data-fk="${f.key}"]`);
      return el ? el.value.trim() : '';
    }

    /** Options of a select filter: static list now, or the options source (needs the parent's value first). */
    async function loadOptions(f) {
      if (f.dataType !== 'select') return;
      const key = f.key;
      if (!f.optionsSourceId) {
        V.opts[key] = normOpts(f.options);
        V.optState[key] = 'ok';
        paintSelect(f);
        return;
      }
      if (f.parentKey && !V.values[f.parentKey]) {
        V.opts[key] = [];
        V.optState[key] = 'needs-parent';
        paintSelect(f);
        return;
      }
      const my = (V.optSeq[key] = (V.optSeq[key] || 0) + 1);
      V.optState[key] = 'loading';
      paintSelect(f);
      try {
        const q = { ...V.values };
        delete q[key];
        const res = await Admin.api.get(API.filterOptions(code, key) + Admin.qs(q));
        if (my !== V.optSeq[key]) return;
        const d = res.data || {};
        V.opts[key] = normOpts(d.options);
        V.optState[key] = d.needsParent ? 'needs-parent' : 'ok';
      } catch (err) {
        if (my !== V.optSeq[key]) return;
        V.opts[key] = [];
        V.optState[key] = 'error';
      }
      paintSelect(f);
    }

    /** A filter changed: clear everything below it, re-fetch the options of its direct children, then reload (debounced). */
    function onFilterChange(key) {
      const f = filterByKey(key);
      if (!f) return;
      const val = readInput(f);
      if (val === null) return; // half-filled date range
      if (val === (V.values[key] || '')) return;
      V.values[key] = val;
      V.seq += 1; // whatever /data request is in flight carries the old selection: drop its answer

      const cleared = [];
      (function walk(k) {
        childrenOf(k).forEach((c) => {
          if (V.values[c.key]) V.values[c.key] = '';
          V.optSeq[c.key] = (V.optSeq[c.key] || 0) + 1; // drop any option answer still in flight
          cleared.push(c);
          walk(c.key);
        });
      })(key);
      cleared.forEach((c) => {
        if (c.dataType !== 'select') {
          const el = barEl.querySelector(`[data-fk="${c.key}"]`);
          if (el) el.value = '';
          return;
        }
        if (c.parentKey === key) loadOptions(c);
        else { V.optState[c.key] = 'needs-parent'; V.opts[c.key] = []; paintSelect(c); }
      });
      syncUrl();
      scheduleReload();
    }

    barEl.addEventListener('change', (e) => {
      const el = e.target.closest('[data-fk]');
      if (el) onFilterChange(el.dataset.fk);
    });
    barEl.addEventListener('click', (e) => {
      if (!e.target.closest('[data-reset]')) return;
      V.seq += 1;
      V.filters.forEach((f) => { V.values[f.key] = ''; V.optSeq[f.key] = (V.optSeq[f.key] || 0) + 1; });
      buildBar();
      V.filters.forEach(loadOptions);
      scheduleReload(0);
    });

    // ---- Loading ----------------------------------------------------------------
    const scheduleReload = (() => {
      let t;
      return (wait = 350) => { clearTimeout(t); t = setTimeout(() => load({}), wait); };
    })();

    function setBusy(on) {
      const grid = bodyEl.querySelector('.rpt-grid');
      if (grid) grid.classList.toggle('is-busy', on);
      refreshBtn.disabled = on;
    }

    function cleanValues() {
      const q = {};
      Object.entries(V.values).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) q[k] = v; });
      return q;
    }

    async function load({ fresh = false, onlyFailed = false } = {}) {
      const my = ++V.seq;
      clearTimeout(V.timer);
      syncUrl();
      if (!bodyEl.querySelector('.rpt-grid')) { releaseAll(); bodyEl.innerHTML = Reports.stateHtml('loading', 'Loading dashboard…'); }
      if (onlyFailed) markFailedLoading();
      setBusy(!onlyFailed);
      try {
        let res;
        if (DRAFT) {
          const d = window.parent.__rptDraft();
          if (d.errs.length) { showState('error', 'Fix these in the builder first:', d.errs.join(' · ')); return; }
          res = await Admin.api.post(API.preview + Admin.qs(cleanValues()), d.body);
        } else {
          res = await Admin.api.get(API.data(code) + Admin.qs({ ...cleanValues(), refresh: fresh ? 1 : '' }));
        }
        if (my !== V.seq) return;
        onData(res.data, onlyFailed);
      } catch (err) {
        if (my !== V.seq) return;
        await onLoadError(err);
      } finally {
        if (my === V.seq) setBusy(false);
      }
    }

    function onData(d, onlyFailed) {
      setHeader(d.dashboard);

      const sig = (list) => list.map((f) => `${f.key}:${f.dataType}:${f.parentKey || ''}`).join('|');
      const changedDefs = !V.haveDefs || sig(d.filters) !== sig(V.filters);
      V.filters = d.filters;
      V.haveDefs = true;
      // The server answers with the values it actually used (link values + defaults); anything that is not a filter is dropped.
      const next = {};
      d.filters.forEach((f) => { next[f.key] = f.value === null || f.value === undefined ? '' : String(f.value); });
      V.values = next;
      syncUrl();

      if (changedDefs) {
        buildBar();
        V.filters.forEach(loadOptions);
      } else {
        syncInputs();
      }

      renderGrid(d.dashboard, d.widgets, onlyFailed);

      const failed = d.widgets.filter((w) => !w.ok).length;
      $('dvUpdated').textContent = `Updated ${new Date().toLocaleTimeString()}${failed ? ` · ${failed} widget${failed === 1 ? '' : 's'} could not load` : ''}`;

      const widgetSecs = d.widgets.filter((w) => w.ok && w.widget && w.widget.refreshIntervalSec).map((w) => Number(w.widget.refreshIntervalSec));
      V.interval = d.dashboard.refreshIntervalSec || (widgetSecs.length ? Math.min(...widgetSecs) : null);
      scheduleAuto();
    }

    async function onLoadError(err) {
      if (DRAFT && err && err.status === 422 && err.message !== 'Invalid filters') { showState('error', 'The draft is not valid yet.', errList(err).join(' · ')); return; }
      if (err && err.status === 422 && Array.isArray(err.errors)) {
        // A required filter is empty or a value is invalid. That answer has no filter definitions, so read them once.
        if (!V.haveDefs) {
          try {
            const def = DRAFT ? { ...(await Admin.api.get(API.one(code))).data.dashboard, filters: draftFilters(window.parent.__rptDraft().body.filters) } : (await Admin.api.get(API.one(code))).data.dashboard;
            setHeader(def);
            V.filters = def.filters || [];
            V.haveDefs = true;
            const next = {};
            V.filters.forEach((f) => { next[f.key] = V.values[f.key] || (f.defaultValue && !/\{/.test(f.defaultValue) ? f.defaultValue : ''); });
            V.values = next;
            buildBar();
            V.filters.forEach(loadOptions);
          } catch (e2) { fatal(e2); return; }
        }
        showState('empty', 'Pick the filters to load this dashboard.', errList(err).join(' · '));
        return;
      }
      fatal(err);
    }

    function fatal(err) {
      barEl.hidden = !V.filters.length;
      if (err && err.status === 404) { showState('error', 'This dashboard does not exist.', 'It may have been deleted. Go back to the dashboards list.'); return; }
      if (err && err.status === 409) { showState('error', err.message || 'This dashboard is switched off.', 'Switch it on in the dashboards list to open it.'); return; }
      const st = Reports.errorState(err);
      showState(st.kind, st.message, st.hint || errList(err).join(' · '), st.kind === 'error' && !(err && err.status === 401));
    }

    // ---- Auto refresh -------------------------------------------------------------
    function scheduleAuto() {
      clearTimeout(V.timer);
      if (!V.interval) return;
      V.timer = setTimeout(() => {
        if (document.hidden) { V.pending = true; return; }
        load({});
      }, Math.max(5, V.interval) * 1000);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && V.pending) { V.pending = false; load({}); }
    });
    window.addEventListener('pagehide', () => { clearTimeout(V.timer); releaseAll(); });

    refreshBtn.addEventListener('click', () => {
      V.filters.forEach((f) => { if (V.optState[f.key] === 'error') loadOptions(f); });
      load({ fresh: true });
    });

    // "Pin to home": saved on the server (follows the user to any browser). Editors also get "Pin for everyone".
    const pinBtn = $('dvPin');
    const pinAll = document.createElement('button');
    pinAll.type = 'button'; pinAll.className = pinBtn.className; pinAll.id = 'dvPinAll';
    pinBtn.insertAdjacentElement('afterend', pinAll);
    const embedded = new URLSearchParams(location.search).get('embed') === '1';
    const paintPin = () => {
      const own = Reports.pinned.get() === code && !Reports.pinned.isGlobal();
      const all = Reports.pinned.globalCode() === code;
      pinBtn.textContent = own ? 'Unpin from home' : 'Pin to home';
      pinAll.textContent = all ? 'Unpin for everyone' : 'Pin for everyone';
      pinBtn.hidden = embedded;
      pinAll.hidden = embedded || !Reports.access.can('report-dashboards', 'edit') || !Reports.pinned.serverBacked();
    };
    paintPin();
    Reports.pinned.load().then(paintPin);
    const doPin = async (scope) => {
      const on = scope === 'global' ? Reports.pinned.globalCode() === code : (Reports.pinned.get() === code && !Reports.pinned.isGlobal());
      if (on) { await Reports.pinned.clear(scope); Admin.toast(scope === 'global' ? 'Unpinned for everyone.' : 'Unpinned from the home page.', 'success'); }
      else if (await Reports.pinned.set(code, scope)) Admin.toast(scope === 'global' ? 'Pinned for everyone on the home page.' : 'Pinned. It now shows on your home page.', 'success');
      else Admin.toast('Could not save the pin.', 'error');
      paintPin();
    };
    pinBtn.addEventListener('click', () => doPin('user'));
    pinAll.addEventListener('click', () => doPin('global'));

    load({});
  }

  // =========================================================================
  // INIT
  // =========================================================================

  async function init() {
    await Admin.requireAuth();
    const acc = await Reports.access.apply('report-dashboards');
    const code = new URLSearchParams(location.search).get('_d');
    if (code && new URLSearchParams(location.search).get('edit') === '1') {
      if (!acc.edit) {
        $('dashBuilderView').hidden = false;
        $('dbBody').innerHTML = Reports.stateHtml('forbidden', 'You do not have permission to edit dashboards.', 'Ask an administrator for the “edit” permission on report-dashboards.');
        $('dbSave').hidden = true; $('dbSaveView').hidden = true;
        return;
      }
      ReportsDashBuilder.mount(code);
    }
    else if (code) initViewer(code);
    else await initList();
  }

  init().catch((e) => Admin.toastError(e));
})();
