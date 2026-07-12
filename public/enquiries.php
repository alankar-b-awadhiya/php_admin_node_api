<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Enquiries';
$activeNav = 'enquiries';
$pageScript = 'enquiries.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Enquiries</h2>
    <p class="subtitle">Manage customer enquiries and messages</p>
  </div>
  <div class="toolbar">
    <button class="btn-square" id="btnRefreshEnquiries" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
    <div class="dropdown" id="bulkActionsDropdown">
      <button class="btn btn-warning" id="btnBulkActions" type="button" disabled>
        Bulk Actions
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="dropdown-menu" id="bulkActionsMenu">
        <button type="button" class="dropdown-item" data-status="read">Mark Read</button>
        <button type="button" class="dropdown-item" data-status="in_progress">In Progress</button>
        <button type="button" class="dropdown-item" data-status="resolved">Resolved</button>
        <button type="button" class="dropdown-item" data-status="spam">Spam</button>
        <button type="button" class="dropdown-item" data-status="closed">Closed</button>
      </div>
    </div>
  </div>
</div>

<div class="enq-stat-grid" id="enqStatGrid">
  <div class="enq-stat-card">
    <span class="enq-stat-icon icon-blue"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M2.5 5.5h15v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 5.5 10 11l7.5-5.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>
    <div><div class="enq-stat-value" id="statUnread">0</div><div class="enq-stat-label">Unread</div></div>
  </div>
  <div class="enq-stat-card">
    <span class="enq-stat-icon icon-amber"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 2.5h10M5 17.5h10M6 2.5v3.2c0 1 .5 1.9 1.4 2.4l1.6 1-1.6 1a2.8 2.8 0 0 0-1.4 2.4v3.2M14 2.5v3.2c0 1-.5 1.9-1.4 2.4l-1.6 1 1.6 1c.9.5 1.4 1.4 1.4 2.4v3.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>
    <div><div class="enq-stat-value" id="statInProgress">0</div><div class="enq-stat-label">In Progress</div></div>
  </div>
  <div class="enq-stat-card">
    <span class="enq-stat-icon icon-green"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.3" stroke="currentColor" stroke-width="1.5"/><path d="M6.8 10.2l2.1 2.1 4.3-4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <div><div class="enq-stat-value" id="statResolved">0</div><div class="enq-stat-label">Resolved</div></div>
  </div>
  <div class="enq-stat-card">
    <span class="enq-stat-icon icon-coral"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2.5 18 16H2L10 2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 8.3v3.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="13.6" r="0.9" fill="currentColor"/></svg></span>
    <div><div class="enq-stat-value" id="statUrgent">0</div><div class="enq-stat-label">Urgent</div></div>
  </div>
  <div class="enq-stat-card">
    <span class="enq-stat-icon icon-violet"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 7.5h15M6 2v3M14 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
    <div><div class="enq-stat-value" id="statToday">0</div><div class="enq-stat-label" id="statTodayLabel">Today</div></div>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="new">New</option>
        <option value="read">Read</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
        <option value="spam">Spam</option>
        <option value="closed">Closed</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="typeFilter">Type</label>
      <select id="typeFilter">
        <option value="">All Types</option>
        <option value="contact">Contact</option>
        <option value="support">Support</option>
        <option value="sales">Sales</option>
        <option value="general">General</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="priorityFilter">Priority</label>
      <select id="priorityFilter">
        <option value="">All Priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="fromDate">From</label>
      <input type="date" id="fromDate">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="toDate">To</label>
      <input type="date" id="toDate">
    </div>
    <button class="btn btn-primary" id="btnApplyFilter" type="button">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M2.5 4h15M5.5 10h9M8.5 16h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      Apply
    </button>
    <button class="btn btn-secondary" id="btnClearFilter" type="button">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.3" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 7.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      Clear
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M2.5 5.5h15v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9Zm.4 0L10 10.6l7.1-5.1H2.9Z"/></svg>
      </span>
      <h3>All Enquiries</h3>
    </div>
  </div>

  <div class="card-body" style="padding:14px 16px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted);">
      Show
      <select id="perPageSelect" style="width:74px;">
        <option value="10">10</option>
        <option value="25" selected>25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
      entries
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted);">
      Search:
      <input type="search" id="tableSearchInput" placeholder="" style="width:200px;">
    </label>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:34px;"><input type="checkbox" id="checkAll"></th>
          <th>Ref No</th>
          <th>From</th>
          <th>Subject / Message</th>
          <th>Type</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Replies</th>
          <th>Date</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="enquiriesTableBody">
        <tr><td colspan="10" class="table-empty">Loading enquiries…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="enquiriesPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
