<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Dashboards';
$activeNav = 'report-dashboards';
$pageScriptsBefore = ['vendor/chart.umd.js', 'js/reports-common.js'];
$pageScript = 'report-dashboards.js';
include __DIR__ . '/../app/includes/header.php';
?>
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

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 17V3h2v12h12v2H3Zm4-3V9h2.5v5H7Zm4 0V5h2.5v9H11Zm4 0v-3.5h2.5V14H15Z"/></svg>
      </span>
      <h3>Dashboards</h3>
    </div>
    <button class="btn-square" id="btnRefresh" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
  </div>
  <div class="card-body" id="rptMain"></div>
</div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>
