<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Social Platforms';
$activeNav = 'social-platforms';
$pageScript = 'social-platforms.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Social Platforms</h2>
    <p class="subtitle">Platform catalog + OAuth app credentials used when connecting client accounts</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-success" id="btnAddPlatform" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Platform
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h14v10H3V3Zm-1 12h16v2H2v-2ZM8 6h4v1H8V6Z"/></svg>
      </span>
      <h3>Platforms</h3>
    </div>
    <span class="count-pill" id="platformsCount">0 platforms</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Platform</th>
          <th>Code</th>
          <th>Auth Type</th>
          <th>Capabilities</th>
          <th>OAuth Apps</th>
          <th>Status</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="platformsTableBody">
        <tr><td colspan="7" class="table-empty">Loading platforms…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
