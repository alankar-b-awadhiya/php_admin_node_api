/**
 * report-dashboard-builder.js — layout / filters builder (report-dashboards.php?_d=<code>&edit=1). Step 6C.
 *
 * ---------------------------------------------------------------------------
 * Loaded BEFORE report-dashboards.js (see $pageScriptsBefore). Exposes ReportsDashBuilder.mount(code).
 *
 * Endpoints used (paths in reports-common.js -> Reports.API.*):
 *   GET   dashboards.one(code)         definition: filters[] + widgets[] (placements)
 *   GET   widgets.list                 ?status=active&per_page=100 (paged until done) -> the widgets that can be placed
 *   GET   sources.list                 ?status=active&per_page=100 -> options sources for select filters
 *   GET   sources.params(id)           params of a widget's source -> the binding rows
 *   GET   sources.fields(id)           field catalogue -> value / label field of an options source
 *   PATCH dashboards.one(id)           { grid_columns, filters[], widgets[] }   ONE atomic call
 *
 * Why one PATCH and not PATCH + PUT /filters + PUT /layout:
 *   the API accepts filters[] and widgets[] on PATCH and writes them in a single transaction, validating the
 *   bindings against the NEW filter list. Three calls could leave a half-saved dashboard.
 *
 * Layout rules:
 *   - No drag-drop. Each placement has width (grid_w), height (grid_h) and a position in the list.
 *   - grid_x / grid_y are derived (auto-flow): fill left to right, start a new row when the next widget does not fit.
 *     The row is as tall as its tallest widget. So x + w > columns can never be sent.
 *   - A dashboard that was laid out by hand elsewhere is read in (y, x) order and re-flowed on the next save.
 *
 * Preview: an <iframe> of the real viewer (?embed=1: no sidebar / top bar) shows the SAVED dashboard; it reloads after a save.
 * Param bindings: per placement, per source param -> "Not set" | filter (sent as "@filter_key") | fixed value.
 * Renaming a filter key rewrites the "@old" bindings and parent references that point at it.
 * Saved credentials / secrets never pass through here.
 * ---------------------------------------------------------------------------
 */
