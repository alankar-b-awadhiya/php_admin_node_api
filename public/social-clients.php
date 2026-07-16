<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Social Clients';
$activeNav = 'social-clients';
$pageScript = 'social-clients.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Social Media Clients</h2>
    <p class="subtitle">Agency clients/tenants — connect their social accounts and schedule posts</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-success" id="btnAddClient" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Client
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;flex:1;min-width:220px;">
      <label for="searchInput">Search</label>
      <input type="search" id="searchInput" placeholder="Search business name, contact, email, code...">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="1">Active</option>
        <option value="2">Paused</option>
        <option value="3">Archived</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="industryFilter">Industry</label>
      <select id="industryFilter"><option value="">All Industries</option></select>
    </div>
    <button class="btn-square" id="btnRefreshClients" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M4 2h4v4H4V2Zm6 0h6v4h-6V2ZM4 8h4v4H4V8Zm6 0h6v4h-6V8ZM4 14h4v4H4v-4Zm6 0h6v4h-6v-4Z"/></svg>
      </span>
      <h3>Clients</h3>
    </div>
    <span class="count-pill" id="clientsCount">0 clients</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Logo</th>
          <th>Business Name</th>
          <th>Client Code</th>
          <th>Contact</th>
          <th>Industry</th>
          <th>Accounts</th>
          <th>Status</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="clientsTableBody">
        <tr><td colspan="8" class="table-empty">Loading clients…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="clientsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
