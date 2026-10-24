<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'API Sources';
$activeNav = 'report-sources';
$pageScriptsBefore = ['js/reports-common.js'];
$pageScript = 'report-sources.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>API Sources</h2>
    <p class="subtitle">Register the APIs your reports read from. Calls are made by the server, so credentials never reach the browser.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewSource" type="button" hidden>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      New API Source
    </button>
  </div>
</div>

<div class="stat-grid">
  <div class="stat-card">
    <div class="stat-label">Registered sources</div>
    <div class="stat-value" id="rptStatTotal">&hellip;</div>
    <div class="stat-hint">Internal and external APIs</div>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group search-field" style="margin-bottom:0;flex:1;min-width:220px;">
      <label for="srcSearch">Search</label>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="top:63%;"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input type="search" id="srcSearch" placeholder="Search name, code or URL...">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="srcStatus">Status</label>
      <select id="srcStatus">
        <option value="">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="srcKind">Type</label>
      <select id="srcKind">
        <option value="">All</option>
        <option value="1">Internal</option>
        <option value="0">External</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="srcAuth">Authentication</label>
      <select id="srcAuth"><option value="">All</option></select>
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
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M7 2h2v4h2V2h2v4h1.5v3.5A4.5 4.5 0 0 1 11 14v4H9v-4a4.5 4.5 0 0 1-3.5-4.5V6H7V2Z"/></svg>
      </span>
      <h3>Registered API sources</h3>
    </div>
    <span class="count-pill" id="srcCount">0 sources</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Endpoint</th>
          <th>Auth</th>
          <th>Usage</th>
          <th>Last tested</th>
          <th>Status</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="srcTableBody"></tbody>
    </table>
  </div>
  <div class="pagination" id="srcPagination"></div>
</div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>
