/**
 * reports-render.js — the ONE chart renderer shared by the widget builder (live
 * preview) and the dashboard viewer. Step 5 of the Reports plan.
 *
 * Load order (page .php): vendor/chart.umd.js, js/reports-common.js, js/reports-render.js
 *
 *   ReportsRender.renderWidget(el, payload, opts)
 *
 *   el       the widget frame. It gets class `rpt-widget` and is filled with a header
 *            (title / subtitle) and a body. Calling it again re-renders in place and
 *            destroys the previous Chart.js instance (no leaks).
 *
 *   payload  one of
 *     { loading: true, message? }                       -> spinner
 *     { error: err }                                    -> error state; err.status 403 -> "forbidden" state
 *     { widget, data, meta, messages }                  -> exactly what GET /report-widgets/:ref/data
 *                                                          and POST /report-widgets/preview return in `data`
 *                                                          (data.kind = cartesian | pie | kpi | table)
 *     { empty: true, message?, hint? }                  -> empty state
 *
 *   opts     { title, subtitle   fallback header while loading / on error
 *              showHeader=true   draw the header
 *              height            chart height in px (default: fills the frame, min 220)
 *              animate=true      Chart.js animation (builder preview turns it off)
 *              onRetry           () => void   shows a Retry button on error states }
 *
 *   widget.options (all optional, stored on the widget):
 *     legend      'top' | 'bottom' | 'right' | 'none'   (default: shown when more than one series / any pie)
 *     smooth      true    smooth line / area curves
 *     horizontal  true    bar / stacked_bar drawn sideways
 *
 * Colors come from the theme panel's CSS variables (--primary, --secondary, --green, ...),
 * read on every render. Changing the theme re-renders every widget drawn so far.
 */
