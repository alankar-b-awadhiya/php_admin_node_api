<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Posts';
$activeNav = 'posts';
$pageScript = 'posts.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Posts</h2>
    <p class="subtitle">Compose once, schedule or publish across every connected account</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-success" id="btnNewPost" type="button" disabled>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      New Post
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
    <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px;">
      <label for="searchInput">Search</label>
      <input type="search" id="searchInput" placeholder="Search title or caption...">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="1">Draft</option>
        <option value="2">Scheduled</option>
        <option value="3">Publishing</option>
        <option value="4">Published</option>
        <option value="5">Failed</option>
        <option value="6">Partially Published</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="mediaTypeFilter">Media Type</label>
      <select id="mediaTypeFilter">
        <option value="">All Types</option>
        <option value="1">Text</option>
        <option value="2">Image</option>
        <option value="3">Video</option>
        <option value="4">Carousel</option>
        <option value="5">Reel</option>
        <option value="6">Story</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshPosts" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M4 2h9l4 4v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V6h2.5L12 3.5ZM5 9h9v1.3H5V9Zm0 3h9v1.3H5V12Zm0 3h6v1.3H5V15Z"/></svg>
      </span>
      <h3>Posts</h3>
    </div>
    <span class="count-pill" id="postsCount">0 posts</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Post</th>
          <th>Media Type</th>
          <th>Targets</th>
          <th>Status</th>
          <th>Created</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="postsTableBody">
        <tr><td colspan="6" class="table-empty">Select a client above to view posts.</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="postsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
