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
 *                                                          (data.kind = cartesian | pie | kpi | table | scatter | gauge)
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
 *     xTitle      'Month'   title of the category axis            (cartesian; "x" = categories even for horizontal bars)
 *     yTitle      'Revenue' title of the value axis               (cartesian)
 *     yMin, yMax  numbers   bounds of the (left) value axis       (cartesian; yMin set => no forced zero)
 *     dataLabels  true      print the value on bars / line points / pie slices
 *     height      px        fixed chart height 120-1200 (a dashboard grid_h row count is the default)
 *     sliceColors { "North": "#1a9c6b" }   pie / donut: color by slice label
 *     palette     ["#1a9c6b", "#e5484d"]   pie / donut: colors in slice order (used where sliceColors has no entry)
 *     gaugeMin, gaugeMax  numbers   gauge dial range (default 0..100; the server already clips the bands to it)
 *     gaugeBands  [{ to, color }]   gauge: color of the band the value falls in (the server sends them ready as data.bands)
 *     scatter also uses xTitle / yTitle (default: the field labels), yMin / yMax, legend and height
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

  const optNum = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? undefined : Number(v));
  const optHeight = (wopts) => { const h = optNum(wopts && wopts.height); return h && h >= 120 && h <= 1200 ? h : 0; };
  const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const safeColor = (c) => (typeof c === 'string' && HEX_RE.test(c.trim()) ? c.trim() : null);

  /** Chart.js has no built-in data labels; this tiny inline plugin prints values on bars, line points and slices. */
  function labelsPlugin(th, { stacked = false, horizontal = false, fallbackFmt = 'compact' } = {}) {
    return {
      id: 'rptLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px system-ui, -apple-system, Segoe UI, sans-serif';
        const total = chart.data.datasets.reduce((n, ds) => n + (ds.data ? ds.data.length : 0), 0);
        if (total > 60) { ctx.restore(); return; } // too dense to stay readable
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((el, i) => {
            const v = ds.data[i];
            if (v === null || v === undefined || v === '') return;
            const text = formatValue(v, ds._fmt || fallbackFmt, ds._dt);
            if (meta.type === 'bar') {
              const pr = el.getProps(['x', 'y', 'base'], true);
              ctx.textBaseline = 'middle';
              if (stacked) {
                const size = horizontal ? Math.abs(pr.x - pr.base) : Math.abs(pr.base - pr.y);
                if (size < 18) return;
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.fillText(text, horizontal ? (pr.x + pr.base) / 2 : pr.x, horizontal ? pr.y : (pr.y + pr.base) / 2);
              } else if (horizontal) {
                ctx.fillStyle = th.text; ctx.textAlign = 'left';
                ctx.fillText(text, pr.x + 5, pr.y);
              } else {
                ctx.fillStyle = th.text; ctx.textAlign = 'center';
                ctx.fillText(text, pr.x, pr.y - 9);
              }
            } else if (meta.type === 'line') {
              const pr = el.getProps(['x', 'y'], true);
              ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(text, pr.x, pr.y - 11);
            } else if (meta.type === 'doughnut' || meta.type === 'pie') {
              const pr = el.getProps(['startAngle', 'endAngle'], true);
              if (pr.endAngle - pr.startAngle < 0.3) return; // slice too thin for a label
              const c = el.getCenterPoint();
              ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(text, c.x, c.y);
            }
          });
        });
        ctx.restore();
      },
    };
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
    if (d.kind === 'scatter') return !d.series.length || d.series.every((s) => !s.points.length);
    if (d.kind === 'gauge') return d.value === null || d.value === undefined;
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
    const yMin = optNum(wopts.yMin);
    const yMax = optNum(wopts.yMax);
    const axisTitle = (text) => (text ? { display: true, text: String(text).slice(0, 80), color: th.muted, font: { size: 12, weight: '600' } } : { display: false });
    const valueAxis = (series, pos, showGrid, primary) => {
      const ax = {
        position: pos,
        beginAtZero: !(primary && yMin !== undefined),
        stacked,
        grid: showGrid ? grid : { drawOnChartArea: false, color: th.line },
        ticks: { color: th.muted, callback: axisFmt(series) },
        border: { display: false },
        title: axisTitle(primary ? wopts.yTitle : ''),
      };
      if (primary && yMin !== undefined) ax.min = yMin;
      if (primary && yMax !== undefined) ax.max = yMax;
      return ax;
    };
    const catAxis = { stacked, grid: { display: false }, ticks: { color: th.muted, autoSkip: true, maxRotation: 45 }, border: { color: th.line }, title: axisTitle(wopts.xTitle) };

    // indexAxis 'y' (horizontal bars): the category scale is `y`, the value scale is `x`.
    const scales = horizontal
      ? { y: { ...catAxis, position: 'left' }, x: valueAxis(leftSeries, 'bottom', true, true) }
      : { x: catAxis, y: valueAxis(leftSeries, 'left', true, true) };
    if (anyRight && !horizontal) scales.y1 = valueAxis(rightSeries, 'right', false, false);

    const legendPos = wopts.legend && wopts.legend !== 'none' ? wopts.legend : 'top';
    const showLegend = wopts.legend ? wopts.legend !== 'none' : d.series.length > 1;

    const canvas = mountCanvas(body, { ...opts, height: opts.height || optHeight(wopts) });
    if (d.droppedSeries) {
      const note = document.createElement('div');
      note.className = 'rpt-hint';
      note.textContent = `Showing the first ${d.series.length} series; ${d.droppedSeries} more were left out.`;
      body.appendChild(note);
    }
    el._rpt.chart = new Chart(canvas, {
      type: anyBar ? 'bar' : 'line',
      data: { labels, datasets },
      plugins: wopts.dataLabels ? [labelsPlugin(th, { stacked, horizontal })] : [],
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
    const canvas = mountCanvas(body, { ...opts, height: opts.height || optHeight(wopts) });
    const byLabel = wopts.sliceColors && typeof wopts.sliceColors === 'object' ? wopts.sliceColors : {};
    const ordered = Array.isArray(wopts.palette) ? wopts.palette : [];
    const sliceColor = (item, i) => safeColor(byLabel[item.label]) || safeColor(ordered[i]) || colorAt(th, i);
    el._rpt.chart = new Chart(canvas, {
      type: donut ? 'doughnut' : 'pie',
      plugins: wopts.dataLabels ? [labelsPlugin(th, { fallbackFmt: d.valueFormat || 'compact' })] : [],
      data: {
        labels: d.items.map((i) => i.label),
        datasets: [{
          data: d.items.map((i) => i.value),
          _fmt: d.valueFormat,
          _dt: d.dataType,
          backgroundColor: d.items.map(sliceColor),
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

  // ---- scatter ---------------------------------------------------------------------------
  function drawScatter(el, body, p, opts, th) {
    const d = p.data;
    const wopts = (p.widget && p.widget.options) || {};
    const xIsTime = d.xAxis && (d.xAxis.dataType === 'date' || d.xAxis.dataType === 'datetime');
    const total = d.series.reduce((n, s) => n + s.points.length, 0);
    const fmtX = (v) => (xIsTime ? formatValue(new Date(Number(v)).toISOString(), d.xAxis.format, d.xAxis.dataType) : formatValue(v, d.xAxis.format || 'compact', d.xAxis.dataType));
    const fmtY = (v) => formatValue(v, d.yAxis.format || 'compact', d.yAxis.dataType);
    const notes = [];
    if (d.skippedRows) notes.push(`${d.skippedRows} row${d.skippedRows === 1 ? ' was' : 's were'} left out (the x or y value is not a number).`);
    if (d.droppedPoints) notes.push(`${d.droppedPoints} point${d.droppedPoints === 1 ? ' was' : 's were'} left out (limit reached).`);
    if (notes.length) {
      const note = document.createElement('div');
      note.className = 'rpt-hint';
      note.textContent = notes.join(' ');
      body.appendChild(note);
    }
    const canvas = mountCanvas(body, { ...opts, height: opts.height || optHeight(wopts) });
    const yMin = optNum(wopts.yMin);
    const yMax = optNum(wopts.yMax);
    const title = (text) => (text ? { display: true, text: String(text).slice(0, 80), color: th.muted, font: { size: 12, weight: '600' } } : { display: false });
    const showLegend = wopts.legend ? wopts.legend !== 'none' : d.series.length > 1;
    const legendPos = wopts.legend && wopts.legend !== 'none' ? wopts.legend : 'top';
    el._rpt.chart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: d.series.map((s, i) => {
          const color = s.color || colorAt(th, i);
          return { label: s.name, data: s.points, backgroundColor: withAlpha(color, 0.7), borderColor: color, pointRadius: total > 300 ? 3 : 5, pointHoverRadius: 7 };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: opts.animate === false ? false : { duration: 350 },
        scales: {
          x: { type: 'linear', grid: { color: th.line }, ticks: { color: th.muted, callback: fmtX, maxTicksLimit: 8 }, border: { color: th.line }, title: title(wopts.xTitle || d.xAxis.label) },
          y: {
            beginAtZero: false, grid: { color: th.line }, ticks: { color: th.muted, callback: fmtY }, border: { display: false }, title: title(wopts.yTitle || d.yAxis.label),
            ...(yMin !== undefined ? { min: yMin } : {}), ...(yMax !== undefined ? { max: yMax } : {}),
          },
        },
        plugins: {
          legend: legendCfg(legendPos, th, showLegend),
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = ctx.raw || {};
                const text = `${fmtX(r.x)}, ${fmtY(r.y)}`;
                return r.label ? ` ${r.label} (${text})` : ` ${ctx.dataset.label}: ${text}`;
              },
            },
          },
        },
      },
    });
  }

  // ---- gauge -----------------------------------------------------------------------------
  function drawGauge(el, body, p, opts, th) {
    const d = p.data;
    const wopts = (p.widget && p.widget.options) || {};
    const span = d.max - d.min || 1;
    const value = Number(d.value);
    const pct = Math.max(0, Math.min(1, (value - d.min) / span));
    const band = (d.bands || []).find((b) => value <= b.to) || (value > d.max && d.bands && d.bands.length ? d.bands[d.bands.length - 1] : null);
    const fill = safeColor(band && band.color) || th.palette[0];
    const canvas = mountCanvas(body, { ...opts, height: opts.height || optHeight(wopts) });
    const plugin = {
      id: 'rptGaugeText',
      afterDatasetsDraw(chart) {
        const arc = chart.getDatasetMeta(0).data[0];
        if (!arc) return;
        const { x, y, innerRadius: ir, outerRadius: or } = arc.getProps(['x', 'y', 'innerRadius', 'outerRadius'], true);
        const ctx = chart.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = th.text;
        ctx.textBaseline = 'alphabetic';
        const big = Math.max(18, Math.min(44, ir * 0.5));
        ctx.font = `700 ${big}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.fillText(formatValue(d.value, d.format, d.dataType), x, y - ir * 0.22);
        ctx.fillStyle = th.muted;
        ctx.font = '500 12px system-ui, -apple-system, Segoe UI, sans-serif';
        ctx.fillText(String(d.label || ''), x, y - ir * 0.22 - big - 6);
        ctx.font = '500 11px system-ui, -apple-system, Segoe UI, sans-serif';
        ctx.textBaseline = 'top';
        const mid = (or + ir) / 2;
        ctx.fillText(formatValue(d.min, 'compact', d.dataType), x - mid, y + 5);
        ctx.fillText(formatValue(d.max, 'compact', d.dataType), x + mid, y + 5);
        ctx.restore();
      },
    };
    el._rpt.chart = new Chart(canvas, {
      type: 'doughnut',
      plugins: [plugin],
      data: { labels: ['value', 'rest'], datasets: [{ data: [pct * span, (1 - pct) * span], backgroundColor: [fill, th.line], borderWidth: 0, borderRadius: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        rotation: -90,
        circumference: 180,
        cutout: '72%',
        layout: { padding: { bottom: 22, top: 6 } },
        animation: opts.animate === false ? false : { duration: 350 },
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
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
    if ((kind === 'cartesian' || kind === 'pie' || kind === 'scatter' || kind === 'gauge') && !window.Chart) {
      stateInto(body, 'error', 'The chart library did not load.', 'Reload the page; if it persists, check assets/vendor/chart.umd.js.');
      return;
    }
    const th = theme();
    setDefaults(th);
    try {
      if (kind === 'cartesian') drawCartesian(el, body, payload, opts, th);
      else if (kind === 'pie') drawPie(el, body, payload, opts, th);
      else if (kind === 'scatter') drawScatter(el, body, payload, opts, th);
      else if (kind === 'gauge') drawGauge(el, body, payload, opts, th);
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
