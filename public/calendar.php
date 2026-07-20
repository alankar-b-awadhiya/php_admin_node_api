<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Calendar';
$activeNav = 'calendar';
$pageScript = 'calendar.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Calendar</h2>
    <p class="subtitle">Scheduled and published posts, by date</p>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;flex:1;min-width:260px;">
      <label for="clientSelect">Client</label>
      <select id="clientSelect">
        <option value="">All clients</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label>&nbsp;</label>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn-square" id="btnPrevMonth" type="button" title="Previous month">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12.5 4 6.5 10l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span id="monthLabel" style="font-weight:600;min-width:150px;text-align:center;">—</span>
        <button class="btn-square" id="btnNextMonth" type="button" title="Next month">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M7.5 4 13.5 10l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="btn btn-secondary" id="btnToday" type="button">Today</button>
      </div>
    </div>
    <button class="btn-square" id="btnRefreshCalendar" type="button" title="Refresh" style="margin-left:auto;">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="btn btn-secondary" id="btnSyncPosts" type="button" title="Pull recent posts straight from each connected account">
      Sync existing posts
    </button>
  </div>
</div>

<div class="card">
  <div class="calendar-grid" id="calendarGrid">
    <div class="table-empty" style="padding:40px;">Loading…</div>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
