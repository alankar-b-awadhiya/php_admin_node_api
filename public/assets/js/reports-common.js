/**
 * reports-common.js — shared by the three Reports pages
 * (report-sources.php, report-widgets.php, report-dashboards.php).
 *
 * Must load AFTER common.js (needs the `Admin` global). The page .php files
 * list it in $pageScriptsBefore, so it loads before the page's own script.
 *
 * ---------------------------------------------------------------------------
 * API map — the ONLY place the Reports URLs live. Keep in sync with the Node
 * service ms_reports (gateway paths /api/v1/report-*):
 *   src/domains/sources/v1/sources.routes.js
 *   src/domains/widgets/v1/widgets.routes.js
 *   src/domains/dashboards/v1/dashboards.routes.js
 *
 * Response shapes (sendSuccess):
 *   list     -> { data: { sources|widgets|dashboards: [...] }, meta: { pagination: { total, page, perPage, pages } } }
 *   getOne   -> { data: { source|widget|dashboard } }
 *   create   -> { data: { id } }            update -> { data: { id, changed } }
 *   status   -> { data: { id, isActive } }  remove -> { message }
 * ---------------------------------------------------------------------------
 */
const Reports = (function () {
  const esc = Admin.escapeHtml;

  // ---- API paths -----------------------------------------------------------
  const API = {
    sources: {
      list: '/report-sources',
      testDraft: '/report-sources/test',              // POST — runs an UNSAVED definition
      one: (id) => `/report-sources/${id}`,
      status: (id) => `/report-sources/${id}/status`, // PATCH { is_active }
      params: (id) => `/report-sources/${id}/params`, // GET | PUT { params: [...] }
      fields: (id) => `/report-sources/${id}/fields`, // GET | PUT { fields: [...] }
      test: (id) => `/report-sources/${id}/test`,     // POST { test_values, save_fields, preview_rows }
      cache: (id) => `/report-sources/${id}/cache`,   // DELETE -> { data: { deleted } }
      runs: (id) => `/report-sources/${id}/runs`,     // GET ?limit= -> { data: { runs: [...] } }
    },
    widgets: {
      list: '/report-widgets',
      meta: '/report-widgets/meta',                   // chart types, aggregations, field uses
      preview: '/report-widgets/preview',             // POST — runs an UNSAVED widget
      one: (ref) => `/report-widgets/${ref}`,         // ref = id or code
      status: (id) => `/report-widgets/${id}/status`,
      fields: (id) => `/report-widgets/${id}/fields`, // PUT { fields: [...] } (mapping)
      data: (ref) => `/report-widgets/${ref}/data`,   // ?refresh=1 bypasses cache
    },
    dashboards: {
      list: '/report-dashboards',
      one: (ref) => `/report-dashboards/${ref}`,
      status: (id) => `/report-dashboards/${id}/status`,
      filters: (id) => `/report-dashboards/${id}/filters`,   // PUT { filters: [...] }
      layout: (id) => `/report-dashboards/${id}/layout`,     // PUT { widgets: [...] }
      data: (ref) => `/report-dashboards/${ref}/data`,       // ?<filter_key>=<v>&refresh=1
      filterOptions: (ref, key) => `/report-dashboards/${ref}/filters/${encodeURIComponent(key)}/options`,
    },
  };

  // ---- Enumerations (labels for the dropdowns; values must match the API) ----
  const HTTP_METHODS = ['GET', 'POST'];
  const AUTH_TYPES = [
    { value: 'none', label: 'No authentication' },
    { value: 'bearer', label: 'Bearer token' },
    { value: 'api_key', label: 'API key (header / query)' },
    { value: 'basic', label: 'Basic (username + password)' },
    { value: 'user_token', label: 'Logged-in user\u2019s token (internal APIs)' },
  ];
  const PARAM_TYPES = [
    { value: 'string', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'daterange', label: 'Date range' },
    { value: 'select', label: 'Select (fixed options)' },
  ];
  const FIELD_TYPES = ['string', 'number', 'date', 'datetime', 'currency', 'percent', 'boolean'];
  const FIELD_ROLES = [
    { value: 'dimension', label: 'Dimension (category)' },
    { value: 'measure', label: 'Measure (number)' },
    { value: 'time', label: 'Time' },
  ];
  const AGGREGATIONS = [
    { value: 'none', label: 'None (use as is)' },
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Min' },
    { value: 'max', label: 'Max' },
    { value: 'count', label: 'Count' },
    { value: 'count_distinct', label: 'Count distinct' },
  ];
  const FIELD_USES = {
    x: 'X axis (category / time)',
    group_by: 'Split into series by',
    value: 'Value (plotted number)',
    label: 'Label (slice / column)',
    tooltip: 'Tooltip (reserved)',
    sort: 'Sort by',
  };

  // Chart types as the UI shows them. `supported` here is only a fallback —
  // the builder reads the real flags from GET /report-widgets/meta.
  const CHART_TYPES = [
    { type: 'line', label: 'Line', supported: true, hint: 'Trend over time or categories' },
    { type: 'area', label: 'Area', supported: true, hint: 'Line with filled area' },
    { type: 'bar', label: 'Bar', supported: true, hint: 'Compare categories (can mix with a line)' },
    { type: 'stacked_bar', label: 'Stacked bar', supported: true, hint: 'Parts of a total per category' },
    { type: 'pie', label: 'Pie', supported: true, hint: 'Share of a whole' },
    { type: 'donut', label: 'Donut', supported: true, hint: 'Pie with a hole' },
    { type: 'kpi', label: 'KPI number', supported: true, hint: 'One big number' },
    { type: 'table', label: 'Table', supported: true, hint: 'Rows and columns' },
    { type: 'scatter', label: 'Scatter', supported: false, hint: 'Coming soon' },
    { type: 'gauge', label: 'Gauge', supported: false, hint: 'Coming soon' },
  ];

  const CHART_ICONS = {
    line: '<path d="M3 15l4-5 3 3 6-8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    area: '<path d="M3 16V12l4-4 3 3 6-6v11H3Z" fill="currentColor" opacity=".35"/><path d="M3 12l4-4 3 3 6-6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    bar: '<path d="M4 16V9h3v7H4Zm5 0V4h3v12H9Zm5 0v-5h3v5h-3Z" fill="currentColor"/>',
    stacked_bar: '<path d="M4 16v-4h3v4H4Zm0-5V8h3v3H4Zm5 5v-6h3v6H9Zm0-7V4h3v5H9Zm5 7v-3h3v3h-3Zm0-4V7h3v5h-3Z" fill="currentColor"/>',
    pie: '<path d="M10 3a7 7 0 1 0 7 7h-7V3Z" fill="currentColor" opacity=".35"/><path d="M11.5 2.2A7 7 0 0 1 17.8 8.5H11.5V2.2Z" fill="currentColor"/>',
    donut: '<circle cx="10" cy="10" r="5.5" stroke="currentColor" stroke-width="3.2" fill="none" opacity=".35"/><path d="M10 4.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" stroke-width="3.2" fill="none"/>',
    kpi: '<path d="M4 15V5h2.2v4l3-4h2.6L8.7 9.2 12 15H9.4L7.3 11.3 6.2 12.7V15H4Zm9-10h3v1.8h-3V5Zm0 3.2h3V10h-3V8.2Z" fill="currentColor"/>',
    table: '<path d="M3 4h14v12H3V4Zm1.6 3.2V10H9V7.2H4.6Zm5.8 0V10h5V7.2h-5ZM4.6 11.4v3H9v-3H4.6Zm5.8 0v3h5v-3h-5Z" fill="currentColor"/>',
    scatter: '<circle cx="6" cy="13" r="1.6" fill="currentColor"/><circle cx="10" cy="8" r="1.6" fill="currentColor"/><circle cx="14" cy="11" r="1.6" fill="currentColor"/><circle cx="15" cy="5" r="1.6" fill="currentColor"/>',
    gauge: '<path d="M3.5 14a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".35"/><path d="M10 14l3.2-4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };

  const chartMeta = (type) => CHART_TYPES.find((c) => c.type === type) || { type, label: type, supported: false, hint: '' };
  const chartLabel = (type) => chartMeta(type).label;
  const chartIcon = (type, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none">${CHART_ICONS[type] || CHART_ICONS.bar}</svg>`;

  const labelOf = (list, value) => {
    const hit = list.find((o) => (typeof o === 'string' ? o : o.value) === value);
    return hit ? (typeof hit === 'string' ? hit : hit.label) : (value || '—');
  };

  // ---- Small helpers --------------------------------------------------------
  const CODE_RE = /^[a-z][a-z0-9_]{1,79}$/;
  const isCode = (s) => CODE_RE.test(String(s || ''));

  /** "Monthly Revenue (INR)" -> "monthly_revenue_inr" (a valid *_code suggestion). */
  function slugify(text, max = 80) {
    let s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) return '';
    if (!/^[a-z]/.test(s)) s = 'r_' + s;
    return s.slice(0, max).replace(/_+$/, '');
  }

  /** Validates a JSON textarea. Empty text is allowed and yields `empty: true`. */
  function parseJsonInput(text, label, { expect = 'object' } = {}) {
    const raw = String(text || '').trim();
    if (!raw) return { value: null, empty: true, error: null };
    let value;
    try { value = JSON.parse(raw); } catch (e) { return { value: null, empty: false, error: `${label} is not valid JSON (${e.message})` }; }
    const isObj = value && typeof value === 'object' && !Array.isArray(value);
    if (expect === 'object' && !isObj) return { value: null, empty: false, error: `${label} must be a JSON object, e.g. {"key": "value"}` };
    if (expect === 'array' && !Array.isArray(value)) return { value: null, empty: false, error: `${label} must be a JSON array` };
    return { value, empty: false, error: null };
  }

  const prettyJson = (v) => (v === null || v === undefined || v === '' ? '' : JSON.stringify(v, null, 2));
  const fmtNumber = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '—' : Number(n).toLocaleString());
  const fmtMs = (ms) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

  const optionsHtml = (list, selected, { blank } = {}) => {
    const rows = (blank !== undefined ? [{ value: '', label: blank }] : []).concat(list.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)));
    return rows.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(selected ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  };

  // ---- Placeholders ({param} / built-in tokens) -----------------------------------
  // Mirrors ms_reports utils/template.js BUILTIN. Used only to hint in the forms;
  // the server is the real validator.
  const BUILTIN_TOKENS = ['today', 'yesterday', 'month_start', 'month_end', 'year_start', 'year_end', 'year', 'month', 'user_id'];

  /** Collects the distinct {placeholder} names found in any string / object / array. */
  function findPlaceholders(value, into = new Set()) {
    if (typeof value === 'string') {
      const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
      let m;
      while ((m = re.exec(value)) !== null) into.add(m[1]);
    } else if (Array.isArray(value)) {
      value.forEach((v) => findPlaceholders(v, into));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach((v) => findPlaceholders(v, into));
    }
    return into;
  }

  // ---- More small helpers ---------------------------------------------------------
  const truncate = (s, n) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '\u2026' : t; };
  const fmtBytes = (b) => (b === null || b === undefined || isNaN(Number(b)) ? '\u2014' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

  /** Server validation errors (ApiError.errors) -> the standard red box used by the other pages. */
  function formErrorsHtml(err) {
    const list = err && Array.isArray(err.errors) ? err.errors : [];
    const msg = (err && err.message) || 'Something went wrong.';
    return `<div class="form-errors"><strong>${esc(msg)}</strong>${list.length ? `<ul>${list.map((e) => `<li>${esc(typeof e === 'string' ? e : (e.message || JSON.stringify(e)))}</li>`).join('')}</ul>` : ''}</div>`;
  }

  // ---- Pagination (same look as blogs / enquiries) --------------------------------
  /** pagerHtml(meta.pagination) -> markup for a <div class="pagination">; wire it with bindPager(). */
  function pagerHtml(p) {
    if (!p || !p.total) return '';
    const page = Number(p.page) || 1;
    const perPage = Number(p.perPage) || 20;
    const total = Number(p.total) || 0;
    const pages = Number(p.pages) || 1;
    const from = (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    return `
      <span>Showing ${from} to ${to} of ${total} entries</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-secondary btn-sm" type="button" data-pg="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>${page} / ${pages}</span>
        <button class="btn btn-secondary btn-sm" type="button" data-pg="next" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>`;
  }
  /** Fills `el` with the pager and calls onPage(newPage) on Previous / Next. */
  function renderPager(el, p, onPage) {
    if (!el) return;
    el.innerHTML = pagerHtml(p);
    const page = p ? Number(p.page) || 1 : 1;
    el.querySelector('[data-pg="prev"]')?.addEventListener('click', () => onPage(page - 1));
    el.querySelector('[data-pg="next"]')?.addEventListener('click', () => onPage(page + 1));
  }

  // ---- Badges ----------------------------------------------------------------
  const activeBadge = (on) => Admin.badge(!!Number(on), 'Active', 'Inactive');
  const internalBadge = (isInternal) => (Number(isInternal)
    ? '<span class="badge badge-sky">Internal</span>'
    : '<span class="badge badge-gray">External</span>');

  // ---- States (loading / empty / error / forbidden) -----------------------------
  const STATE_ICONS = {
    loading: '<span class="spinner spinner-dark"></span>',
    empty: '<svg width="30" height="30" viewBox="0 0 20 20" fill="none"><path d="M3 5h14v10H3V5Zm0 3h14" stroke="currentColor" stroke-width="1.4"/></svg>',
    error: '<svg width="30" height="30" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.4"/><path d="M10 6v5M10 13.4v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    forbidden: '<svg width="30" height="30" viewBox="0 0 20 20" fill="none"><rect x="4.5" y="9" width="11" height="8" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M7 9V6.6a3 3 0 0 1 6 0V9" stroke="currentColor" stroke-width="1.4"/></svg>',
  };
  const stateHtml = (kind, message, hint) => `
    <div class="rpt-state rpt-state-${kind}">
      <div class="rpt-state-icon">${STATE_ICONS[kind] || ''}</div>
      <div class="rpt-state-msg">${esc(message)}</div>
      ${hint ? `<div class="rpt-state-hint">${esc(hint)}</div>` : ''}
    </div>`;

  /** Turns any thrown error into { kind, message } for stateHtml(). */
  function errorState(err) {
    if (err && err.status === 403) return { kind: 'forbidden', message: 'You don\u2019t have access to this.', hint: 'Ask an admin to grant the matching Reports permission to your role.' };
    if (err && err.status === 401) return { kind: 'error', message: 'Your session has expired. Please sign in again.' };
    return { kind: 'error', message: (err && err.message) || 'Something went wrong.' };
  }

  // ---- Params editor (declared {placeholders}) -------------------------------------
  // One component used by the source form (create / edit) and by the source detail
  // "Params" tab. Rows live in memory; the DOM is re-rendered only when a row is
  // added or removed, so typing never loses focus.
  const PARAM_KEY_RE = /^[a-z][a-z0-9_]{0,59}$/;
  const PARAM_HINTS = {
    string: (k) => `Use it as <span class="rpt-code">{${k}}</span>.`,
    number: (k) => `Must be a number. Use it as <span class="rpt-code">{${k}}</span>.`,
    date: (k) => `Date as YYYY-MM-DD. Use it as <span class="rpt-code">{${k}}</span>.`,
    daterange: (k) => `Value is <em>from,to</em> (YYYY-MM-DD). Use <span class="rpt-code">{${k}_from}</span> and <span class="rpt-code">{${k}_to}</span>.`,
    select: (k) => `Callers must pick one of the options. Use it as <span class="rpt-code">{${k}}</span>.`,
  };

  /** [ 'a', {value:'b', label:'B'} ]  ->  "a\nb|B" */
  function optionsToText(options) {
    if (!Array.isArray(options)) return '';
    return options.map((o) => (o && typeof o === 'object'
      ? (o.label !== undefined && String(o.label) !== String(o.value) ? `${o.value}|${o.label}` : String(o.value))
      : String(o))).join('\n');
  }
  /** "a\nb|B" -> [ 'a', {value:'b', label:'B'} ]  (blank lines dropped, duplicates removed) */
  function textToOptions(text) {
    const seen = new Set();
    const out = [];
    String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const i = line.indexOf('|');
      const value = (i === -1 ? line : line.slice(0, i)).trim();
      const label = i === -1 ? '' : line.slice(i + 1).trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push(label && label !== value ? { value, label } : value);
    });
    return out;
  }

  /**
   * paramsEditor(mount, { params, getUsedNames, onChange }) -> { getValue, isDirty, declaredKeys, addMissing, rowCount }
   *   params       : API shape [{ paramKey, paramLabel, dataType, isRequired, defaultValue, options }]
   *   getUsedNames : () => Set|Array of {placeholder} names used by the source (enables "Add from placeholders")
   *   onChange     : called after any edit / add / remove
   *   getValue()   : { params: [snake_case rows for the API], errors: [messages] }
   */
  function paramsEditor(mount, { params = [], getUsedNames = null, onChange = null } = {}) {
    const toRow = (p) => ({
      key: p.paramKey ?? p.param_key ?? '',
      label: p.paramLabel ?? p.param_label ?? '',
      type: p.dataType ?? p.data_type ?? 'string',
      required: !!(p.isRequired ?? p.is_required),
      def: p.defaultValue ?? p.default_value ?? '',
      optionsText: optionsToText(p.options),
      keyTouched: true,
    });
    let rows = (params || []).map(toRow);
    let note = '';

    function serialize() {
      return rows.map((r, i) => ({
        param_key: r.key.trim(),
        param_label: r.label.trim() || r.key.trim(),
        data_type: r.type,
        is_required: r.required,
        default_value: r.def === '' ? null : r.def,
        options: r.type === 'select' ? textToOptions(r.optionsText) : null,
        sort_order: i,
      }));
    }
    const initial = JSON.stringify(serialize());

    function getValue() {
      const errors = [];
      if (rows.length > 30) errors.push('A source can have at most 30 params.');
      const seen = new Set();
      rows.forEach((r, i) => {
        const key = r.key.trim();
        const n = `Param ${i + 1}${key ? ` (${key})` : ''}`;
        if (!PARAM_KEY_RE.test(key)) errors.push(`${n}: key must be lowercase letters, digits or _ , starting with a letter (max 60).`);
        else if (seen.has(key)) errors.push(`${n}: this key is used twice.`);
        seen.add(key);
        if (r.type === 'select' && !textToOptions(r.optionsText).length) errors.push(`${n}: a Select param needs at least one option.`);
      });
      return { params: serialize(), errors };
    }

    function declaredKeys() {
      const set = new Set();
      rows.forEach((r) => {
        const k = r.key.trim();
        if (!k) return;
        set.add(k);
        if (r.type === 'daterange') { set.add(`${k}_from`); set.add(`${k}_to`); }
      });
      return set;
    }

    const changed = () => { if (typeof onChange === 'function') onChange(); };
    const hintFor = (r) => (PARAM_HINTS[r.type] || PARAM_HINTS.string)(esc(r.key.trim() || 'key'));

    function cardHtml(r, i) {
      return `
      <div class="rpt-param" data-i="${i}">
        <div class="rpt-param-grid">
          <div class="form-group"><label>Key <span style="color:var(--coral);">*</span></label>
            <input type="text" class="rpt-mono" data-k="key" maxlength="60" autocomplete="off" placeholder="region" value="${esc(r.key)}"></div>
          <div class="form-group"><label>Label</label>
            <input type="text" data-k="label" maxlength="150" autocomplete="off" placeholder="Region" value="${esc(r.label)}"></div>
          <div class="form-group"><label>Type</label>
            <select data-k="type">${optionsHtml(PARAM_TYPES, r.type)}</select></div>
          <div class="form-group"><label>Required</label>
            <div style="display:flex;align-items:center;height:38px;"><label class="switch"><input type="checkbox" data-k="required" ${r.required ? 'checked' : ''}><span class="slider"></span></label></div></div>
        </div>
        <div class="rpt-param-grid2">
          <div class="form-group"><label>Default value</label>
            <input type="text" data-k="def" maxlength="255" autocomplete="off" placeholder="optional, e.g. {month_start}" value="${esc(r.def)}"></div>
          <div class="form-group" data-opt ${r.type === 'select' ? '' : 'hidden'}><label>Options <span class="cell-muted" style="font-weight:400;">(one per line: value or value|Label)</span></label>
            <textarea data-k="optionsText" class="rpt-mono" rows="3" placeholder="north&#10;south|South zone">${esc(r.optionsText)}</textarea></div>
        </div>
        <div class="rpt-param-foot">
          <span class="rpt-hint" data-hint style="margin:0;">${hintFor(r)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-pe="remove">Remove</button>
        </div>
      </div>`;
    }

    function render() {
      mount.innerHTML = `
        <div class="rpt-params">
          ${rows.length
            ? `<div class="rpt-params-list">${rows.map(cardHtml).join('')}</div>`
            : '<div class="rpt-hint" style="margin:0 0 4px;">No params declared. Add one for every <span class="rpt-code">{name}</span> your URL, query, headers or body uses (built-ins like <span class="rpt-code">{today}</span> need none).</div>'}
          <div class="rpt-params-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-pe="add">+ Add param</button>
            ${getUsedNames ? '<button type="button" class="btn btn-secondary btn-sm" data-pe="detect">Add from placeholders</button>' : ''}
            <span class="rpt-hint" data-pe="note" style="margin:0;">${esc(note)}</span>
          </div>
        </div>`;
    }

    function addMissing() {
      const used = getUsedNames ? [...getUsedNames()] : [];
      const have = declaredKeys();
      const fresh = used.filter((n) => !BUILTIN_TOKENS.includes(n) && !have.has(n) && PARAM_KEY_RE.test(n));
      fresh.forEach((n) => rows.push({ key: n, label: n.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), type: 'string', required: false, def: '', optionsText: '', keyTouched: true }));
      note = fresh.length ? `Added ${fresh.length} param${fresh.length === 1 ? '' : 's'}: ${fresh.join(', ')}.` : 'Every placeholder in use is already declared.';
      render();
      changed();
      return fresh.length;
    }

    mount.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pe]');
      if (!btn || btn.dataset.pe === 'note') return;
      if (btn.dataset.pe === 'add') {
        if (rows.length >= 30) { note = 'A source can have at most 30 params.'; render(); return; }
        rows.push({ key: '', label: '', type: 'string', required: false, def: '', optionsText: '', keyTouched: false });
        note = '';
        render();
        const last = mount.querySelectorAll('.rpt-param');
        last[last.length - 1]?.querySelector('[data-k="key"]')?.focus();
        changed();
      } else if (btn.dataset.pe === 'remove') {
        const i = Number(btn.closest('.rpt-param').dataset.i);
        rows.splice(i, 1);
        note = '';
        render();
        changed();
      } else if (btn.dataset.pe === 'detect') {
        addMissing();
      }
    });

    function onEdit(e) {
      const el = e.target.closest('[data-k]');
      if (!el) return;
      const card = el.closest('.rpt-param');
      const r = rows[Number(card.dataset.i)];
      if (!r) return;
      const k = el.dataset.k;
      if (k === 'required') r.required = el.checked;
      else if (k === 'key') { r.key = el.value; r.keyTouched = true; }
      else if (k === 'label') {
        r.label = el.value;
        if (!r.keyTouched) { r.key = slugify(r.label, 60); card.querySelector('[data-k="key"]').value = r.key; }
      } else r[k] = el.value;
      if (k === 'type') card.querySelector('[data-opt]').hidden = r.type !== 'select';
      if (k === 'type' || k === 'key' || k === 'label') card.querySelector('[data-hint]').innerHTML = hintFor(r);
      changed();
    }
    mount.addEventListener('input', onEdit);
    mount.addEventListener('change', onEdit);

    render();
    return {
      getValue,
      declaredKeys,
      addMissing,
      rowCount: () => rows.length,
      isDirty: () => JSON.stringify(serialize()) !== initial,
    };
  }

  // ---- Page bootstrap ----------------------------------------------------------
  /**
   * Common start-up for every Reports page: auth guard, then a single cheap
   * list call (per_page=1) to prove the gateway, ms_reports and the user's
   * permission all work, and to fill the "registered" stat.
   *
   *   Reports.bootPage({ listPath, listKey, noun, mount })
   *     listPath : API.<x>.list
   *     noun     : 'API sources' | 'widgets' | 'dashboards' (for messages)
   *     mount    : element id of the main card body to fill with the state
   *
   * Resolves { me, total } on success, or null when the page can't load
   * (the reason is already painted into the page).
   */
  async function bootPage({ listPath, noun, mount, statEl = 'rptStatTotal' }) {
    const me = await Admin.requireAuth();
    const box = document.getElementById(mount);
    if (box) box.innerHTML = stateHtml('loading', `Loading ${noun}\u2026`);
    try {
      const res = await Admin.api.get(listPath + Admin.qs({ per_page: 1 }));
      const total = (res.meta && res.meta.pagination && res.meta.pagination.total) || 0;
      const stat = document.getElementById(statEl);
      if (stat) stat.textContent = fmtNumber(total);
      return { me, total };
    } catch (err) {
      const st = errorState(err);
      if (box) box.innerHTML = stateHtml(st.kind, st.message, st.hint);
      const stat = document.getElementById(statEl);
      if (stat) stat.textContent = '—';
      return null;
    }
  }


  // ---- Access (RBAC hints) ----------------------------------------------------------
  // UI convenience ONLY: the API enforces requirePermission() on every route. This just hides buttons the user could not use.
  //   SUPERADMIN            -> everything (the server bypasses grants for it too)
  //   GET /auth/my-permissions -> the caller's allowed { resourceName, permissionCode } grants
  //   endpoint missing / failing -> FAIL OPEN (buttons stay visible; the API still answers 403)
  const access = (function () {
    let grants = null;      // Set of "resource:code", or null = unknown (fail open)
    let superadmin = false;
    let loaded = null;

    function load() {
      if (loaded) return loaded;
      loaded = (async () => {
        const me = Admin.getMe();
        if (me && me.usertype && me.usertype.code === 'SUPERADMIN') { superadmin = true; return; }
        try {
          const res = await Admin.api.get('/auth/my-permissions');
          const d = res.data || {};
          if (d.isSuperadmin) { superadmin = true; return; }
          grants = new Set((d.grants || []).map((g) => `${g.resourceName}:${g.permissionCode}`));
        } catch (e) {
          grants = null;
          if (window.console && console.info) console.info('[reports] could not read my-permissions; showing all actions (the API still enforces).');
        }
      })();
      return loaded;
    }
    /** can('report-widgets', 'edit') -> boolean (true while unknown). */
    const can = (resource, action) => superadmin || grants === null || grants.has(`${resource}:${action}`);

    /** Loads grants, then sets html classes rpt-no-create / rpt-no-edit / rpt-no-delete that the stylesheet uses to hide the matching buttons. */
    async function apply(resource) {
      await load();
      const root = document.documentElement;
      ['create', 'edit', 'delete'].forEach((a) => root.classList.toggle(`rpt-no-${a}`, !can(resource, a)));
      return { create: can(resource, 'create'), edit: can(resource, 'edit'), delete: can(resource, 'delete') };
    }
    return { load, can, apply };
  })();

  // ---- Pinned dashboard (per user, per browser) ---------------------------------------
  // Stored in localStorage only (no API change). Cleared storage / another browser = nothing pinned.
  const pinned = (function () {
    const key = () => { const me = Admin.getMe(); return `rpt_pinned_dashboard:${(me && (me.id !== undefined ? me.id : me.username)) || 'anon'}`; };
    return {
      get() { try { return localStorage.getItem(key()) || ''; } catch (e) { return ''; } },
      set(code) { try { localStorage.setItem(key(), String(code)); return true; } catch (e) { return false; } },
      clear() { try { localStorage.removeItem(key()); } catch (e) { /* ignore */ } },
    };
  })();

  return {
    API, HTTP_METHODS, AUTH_TYPES, PARAM_TYPES, FIELD_TYPES, FIELD_ROLES, AGGREGATIONS, FIELD_USES, CHART_TYPES,
    chartMeta, chartLabel, chartIcon, labelOf,
    isCode, slugify, parseJsonInput, prettyJson, fmtNumber, fmtMs, fmtBytes, truncate, optionsHtml,
    BUILTIN_TOKENS, findPlaceholders, formErrorsHtml, pagerHtml, renderPager, paramsEditor, optionsToText, textToOptions,
    activeBadge, internalBadge, stateHtml, errorState, bootPage, access, pinned,
  };
})();
