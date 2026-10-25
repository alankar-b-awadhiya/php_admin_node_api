/**
 * dashboard-pinned.js — "Pinned dashboard" card on the home page (dashboard.php). Reports step 7.
 *
 * Loaded before dashboard.js via $pageScriptsBefore; dashboard.js calls ReportsPinned.mount() once the user is known.
 *
 *   - The card stays hidden unless the user can list report dashboards (no access = no card, no error).
 *   - Which dashboard is pinned is stored on the server (Reports.pinned -> /report-dashboards/pin), so it follows the
 *     user to any browser; an editor can also pin one for everybody. localStorage is only a fallback. It can also be
 *     pinned from the viewer's "Pin to home" / "Pin for everyone" buttons.
 *   - The card draws the dashboard exactly like the viewer does: ONE GET /report-dashboards/:code/data call (filter
 *     defaults apply) and ReportsRender.renderWidget per widget. A required filter that has no default answers 422;
 *     the card then says so and links to the full dashboard, where the filters can be chosen.
 */
const ReportsPinned = (function () {
  const esc = Admin.escapeHtml;
  const API = Reports.API.dashboards;
  const $ = (id) => document.getElementById(id);
  const frames = [];

  function releaseAll() { frames.splice(0).forEach((c) => ReportsRender.release(c)); }

  function drawDashboard(body, d) {
    releaseAll();
    const widgets = d.widgets || [];
    if (!widgets.length) { body.innerHTML = Reports.stateHtml('empty', 'This dashboard has no widgets yet.'); return; }
    body.innerHTML = '<div class="rpt-grid"></div>';
    const grid = body.firstChild;
    grid.style.setProperty('--rpt-cols', String((d.dashboard && d.dashboard.gridColumns) || 12));
    widgets.forEach((w) => {
      const cell = document.createElement('div');
      cell.className = 'rpt-cell';
      const g = w.grid || { x: 0, y: 0, w: 6, h: 4 };
      cell.style.gridColumn = `${g.x + 1} / span ${g.w}`;
      cell.style.gridRow = `${g.y + 1} / span ${g.h}`;
      cell.style.setProperty('--rpt-h', String(g.h));
      grid.appendChild(cell);
      frames.push(cell);
      if (w.ok) ReportsRender.renderWidget(cell, { widget: w.widget, data: w.data, meta: w.meta, messages: w.messages }, { title: w.title });
      else {
        const e = w.error || {};
        ReportsRender.renderWidget(cell, { error: { message: e.message, errors: e.errors || [], status: e.code === 'forbidden' ? 403 : undefined } }, { title: w.title });
      }
    });
  }

  async function mount() {
    const card = $('pinnedCard');
    if (!card) return;
    let list;
    try {
      list = ((await Admin.api.get(API.list + Admin.qs({ status: 'active', per_page: 100 }))).data || {}).dashboards || [];
    } catch (e) { return; } // no access / API down: leave the card hidden
    card.hidden = false;
    await Promise.all([Reports.pinned.load(), Reports.access.load()]);
    const canAll = () => Reports.access.can('report-dashboards', 'edit') && Reports.pinned.serverBacked();
    const title = $('pinnedTitle');
    const actions = $('pinnedActions');
    const body = $('pinnedBody');
    window.addEventListener('pagehide', releaseAll);

    function chooser(current) {
      body.innerHTML = list.length
        ? `<div class="rpt-add-row"><select id="pinnedPick" aria-label="Dashboard to pin">${Reports.optionsHtml(list.map((d) => ({ value: d.code, label: `${d.title} (${d.code})` })), current || '', { blank: 'Choose a dashboard…' })}</select>
             <button type="button" class="btn btn-primary" id="pinnedGo">Pin it</button></div>
           ${canAll() ? '<label class="rpt-check" style="margin-top:8px;"><input type="checkbox" id="pinnedAll"> Pin for everyone (users who pinned their own keep theirs)</label>' : ''}
           <div class="rpt-hint" style="margin-top:8px;">${Reports.pinned.serverBacked() ? 'Saved to your account, so it follows you to any browser.' : 'Remembered in this browser only.'}</div>`
        : Reports.stateHtml('empty', 'No active dashboards yet.', 'Create one under Reports → Dashboards.');
      const go = $('pinnedGo');
      if (go) go.addEventListener('click', async () => {
        const code = $('pinnedPick').value;
        if (!code) { Admin.toast('Choose a dashboard first.', 'error'); return; }
        const all = $('pinnedAll');
        await Reports.pinned.set(code, all && all.checked ? 'global' : 'user');
        paint();
      });
    }

    async function paint() {
      releaseAll();
      const code = Reports.pinned.get();
      const dash = list.find((d) => d.code === code);
      if (!code) { title.textContent = 'Pinned dashboard'; actions.innerHTML = ''; chooser(''); return; }
      if (!dash) {
        title.textContent = 'Pinned dashboard';
        actions.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" id="pinnedUnpin">Unpin</button>';
        body.innerHTML = Reports.stateHtml('error', `The pinned dashboard “${code}” is switched off or no longer exists.`);
        $('pinnedUnpin').addEventListener('click', async () => { await Reports.pinned.clear(Reports.pinned.isGlobal() ? 'global' : 'user'); paint(); });
        return;
      }
      title.textContent = dash.title + (Reports.pinned.isGlobal() ? ' · pinned for everyone' : '');
      actions.innerHTML = `<a class="btn btn-secondary btn-sm" href="report-dashboards.php${Admin.qs({ _d: code })}">Open</a>
        <button type="button" class="btn btn-ghost btn-sm" id="pinnedChange">Change</button>
        ${Reports.pinned.isGlobal() && !canAll() ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="pinnedUnpin">Unpin</button>'}`;
      $('pinnedChange').addEventListener('click', () => { actions.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" id="pinnedCancel">Cancel</button>'; chooser(code); $('pinnedCancel').addEventListener('click', paint); });
      const un = $('pinnedUnpin');
      if (un) un.addEventListener('click', async () => { await Reports.pinned.clear(Reports.pinned.isGlobal() ? 'global' : 'user'); paint(); });
      body.innerHTML = Reports.stateHtml('loading', 'Loading dashboard…');
      try {
        const res = await Admin.api.get(API.data(code));
        if (Reports.pinned.get() !== code) return; // changed while loading
        drawDashboard(body, res.data);
      } catch (err) {
        if (Reports.pinned.get() !== code) return;
        if (err && err.status === 422) body.innerHTML = Reports.stateHtml('empty', 'This dashboard needs a filter value before it can load.', 'Open it to choose the filters.');
        else { const st = Reports.errorState(err); body.innerHTML = Reports.stateHtml(st.kind, st.message, st.hint); }
      }
    }
    paint();
  }

  return { mount };
})();
