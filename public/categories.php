<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Categories';
$activeNav = 'categories';
$pageScript = 'categories.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Categories</h2>
    <p class="subtitle">Manage content categories</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewCategory" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Category
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group" style="margin-bottom:0;">
      <label for="typeFilter">Category Type</label>
      <select id="typeFilter"></select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="nameSearchInput">Search</label>
      <input type="search" id="nameSearchInput" placeholder="Name...">
    </div>
    <button class="btn btn-primary" id="btnApplyFilter" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      Filter
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M10.6 2H4a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l7 7c.8.8 2 .8 2.8 0l6-6c.8-.8.8-2 0-2.8l-7-7c-.4-.4-.9-.6-1.4-.6ZM6 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
      </span>
      <h3>Categories</h3>
    </div>
    <button class="btn-square" id="btnRefreshCategories" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Refresh
    </button>
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
      <input type="search" id="tableSearchInput" placeholder="" style="width:180px;">
    </label>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>NAME</th>
          <th>SLUG</th>
          <th>PARENT</th>
          <th>TYPE</th>
          <th>CHILDREN</th>
          <th>STATUS</th>
          <th style="text-align:right;">ACTIONS</th>
        </tr>
      </thead>
      <tbody id="categoriesTableBody">
        <tr><td colspan="8" class="table-empty">Loading categories…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="categoriesPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