const ReportsDashBuilder = (function () {
  const esc = Admin.escapeHtml;
  const R = Reports;
  const API = R.API.dashboards;
  const $ = (id) => document.getElementById(id);

  const KEY_RE = /^[a-z][a-z0-9_]{0,59}$/;
  const FILTER_TYPES = [
    { value: 'select', label: 'Select' },
    { value: 'string', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'daterange', label: 'Date range' },
  ];
  let uid = 0;
  const nextUid = () => `u${++uid}`;

  /** Reads every page of a list endpoint (the API caps per_page at 100). */
  async function fetchAll(path, listKey, params) {
    const out = [];
    for (let page = 1; page <= 20; page += 1) {
      const res = await Admin.api.get(path + Admin.qs({ ...params, page, per_page: 100 }));
      out.push(...((res.data && res.data[listKey]) || []));
      const pg = res.meta && res.meta.pagination;
      if (!pg || page >= pg.pages) break;
    }
    return out;
  }

  /** Auto-flow: [{w,h}] -> [{x,y,w,h}] */
  function flow(list, cols) {
    let x = 0; let y = 0; let rowH = 0;
    return list.map((p) => {
      const w = Math.min(Math.max(1, Number(p.w) || 1), cols);
      const h = Math.min(Math.max(1, Number(p.h) || 1), 40);
      if (x + w > cols) { x = 0; y += rowH; rowH = 0; }
      const pos = { x, y, w, h };
      x += w;
      rowH = Math.max(rowH, h);
      return pos;
    });
  }

  async function mount(code) {
    $('dashBuilderView').hidden = false;
    const body = $('dbBody');
    body.innerHTML = R.stateHtml('loading', 'Loading the layout…');

    let def; let widgetList; let sourceList;
    try {
      [def, widgetList, sourceList] = await Promise.all([
        Admin.api.get(API.one(code)).then((r) => r.data.dashboard),
        fetchAll(R.API.widgets.list, 'widgets', { status: 'active' }),
        fetchAll(R.API.sources.list, 'sources', { status: 'active' }).catch(() => []),
      ]);
    } catch (err) {
      const st = R.errorState(err);
      body.innerHTML = R.stateHtml(st.kind, err && err.status === 404 ? 'This dashboard does not exist.' : st.message, st.hint);
      return;
    }

    // ---- model ---------------------------------------------------------------
    const B = {
      def,
      cols: def.gridColumns || 12,
      filters: [],
      places: [],
      catalog: new Map(widgetList.map((w) => [w.id, w])),
      sources: sourceList,
      params: new Map(),   // sourceId -> Promise<[params]>
      fields: new Map(),   // sourceId -> Promise<[fields]>
      dirty: false,
    };
    const filterByUid = (u) => B.filters.find((f) => f.uid === u);
    const placeByUid = (u) => B.places.find((p) => p.uid === u);
    const sourceName = (s) => s.name || s.sourceName || s.code || `#${s.id}`;

    function load(d) {
      B.def = d;
      B.cols = d.gridColumns || 12;
      B.filters = (d.filters || []).map((f) => ({
        uid: nextUid(),
        key: f.key,
        label: f.label || '',
        type: f.dataType || 'select',
        def: f.defaultValue || '',
        required: !!f.isRequired,
        parent: f.parentKey || '',
        optMode: f.optionsSourceId ? 'source' : 'static',
        optionsText: R.optionsToText(f.options),
        sourceId: f.optionsSourceId ? String(f.optionsSourceId) : '',
        valueField: f.optionValueField || '',
        labelField: f.optionLabelField || '',
      }));
      const placed = (d.widgets || []).slice().sort((a, b) => (a.grid.y - b.grid.y) || (a.grid.x - b.grid.x) || (a.sortOrder - b.sortOrder));
      B.places = placed.map((p) => {
        const b = {};
        Object.entries(p.paramBindings || {}).forEach(([k, v]) => {
          const s = v === null || v === undefined ? '' : String(v);
          b[k] = s.startsWith('@') ? { mode: 'filter', v: s.slice(1) } : { mode: 'const', v: s };
        });
        return {
          uid: nextUid(),
          widgetId: p.widgetId,
          fallback: { title: p.widgetTitle, code: p.widgetCode, chartType: p.chartType, sourceName: p.sourceCode, inactive: !p.widgetActive },
          titleOverride: p.titleOverride || '',
          w: p.grid.w,
          h: p.grid.h,
          b,
        };
      });
      B.dirty = false;
    }
    load(def);

    const markDirty = () => { B.dirty = true; $('dbSave').disabled = false; $('dbSaveView').disabled = false; $('dbDirty').hidden = false; };
    window.addEventListener('beforeunload', (e) => { if (B.dirty) { e.preventDefault(); e.returnValue = ''; } });

    // ---- data helpers ----------------------------------------------------------
    const widgetInfo = (p) => {
      const w = B.catalog.get(p.widgetId);
      return w
        ? { title: w.title, code: w.code, chartType: w.chartType, sourceId: w.sourceId, sourceName: w.sourceName || w.sourceCode, inactive: false }
        : { ...p.fallback, sourceId: null };
    };
    function ensureParams(sourceId) {
      if (!B.params.has(sourceId)) {
        B.params.set(sourceId, Admin.api.get(R.API.sources.params(sourceId)).then((r) => (r.data && r.data.params) || []).catch((e) => { B.params.delete(sourceId); throw e; }));
      }
      return B.params.get(sourceId);
    }
    function ensureFields(sourceId) {
      if (!B.fields.has(sourceId)) {
        B.fields.set(sourceId, Admin.api.get(R.API.sources.fields(sourceId)).then((r) => (r.data && r.data.fields) || []).catch((e) => { B.fields.delete(sourceId); throw e; }));
      }
      return B.fields.get(sourceId);
    }

    // ---- shell -------------------------------------------------------------------
    body.innerHTML = `
      <div id="dbErr"></div>
      <div class="card">
        <div class="card-header"><div class="card-header-lead"><h3>Grid</h3></div></div>
        <div class="card-body">
          <div class="rpt-pform">
            <div class="form-group"><label for="dbCols">Grid columns</label>
              <input type="number" id="dbCols" min="1" max="24" value="${B.cols}">
              <div class="rpt-hint">1–24. Widths below are counted in these columns.</div></div>
          </div>
          <div class="rpt-section-title" style="margin-top:6px;">Layout map</div>
          <div id="dbMap" class="rpt-map"></div>
          <div class="rpt-hint">Schematic only — the numbers are the order on the dashboard. Widgets fill left to right and wrap to a new row.</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-header-lead"><h3>Filters</h3></div>
          <button type="button" class="btn btn-secondary btn-sm" id="dbAddFilter">+ Add filter</button>
        </div>
        <div class="card-body"><div id="dbFilters" class="rpt-params-list"></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-header-lead"><h3>Widgets</h3></div>
          <span class="count-pill" id="dbWCount"></span>
        </div>
        <div class="card-body">
          <div class="rpt-add-row">
            <select id="dbPick" aria-label="Widget to add"></select>
            <button type="button" class="btn btn-secondary" id="dbAddWidget">+ Add to dashboard</button>
          </div>
          <div id="dbWidgets" class="rpt-params-list" style="margin-top:14px;"></div>
        </div>
      </div>

      <details class="card" id="dbPreview" style="margin-top:18px;">
        <summary class="card-header" style="cursor:pointer;list-style:none;">
          <div class="card-header-lead"><h3>Preview</h3></div>
          <span class="rpt-hint" style="margin:0;" id="dbPreviewNote">The saved version, in the real viewer</span>
        </summary>
        <div class="card-body">
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="dbPreviewReload">Reload preview</button>
            <span class="rpt-hint" style="margin:0;">Unsaved changes do not show here — save first.</span>
          </div>
          <iframe id="dbPreviewFrame" class="rpt-preview-frame" title="Dashboard preview"></iframe>
        </div>
      </details>`;

    // ---- preview (the real viewer, embedded; shows the SAVED version) ---------------------
    const prevEl = $('dbPreview');
    const prevFrame = $('dbPreviewFrame');
    const prevSrc = `report-dashboards.php${Admin.qs({ _d: code, embed: 1 })}`;
    const loadPreview = () => { prevFrame.src = 'about:blank'; setTimeout(() => { prevFrame.src = prevSrc; }, 30); };
    prevEl.addEventListener('toggle', () => { if (prevEl.open && !prevFrame.getAttribute('src')) prevFrame.src = prevSrc; });
    $('dbPreviewReload').addEventListener('click', (e) => { e.preventDefault(); loadPreview(); });

    // ---- layout map ----------------------------------------------------------------
    function paintMap() {
      const pos = flow(B.places, B.cols);
      const map = $('dbMap');
      map.style.setProperty('--rpt-cols', String(B.cols));
      map.innerHTML = B.places.length
        ? B.places.map((p, i) => {
          const g = pos[i];
          return `<div class="rpt-map-box" style="grid-column:${g.x + 1} / span ${g.w};grid-row:${g.y + 1} / span ${g.h};" title="${esc(widgetInfo(p).title)}"><b>${i + 1}</b> ${esc(R.truncate(p.titleOverride || widgetInfo(p).title, 22))}</div>`;
        }).join('')
        : '<div class="rpt-hint">Nothing placed yet.</div>';
      B.places.forEach((p, i) => {
        const el = body.querySelector(`[data-pos="${p.uid}"]`);
        if (el) el.textContent = `Position ${i + 1} · columns ${pos[i].x + 1}–${pos[i].x + pos[i].w} · row ${pos[i].y + 1}`;
      });
    }

    // ---- filters ----------------------------------------------------------------------
    const fieldOptions = (fields, selected) => R.optionsHtml(
      fields.map((f) => ({ value: f.fieldPath, label: f.fieldLabel && f.fieldLabel !== f.fieldPath ? `${f.fieldPath} — ${f.fieldLabel}` : f.fieldPath })),
      selected, { blank: 'Select a field…' });

    function filterCard(f, i) {
      const others = B.filters.filter((x) => x.uid !== f.uid && x.key);
      const isSel = f.type === 'select';
      return `
      <div class="rpt-param" data-fuid="${f.uid}">
        <div class="rpt-param-grid">
          <div class="form-group"><label>Key <span style="color:var(--coral);">*</span></label>
            <input type="text" class="rpt-mono" data-f="key" maxlength="60" autocomplete="off" placeholder="region" value="${esc(f.key)}"></div>
          <div class="form-group"><label>Label</label>
            <input type="text" data-f="label" maxlength="100" autocomplete="off" placeholder="Region" value="${esc(f.label)}"></div>
          <div class="form-group"><label>Type</label>
            <select data-f="type">${R.optionsHtml(FILTER_TYPES, f.type)}</select></div>
          <div class="form-group"><label>Order</label>
            <div class="rpt-slot-btns" style="margin:0;">
              <button type="button" class="btn btn-ghost btn-sm" data-fact="up" title="Move up"${i === 0 ? ' disabled' : ''}>&uarr;</button>
              <button type="button" class="btn btn-ghost btn-sm" data-fact="down" title="Move down"${i === B.filters.length - 1 ? ' disabled' : ''}>&darr;</button>
            </div></div>
        </div>
        <div class="rpt-param-grid2">
          <div class="form-group"><label>Default value</label>
            <input type="text" data-f="def" maxlength="255" autocomplete="off" placeholder="${f.type === 'daterange' ? '{month_start},{today}' : f.type === 'date' ? '{today}' : 'optional'}" value="${esc(f.def)}"></div>
          <div class="form-group"><label>Depends on (parent filter)</label>
            <select data-f="parent">${R.optionsHtml(others.map((o) => ({ value: o.key, label: o.label || o.key })), f.parent, { blank: 'None' })}</select></div>
        </div>
        ${isSel ? `
        <div class="rpt-param-grid2">
          <div class="form-group"><label>Options come from</label>
            <select data-f="optMode">${R.optionsHtml([{ value: 'static', label: 'A fixed list' }, { value: 'source', label: 'An API source' }], f.optMode)}</select></div>
          ${f.optMode === 'source'
    ? `<div class="form-group"><label>API source</label>
              <select data-f="sourceId">${R.optionsHtml(B.sources.map((s) => ({ value: String(s.id), label: sourceName(s) })), f.sourceId, { blank: 'Select a source…' })}</select></div>`
    : '<div></div>'}
        </div>
        ${f.optMode === 'source'
    ? `<div class="rpt-param-grid2">
            <div class="form-group"><label>Value field</label>
              <select data-f="valueField" data-fs="value"><option value="">Loading…</option></select></div>
            <div class="form-group"><label>Label field</label>
              <select data-f="labelField" data-fs="label"><option value="">Loading…</option></select></div>
          </div>
          <div class="rpt-hint" data-fhint style="margin-bottom:10px;">When the filter has a parent, the parent's value is sent to the source as a param with the parent's key.</div>`
    : `<div class="form-group"><label>Options</label>
            <textarea rows="3" data-f="optionsText" class="rpt-mono" placeholder="one per line, or value|Label">${esc(f.optionsText)}</textarea></div>`}` : ''}
        <div class="rpt-param-foot">
          <label class="rpt-check"><input type="checkbox" data-f="required"${f.required ? ' checked' : ''}> Required (the dashboard will not load until it is filled)</label>
          <button type="button" class="btn btn-danger btn-sm" data-fact="remove">Remove</button>
        </div>
      </div>`;
    }

    function paintFilters() {
      const box = $('dbFilters');
      box.innerHTML = B.filters.length
        ? B.filters.map(filterCard).join('')
        : '<div class="rpt-hint">No filters. Add one if viewers should be able to narrow the data.</div>';
      B.filters.filter((f) => f.type === 'select' && f.optMode === 'source' && f.sourceId).forEach(fillFieldSelects);
      B.filters.filter((f) => f.type === 'select' && f.optMode === 'source' && !f.sourceId).forEach((f) => {
        box.querySelectorAll(`[data-fuid="${f.uid}"] [data-fs]`).forEach((s) => { s.innerHTML = '<option value="">Pick a source first</option>'; s.disabled = true; });
      });
    }

    async function fillFieldSelects(f) {
      const card = body.querySelector(`[data-fuid="${f.uid}"]`);
      if (!card) return;
      const vSel = card.querySelector('[data-fs="value"]');
      const lSel = card.querySelector('[data-fs="label"]');
      try {
        const fields = await ensureFields(Number(f.sourceId));
        const live = body.querySelector(`[data-fuid="${f.uid}"]`);
        if (!live || live !== card) return; // card was re-rendered meanwhile
        vSel.innerHTML = fieldOptions(fields, f.valueField);
        lSel.innerHTML = fieldOptions(fields, f.labelField).replace('Select a field…', 'Same as value');
        if (!fields.length) card.querySelector('[data-fhint]').textContent = 'This source has no field catalogue yet — open the source and run Test API first.';
      } catch (e) {
        vSel.innerHTML = '<option value="">Could not load fields</option>';
        lSel.innerHTML = '<option value="">Could not load fields</option>';
      }
    }

    function addFilter() {
      B.filters.push({ uid: nextUid(), key: '', label: '', type: 'select', def: '', required: false, parent: '', optMode: 'static', optionsText: '', sourceId: '', valueField: '', labelField: '' });
      markDirty();
      paintFilters();
      paintBindingsAll();
      const last = $('dbFilters').querySelector('[data-fuid]:last-child [data-f="key"]');
      if (last) last.focus();
    }

    function renameFilter(f, oldKey, newKey) {
      if (!oldKey || oldKey === newKey || !KEY_RE.test(newKey)) return;
      B.filters.forEach((x) => { if (x.parent === oldKey) x.parent = newKey; });
      B.places.forEach((p) => Object.values(p.b).forEach((t) => { if (t.mode === 'filter' && t.v === oldKey) t.v = newKey; }));
    }

    const filtersBox = $('dbFilters');
    filtersBox.addEventListener('input', (e) => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const f = filterByUid(el.closest('[data-fuid]').dataset.fuid);
      const k = el.dataset.f;
      if (k === 'required') f.required = el.checked;
      else if (['label', 'def', 'optionsText'].includes(k)) f[k] = el.value;
      else if (k === 'key') f.keyDraft = el.value;
      else return;
      markDirty();
    });
    filtersBox.addEventListener('change', (e) => {
      const el = e.target.closest('[data-f]');
      if (!el) return;
      const f = filterByUid(el.closest('[data-fuid]').dataset.fuid);
      const k = el.dataset.f;
      markDirty();
      if (k === 'key') {
        const nk = el.value.trim().toLowerCase();
        renameFilter(f, f.key, nk);
        f.key = nk; delete f.keyDraft;
        paintFilters(); paintBindingsAll();
      } else if (k === 'type') {
        f.type = el.value;
        paintFilters();
      } else if (k === 'optMode') {
        f.optMode = el.value; paintFilters();
      } else if (k === 'sourceId') {
        f.sourceId = el.value; f.valueField = ''; f.labelField = ''; paintFilters();
      } else if (k === 'parent') f.parent = el.value;
      else if (k === 'valueField' || k === 'labelField') f[k] = el.value;
    });
    filtersBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fact]');
      if (!btn) return;
      const f = filterByUid(btn.closest('[data-fuid]').dataset.fuid);
      const i = B.filters.indexOf(f);
      const act = btn.dataset.fact;
      if (act === 'up' && i > 0) B.filters.splice(i - 1, 0, B.filters.splice(i, 1)[0]);
      else if (act === 'down' && i < B.filters.length - 1) B.filters.splice(i + 1, 0, B.filters.splice(i, 1)[0]);
      else if (act === 'remove') {
        B.filters.splice(i, 1);
        // Only clear references when no other filter still owns that key (a half-typed duplicate must not wipe the original's links).
        if (f.key && !B.filters.some((x) => x.key === f.key)) {
          B.filters.forEach((x) => { if (x.parent === f.key) x.parent = ''; });
          B.places.forEach((p) => Object.values(p.b).forEach((t) => { if (t.mode === 'filter' && t.v === f.key) { t.mode = 'none'; t.v = ''; } }));
        }
      } else return;
      markDirty();
      paintFilters();
      paintBindingsAll();
    });
    $('dbAddFilter').addEventListener('click', addFilter);

    // ---- widgets ----------------------------------------------------------------------
    function bindingRow(p, prm) {
      const t = p.b[prm.paramKey] || { mode: 'none', v: '' };
      const filterOpts = B.filters.filter((f) => f.key).map((f) => ({ value: f.key, label: f.label || f.key }));
      const need = prm.isRequired && !prm.defaultValue && t.mode === 'none';
      return `
      <div class="rpt-bind-row" data-param="${esc(prm.paramKey)}">
        <div class="rpt-bind-name"><span class="rpt-code">{${esc(prm.paramKey)}}</span>
          <span class="cell-muted">${esc(prm.paramLabel || '')}${prm.isRequired ? ' · required' : ''}</span>
          ${need ? '<div class="rpt-hint" style="color:var(--amber);">Required and has no default — bind it to a filter or a fixed value.</div>' : ''}</div>
        <select data-b="mode">${R.optionsHtml([
    { value: 'none', label: prm.defaultValue ? `Use the param default (${R.truncate(prm.defaultValue, 18)})` : 'Not set' },
    { value: 'filter', label: 'From a filter' },
    { value: 'const', label: 'Fixed value' }], t.mode)}</select>
        ${t.mode === 'filter'
    ? `<select data-b="filter">${R.optionsHtml(filterOpts, t.v, { blank: 'Pick a filter…' })}</select>`
    : t.mode === 'const'
      ? `<input type="text" data-b="const" maxlength="255" autocomplete="off" placeholder="value" value="${esc(t.v)}">`
      : '<span></span>'}
      </div>`;
    }

    async function paintBindings(p) {
      const box = body.querySelector(`[data-bind-for="${p.uid}"]`);
      if (!box) return;
      const info = widgetInfo(p);
      if (!info.sourceId) { box.innerHTML = '<div class="rpt-hint">This widget is switched off or missing, so its params cannot be read.</div>'; return; }
      try {
        const params = await ensureParams(info.sourceId);
        const live = body.querySelector(`[data-bind-for="${p.uid}"]`);
        if (!live) return;
        const known = new Set(params.map((x) => x.paramKey));
        const stale = Object.keys(p.b).filter((k) => !known.has(k) && p.b[k].mode !== 'none');
        live.innerHTML = (params.length ? params.map((x) => bindingRow(p, x)).join('') : '<div class="rpt-hint">This widget’s source has no params, so there is nothing to bind.</div>')
          + (stale.length ? `<div class="rpt-hint" style="color:var(--amber);">Bindings for params the source no longer has (${stale.map((k) => esc(k)).join(', ')}) are dropped when you save.</div>` : '');
        const sum = body.querySelector(`[data-bind-sum="${p.uid}"]`);
        if (sum) sum.textContent = bindingSummary(p);
      } catch (e) {
        const live = body.querySelector(`[data-bind-for="${p.uid}"]`);
        if (live) live.innerHTML = '<div class="rpt-hint" style="color:var(--coral);">Could not load the source params. Reopen the builder to retry.</div>';
      }
    }
    const bindingSummary = (p) => {
      const n = Object.values(p.b).filter((t) => t.mode !== 'none' && t.v !== '').length;
      return n ? `${n} bound` : 'none';
    };
    const paintBindingsAll = () => B.places.forEach(paintBindings);

    function placeCard(p, i) {
      const info = widgetInfo(p);
      return `
      <div class="rpt-param rpt-place" data-puid="${p.uid}">
        <div class="rpt-place-head">
          <span class="rpt-typecell">${R.chartIcon(info.chartType, 16)} <span>${esc(info.title)}</span></span>
          <span class="rpt-code">${esc(info.code || '')}</span>
          <span class="cell-muted">${esc(info.sourceName || '')}</span>
          ${info.inactive ? '<span class="badge badge-gray">Widget off</span>' : ''}
        </div>
        ${info.inactive ? '<div class="rpt-hint" style="color:var(--amber);">This widget is switched off, so the dashboard cannot be saved with it. Remove it or switch the widget on.</div>' : ''}
        <div class="rpt-param-grid">
          <div class="form-group"><label>Title on this dashboard</label>
            <input type="text" data-p="title" maxlength="150" autocomplete="off" placeholder="${esc(info.title)}" value="${esc(p.titleOverride)}"></div>
          <div class="form-group"><label>Width (columns)</label>
            <input type="number" data-p="w" min="1" max="${B.cols}" value="${p.w}"></div>
          <div class="form-group"><label>Height (rows)</label>
            <input type="number" data-p="h" min="1" max="40" value="${p.h}"></div>
          <div class="form-group"><label>Order</label>
            <div class="rpt-slot-btns" style="margin:0;">
              <button type="button" class="btn btn-ghost btn-sm" data-pact="up" title="Move earlier"${i === 0 ? ' disabled' : ''}>&uarr;</button>
              <button type="button" class="btn btn-ghost btn-sm" data-pact="down" title="Move later"${i === B.places.length - 1 ? ' disabled' : ''}>&darr;</button>
            </div></div>
        </div>
        <div class="rpt-param-foot">
          <span class="rpt-hint" style="margin:0;" data-pos="${p.uid}"></span>
          <button type="button" class="btn btn-danger btn-sm" data-pact="remove">Remove</button>
        </div>
        <details class="rpt-advanced" style="margin:8px 0 10px;">
          <summary>Param bindings <span class="cell-muted" data-bind-sum="${p.uid}">…</span></summary>
          <div data-bind-for="${p.uid}" class="rpt-bind-list"><div class="rpt-hint">Loading…</div></div>
        </details>
      </div>`;
    }

    function paintPicker() {
      const list = [...B.catalog.values()].sort((a, b) => a.title.localeCompare(b.title));
      $('dbPick').innerHTML = list.length
        ? R.optionsHtml(list.map((w) => ({ value: String(w.id), label: `${w.title} — ${R.chartLabel(w.chartType)} · ${w.code}` })), '', { blank: 'Choose a widget…' })
        : '<option value="">No active widgets yet</option>';
      $('dbAddWidget').disabled = !list.length;
    }

    function paintWidgets() {
      $('dbWidgets').innerHTML = B.places.length
        ? B.places.map(placeCard).join('')
        : '<div class="rpt-hint">No widgets on this dashboard yet. Pick one above and add it.</div>';
      $('dbWCount').textContent = `${B.places.length} widget${B.places.length === 1 ? '' : 's'}`;
      paintMap();
      paintBindingsAll();
    }

    const wBox = $('dbWidgets');
    wBox.addEventListener('input', (e) => {
      const el = e.target.closest('[data-p]');
      if (!el) return;
      const p = placeByUid(el.closest('[data-puid]').dataset.puid);
      if (el.dataset.p === 'title') p.titleOverride = el.value;
      else p[el.dataset.p] = Number(el.value) || 0;
      markDirty();
      paintMap();
    });
    wBox.addEventListener('change', (e) => {
      const el = e.target.closest('[data-b]');
      if (!el) return;
      const p = placeByUid(el.closest('[data-puid]').dataset.puid);
      const key = el.closest('[data-param]').dataset.param;
      const t = p.b[key] || (p.b[key] = { mode: 'none', v: '' });
      if (el.dataset.b === 'mode') { t.mode = el.value; t.v = ''; } else t.v = el.value;
      markDirty();
      paintBindings(p);
    });
    wBox.addEventListener('input', (e) => {
      const el = e.target.closest('[data-b="const"]');
      if (!el) return;
      const p = placeByUid(el.closest('[data-puid]').dataset.puid);
      const key = el.closest('[data-param]').dataset.param;
      p.b[key].v = el.value;
      markDirty();
    });
    wBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pact]');
      if (!btn) return;
      const p = placeByUid(btn.closest('[data-puid]').dataset.puid);
      const i = B.places.indexOf(p);
      const act = btn.dataset.pact;
      if (act === 'up' && i > 0) B.places.splice(i - 1, 0, B.places.splice(i, 1)[0]);
      else if (act === 'down' && i < B.places.length - 1) B.places.splice(i + 1, 0, B.places.splice(i, 1)[0]);
      else if (act === 'remove') B.places.splice(i, 1);
      else return;
      markDirty();
      paintWidgets();
    });
    $('dbAddWidget').addEventListener('click', () => {
      const id = Number($('dbPick').value);
      const w = B.catalog.get(id);
      if (!w) { Admin.toast('Choose a widget first.', 'error'); return; }
      B.places.push({ uid: nextUid(), widgetId: id, fallback: {}, titleOverride: '', w: Math.min(6, B.cols), h: 4, b: {} });
      markDirty();
      paintWidgets();
      const last = wBox.lastElementChild;
      if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    $('dbCols').addEventListener('input', (e) => {
      const n = Number(e.target.value);
      if (!Number.isInteger(n) || n < 1 || n > 24) return;
      B.cols = n;
      markDirty();
      paintWidgets();
    });

    // ---- validate + save --------------------------------------------------------------------
    function collect() {
      const errs = [];
      const cols = Number($('dbCols').value);
      if (!Number.isInteger(cols) || cols < 1 || cols > 24) errs.push('Grid columns must be a whole number from 1 to 24.');

      const keys = new Set();
      const filters = B.filters.map((f, i) => {
        const tag = `Filter ${i + 1}${f.key ? ` (${f.key})` : ''}`;
        if (!KEY_RE.test(f.key)) errs.push(`${tag}: key must be lowercase letters, digits or _ , starting with a letter.`);
        else if (keys.has(f.key)) errs.push(`${tag}: the key is used twice.`);
        keys.add(f.key);
        let options = null;
        let sourceId = null;
        if (f.type === 'select') {
          if (f.optMode === 'source') {
            sourceId = Number(f.sourceId) || null;
            if (!sourceId) errs.push(`${tag}: pick an API source.`);
            else if (!f.valueField) errs.push(`${tag}: pick the value field of the source.`);
          } else {
            options = R.textToOptions(f.optionsText);
            if (!options.length) errs.push(`${tag}: add at least one option.`);
          }
        }
        return {
          filter_key: f.key,
          filter_label: f.label.trim() || f.key,
          data_type: f.type,
          options,
          options_source_id: sourceId,
          option_value_field: sourceId ? f.valueField : null,
          option_label_field: sourceId ? (f.labelField || f.valueField) : null,
          parent_filter_key: f.parent || null,
          default_value: f.def.trim() || null,
          is_required: f.required ? 1 : 0,
          sort_order: i,
        };
      });
      // parent references / loops
      const byKey = new Map(filters.map((f) => [f.filter_key, f]));
      filters.forEach((f) => {
        if (!f.parent_filter_key) return;
        if (!byKey.has(f.parent_filter_key)) { errs.push(`Filter ${f.filter_key}: parent "${f.parent_filter_key}" does not exist.`); return; }
        const seen = new Set([f.filter_key]);
        let cur = byKey.get(f.parent_filter_key);
        while (cur) {
          if (seen.has(cur.filter_key)) { errs.push(`Filter ${f.filter_key}: the parent chain loops back on itself.`); break; }
          seen.add(cur.filter_key);
          cur = cur.parent_filter_key ? byKey.get(cur.parent_filter_key) : null;
        }
      });

      const pos = flow(B.places, cols || B.cols);
      const widgets = B.places.map((p, i) => {
        const info = widgetInfo(p);
        const tag = `Widget ${i + 1} (${info.title})`;
        if (info.inactive || !B.catalog.has(p.widgetId)) errs.push(`${tag}: the widget is switched off or missing — remove it or switch it on.`);
        if (!Number.isInteger(p.w) || p.w < 1 || p.w > (cols || B.cols)) errs.push(`${tag}: width must be between 1 and ${cols || B.cols}.`);
        if (!Number.isInteger(p.h) || p.h < 1 || p.h > 40) errs.push(`${tag}: height must be between 1 and 40.`);
        const bindings = {};
        Object.entries(p.b).forEach(([k, t]) => {
          if (t.mode === 'filter') {
            if (!t.v) errs.push(`${tag}: param {${k}} is set to “From a filter” but no filter is picked.`);
            else if (!keys.has(t.v)) errs.push(`${tag}: param {${k}} points at the filter “${t.v}”, which does not exist.`);
            else bindings[k] = `@${t.v}`;
          } else if (t.mode === 'const' && t.v !== '') {
            if (t.v.startsWith('@')) errs.push(`${tag}: a fixed value for {${k}} cannot start with @ (that means “from a filter”).`);
            else bindings[k] = t.v;
          }
        });
        return {
          widget_id: p.widgetId,
          grid_x: pos[i].x, grid_y: pos[i].y, grid_w: pos[i].w, grid_h: pos[i].h,
          title_override: p.titleOverride.trim() || null,
          param_bindings: Object.keys(bindings).length ? bindings : null,
          sort_order: i,
          is_active: 1,
        };
      });
      return { errs, body: { grid_columns: cols, filters, widgets } };
    }

    async function save(thenView) {
      const { errs, body: payload } = collect();
      const box = $('dbErr');
      if (errs.length) {
        box.innerHTML = R.formErrorsHtml({ message: 'Please fix the following before saving:', errors: errs });
        box.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      box.innerHTML = '';
      const btns = [$('dbSave'), $('dbSaveView')];
      const active = thenView ? $('dbSaveView') : $('dbSave');
      btns.forEach((b) => { b.disabled = true; });
      Admin.setButtonLoading(active, true, 'Saving…');
      try {
        await Admin.api.patch(API.one(B.def.id), payload);
        B.dirty = false;
        Admin.toast('Layout saved.', 'success');
        if (thenView) { location.href = `report-dashboards.php${Admin.qs({ _d: code })}`; return; }
        // re-read what the server stored, so ids and positions match the saved state
        const fresh = (await Admin.api.get(API.one(code))).data.dashboard;
        load(fresh);
        $('dbCols').value = B.cols;
        paintFilters(); paintWidgets();
        $('dbDirty').hidden = true;
        btns.forEach((b) => { b.disabled = true; });
        if (prevEl.open) loadPreview();
      } catch (err) {
        box.innerHTML = R.formErrorsHtml(err);
        box.scrollIntoView({ block: 'start', behavior: 'smooth' });
        btns.forEach((b) => { b.disabled = false; });
      } finally {
        Admin.setButtonLoading(active, false);
        btns.forEach((b) => { b.disabled = !B.dirty; }); // setButtonLoading re-enables; a clean state keeps Save off
      }
    }

    $('dbTitle').textContent = `Edit layout — ${B.def.title}`;
    $('dbSub').textContent = B.def.description || '';
    $('dbBack').href = `report-dashboards.php${Admin.qs({ _d: code })}`;
    $('dbSave').disabled = true; $('dbSaveView').disabled = true; $('dbDirty').hidden = true;
    $('dbSave').addEventListener('click', () => save(false));
    $('dbSaveView').addEventListener('click', () => save(true));

    paintPicker();
    paintFilters();
    paintWidgets();
  }

  return { mount };
})();
