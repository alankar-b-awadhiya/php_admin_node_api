/**
 * report-widgets.js — Widgets page (report-widgets.php). Step 4 of the Reports plan.
 *
 * ---------------------------------------------------------------------------
 * Endpoints used (paths live in reports-common.js -> Reports.API.*):
 *   widgets  GET list            ?search&source_id&chart_type&status&page&per_page
 *            GET one(id)         definition + field mapping + options
 *            GET meta            chart types (supported flag, min/max per field use), aggregations
 *            POST list           create  { source_id, widget_code, widget_title, widget_subtitle, chart_type,
 *                                          row_limit, refresh_interval_sec, is_active, permission_resource, options, fields }
 *            PATCH one(id)       update  (same body; this page always sends `fields`, which replaces the mapping)
 *            PATCH status(id)    { is_active }
 *            DELETE one(id)      409 when the widget is placed on a dashboard (message is shown as is)
 *            POST preview        runs an UNSAVED definition (+ `params`), never cached, nothing stored
 *            GET data(ref)       ?<source params>&refresh=1   a SAVED widget, chart-ready
 *   sources  GET list, GET fields(id), GET params(id)
 *
 * Mapping payload row (POST / PATCH `fields`):
 *   { source_field_id, field_use, aggregation, series_label, series_chart_type, y_axis, color, sort_dir, display_format }
 *   field_use: x | group_by | value | label | sort   (which ones, and how many, depends on chart_type - GET meta)
 *
 * Preview: every change (select / blur, not every keystroke) is debounced and sent to POST preview; a request
 * counter drops answers that arrive late. Drawing is done by ReportsRender.renderWidget (reports-render.js),
 * the same function the dashboards use. Gauge and scatter are shown disabled ("coming soon").
 * ---------------------------------------------------------------------------
 */
