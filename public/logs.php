<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'System Logs';
$activeNav = 'system-logs';
$pageScript = 'logs.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>System Logs</h2>
    <p class="subtitle">Errors, requests, auth, suspicious activity and more — across the whole platform</p>
  </div>
  <div class="toolbar">
    <button class="btn-square" id="btnRefreshLogs" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
    <button class="btn btn-secondary" id="btnExportCsv" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6.5 9.5 10 13l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      Export CSV
    </button>
    <a class="btn btn-secondary" href="log-settings.php">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 6.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" stroke="currentColor" stroke-width="1.3"/><path d="M17.4 10c0 .4 0 .8-.1 1.1l1.6 1.3-1.6 2.7-1.9-.6c-.6.5-1.3.9-2 1.1L13 18h-3l-.4-2.3c-.7-.2-1.4-.6-2-1.1l-1.9.6-1.6-2.7 1.6-1.3a6 6 0 0 1 0-2.2L4.1 7.7l1.6-2.7 1.9.6c.6-.5 1.3-.9 2-1.1L10 2h3l.4 2.3c.7.2 1.4.6 2 1.1l1.9-.6 1.6 2.7-1.6 1.3c.1.3.1.7.1 1.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
      Log Settings
    </a>
  </div>
</div>

<div class="tabs" id="logsTabs"></div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;" id="logsFilterBar">
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h14v10H3V3Zm-1 12h16v2H2v-2ZM8 6h4v1H8V6Z"/></svg>
      </span>
      <h3 id="logsTableTitle">Logs</h3>
    </div>
    <span class="count-pill" id="logsCount">0 rows</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead id="logsTableHead"></thead>
      <tbody id="logsTableBody">
        <tr><td class="table-empty">Loading…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="logsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
