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
      cache: (id) => `/report-sources/${id}/cache`,   // DELETE
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

  return {
    API, HTTP_METHODS, AUTH_TYPES, PARAM_TYPES, FIELD_TYPES, FIELD_ROLES, AGGREGATIONS, FIELD_USES, CHART_TYPES,
    chartMeta, chartLabel, chartIcon, labelOf,
    isCode, slugify, parseJsonInput, prettyJson, fmtNumber, fmtMs, optionsHtml,
    activeBadge, internalBadge, stateHtml, errorState, bootPage,
  };
})();
