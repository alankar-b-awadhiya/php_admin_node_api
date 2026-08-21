<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Log Settings';
$activeNav = 'system-logs';
$pageScript = 'log-settings.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Log Settings</h2>
    <p class="subtitle">Toggle and tune logging behavior at runtime — no redeploy needed</p>
  </div>
  <div class="toolbar" id="logSettingsToolbar">
    <a class="btn btn-secondary" href="logs.php">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M12.5 4.5 6 10l6.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Back to Logs
    </a>
    <span class="badge-outline" id="dirtyIndicator" style="display:none;">Unsaved changes</span>
    <button class="btn btn-secondary" id="btnTestAlert" type="button">Send Test Alert</button>
    <button class="btn btn-primary" id="btnSaveAll" type="button" disabled>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 10v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5M10 12V3M6.5 6.5 10 3l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Save All Changes
    </button>
  </div>
</div>

<div id="logSettingsGroups">
  <div class="card"><div class="table-empty">Loading settings…</div></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