(function () {
  const esc = Admin.escapeHtml;
  const API = Reports.API.widgets;
  const SRC = Reports.API.sources;

  const ICON = {
    edit: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="6" y="4.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="11" y="4.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor"/></svg>',
    eye: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.3" stroke="currentColor" stroke-width="1.5"/></svg>',
    up: '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M5 12l5-5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cog: '<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 6h8M15 6h1M4 14h1M8 14h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="13.5" cy="6" r="1.8" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="14" r="1.8" stroke="currentColor" stroke-width="1.5"/></svg>',
  };

  const NUMERIC_TYPES = ['number', 'currency', 'percent'];
  const isNumericType = (t) => NUMERIC_TYPES.includes(t);
  const CARTESIAN = ['line', 'area', 'bar', 'stacked_bar'];
  const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  /** { sliceColors:{North:'#..'}, palette:['#..'] } -> "North|#..\n#.." */
  function sliceColorsToText(o) {
    const lines = Object.entries((o && o.sliceColors) || {}).map(([k, v]) => `${k}|${v}`);
    return lines.concat(Array.isArray(o && o.palette) ? o.palette : []).join('\n');
  }
  const ANCHORS = ['x', 'label', 'value']; // a sort field must be one of these

  // Same rules as ms_reports utils/transform.js CHART_RULES. Only used if GET meta fails;
  // normally the server's copy (which also carries the `supported` flag) wins.
  const FALLBACK_META = {
    chartTypes: [
      ...CARTESIAN.map((type) => ({ type, supported: true, uses: { x: { min: 1, max: 1 }, value: { min: 1, max: 10 }, group_by: { min: 0, max: 1 }, sort: { min: 0, max: 1 } } })),
      ...['pie', 'donut'].map((type) => ({ type, supported: true, uses: { label: { min: 1, max: 1 }, value: { min: 1, max: 1 }, sort: { min: 0, max: 1 } } })),
      { type: 'kpi', supported: true, uses: { value: { min: 1, max: 1 } } },
      { type: 'table', supported: true, uses: { label: { min: 1, max: 50 }, sort: { min: 0, max: 3 } } },
      { type: 'scatter', supported: false, uses: {} },
      { type: 'gauge', supported: false, uses: {} },
    ],
    aggregations: ['none', 'sum', 'avg', 'min', 'max', 'count', 'count_distinct'],
  };
  let META = FALLBACK_META;
  const rulesFor = (type) => META.chartTypes.find((c) => c.type === type) || { supported: false, uses: {} };
  const supported = (type) => !!rulesFor(type).supported;

  let sources = []; // all sources (name, code, fieldCount, paramCount, isActive) for the filter and the builder

  // =========================================================================
  // Source params -> small test-value form (used by the builder and the viewer)
  // =========================================================================

  /** [{paramKey, paramLabel, dataType, isRequired, defaultValue, options}] -> inputs; read back with readParamValues(). */
  function paramFormHtml(params, values) {
    if (!params.length) return '';
    return `<div class="rpt-pform">${params.map((p) => {
      const k = p.paramKey;
      const val = values[k] ?? '';
      const label = `${esc(p.paramLabel || k)}${p.isRequired ? ' <span style="color:var(--coral);">*</span>' : ''}`;
      let input;
      if (p.dataType === 'select') {
        const opts = (Array.isArray(p.options) ? p.options : []).map((o) => (o && typeof o === 'object' ? o : { value: o, label: o }));
        input = `<select data-pk="${esc(k)}">${Reports.optionsHtml(opts, val, { blank: p.defaultValue ? `(default: ${p.defaultValue})` : 'Choose…' })}</select>`;
      } else if (p.dataType === 'daterange') {
        const [from, to] = String(val).split(',');
        input = `<div style="display:flex;gap:6px;"><input type="date" data-pk="${esc(k)}" data-part="from" value="${esc(from || '')}"><input type="date" data-pk="${esc(k)}" data-part="to" value="${esc(to || '')}"></div>`;
      } else {
        const type = p.dataType === 'date' ? 'date' : p.dataType === 'number' ? 'number' : 'text';
        input = `<input type="${type}" data-pk="${esc(k)}" placeholder="${p.defaultValue ? `default: ${esc(p.defaultValue)}` : ''}" value="${esc(val)}" autocomplete="off">`;
      }
      return `<div class="form-group"><label>${label}</label>${input}</div>`;
    }).join('')}</div>`;
  }

  /** Reads the inputs back into { key: value }. Blank = omitted, so the source default applies. */
  function readParamValues(root, params) {
    const out = {};
    params.forEach((p) => {
      const k = p.paramKey;
      if (p.dataType === 'daterange') {
        const from = root.querySelector(`[data-pk="${k}"][data-part="from"]`);
        const to = root.querySelector(`[data-pk="${k}"][data-part="to"]`);
        if (from && to && (from.value || to.value)) out[k] = `${from.value},${to.value}`;
      } else {
        const el = root.querySelector(`[data-pk="${k}"]`);
        if (el && String(el.value).trim() !== '') out[k] = String(el.value).trim();
      }
    });
    return out;
  }

  // =========================================================================
  // LIST
  // =========================================================================

  const state = { search: '', status: '', chartType: '', sourceId: '', page: 1, perPage: 20 };
  let rows = [];

  const filtersActive = () => !!(state.search || state.status || state.chartType || state.sourceId);

  async function loadSources() {
    try {
      const res = await Admin.api.get(SRC.list + Admin.qs({ per_page: 100 }));
      sources = (res.data && res.data.sources) || [];
    } catch (e) { sources = []; }
  }

  async function loadList(spin) {
    const body = document.getElementById('wdgTableBody');
    const refreshBtn = document.getElementById('btnRefresh');
    if (spin) refreshBtn.classList.add('is-spinning');
    body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading widgets…</td></tr>';
    try {
      const res = await Admin.api.get(API.list + Admin.qs({
        search: state.search, status: state.status, chart_type: state.chartType, source_id: state.sourceId,
        page: state.page, per_page: state.perPage,
      }));
      rows = (res.data && res.data.widgets) || [];
      const pg = res.meta && res.meta.pagination;
      const total = pg ? pg.total : rows.length;
      document.getElementById('wdgCount').textContent = `${total} widget${total === 1 ? '' : 's'}`;
      if (!filtersActive()) document.getElementById('rptStatTotal').textContent = Reports.fmtNumber(total);
      renderTable();
      Reports.renderPager(document.getElementById('wdgPagination'), pg, (p) => { state.page = p; loadList(); });
    } catch (err) {
      const st = Reports.errorState(err);
      body.innerHTML = `<tr><td colspan="6" class="table-empty">${Reports.stateHtml(st.kind, st.message, st.hint)}</td></tr>`;
      document.getElementById('wdgPagination').innerHTML = '';
      document.getElementById('wdgCount').textContent = '—';
      if (st.kind !== 'forbidden') Admin.toastError(err);
    } finally {
      if (spin) setTimeout(() => refreshBtn.classList.remove('is-spinning'), 300);
    }
  }

  function renderTable() {
    const body = document.getElementById('wdgTableBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">${filtersActive()
        ? 'No widgets match these filters.'
        : 'No widgets yet. Click “New Widget” to build your first chart.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((w) => `
      <tr data-id="${w.id}">
        <td>
          <a href="#" class="rpt-link" data-act="view" title="Preview with live data">${esc(w.title)}</a>
          <div><span class="rpt-code">${esc(w.code)}</span>${w.subtitle ? ` <span class="cell-muted">${esc(Reports.truncate(w.subtitle, 60))}</span>` : ''}</div>
        </td>
        <td><span class="rpt-typecell">${Reports.chartIcon(w.chartType, 16)} ${esc(Reports.chartLabel(w.chartType))}</span></td>
        <td>
          <a class="rpt-link" href="report-sources.php" style="font-weight:600;">${esc(w.sourceName)}</a>
          <div><span class="rpt-code">${esc(w.sourceCode)}</span></div>
        </td>
        <td class="cell-muted" style="white-space:nowrap;">${w.dashboardCount === undefined ? '—' : `${w.dashboardCount} dashboard${Number(w.dashboardCount) === 1 ? '' : 's'}`}</td>
        <td>${Reports.activeBadge(w.isActive)}</td>
        <td class="cell-actions">
          <button class="icon-action icon-action-view" data-act="view" title="Preview with live data">${ICON.eye}</button>
          <button class="icon-action icon-action-edit" data-act="edit" title="Edit">${ICON.edit}</button>
          ${w.isActive
            ? `<button class="icon-action icon-action-toggle" data-act="disable" title="Switch off">${ICON.pause}</button>`
            : `<button class="icon-action icon-action-toggle" data-act="enable" title="Switch on">${ICON.play}</button>`}
          <button class="icon-action icon-action-delete" data-act="delete" title="Delete">${ICON.trash}</button>
        </td>
      </tr>`).join('');

    body.querySelectorAll('tr[data-id]').forEach((tr) => {
      const w = rows.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const act = el.dataset.act;
        if (act === 'view') openViewModal(w);
        else if (act === 'edit') openBuilder(w);
        else if (act === 'disable' || act === 'enable') setStatus(w, act === 'enable');
        else if (act === 'delete') removeWidget(w);
      }));
    });
  }

  async function setStatus(w, on) {
    try {
      await Admin.api.patch(API.status(w.id), { is_active: on });
      Admin.toast(`Widget ${on ? 'switched on' : 'switched off'}.`, 'success');
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  async function removeWidget(w) {
    const ok = await Admin.confirmAction({
      title: 'Delete widget?',
      body: `<p>“${esc(w.title)}” will be removed. Its code <span class="rpt-code">${esc(w.code)}</span> stays reserved.</p>`,
      confirmLabel: 'Delete widget',
      danger: true,
    });
    if (!ok) return;
    try {
      await Admin.api.del(API.one(w.id));
      Admin.toast('Widget deleted.', 'success');
      if (rows.length === 1 && state.page > 1) state.page -= 1;
      loadList();
    } catch (err) { Admin.toastError(err); }
  }

  // =========================================================================
  // VIEWER: a SAVED widget with live data (GET /:ref/data)
  // =========================================================================

  async function openViewModal(w) {
    Admin.openModal(`
      <div class="modal-header">
        <div><h3>${esc(w.title)}</h3>
          <div class="rpt-hint" style="margin:2px 0 0;"><span class="rpt-code">${esc(w.code)}</span> ${esc(Reports.chartLabel(w.chartType))} · ${esc(w.sourceName)}</div></div>
        <button class="btn btn-ghost btn-icon" type="button" data-act="close">&times;</button>
      </div>
      <div class="modal-body">
        <div id="vwParams"></div>
        <div id="vwFrame" style="min-height:300px;"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Close</button>
        <button type="button" class="btn btn-secondary" id="vwRefresh">Refresh data</button>
        <button type="button" class="btn btn-primary" id="vwEdit">Edit widget</button>
      </div>`, 'rpt-modal-wide');
    const root = document.getElementById('modalBackdrop');
    const frame = root.querySelector('#vwFrame');
    root.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', () => { ReportsRender.release(frame); Admin.closeModal(); }));
    root.querySelector('#vwEdit').addEventListener('click', () => { ReportsRender.release(frame); openBuilder(w); });

    let params = [];
    try { params = (await Admin.api.get(SRC.params(w.sourceId))).data.params || []; } catch (e) { /* run without the form */ }
    const pbox = root.querySelector('#vwParams');
    pbox.innerHTML = params.length
      ? `<div class="rpt-section-title" style="margin-top:0;">Source parameters</div>${paramFormHtml(params, {})}<div class="rpt-hint" style="margin-bottom:10px;">Blank fields use the source default.</div>`
      : '';

    let seq = 0;
    async function run(fresh) {
      const my = ++seq;
      ReportsRender.renderWidget(frame, { loading: true }, { showHeader: false });
      try {
        const q = { ...readParamValues(root, params) };
        if (fresh) q.refresh = 1;
        const res = await Admin.api.get(API.data(w.id) + Admin.qs(q));
        if (my === seq) ReportsRender.renderWidget(frame, res.data, { height: 340, showHeader: false });
      } catch (err) {
        if (my === seq) ReportsRender.renderWidget(frame, { error: err }, { onRetry: () => run(false), showHeader: false });
      }
    }
    pbox.addEventListener('change', () => run(false));
    root.querySelector('#vwRefresh').addEventListener('click', () => run(true));
    run(false);
  }

  // =========================================================================
  // BUILDER: create / edit modal with live preview
  // =========================================================================

  const USE_TITLES = {
    cartesian: { x: 'X axis (category or time)', value: 'Values (the numbers to plot)', group_by: 'Split into series by (optional)', sort: 'Sort by (optional)' },
    pie: { label: 'Slice label', value: 'Slice value', sort: 'Sort by (optional)' },
    kpi: { value: 'Value' },
    table: { label: 'Columns', sort: 'Sort rows by (optional, up to 3)' },
  };
  const useTitle = (type, use) => {
    const g = CARTESIAN.includes(type) ? 'cartesian' : (type === 'pie' || type === 'donut') ? 'pie' : type;
    return (USE_TITLES[g] && USE_TITLES[g][use]) || Reports.FIELD_USES[use] || use;
  };
  const USE_HINTS = {
    x: 'One field. Rows with the same value are combined.',
    value: 'Each value is aggregated per X (sum, average, count…).',
    group_by: 'Creates one series per distinct value. Works with a single value field.',
    label: 'Rows with the same label are combined.',
    sort: 'Must be one of the fields mapped above.',
  };
  const ALL_USES = ['x', 'label', 'group_by', 'value', 'sort'];

  function openBuilder(listRow) {
    (async () => {
      let widget = null;
      if (listRow) {
        try { widget = (await Admin.api.get(API.one(listRow.id))).data.widget; } catch (err) { Admin.toastError(err); return; }
      }
      await loadSources();
      showBuilder(widget);
    })();
  }

  function showBuilder(widget) {
    const editing = !!widget;
    const $ = (id) => document.getElementById(id);

    // ---- state ---------------------------------------------------------
    const S = {
      id: editing ? widget.id : null,
      title: editing ? widget.title : '',
      code: editing ? widget.code : '',
      codeTouched: editing,
      subtitle: editing ? (widget.subtitle || '') : '',
      sourceId: editing ? String(widget.sourceId) : '',
      chartType: editing ? widget.chartType : 'bar',
      rowLimit: editing && widget.rowLimit !== null ? String(widget.rowLimit) : '',
      refreshSec: editing && widget.refreshIntervalSec !== null ? String(widget.refreshIntervalSec) : '',
      permRes: editing ? (widget.permissionResource || '') : '',
      active: editing ? widget.isActive : true,
      opts: editing && widget.options && typeof widget.options === 'object' ? { ...widget.options } : {},
      map: { x: [], group_by: [], value: [], label: [], sort: [] },
      fields: [],
      params: [],
      paramValues: {},
      fieldsLoaded: false,
    };
    const entry = (o = {}) => ({ fid: '', agg: '', label: '', sType: '', yAxis: 'left', color: '', sortDir: 'asc', format: '', ...o });
    if (editing) {
      (widget.fields || []).forEach((f) => {
        if (S.map[f.fieldUse]) {
          S.map[f.fieldUse].push(entry({
            fid: String(f.sourceFieldId), agg: f.aggregation === 'none' ? '' : f.aggregation, label: f.seriesLabel || '',
            sType: f.seriesChartType || '', yAxis: f.yAxis || 'left', color: f.color || '', sortDir: f.sortDir || 'asc', format: f.displayFormat || '',
          }));
        }
      });
    }

    // ---- modal shell ------------------------------------------------------
    Admin.openModal(`
      <div class="modal-header">
        <h3>${editing ? 'Edit widget' : 'New widget'}</h3>
        <button class="btn btn-ghost btn-icon" type="button" data-act="close">&times;</button>
      </div>
      <div class="modal-body">
        <div id="wbErrors"></div>
        <div class="rpt-builder">
          <div class="rpt-builder-form">
            <div class="rpt-section-title" style="margin-top:0;">1 · Basics</div>
            <div class="form-row">
              <div class="form-group"><label for="wb-title">Title <span style="color:var(--coral);">*</span></label>
                <input type="text" id="wb-title" maxlength="150" autocomplete="off" placeholder="Monthly revenue" value="${esc(S.title)}"></div>
              <div class="form-group"><label for="wb-code">Code <span style="color:var(--coral);">*</span></label>
                <input type="text" id="wb-code" class="rpt-mono" maxlength="80" autocomplete="off" placeholder="monthly_revenue" value="${esc(S.code)}">
                <div class="rpt-hint">Lowercase letters, digits, _ . Used by dashboards.</div></div>
            </div>
            <div class="form-group"><label for="wb-sub">Subtitle</label>
              <input type="text" id="wb-sub" maxlength="250" autocomplete="off" placeholder="optional" value="${esc(S.subtitle)}"></div>
            <div class="form-group"><label for="wb-source">Source <span style="color:var(--coral);">*</span></label>
              <select id="wb-source"></select>
              <div class="rpt-hint" id="wb-sourceHint"></div></div>

            <div class="rpt-section-title">2 · Chart type</div>
            <div class="rpt-type-grid" id="wb-types"></div>

            <div class="rpt-section-title">3 · Map fields</div>
            <div id="wb-slots"></div>

            <details class="rpt-advanced" id="wb-adv" style="margin-top:16px;">
              <summary>Display &amp; limits</summary>
              <div class="form-row" style="margin-top:10px;">
                <div class="form-group"><label for="wb-limit">Row limit</label>
                  <input type="number" id="wb-limit" min="1" max="10000" placeholder="no limit" value="${esc(S.rowLimit)}">
                  <div class="rpt-hint">Max categories / slices / table rows (1–10000).</div></div>
                <div class="form-group"><label for="wb-refresh">Auto-refresh (seconds)</label>
                  <input type="number" id="wb-refresh" min="5" max="86400" placeholder="off" value="${esc(S.refreshSec)}">
                  <div class="rpt-hint">Dashboards re-fetch this widget at this interval (5–86400).</div></div>
              </div>
              <div class="form-row">
                <div class="form-group" id="wb-legendG"><label for="wb-legend">Legend</label>
                  <select id="wb-legend"></select></div>
                <div class="form-group" id="wb-flagsG"><label>Style</label>
                  <label class="rpt-check" id="wb-smoothL"><input type="checkbox" id="wb-smooth"> Smooth curves</label>
                  <label class="rpt-check" id="wb-horizL"><input type="checkbox" id="wb-horiz"> Horizontal bars</label></div>
              </div>
              <div id="wb-chartG">
                <div class="rpt-section-title" style="margin-top:4px;">Chart options</div>
                <div class="form-row" id="wb-axisG">
                  <div class="form-group"><label for="wb-xtitle">Category axis title</label>
                    <input type="text" id="wb-xtitle" maxlength="60" placeholder="none" value="${esc(S.opts.xTitle || '')}"></div>
                  <div class="form-group"><label for="wb-ytitle">Value axis title</label>
                    <input type="text" id="wb-ytitle" maxlength="60" placeholder="none" value="${esc(S.opts.yTitle || '')}"></div>
                </div>
                <div class="form-row" id="wb-rangeG">
                  <div class="form-group"><label for="wb-ymin">Value axis minimum</label>
                    <input type="number" id="wb-ymin" step="any" placeholder="automatic (starts at 0)" value="${esc(S.opts.yMin ?? '')}"></div>
                  <div class="form-group"><label for="wb-ymax">Value axis maximum</label>
                    <input type="number" id="wb-ymax" step="any" placeholder="automatic" value="${esc(S.opts.yMax ?? '')}"></div>
                </div>
                <div class="form-row">
                  <div class="form-group"><label for="wb-height">Fixed height (px)</label>
                    <input type="number" id="wb-height" min="120" max="1200" placeholder="fill the grid cell" value="${esc(S.opts.height ?? '')}">
                    <div class="rpt-hint">120–1200. Blank = the chart fills its grid cell.</div></div>
                  <div class="form-group" id="wb-labelsG"><label>Labels</label>
                    <label class="rpt-check"><input type="checkbox" id="wb-dlabels" ${S.opts.dataLabels ? 'checked' : ''}> Show values on the chart</label></div>
                </div>
                <div class="form-group" id="wb-sliceG"><label for="wb-slices">Slice colors</label>
                  <textarea id="wb-slices" rows="3" class="rpt-mono" placeholder="North|#1a9c6b&#10;South|#e5484d&#10;#7c3aed">${esc(sliceColorsToText(S.opts))}</textarea>
                  <div class="rpt-hint">One per line: <span class="rpt-code">Label|#hex</span> colors that slice; a bare <span class="rpt-code">#hex</span> line colors slices in order. Others keep the theme colors.</div></div>
              </div>
              <div class="form-group"><label for="wb-perm">Extra permission resource</label>
                <input type="text" id="wb-perm" class="rpt-mono" maxlength="80" placeholder="optional, e.g. clientele" value="${esc(S.permRes)}">
                <div class="rpt-hint">If set, a viewer also needs “view” on this RBAC resource to see the widget.</div></div>
              <label class="rpt-check"><input type="checkbox" id="wb-active" ${S.active ? 'checked' : ''}> Widget is active</label>
            </details>
          </div>

          <div class="rpt-builder-preview">
            <div class="rpt-preview-pane">
              <div class="rpt-preview-bar">
                <strong>Live preview</strong>
                <button type="button" class="btn btn-secondary btn-sm" id="wb-prevBtn">Refresh preview</button>
              </div>
              <div id="wb-pparams"></div>
              <div id="wb-pframe" class="rpt-widget" style="min-height:300px;"></div>
              <div class="rpt-hint" id="wb-pmeta"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
        <button type="button" class="btn btn-primary" id="wb-save">${editing ? 'Save changes' : 'Create widget'}</button>
      </div>`, 'rpt-modal-wide');

    const root = $('modalBackdrop');
    const frame = $('wb-pframe');
    let timer = null;
    let seq = 0;
    const close = () => { clearTimeout(timer); seq += 1; ReportsRender.release(frame); Admin.closeModal(); };
    root.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', close));

    // ---- helpers --------------------------------------------------------------
    const usesOf = () => rulesFor(S.chartType).uses || {};
    const minOf = (use) => (usesOf()[use] ? usesOf()[use].min : 0);
    const maxOf = (use) => (usesOf()[use] ? usesOf()[use].max : 0);
    const fieldById = (id) => S.fields.find((f) => String(f.id) === String(id));
    const anyMapped = () => ALL_USES.some((u) => S.map[u].some((e) => e.fid));
    const isAnchored = (fid) => ANCHORS.some((u) => S.map[u].some((m) => m.fid === fid));
    const pruneSorts = () => S.map.sort.forEach((s) => { if (s.fid && !isAnchored(s.fid)) s.fid = ''; });

    /** How many rows a use always shows: its minimum, or one when it is a single optional slot. */
    const floorOf = (use) => Math.max(minOf(use), maxOf(use) === 1 ? 1 : 0);

    function ensureSlots() {
      ALL_USES.forEach((use) => {
        if (!usesOf()[use]) { S.map[use] = []; return; }
        if (S.map[use].length > maxOf(use)) S.map[use].length = maxOf(use);
        while (S.map[use].length < floorOf(use)) S.map[use].push(entry());
      });
    }

    function defaultAgg(fid, use) {
      if (use !== 'value') return '';
      const f = fieldById(fid);
      return f && isNumericType(f.dataType) ? 'sum' : 'count';
    }

    /** Fills every REQUIRED slot that is still empty with a sensible field, so the preview shows something right away. */
    function autoFill() {
      if (!S.fieldsLoaded || !S.fields.length || !supported(S.chartType)) return;
      const vis = S.fields.filter((f) => f.isVisible);
      const pool = vis.length ? vis : S.fields;
      const measure = pool.find((f) => isNumericType(f.dataType) && f.fieldRole === 'measure') || pool.find((f) => isNumericType(f.dataType));
      const time = pool.find((f) => f.fieldRole === 'time' || f.dataType === 'date' || f.dataType === 'datetime');
      const dim = pool.find((f) => f.fieldRole === 'dimension' && !isNumericType(f.dataType)) || pool.find((f) => !isNumericType(f.dataType)) || pool[0];
      const used = new Set();
      ANCHORS.forEach((u) => S.map[u].forEach((e) => { if (e.fid) used.add(String(e.fid)); }));
      const fresh = (list) => list.filter(Boolean).find((f) => !used.has(String(f.id))) || list.find(Boolean);
      const needs = (use) => minOf(use) > 0 && !S.map[use].some((e) => e.fid);
      const t = S.chartType;
      ensureSlots();
      if (needs('x')) S.map.x[0] = entry({ fid: String(fresh([time, dim, ...pool]).id) });
      if (needs('label')) {
        if (t === 'table') S.map.label = pool.slice(0, 5).map((f) => entry({ fid: String(f.id) }));
        else S.map.label[0] = entry({ fid: String(fresh([dim, ...pool]).id) });
      }
      if (needs('value')) {
        const f = measure || (t === 'kpi' ? pool[0] : fresh([dim, ...pool]));
        S.map.value[0] = entry({ fid: String(f.id), agg: defaultAgg(f.id, 'value') });
      }
    }

    // ---- type tiles / source select / options -----------------------------------
    function renderTypes() {
      $('wb-types').innerHTML = META.chartTypes.map((c) => {
        const m = Reports.chartMeta(c.type);
        const ok = c.supported;
        return `<button type="button" class="rpt-type-tile${S.chartType === c.type ? ' is-selected' : ''}${ok ? '' : ' is-disabled'}" data-type="${esc(c.type)}" ${ok ? '' : 'disabled aria-disabled="true"'} title="${esc(ok ? m.hint : 'Coming soon')}">
          ${Reports.chartIcon(c.type, 26)}<span>${esc(m.label)}</span>${ok ? '' : '<span class="rpt-soon">Coming soon</span>'}</button>`;
      }).join('');
    }

    function renderSourceSelect() {
      const list = sources.filter((s) => s.isActive || String(s.id) === S.sourceId);
      $('wb-source').innerHTML = `<option value="">Choose a source…</option>${list.map((s) =>
        `<option value="${s.id}"${String(s.id) === S.sourceId ? ' selected' : ''}>${esc(s.name)} (${esc(s.code)})${s.isActive ? '' : ' — inactive'}</option>`).join('')}`;
    }

    function renderOptionControls() {
      const t = S.chartType;
      const pie = t === 'pie' || t === 'donut';
      const lineish = t === 'line' || t === 'area' || t === 'bar';
      const barish = t === 'bar' || t === 'stacked_bar';
      $('wb-legendG').hidden = !(CARTESIAN.includes(t) || pie);
      $('wb-smoothL').hidden = !lineish;
      $('wb-horizL').hidden = !barish;
      $('wb-flagsG').hidden = !(lineish || barish);
      $('wb-legend').innerHTML = Reports.optionsHtml([
        { value: '', label: 'Automatic' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' },
        { value: 'right', label: 'Right' }, { value: 'none', label: 'Hidden' },
      ], S.opts.legend || '');
      $('wb-smooth').checked = !!S.opts.smooth;
      $('wb-horiz').checked = !!S.opts.horizontal;
      const cart = CARTESIAN.includes(t);
      $('wb-chartG').hidden = !(cart || pie);
      $('wb-axisG').hidden = !cart;
      $('wb-rangeG').hidden = !cart;
      $('wb-sliceG').hidden = !pie;
    }

    // ---- slots ----------------------------------------------------------------------
    function fieldOptions(use, selected) {
      let list;
      if (use === 'sort') {
        const ids = new Set();
        ANCHORS.forEach((u) => S.map[u].forEach((e) => { if (e.fid) ids.add(String(e.fid)); }));
        list = S.fields.filter((f) => ids.has(String(f.id)));
      } else {
        list = S.fields.filter((f) => f.isVisible || String(f.id) === String(selected));
      }
      const blank = minOf(use) === 0 ? '— none —' : 'Choose a field…';
      return `<option value="">${blank}</option>${list.map((f) => `<option value="${f.id}"${String(f.id) === String(selected) ? ' selected' : ''}>${esc(f.fieldLabel || f.fieldPath)} · ${esc(f.dataType)}</option>`).join('')}`;
    }

    function aggOptions(e) {
      const f = fieldById(e.fid);
      const numeric = f && isNumericType(f.dataType);
      const list = META.aggregations
        .filter((a) => a !== 'none' || S.chartType === 'kpi')
        .filter((a) => numeric || !['sum', 'avg', 'min', 'max'].includes(a));
      return Reports.optionsHtml(list.map((v) => ({ value: v, label: Reports.labelOf(Reports.AGGREGATIONS, v) })), e.agg || defaultAgg(e.fid, 'value'));
    }

    function rowHtml(use, e, i) {
      const multi = maxOf(use) > 1;
      const count = S.map[use].length;
      const canRemove = count > floorOf(use);
      const isValue = use === 'value';
      const cart = CARTESIAN.includes(S.chartType);
      const extra = [];
      if (isValue && cart) {
        extra.push(`<div class="form-group"><label>Draw as</label><select data-k="sType">${Reports.optionsHtml([
          { value: '', label: 'Chart default' }, { value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }, { value: 'area', label: 'Area' }], e.sType)}</select></div>`);
        extra.push(`<div class="form-group"><label>Y axis</label><select data-k="yAxis">${Reports.optionsHtml([
          { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], e.yAxis)}</select></div>`);
        extra.push(`<div class="form-group"><label>Color</label><div style="display:flex;gap:8px;align-items:center;height:36px;">
          <label class="rpt-check" style="margin:0;"><input type="checkbox" data-k="colorOn" ${e.color ? 'checked' : ''}> Custom</label>
          <input type="color" data-k="color" value="${esc(/^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#4f5dff')}" ${e.color ? '' : 'disabled'} style="width:44px;padding:2px;height:30px;"></div></div>`);
      }
      if (isValue || use === 'label') {
        extra.push(`<div class="form-group"><label>Format</label><input type="text" data-k="format" maxlength="50" placeholder="e.g. currency, 0.00" value="${esc(e.format)}"></div>`);
      }
      const labelPh = use === 'label' && S.chartType === 'table' ? 'Column heading (optional)' : 'Label (optional)';
      return `
      <div class="rpt-slot-row" data-use="${use}" data-i="${i}">
        <div class="rpt-slot-main">
          <select data-k="fid" aria-label="Field">${fieldOptions(use, e.fid)}</select>
          ${isValue ? `<select data-k="agg" aria-label="Aggregation">${aggOptions(e)}</select>` : ''}
          ${use === 'sort' ? `<select data-k="sortDir" aria-label="Direction">${Reports.optionsHtml([{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }], e.sortDir)}</select>` : ''}
          ${isValue || use === 'label' ? `<input type="text" data-k="label" maxlength="100" placeholder="${labelPh}" value="${esc(e.label)}" aria-label="Label">` : ''}
          <span class="rpt-slot-btns">
            ${extra.length ? `<button type="button" class="btn btn-ghost btn-sm" data-sl="more" title="More options">${ICON.cog}</button>` : ''}
            ${multi && count > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-sl="up" title="Move up" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button><button type="button" class="btn btn-ghost btn-sm" data-sl="down" title="Move down" ${i === count - 1 ? 'disabled' : ''}>${ICON.down}</button>` : ''}
            ${canRemove ? '<button type="button" class="btn btn-ghost btn-sm" data-sl="remove" title="Remove">&times;</button>' : ''}
          </span>
        </div>
        ${extra.length ? `<div class="rpt-slot-extra" hidden>${extra.join('')}</div>` : ''}
      </div>`;
    }

    function renderSlots() {
      const box = $('wb-slots');
      const src = sources.find((s) => String(s.id) === S.sourceId);
      if (!S.sourceId) { box.innerHTML = '<div class="rpt-hint">Choose a source first; its detected fields appear here.</div>'; return; }
      if (!S.fieldsLoaded) { box.innerHTML = Reports.stateHtml('loading', 'Loading fields…'); return; }
      if (!S.fields.length) {
        box.innerHTML = `<div class="callout callout-amber" style="margin:0;">${esc(src ? src.name : 'This source')} has no detected fields yet. Open <a href="report-sources.php">API Sources</a> → Details → Fields → “Detect fields from API”, then come back.</div>`;
        return;
      }
      if (!supported(S.chartType)) { box.innerHTML = '<div class="rpt-hint">Pick a chart type above.</div>'; return; }
      ensureSlots();
      box.innerHTML = Object.keys(usesOf()).map((use) => {
        const addBtn = maxOf(use) > 1 && S.map[use].length < maxOf(use)
          ? `<button type="button" class="btn btn-secondary btn-sm" data-sl="add" data-use="${use}">+ Add ${use === 'label' ? 'column' : use === 'sort' ? 'sort' : 'value'}</button>` : '';
        return `<div class="rpt-slot" data-slot="${use}">
          <div class="rpt-slot-title">${esc(useTitle(S.chartType, use))}${minOf(use) ? ' <span style="color:var(--coral);">*</span>' : ''}</div>
          ${USE_HINTS[use] ? `<div class="rpt-hint" style="margin:0 0 6px;">${esc(USE_HINTS[use])}</div>` : ''}
          ${S.map[use].map((e, i) => rowHtml(use, e, i)).join('')}
          ${addBtn}
        </div>`;
      }).join('');
    }

    function renderParamForm() {
      $('wb-pparams').innerHTML = S.params.length
        ? `<details class="rpt-advanced" ${S.params.some((p) => p.isRequired && !p.defaultValue) ? 'open' : ''} style="margin-top:0;"><summary>Test values for source params (preview only)</summary><div style="margin-top:10px;">${paramFormHtml(S.params, S.paramValues)}<div class="rpt-hint">Not saved with the widget; dashboards supply these through their filters.</div></div></details>`
        : '';
    }

    function renderSourceHint() {
      const s = sources.find((x) => String(x.id) === S.sourceId);
      $('wb-sourceHint').innerHTML = s
        ? `${s.fieldCount} field${Number(s.fieldCount) === 1 ? '' : 's'} · ${s.paramCount} param${Number(s.paramCount) === 1 ? '' : 's'}${s.isActive ? '' : ' · <span style="color:var(--coral);">source is inactive</span>'}`
        : '';
    }

    // ---- validation ----------------------------------------------------------------------
    /** full=false: only what the preview needs. full=true: also title, code, limits (before saving). */
    function validate({ full }) {
      const errors = [];
      if (!S.sourceId) errors.push('Choose a source.');
      if (!supported(S.chartType)) errors.push('Choose a chart type.');
      if (full) {
        if (!S.title.trim()) errors.push('Title is required.');
        if (!Reports.isCode(S.code)) errors.push('Code must be 2–80 characters: lowercase letters, digits and _ , starting with a letter.');
      }
      const lim = S.rowLimit.trim();
      if (lim && !(Number.isInteger(Number(lim)) && Number(lim) >= 1 && Number(lim) <= 10000)) errors.push('Row limit must be a whole number from 1 to 10000.');
      if (CARTESIAN.includes(S.chartType)) {
        const lo = numOrNull(S.opts.yMin); const hi = numOrNull(S.opts.yMax);
        if (lo !== null && hi !== null && lo >= hi) errors.push('Value axis minimum must be lower than the maximum.');
      }
      const hgt = numOrNull(S.opts.height);
      if (String(S.opts.height ?? '').trim() !== '' && (hgt === null || hgt < 120 || hgt > 1200)) errors.push('Fixed height must be a number from 120 to 1200.');
      if (S.chartType === 'pie' || S.chartType === 'donut') errors.push(...parseSliceColors(S.sliceText !== undefined ? S.sliceText : sliceColorsToText(S.opts)).errors);
      const ref = S.refreshSec.trim();
      if (full && ref && !(Number.isInteger(Number(ref)) && Number(ref) >= 5 && Number(ref) <= 86400)) errors.push('Auto-refresh must be a whole number from 5 to 86400.');
      if (!S.fieldsLoaded || !supported(S.chartType)) return errors;

      const uses = usesOf();
      Object.keys(uses).forEach((use) => {
        const filled = S.map[use].filter((e) => e.fid);
        const t = useTitle(S.chartType, use).replace(/ \(.*\)$/, '');
        if (filled.length < uses[use].min) errors.push(`${t}: choose ${uses[use].min === 1 ? 'a field' : `at least ${uses[use].min} fields`}.`);
        const seen = new Set();
        filled.forEach((e) => {
          const f = fieldById(e.fid);
          if (!f) return;
          if (use === 'value') {
            const agg = e.agg || defaultAgg(e.fid, 'value');
            if (['sum', 'avg', 'min', 'max'].includes(agg) && !isNumericType(f.dataType)) errors.push(`“${f.fieldLabel}” is ${f.dataType}; use count or count distinct.`);
          } else if (use !== 'label' || S.chartType === 'table') {
            if (seen.has(e.fid)) errors.push(`${t}: “${f.fieldLabel}” is chosen twice.`);
            seen.add(e.fid);
          }
        });
      });
      if (S.map.group_by.some((e) => e.fid) && S.map.value.filter((e) => e.fid).length > 1) errors.push('“Split into series by” only works with one value field.');
      if (S.map.sort.some((e) => e.fid && !isAnchored(e.fid))) errors.push('A sort field must also be one of the mapped fields above.');
      return errors;
    }

    function buildFields() {
      const cart = CARTESIAN.includes(S.chartType);
      const out = [];
      Object.keys(usesOf()).forEach((use) => {
        S.map[use].forEach((e) => {
          if (!e.fid) return;
          out.push({
            source_field_id: Number(e.fid),
            field_use: use,
            aggregation: use === 'value' ? (e.agg || defaultAgg(e.fid, 'value')) : 'none',
            series_label: e.label.trim() || null,
            series_chart_type: use === 'value' && cart && e.sType ? e.sType : null,
            y_axis: use === 'value' && cart ? (e.yAxis || 'left') : 'left',
            color: use === 'value' && cart && e.color ? e.color : null,
            sort_dir: use === 'sort' ? (e.sortDir || 'asc') : null,
            display_format: (use === 'value' || use === 'label') && e.format.trim() ? e.format.trim() : null,
          });
        });
      });
      return out;
    }

    /** "North|#1a9c6b\n#7c3aed" -> { sliceColors, palette, errors } */
    function parseSliceColors(text) {
      const sliceColors = {}; const palette = []; const errors = [];
      String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
        const cut = line.lastIndexOf('|');
        const label = cut === -1 ? '' : line.slice(0, cut).trim();
        const hex = (cut === -1 ? line : line.slice(cut + 1)).trim();
        if (!HEX_RE.test(hex)) { errors.push(`Slice colors, line ${i + 1}: “${hex}” is not a hex color like #1a9c6b.`); return; }
        if (label) sliceColors[label] = hex; else palette.push(hex);
      });
      return { sliceColors, palette, errors };
    }
    const numOrNull = (v) => { const t = String(v === undefined || v === null ? '' : v).trim(); return t !== '' && isFinite(Number(t)) ? Number(t) : null; };

    function cleanOptions() {
      const o = { ...S.opts };
      const cart = CARTESIAN.includes(S.chartType);
      const pie = S.chartType === 'pie' || S.chartType === 'donut';
      ['legend', 'smooth', 'horizontal', 'dataLabels', 'xTitle', 'yTitle'].forEach((k) => { if (!o[k]) delete o[k]; });
      ['yMin', 'yMax', 'height'].forEach((k) => { const n = numOrNull(o[k]); if (n === null) delete o[k]; else o[k] = n; });
      if (!(S.chartType === 'bar' || S.chartType === 'stacked_bar')) delete o.horizontal;
      if (!(S.chartType === 'line' || S.chartType === 'area' || S.chartType === 'bar')) delete o.smooth;
      if (!cart) { ['xTitle', 'yTitle', 'yMin', 'yMax'].forEach((k) => delete o[k]); }
      if (!(cart || pie)) { delete o.dataLabels; delete o.height; }
      if (pie) {
        const sc = parseSliceColors(S.sliceText !== undefined ? S.sliceText : sliceColorsToText(o));
        if (Object.keys(sc.sliceColors).length) o.sliceColors = sc.sliceColors; else delete o.sliceColors;
        if (sc.palette.length) o.palette = sc.palette; else delete o.palette;
      } else { delete o.sliceColors; delete o.palette; }
      return Object.keys(o).length ? o : null;
    }

    function widgetBody() {
      return {
        source_id: Number(S.sourceId),
        widget_title: S.title.trim(),
        widget_subtitle: S.subtitle.trim(),
        chart_type: S.chartType,
        row_limit: S.rowLimit.trim() ? Number(S.rowLimit) : null,
        refresh_interval_sec: S.refreshSec.trim() ? Number(S.refreshSec) : null,
        options: cleanOptions(),
        fields: buildFields(),
      };
    }

    // ---- preview ----------------------------------------------------------------------------
    const previewOpts = () => ({ height: (numOrNull(S.opts.height) >= 120 && numOrNull(S.opts.height) <= 1200 ? numOrNull(S.opts.height) : 300), animate: false, title: S.title, subtitle: S.subtitle });

    function schedulePreview(delay = 700) {
      clearTimeout(timer);
      timer = setTimeout(runPreview, delay);
    }

    async function runPreview() {
      clearTimeout(timer);
      const my = ++seq;
      const errors = validate({ full: false });
      const meta = $('wb-pmeta');
      if (errors.length) {
        meta.textContent = '';
        ReportsRender.renderWidget(frame, { empty: true, message: 'Finish the setup to see a preview.', hint: errors[0] }, previewOpts());
        return;
      }
      ReportsRender.renderWidget(frame, { loading: true, message: 'Calling the source…' }, previewOpts());
      try {
        const body = { ...widgetBody(), widget_title: S.title.trim() || 'Preview', params: readParamValues($('wb-pparams'), S.params) };
        const res = await Admin.api.post(API.preview, body);
        if (my !== seq) return;
        ReportsRender.renderWidget(frame, res.data, previewOpts());
        const m = res.data.meta || {};
        meta.textContent = `${Reports.fmtNumber(m.rowCount)} source row${Number(m.rowCount) === 1 ? '' : 's'} · ${Reports.fmtMs(m.ms)}${m.truncated ? ' · response was truncated' : ''}`;
      } catch (err) {
        if (my !== seq) return;
        meta.textContent = '';
        ReportsRender.renderWidget(frame, { error: err }, { ...previewOpts(), onRetry: runPreview });
        const list = err && Array.isArray(err.errors) ? err.errors.filter((x) => typeof x === 'string' && !/^reason:/i.test(x)) : [];
        const hint = frame.querySelector('.rpt-state-hint');
        if (err && err.status === 422 && list.length > 1 && hint) hint.innerHTML = `<ul style="text-align:left;margin:4px 0 0;">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
      }
    }

    // ---- loading a source's fields / params ---------------------------------------------------
    async function loadSourceData(keepMapping) {
      S.fields = []; S.params = []; S.paramValues = {}; S.fieldsLoaded = false;
      renderSlots(); renderParamForm(); renderSourceHint();
      if (!S.sourceId) { schedulePreview(0); return; }
      const id = S.sourceId;
      try {
        const [f, p] = await Promise.all([Admin.api.get(SRC.fields(id)), Admin.api.get(SRC.params(id))]);
        if (id !== S.sourceId) return; // the user switched source meanwhile
        S.fields = (f.data && f.data.fields) || [];
        S.params = (p.data && p.data.params) || [];
        S.fieldsLoaded = true;
        if (keepMapping) {
          // drop mappings that point at fields the source no longer has
          ALL_USES.forEach((u) => S.map[u].forEach((e) => { if (e.fid && !fieldById(e.fid)) e.fid = ''; }));
        } else {
          ALL_USES.forEach((u) => { S.map[u] = []; });
          ensureSlots();
          autoFill();
        }
      } catch (err) {
        if (id !== S.sourceId) return;
        const st = Reports.errorState(err);
        $('wb-slots').innerHTML = Reports.stateHtml(st.kind, st.message, st.hint);
        return;
      }
      renderSlots(); renderParamForm();
      schedulePreview(0);
    }

    // ---- chart type change: keep what still fits -------------------------------------------------
    function changeType(next) {
      if (next === S.chartType || !supported(next)) return;
      S.chartType = next;
      const u = usesOf();
      // pie/donut <-> cartesian: the category field moves between "label" and "x"
      if (u.x && !u.label && S.map.label.some((e) => e.fid) && !S.map.x.some((e) => e.fid)) S.map.x = S.map.label;
      if (u.label && !u.x && S.map.x.some((e) => e.fid) && !S.map.label.some((e) => e.fid)) S.map.label = S.map.x;
      ALL_USES.forEach((use) => { if (!u[use]) S.map[use] = []; });
      if (!CARTESIAN.includes(next)) S.map.value.forEach((e) => { e.sType = ''; e.yAxis = 'left'; e.color = ''; });
      if (next === 'table') S.map.label.forEach((e) => { e.agg = ''; });
      ensureSlots();
      pruneSorts();
      autoFill();
      renderTypes(); renderOptionControls(); renderSlots();
      schedulePreview(150);
    }

    // ---- events -------------------------------------------------------------------------------------
    $('wb-types').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-type]');
      if (b && !b.disabled) changeType(b.dataset.type);
    });

    $('wb-title').addEventListener('input', (e) => {
      S.title = e.target.value;
      if (!S.codeTouched) { S.code = Reports.slugify(S.title); $('wb-code').value = S.code; }
    });
    $('wb-code').addEventListener('input', (e) => { S.code = e.target.value.trim().toLowerCase(); S.codeTouched = true; });
    $('wb-sub').addEventListener('input', (e) => { S.subtitle = e.target.value; });
    ['wb-title', 'wb-sub'].forEach((id) => $(id).addEventListener('change', () => schedulePreview(300)));

    $('wb-source').addEventListener('change', (e) => {
      const had = anyMapped();
      S.sourceId = e.target.value;
      if (editing && had && S.sourceId !== String(widget.sourceId)) Admin.toast('Source changed: the field mapping was reset.');
      loadSourceData(false);
    });

    $('wb-limit').addEventListener('input', (e) => { S.rowLimit = e.target.value; });
    $('wb-refresh').addEventListener('input', (e) => { S.refreshSec = e.target.value; });
    $('wb-perm').addEventListener('input', (e) => { S.permRes = e.target.value.trim(); });
    $('wb-active').addEventListener('change', (e) => { S.active = e.target.checked; });
    $('wb-limit').addEventListener('change', () => schedulePreview(300));
    $('wb-legend').addEventListener('change', (e) => { S.opts.legend = e.target.value; schedulePreview(200); });
    $('wb-smooth').addEventListener('change', (e) => { S.opts.smooth = e.target.checked; schedulePreview(200); });
    $('wb-horiz').addEventListener('change', (e) => { S.opts.horizontal = e.target.checked; schedulePreview(200); });
    $('wb-xtitle').addEventListener('input', (e) => { S.opts.xTitle = e.target.value; schedulePreview(500); });
    $('wb-ytitle').addEventListener('input', (e) => { S.opts.yTitle = e.target.value; schedulePreview(500); });
    $('wb-ymin').addEventListener('input', (e) => { S.opts.yMin = e.target.value; schedulePreview(500); });
    $('wb-ymax').addEventListener('input', (e) => { S.opts.yMax = e.target.value; schedulePreview(500); });
    $('wb-height').addEventListener('input', (e) => { S.opts.height = e.target.value; schedulePreview(500); });
    $('wb-dlabels').addEventListener('change', (e) => { S.opts.dataLabels = e.target.checked; schedulePreview(200); });
    $('wb-slices').addEventListener('input', (e) => { S.sliceText = e.target.value; schedulePreview(500); });
    $('wb-prevBtn').addEventListener('click', runPreview);
    $('wb-pparams').addEventListener('change', (e) => {
      if (e.target.closest('[data-pk]')) { S.paramValues = readParamValues($('wb-pparams'), S.params); schedulePreview(300); }
    });

    const slotsBox = $('wb-slots');
    function rowOf(el) {
      const row = el.closest('.rpt-slot-row');
      if (!row) return null;
      const use = row.dataset.use;
      const i = Number(row.dataset.i);
      return { row, use, i, e: S.map[use][i] };
    }

    slotsBox.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-sl]');
      if (!btn) return;
      const act = btn.dataset.sl;
      if (act === 'add') {
        S.map[btn.dataset.use].push(entry());
        renderSlots();
        return;
      }
      const r = rowOf(btn);
      if (!r) return;
      if (act === 'more') { const x = r.row.querySelector('.rpt-slot-extra'); if (x) x.hidden = !x.hidden; return; }
      const list = S.map[r.use];
      if (act === 'remove') {
        list.splice(r.i, 1);
        if (r.use !== 'sort') pruneSorts();
      } else if (act === 'up' && r.i > 0) {
        [list[r.i - 1], list[r.i]] = [list[r.i], list[r.i - 1]];
      } else if (act === 'down' && r.i < list.length - 1) {
        [list[r.i + 1], list[r.i]] = [list[r.i], list[r.i + 1]];
      }
      renderSlots();
      schedulePreview(300);
    });

    function onSlotEdit(ev) {
      const el = ev.target.closest('[data-k]');
      if (!el) return;
      const r = rowOf(el);
      if (!r || !r.e) return;
      const k = el.dataset.k;
      if (k === 'colorOn') {
        const picker = r.row.querySelector('[data-k="color"]');
        r.e.color = el.checked ? (picker.value || '#4f5dff') : '';
        picker.disabled = !el.checked;
      } else if (k === 'color') {
        r.e.color = el.value;
      } else {
        r.e[k] = el.value;
      }
      if (ev.type === 'input') return; // text boxes commit on blur ('change'), so typing never calls the API
      if (k === 'fid') {
        if (r.use === 'value') r.e.agg = defaultAgg(r.e.fid, 'value');
        if (r.use !== 'sort') pruneSorts();
        renderSlots(); // the aggregation list and the sort choices depend on the chosen field
      }
      schedulePreview(k === 'fid' || k === 'agg' ? 400 : 300);
    }
    slotsBox.addEventListener('input', onSlotEdit);
    slotsBox.addEventListener('change', onSlotEdit);

    // ---- save ------------------------------------------------------------------------------------------
    $('wb-save').addEventListener('click', async () => {
      const errBox = $('wbErrors');
      errBox.innerHTML = '';
      const errors = validate({ full: true });
      if (errors.length) {
        errBox.innerHTML = Reports.formErrorsHtml({ message: 'Please fix the following:', errors });
        errBox.scrollIntoView({ block: 'nearest' });
        return;
      }
      const btn = $('wb-save');
      Admin.setButtonLoading(btn, true, 'Saving…');
      try {
        const body = { ...widgetBody(), widget_code: S.code, permission_resource: S.permRes, is_active: S.active };
        if (editing) await Admin.api.patch(API.one(S.id), body);
        else await Admin.api.post(API.list, body);
        Admin.toast(editing ? 'Widget updated.' : 'Widget created.', 'success');
        close();
        loadList();
      } catch (err) {
        errBox.innerHTML = Reports.formErrorsHtml(err);
        errBox.scrollIntoView({ block: 'nearest' });
      } finally {
        Admin.setButtonLoading(btn, false);
      }
    });

    // ---- first paint ---------------------------------------------------------------------------------------
    renderSourceSelect(); renderSourceHint(); renderTypes(); renderOptionControls(); renderSlots();
    ReportsRender.renderWidget(frame, { empty: true, message: 'Finish the setup to see a preview.', hint: 'Choose a source and map the fields.' }, previewOpts());
    if (S.sourceId) loadSourceData(true);
  }

  // =========================================================================
  // INIT
  // =========================================================================

  async function init() {
    await Admin.requireAuth();
    const acc = await Reports.access.apply('report-widgets');
    try { META = (await Admin.api.get(API.meta)).data || FALLBACK_META; } catch (e) { META = FALLBACK_META; }
    await loadSources();

    document.getElementById('wdgType').innerHTML = Reports.optionsHtml(
      META.chartTypes.filter((c) => c.supported).map((c) => ({ value: c.type, label: Reports.chartLabel(c.type) })), '', { blank: 'All' });
    document.getElementById('wdgSource').innerHTML = Reports.optionsHtml(
      sources.map((s) => ({ value: String(s.id), label: s.name })), '', { blank: 'All' });

    const newBtn = document.getElementById('btnNewWidget');
    newBtn.hidden = !acc.create;
    newBtn.addEventListener('click', () => openBuilder(null));
    document.getElementById('btnRefresh').addEventListener('click', () => loadList(true));

    const apply = () => {
      state.search = document.getElementById('wdgSearch').value.trim();
      state.status = document.getElementById('wdgStatus').value;
      state.chartType = document.getElementById('wdgType').value;
      state.sourceId = document.getElementById('wdgSource').value;
      state.page = 1;
      loadList();
    };
    document.getElementById('wdgSearch').addEventListener('input', Admin.debounce(apply, 350));
    ['wdgStatus', 'wdgType', 'wdgSource'].forEach((id) => document.getElementById(id).addEventListener('change', apply));

    await loadList();
  }

  init().catch((e) => Admin.toastError(e));
})();
