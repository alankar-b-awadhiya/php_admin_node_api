<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'My Sessions';
$activeNav = 'sessions';
$pageScript = 'sessions.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>My Sessions</h2>
    <p class="subtitle">Devices and browsers currently signed in to your account.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-danger" id="btnLogoutAll">Sign out everywhere</button>
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Device / browser</th><th>IP address</th><th>Signed in</th><th>Expires</th><th></th></tr>
      </thead>
      <tbody id="sessionsTableBody">
        <tr><td colspan="5" class="table-empty">Loading sessions…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
