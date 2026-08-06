<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Master Resources';
$activeNav = 'rbac-resources';
$pageScript = 'rbac-resources.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Master Resources</h2>
    <p class="subtitle">Manage resource mappings, types, parent/child hierarchy, and their active status</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewResource">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Resource
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
    <div class="search-field">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input type="search" id="searchInput" placeholder="Search name, type, description...">
    </div>
    <select id="typeFilter"><option value="">All Types</option></select>
    <select id="statusFilter">
      <option value="">All Statuses</option>
      <option value="true">Active</option>
      <option value="false">Inactive</option>
    </select>
    <button class="btn-square" id="btnRefresh" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3Zm8 0h6v6h-6V3ZM3 11h6v6H3v-6Zm8 0h6v6h-6v-6Z"/></svg>
      </span>
      <h3>Resource List</h3>
    </div>
    <span class="count-pill" id="resourceCount">0 resources</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Name</th><th>Type</th><th>Parent</th><th>Ref ID</th><th>Description</th><th>Status</th><th>Created</th><th style="text-align:right;">Actions</th></tr>
      </thead>
      <tbody id="resourcesTableBody">
        <tr><td colspan="8" class="table-empty">Loading resources…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
