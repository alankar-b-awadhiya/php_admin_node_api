<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Dashboards';
$activeNav = 'report-dashboards';
$pageScriptsBefore = ['vendor/chart.umd.js', 'js/reports-common.js', 'js/reports-render.js', 'js/report-dashboard-builder.js'];
$pageScript = 'report-dashboards.js';
include __DIR__ . '/../app/includes/header.php';
?>

<!-- ============================ LIST VIEW ============================ -->
<div id="dashListView" hidden>
  <div class="page-header">
    <div>
      <h2>Report Dashboards</h2>
      <p class="subtitle">Arrange widgets on a grid, add filters, and load everything with a single call.</p>
    </div>
    <div class="toolbar">
      <button class="btn btn-primary" id="btnNewDashboard" type="button" hidden>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        New Dashboard
      </button>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-label">Dashboards</div>
      <div class="stat-value" id="rptStatTotal">&hellip;</div>
      <div class="stat-hint">Saved dashboards</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
      <div class="form-group search-field" style="margin-bottom:0;flex:1;min-width:220px;">
        <label for="dashSearch">Search</label>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="top:63%;"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <input type="search" id="dashSearch" placeholder="Search title, code or description...">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label for="dashStatus">Status</label>
        <select id="dashStatus">
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <button class="btn-square" id="btnRefresh" type="button" title="Refresh">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-header-lead">
        <span class="card-header-icon">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 17V3h2v12h12v2H3Zm4-3V9h2.5v5H7Zm4 0V5h2.5v9H11Zm4 0v-3.5h2.5V14H15Z"/></svg>
        </span>
        <h3>Dashboards</h3>
      </div>
      <span class="count-pill" id="dashCount">0 dashboards</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Dashboard</th>
            <th>Widgets</th>
            <th>Filters</th>
            <th>Updated</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody id="dashTableBody"></tbody>
      </table>
    </div>
    <div class="pagination" id="dashPagination"></div>
  </div>
</div>

<!-- ============================ VIEWER ============================ -->
<div id="dashViewerView" hidden>
  <div class="page-header">
    <div style="min-width:0;">
      <a href="report-dashboards.php" class="rpt-link" style="font-size:12.5px;">&larr; All dashboards</a>
      <h2 id="dvTitle" style="margin-top:4px;">Dashboard</h2>
      <p class="subtitle" id="dvSub"></p>
    </div>
    <div class="toolbar">
      <span class="rpt-hint" id="dvUpdated" style="margin:0 6px 0 0;"></span>
      <a class="btn btn-secondary" id="dvEdit" href="#" hidden>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3L13.5 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        Edit layout
      </a>
      <button class="btn btn-secondary" id="dvRefresh" type="button" disabled>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Refresh data
      </button>
    </div>
  </div>
  <div id="dvFilters" class="rpt-filterbar" hidden></div>
  <div id="dvBody"></div>
</div>

<!-- ============================ BUILDER (6C) ============================ -->
<div id="dashBuilderView" hidden>
  <div class="page-header">
    <div style="min-width:0;">
      <a href="report-dashboards.php" class="rpt-link" id="dbBack" style="font-size:12.5px;">&larr; Back to dashboard</a>
      <h2 id="dbTitle" style="margin-top:4px;">Edit layout</h2>
      <p class="subtitle" id="dbSub"></p>
    </div>
    <div class="toolbar">
      <span class="rpt-hint" id="dbDirty" style="margin:0 6px 0 0;color:var(--amber);" hidden>Unsaved changes</span>
      <button class="btn btn-secondary" id="dbSaveView" type="button" disabled>Save &amp; view</button>
      <button class="btn btn-primary" id="dbSave" type="button" disabled>Save layout</button>
    </div>
  </div>
  <div id="dbBody"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