const ReportsRender = (function () {
  const esc = Admin.escapeHtml;

  // ---- Theme ----------------------------------------------------------------------
  const FALLBACK = { primary: '#4f5dff', secondary: '#7c3aed', green: '#1a9c6b', amber: '#e8a33d', sky: '#0c6690', coral: '#e5484d', text: '#1c2130', muted: '#667085', line: '#e4e7ee', paper: '#ffffff' };

  function theme() {
    const cs = window.getComputedStyle(document.documentElement);
    const v = (name, key) => (cs.getPropertyValue(name) || '').trim() || FALLBACK[key];
    return {
      palette: [v('--primary', 'primary'), v('--secondary', 'secondary'), v('--green', 'green'), v('--amber', 'amber'), v('--sky', 'sky'), v('--coral', 'coral')],
      text: v('--text', 'text'),
      muted: v('--text-muted', 'muted'),
      line: v('--line', 'line'),
      paper: v('--paper', 'paper'),
    };
  }

  /** i-th series / slice color: the six theme colors, then golden-angle hues so a 30-series chart stays readable. */
  function colorAt(th, i) {
    if (i < th.palette.length) return th.palette[i];
    return `hsl(${Math.round((i * 137.508) % 360)}, 55%, 52%)`;
  }

  function withAlpha(color, a) {
    const c = String(color || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(c);
    if (m) { const h = m[1]; return `rgba(${parseInt(h[0] + h[0], 16)},${parseInt(h[1] + h[1], 16)},${parseInt(h[2] + h[2], 16)},${a})`; }
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
    if (m) { const h = m[1]; return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; }
    m = /^hsl\((.+)\)$/i.exec(c);
    if (m) return `hsla(${m[1]}, ${a})`;
    return c;
  }

  // ---- Value formatting -----------------------------------------------------------
  // display_format is free text on a field. Understood (case-insensitive):
  //   currency | inr | usd | eur     money        percent | %    adds a % sign (value is NOT multiplied)
  //   compact                         1.2K / 3.4M   int | integer | 0   no decimals
  //   0.0 / 0.00 / dec2               fixed decimals
  //   date | datetime | time          dates
  //   "{v} kg"                        any text containing {v}
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const asNumber = (v) => {
    if (isNum(v)) return v;
    if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    return null;
  };

  function fmtDate(v, kind) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    if (kind === 'time') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (kind === 'datetime') return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatValue(value, format, dataType) {
    if (value === null || value === undefined || value === '') return '—';
    const fmt = String(format || '').trim();
    const f = fmt.toLowerCase();

    if (fmt.includes('{v}')) return fmt.replace(/\{v\}/g, formatValue(value, '', dataType));

    if (f === 'date' || f === 'datetime' || f === 'time') return fmtDate(value, f);
    if ((dataType === 'date' || dataType === 'datetime') && !f && typeof value === 'string') return fmtDate(value, dataType);
    if (dataType === 'boolean' || typeof value === 'boolean') return value === true || value === 1 || value === 'true' ? 'Yes' : 'No';

    const n = asNumber(value);
    if (n === null) return String(value);

    const money = (cur) => { try { return n.toLocaleString(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }); } catch (e) { return String(n); } };
    if (f === 'currency' || f === 'inr') return money('INR');
    if (f === 'usd') return money('USD');
    if (f === 'eur') return money('EUR');
    if (f === 'percent' || f === '%') return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    if (f === 'compact') return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    if (f === 'int' || f === 'integer' || f === '0') return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    let m = /^0\.(0+)$/.exec(f) || /^dec(?:imal)?(\d)$/.exec(f);
    if (m) {
      const dp = m[1].length > 1 || /^0+$/.test(m[1]) ? m[1].length : Number(m[1]);
      return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
    }
    if (!f) {
      if (dataType === 'currency') return money('INR');
      if (dataType === 'percent') return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    }
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  // ---- Frame ---------------------------------------------------------------------
  const registry = new Set(); // frames drawn so far, for theme refresh

  function destroy(el) {
    if (el && el._rpt && el._rpt.chart) {
      try { el._rpt.chart.destroy(); } catch (e) { /* already gone */ }
      el._rpt.chart = null;
    }
  }

  function headHtml(title, subtitle, extra) {
    if (!title && !subtitle && !extra) return '';
    return `<div class="rpt-widget-head">
      <div style="min-width:0;"><div class="rpt-widget-title">${esc(title || '')}</div>${subtitle ? `<div class="rpt-widget-sub">${esc(subtitle)}</div>` : ''}</div>
      ${extra ? `<div class="rpt-widget-sub" style="white-space:nowrap;">${extra}</div>` : ''}
    </div>`;
  }

  function frame(el, opts, w, extra) {
    el.classList.add('rpt-widget');
    const title = w && w.title ? w.title : opts.title;
    const subtitle = w && w.subtitle ? w.subtitle : opts.subtitle;
    const head = opts.showHeader === false ? '' : headHtml(title, subtitle, extra);
    el.innerHTML = `${head}<div class="rpt-widget-body"></div>`;
    return el.querySelector('.rpt-widget-body');
  }

  function stateInto(body, kind, message, hint, onRetry) {
    body.innerHTML = Reports.stateHtml(kind, message, hint);
    if (kind === 'error' && typeof onRetry === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = 'Retry';
      btn.addEventListener('click', onRetry);
      body.querySelector('.rpt-state').appendChild(btn);
    }
  }

  function errorParts(err) {
    if (err && err.status === 403) return { kind: 'forbidden', message: 'You don’t have access to this data.', hint: 'Ask an admin to grant you access to the underlying report data.' };
    const list = err && Array.isArray(err.errors) ? err.errors.filter((e) => typeof e === 'string' && !/^reason:/i.test(e)) : [];
    return { kind: 'error', message: (err && err.message) || 'Unable to load this widget.', hint: list.length ? list.slice(0, 2).join(' · ') : '' };
  }

  // ---- Empty detection -------------------------------------------------------------
  function isEmpty(d) {
    if (!d) return true;
    if (d.kind === 'cartesian') return !d.labels.length || !d.series.length || d.series.every((s) => s.values.every((v) => v === null || v === undefined));
    if (d.kind === 'pie') return !d.items.length;
    if (d.kind === 'kpi') return d.value === null || d.value === undefined;
    if (d.kind === 'table') return !d.rows.length;
    return false;
  }

  // ---- Chart.js bits ---------------------------------------------------------------
  let defaultsSet = false;
  function setDefaults(th) {
    if (defaultsSet || !window.Chart) return;
    defaultsSet = true;
    try {
      Chart.defaults.font.family = window.getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
      Chart.defaults.font.size = 12;
    } catch (e) { /* cosmetic only */ }
  }

  function legendCfg(pos, th, show) {
    if (!show || pos === 'none') return { display: false };
    return { display: true, position: pos, labels: { color: th.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 } };
  }

  function mountCanvas(body, opts) {
    const box = document.createElement('div');
    box.className = 'rpt-chart-box';
    if (opts.height) box.style.height = `${opts.height}px`;
    const canvas = document.createElement('canvas');
    box.appendChild(canvas);
    body.innerHTML = '';
    body.appendChild(box);
    return canvas;
  }

  function drawCartesian(el, body, p, opts, th) {
    const d = p.data;
    const wopts = (p.widget && p.widget.options) || {};
    const chartType = p.widget && p.widget.chartType;
    const stacked = chartType === 'stacked_bar';
    const horizontal = !!wopts.horizontal && (chartType === 'bar' || stacked);
    const anyRight = d.series.some((s) => s.yAxis === 'right');
    const anyBar = d.series.some((s) => s.type === 'bar');
    const leftSeries = d.series.find((s) => s.yAxis !== 'right') || d.series[0];
    const rightSeries = d.series.find((s) => s.yAxis === 'right');
    const xIsDate = d.xAxis && (d.xAxis.dataType === 'date' || d.xAxis.dataType === 'datetime');
    const labels = d.labels.map((l) => (d.xAxis && (d.xAxis.format || xIsDate) ? formatValue(l, d.xAxis.format, d.xAxis.dataType) : l));

    const datasets = d.series.map((s, i) => {
      const color = s.color || colorAt(th, i);
      const isLine = s.type === 'line' || s.type === 'area';
      const ds = {
        type: s.type === 'area' ? 'line' : s.type,
        label: s.name,
        data: s.values,
        borderColor: color,
        backgroundColor: isLine ? (s.type === 'area' ? withAlpha(color, 0.22) : color) : withAlpha(color, 0.85),
        yAxisID: s.yAxis === 'right' ? 'y1' : 'y',
        _fmt: s.format,
        _dt: s.dataType,
      };
      if (isLine) {
        ds.fill = s.type === 'area';
        ds.tension = wopts.smooth ? 0.35 : 0;
        ds.pointRadius = d.labels.length > 40 ? 0 : 3;
        ds.pointHoverRadius = 5;
        ds.borderWidth = 2;
        ds.spanGaps = true;
      } else {
        ds.borderRadius = 4;
        ds.maxBarThickness = 48;
        if (s.stack) ds.stack = s.stack;
      }
      return ds;
    });

    const axisFmt = (series) => (v) => formatValue(v, series && series.format ? series.format : 'compact', series && series.dataType);
    const grid = { color: th.line };
    const valueAxis = (series, pos, showGrid) => ({
      position: pos,
      beginAtZero: true,
      stacked,
      grid: showGrid ? grid : { drawOnChartArea: false, color: th.line },
      ticks: { color: th.muted, callback: axisFmt(series) },
      border: { display: false },
    });
    const catAxis = { stacked, grid: { display: false }, ticks: { color: th.muted, autoSkip: true, maxRotation: 45 }, border: { color: th.line } };

    // indexAxis 'y' (horizontal bars): the category scale is `y`, the value scale is `x`.
    const scales = horizontal
      ? { y: { ...catAxis, position: 'left' }, x: valueAxis(leftSeries, 'bottom', true) }
      : { x: catAxis, y: valueAxis(leftSeries, 'left', true) };
    if (anyRight && !horizontal) scales.y1 = valueAxis(rightSeries, 'right', false);

    const legendPos = wopts.legend && wopts.legend !== 'none' ? wopts.legend : 'top';
    const showLegend = wopts.legend ? wopts.legend !== 'none' : d.series.length > 1;

    const canvas = mountCanvas(body, opts);
    if (d.droppedSeries) {
      const note = document.createElement('div');
      note.className = 'rpt-hint';
      note.textContent = `Showing the first ${d.series.length} series; ${d.droppedSeries} more were left out.`;
      body.appendChild(note);
    }
    el._rpt.chart = new Chart(canvas, {
      type: anyBar ? 'bar' : 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: opts.animate === false ? false : { duration: 350 },
        indexAxis: horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false },
        scales,
        plugins: {
          legend: legendCfg(legendPos, th, showLegend),
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatValue(ctx.parsed[horizontal ? 'x' : 'y'], ctx.dataset._fmt, ctx.dataset._dt)}`,
            },
          },
        },
      },
    });
  }

  function drawPie(el, body, p, opts, th) {
    const d = p.data;
    const wopts = (p.widget && p.widget.options) || {};
    const donut = p.widget && p.widget.chartType === 'donut';
    const wide = (body.clientWidth || 480) > 420;
    const legendPos = wopts.legend && wopts.legend !== 'none' ? wopts.legend : (wide ? 'right' : 'bottom');
    const showLegend = wopts.legend ? wopts.legend !== 'none' : true;
    const canvas = mountCanvas(body, opts);
    el._rpt.chart = new Chart(canvas, {
      type: donut ? 'doughnut' : 'pie',
      data: {
        labels: d.items.map((i) => i.label),
        datasets: [{
          data: d.items.map((i) => i.value),
          backgroundColor: d.items.map((_, i) => colorAt(th, i)),
          borderColor: th.paper,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: donut ? '62%' : 0,
        animation: opts.animate === false ? false : { duration: 350 },
        plugins: {
          legend: legendCfg(legendPos, th, showLegend),
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = d.total || 0;
                const pct = total ? ` (${((ctx.parsed / total) * 100).toFixed(1)}%)` : '';
                return ` ${ctx.label}: ${formatValue(ctx.parsed, d.valueFormat, d.dataType)}${pct}`;
              },
            },
          },
        },
      },
    });
  }

  function drawKpi(body, p) {
    const d = p.data;
    body.innerHTML = `<div class="rpt-kpi"><div class="rpt-kpi-value">${esc(formatValue(d.value, d.format, d.dataType))}</div><div class="rpt-kpi-label">${esc(d.label || '')}</div></div>`;
  }

  function drawTable(body, p) {
    const d = p.data;
    const numeric = (c) => ['number', 'currency', 'percent'].includes(c.dataType);
    const head = d.columns.map((c) => `<th${numeric(c) ? ' style="text-align:right;"' : ''}>${esc(c.label)}</th>`).join('');
    const rows = d.rows.map((r) => `<tr>${d.columns.map((c) => `<td${numeric(c) ? ' style="text-align:right;white-space:nowrap;"' : ''}>${esc(formatValue(r[c.key], c.format, c.dataType))}</td>`).join('')}</tr>`).join('');
    const more = d.total > d.rows.length ? `<div class="rpt-hint" style="margin-top:8px;">Showing ${d.rows.length.toLocaleString()} of ${d.total.toLocaleString()} rows.</div>` : '';
    body.innerHTML = `<div class="table-wrap rpt-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>${more}`;
  }

  // ---- Public: renderWidget ----------------------------------------------------------
  function renderWidget(el, payload, opts) {
    opts = opts || {};
    payload = payload || {};
    destroy(el);
    el._rpt = { chart: null, payload, opts };
    registry.add(el);

    if (payload.loading) {
      const body = frame(el, opts, null);
      stateInto(body, 'loading', payload.message || opts.loadingMessage || 'Loading…');
      return;
    }
    if (payload.error) {
      const body = frame(el, opts, null);
      const e = errorParts(payload.error);
      stateInto(body, e.kind, e.message, e.hint, opts.onRetry);
      return;
    }
    if (payload.empty || !payload.data) {
      const body = frame(el, opts, payload.widget);
      stateInto(body, 'empty', payload.message || 'No data to show.', payload.hint);
      return;
    }

    const meta = payload.meta || {};
    const extra = meta.cached && meta.fetchedAt && opts.showHeader !== false
      ? `<span title="${esc(Admin.formatDate(meta.fetchedAt))}">cached ${esc(Admin.timeAgo(meta.fetchedAt))}</span>` : '';
    const body = frame(el, opts, payload.widget, extra);

    if (isEmpty(payload.data)) {
      stateInto(body, 'empty', 'No data for the current selection.', 'Try another filter or date range.');
      return;
    }
    const kind = payload.data.kind;
    if ((kind === 'cartesian' || kind === 'pie') && !window.Chart) {
      stateInto(body, 'error', 'The chart library did not load.', 'Reload the page; if it persists, check assets/vendor/chart.umd.js.');
      return;
    }
    const th = theme();
    setDefaults(th);
    try {
      if (kind === 'cartesian') drawCartesian(el, body, payload, opts, th);
      else if (kind === 'pie') drawPie(el, body, payload, opts, th);
      else if (kind === 'kpi') drawKpi(body, payload);
      else if (kind === 'table') drawTable(body, payload);
      else stateInto(body, 'error', `Unknown chart data (${kind || 'none'}).`);
    } catch (err) {
      destroy(el);
      stateInto(body, 'error', 'This widget could not be drawn.', err && err.message, opts.onRetry);
    }
  }

  /** Frees the chart of a frame that is about to be removed from the page. */
  function release(el) {
    destroy(el);
    registry.delete(el);
  }

  // ---- Theme changes: the theme panel sets CSS variables on <html> -----------------------
  let themeTimer = null;
  function redrawAll() {
    registry.forEach((el) => {
      if (!el.isConnected) { release(el); return; }
      const s = el._rpt;
      if (s && s.payload && s.payload.data && !s.payload.error && !s.payload.loading) renderWidget(el, s.payload, { ...s.opts, animate: false });
    });
  }
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { clearTimeout(themeTimer); themeTimer = setTimeout(redrawAll, 150); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  }

  return { renderWidget, release, formatValue, colorAt, theme };
})();
