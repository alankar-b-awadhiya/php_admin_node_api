<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Widgets';
$activeNav = 'report-widgets';
$pageScriptsBefore = ['vendor/chart.umd.js', 'js/reports-common.js'];
$pageScript = 'report-widgets.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Report Widgets</h2>
    <p class="subtitle">A widget is one chart, KPI or table: pick a source, a chart type and map the response fields.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewWidget" type="button" hidden>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      New Widget
    </button>
  </div>
</div>

<div class="stat-grid">
  <div class="stat-card">
    <div class="stat-label">Widgets</div>
    <div class="stat-value" id="rptStatTotal">&hellip;</div>
    <div class="stat-hint">Charts, KPIs and tables</div>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3Zm8 0h6v3.5h-6V3Zm0 5h6v9h-6V8ZM3 11h6v6H3v-6Z"/></svg>
      </span>
      <h3>Widgets</h3>
    </div>
    <button class="btn-square" id="btnRefresh" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
  </div>
  <div class="card-body" id="rptMain"></div>
</div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>
