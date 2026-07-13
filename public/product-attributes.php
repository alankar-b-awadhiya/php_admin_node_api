<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Product Attributes';
$activeNav = 'products';
$pageScript = 'product-attributes.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Product Attributes</h2>
    <p class="subtitle">Manage attributes (e.g. Color, Size) and their values, used to build product variants</p>
  </div>
  <div class="toolbar">
    <a class="btn btn-secondary" href="products.php">&larr; Back to Products</a>
    <button class="btn btn-success" id="btnAddAttribute" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Attribute
    </button>
  </div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group search-field" style="margin-bottom:0;flex:1;min-width:220px;">
      <label for="searchInput">Search</label>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="top:63%;"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input type="search" id="searchInput" placeholder="Search attribute name...">
    </div>
    <button class="btn-square" id="btnRefreshAttributes" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M10.6 2H4a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l7 7c.8.8 2 .8 2.8 0l6-6c.8-.8.8-2 0-2.8l-7-7c-.4-.4-.9-.6-1.4-.6ZM6 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
      </span>
      <h3>Attributes</h3>
    </div>
    <span class="count-pill" id="attributesCount">0 attributes</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Attribute</th>
          <th>Slug</th>
          <th>Values</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="attributesTableBody">
        <tr><td colspan="4" class="table-empty">Loading attributes…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
