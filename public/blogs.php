<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Blogs';
$activeNav = 'blogs';
$pageScript = 'blogs.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Blogs</h2>
    <p class="subtitle">Manage blog articles and publications</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-outline-indigo" id="btnNewCategory" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10.6 2H4a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l7 7c.8.8 2 .8 2.8 0l6-6c.8-.8.8-2 0-2.8l-7-7c-.4-.4-.9-.6-1.4-.6ZM6 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" stroke="currentColor" stroke-width="1.3"/></svg>
      New Category
    </button>
    <button class="btn btn-success" id="btnAddBlogPost" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Blog Post
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group search-field" style="margin-bottom:0;flex:1;min-width:220px;">
      <label for="searchInput">Search</label>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="top:63%;"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input type="search" id="searchInput" placeholder="Search title, excerpt, author...">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="categoryFilter">Category</label>
      <select id="categoryFilter"><option value="">All Categories</option></select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="featuredFilter">Featured</label>
      <select id="featuredFilter">
        <option value="">All</option>
        <option value="1">Featured</option>
        <option value="0">Not Featured</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshBlogs" type="button" title="Refresh">
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
      <h3>Articles</h3>
    </div>
    <span class="count-pill" id="articlesCount">0 articles</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Image</th>
          <th>Title</th>
          <th>Category</th>
          <th>Author</th>
          <th>Status</th>
          <th>Published Date</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="blogsTableBody">
        <tr><td colspan="7" class="table-empty">Loading articles…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="blogsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
