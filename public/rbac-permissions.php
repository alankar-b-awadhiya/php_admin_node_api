<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Permissions';
$activeNav = 'rbac-permissions';
$pageScript = 'rbac-permissions.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Permissions</h2>
    <p class="subtitle">Manage permission definitions and role access matrix</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewPermission">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Permission
    </button>
  </div>
</div>

<div class="tabstrip">
  <button class="tabstrip-btn" data-tab="permissions">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M13 2a5 5 0 0 0-4.8 6.4L2 14.6V18h3.4l1-1v-1.5H8V14h1.5v-1.5L11 11h1.6A5 5 0 1 0 13 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Permissions
  </button>
  <button class="tabstrip-btn" data-tab="matrix">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 3h6v6H3V3Zm8 0h6v6h-6V3ZM3 11h6v6H3v-6Zm8 0h6v6h-6v-6Z" stroke="currentColor" stroke-width="1.4"/></svg>
    Role Matrix
  </button>
</div>

<!-- ===================== Permissions tab ===================== -->
<div class="tab-panel" id="panel-permissions">
  <div class="card" style="margin-bottom:18px;">
    <div class="card-body" style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <div class="search-field">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <input type="search" id="permSearchInput" placeholder="Search name, code, description...">
      </div>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
      <button class="btn-square" id="btnRefreshPerm" type="button" title="Refresh">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-header-lead">
        <span class="card-header-icon">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M13 2a5 5 0 0 0-4.8 6.4L2 14.6V18h3.4l1-1v-1.5H8V14h1.5v-1.5L11 11h1.6A5 5 0 1 0 13 2Zm1.5 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/></svg>
        </span>
        <h3>Permission Definitions</h3>
      </div>
      <span class="count-pill" id="permissionCount">0 permissions</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Permission Name</th><th>Code</th><th>Description</th><th>Status</th><th>Created</th><th style="text-align:right;">Actions</th></tr>
        </thead>
        <tbody id="permissionsTableBody">
          <tr><td colspan="7" class="table-empty">Loading permissions…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- ===================== Role Matrix tab ===================== -->
<div class="tab-panel" id="panel-matrix">
  <div class="matrix-toolbar">
    <div class="matrix-toolbar-fields">
      <div class="field-inline">
        <label for="matrixRole">Select Role</label>
        <select id="matrixRole"></select>
      </div>
      <div class="field-inline-copy">
        <div class="field-inline">
          <label for="matrixCopyFrom">Copy From</label>
          <select id="matrixCopyFrom"><option value="">— Source role —</option></select>
        </div>
        <button class="btn btn-secondary" id="btnCopyFrom" type="button">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-8A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14H6" stroke="currentColor" stroke-width="1.5"/></svg>
          Copy
        </button>
      </div>
    </div>
    <div class="matrix-toolbar-right">
      <span class="autosave-note" id="autosaveNote">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 10.5 8 14l8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Changes save automatically
      </span>
      <button class="btn btn-outline-green" id="btnGrantAll" type="button">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M4 10.5 8 14l8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Grant All
      </button>
      <button class="btn btn-outline-red" id="btnRevokeAll" type="button">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        Revoke All
      </button>
    </div>
  </div>

  <div id="matrixGroups">
    <div class="card"><div class="table-empty">Loading role matrix…</div></div>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
