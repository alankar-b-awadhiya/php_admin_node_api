<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Webhook Events';
$activeNav = 'social-webhooks';
$pageScript = 'social-webhooks.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Webhook Events</h2>
    <p class="subtitle">Raw inbound events from every connected platform — for debugging and replay</p>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;">
      <label for="platformFilter">Platform</label>
      <select id="platformFilter"><option value="">All Platforms</option></select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="processedFilter">Processed</label>
      <select id="processedFilter">
        <option value="">All</option>
        <option value="0">Unprocessed</option>
        <option value="1">Processed</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshEvents" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h14v10H3V3Zm-1 12h16v2H2v-2ZM8 6h4v1H8V6Z"/></svg>
      </span>
      <h3>Events</h3>
    </div>
    <span class="count-pill" id="eventsCount">0 events</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Platform</th>
          <th>Event Type</th>
          <th>Account</th>
          <th>Signature</th>
          <th>Status</th>
          <th>Received</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="eventsTableBody">
        <tr><td colspan="7" class="table-empty">Loading events…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="eventsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
