<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Comments';
$activeNav = 'social-comments';
$pageScript = 'social-comments.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Comments</h2>
    <p class="subtitle">Synced comments from published posts — moderate, hide, and track replies</p>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;">
      <label for="targetIdFilter">Post Target ID</label>
      <input type="number" id="targetIdFilter" placeholder="Filter by target id" min="1">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="hiddenFilter">Visibility</label>
      <select id="hiddenFilter">
        <option value="">All</option>
        <option value="0">Visible</option>
        <option value="1">Hidden</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshComments" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M2.5 5.5h15v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9Zm.4 0L10 10.6l7.1-5.1H2.9Z"/></svg>
      </span>
      <h3>Comments</h3>
    </div>
    <span class="count-pill" id="commentsCount">0 comments</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Author</th>
          <th>Message</th>
          <th>Target</th>
          <th>Posted</th>
          <th>Status</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="commentsTableBody">
        <tr><td colspan="6" class="table-empty">Loading comments…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="commentsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
