<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Feedback & Testimonials';
$activeNav = 'feedback';
$pageScript = 'feedback.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Feedback &amp; Testimonials</h2>
    <p class="subtitle">Review submissions, moderate, and publish testimonials</p>
  </div>
  <div class="toolbar">
    <span class="badge badge-amber" id="pillPending">0 pending</span>
    <span class="badge badge-green" id="pillTestimonials">0 testimonials</span>
    <span class="badge badge-indigo" id="pillFeatured">0 featured</span>
    <button class="btn-square" id="btnRefreshFeedback" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="btn btn-primary" id="btnAddFeedback" type="button">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Feedback
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group search-field" style="margin-bottom:0;min-width:240px;">
      <label for="fbSearchInput">Search</label>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="top:63%;"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input type="search" id="fbSearchInput" placeholder="Search name, email, title, message…">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="testimonialFilter">Testimonial</label>
      <select id="testimonialFilter">
        <option value="">All</option>
        <option value="1">Testimonial</option>
        <option value="0">Not testimonial</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="featuredFilter">Featured</label>
      <select id="featuredFilter">
        <option value="">All</option>
        <option value="1">Featured</option>
        <option value="0">Not featured</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="sortFilter">Sort</label>
      <select id="sortFilter">
        <option value="">Newest first</option>
        <option value="rating_desc">Rating: High to Low</option>
        <option value="rating_asc">Rating: Low to High</option>
      </select>
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
  <div class="card-body" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--line-soft);">
    <div class="flex-gap">
      <span id="selectedCountLabel" style="font-size:13px;color:var(--text-muted);">0 selected</span>
      <select id="bulkStatusSelect" style="width:170px;">
        <option value="approved">Mark Approved</option>
        <option value="rejected">Mark Rejected</option>
        <option value="archived">Mark Archived</option>
        <option value="pending">Mark Pending</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="btnBulkApply" type="button" disabled>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4L16 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Apply
      </button>
    </div>
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
    <span class="count-pill" id="totalItemsPill">0 items</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:34px;"><input type="checkbox" id="checkAll"></th>
          <th>Submitted By</th>
          <th>Rating</th>
          <th>Title / Message</th>
          <th>Status</th>
          <th>Testimonial</th>
          <th>Date</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="feedbackTableBody">
        <tr><td colspan="8" class="table-empty">Loading feedback…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="feedbackPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
