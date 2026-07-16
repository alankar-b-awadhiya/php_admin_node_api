<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Connected Accounts';
$activeNav = 'social-accounts';
$pageScript = 'social-accounts.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Connected Accounts</h2>
    <p class="subtitle">Connect and manage each client's social platform accounts</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-success" id="btnConnectAccount" type="button" disabled>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Connect Account
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;flex:1;min-width:260px;">
      <label for="clientSelect">Client <span style="color:var(--coral);">*</span></label>
      <select id="clientSelect">
        <option value="">Select a client…</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="platformFilter">Platform</label>
      <select id="platformFilter">
        <option value="">All Platforms</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="0">Pending</option>
        <option value="1">Active</option>
        <option value="2">Expired</option>
        <option value="3">Revoked</option>
        <option value="4">Error</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshAccounts" type="button" title="Refresh">
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
      <h3>Accounts</h3>
    </div>
    <span class="count-pill" id="accountsCount">0 accounts</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Platform</th>
          <th>Account</th>
          <th>Status</th>
          <th>Token Expires</th>
          <th>Last Synced</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="accountsTableBody">
        <tr><td colspan="6" class="table-empty">Select a client above to view connected accounts.</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
