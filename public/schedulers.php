<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Scheduled Tasks';
$activeNav = 'schedulers';
$pageScript = 'schedulers.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Scheduled Tasks</h2>
    <p class="subtitle">Create task types, then schedule recurring or one-time background jobs.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-secondary" id="btnNewTaskType" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      New Task Type
    </button>
    <button class="btn btn-primary" id="btnNewTask" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Schedule New Task
    </button>
  </div>
</div>

<!-- ============ TASK TYPES ============ -->
<div class="card" style="margin-bottom:18px;">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h4.4l1.6 2H17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z"/></svg>
      </span>
      <h3>Task Types</h3>
    </div>
    <button class="btn-square" id="btnRefreshTaskTypes" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>KEY</th>
          <th>LABEL</th>
          <th>DESCRIPTION</th>
          <th>STATUS</th>
          <th style="text-align:right;">ACTIONS</th>
        </tr>
      </thead>
      <tbody id="taskTypesTableBody">
        <tr><td colspan="5" class="table-empty">Loading task types…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ============ FILTERS ============ -->
<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;">
      <label for="taskTypeFilter">Task Type</label>
      <select id="taskTypeFilter"><option value="">All types</option></select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="activeFilter">Status</label>
      <select id="activeFilter">
        <option value="">All tasks</option>
        <option value="1">Enabled only</option>
        <option value="0">Paused only</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="limitSelect">Show</label>
      <select id="limitSelect" style="width:90px;">
        <option value="25">25</option>
        <option value="50" selected>50</option>
        <option value="100">100</option>
      </select>
    </div>
    <button class="btn btn-primary" id="btnApplyFilter" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      Filter
    </button>
  </div>
</div>

<!-- ============ SCHEDULED TASKS ============ -->
<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M6 1.5a1 1 0 0 1 1 1V3h6v-.5a1 1 0 1 1 2 0V3h1a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1v-.5a1 1 0 0 1 1-1ZM5 8v9h10V8H5Z"/></svg>
      </span>
      <h3>Scheduled Tasks</h3>
    </div>
    <button class="btn-square" id="btnRefreshTasks" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>TASK</th>
          <th>TYPE</th>
          <th>NEXT RUN</th>
          <th>LAST RESULT</th>
          <th>STATUS</th>
          <th style="text-align:right;">ACTIONS</th>
        </tr>
      </thead>
      <tbody id="tasksTableBody">
        <tr><td colspan="6" class="table-empty">Loading scheduled tasks…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
