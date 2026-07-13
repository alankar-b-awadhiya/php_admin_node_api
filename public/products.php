<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Products';
$activeNav = 'products';
$pageScript = 'products.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Products</h2>
    <p class="subtitle">Manage products, images, attributes and variants</p>
  </div>
  <div class="toolbar">
    <a class="btn btn-outline-indigo" href="product-attributes.php">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10.6 2H4a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l7 7c.8.8 2 .8 2.8 0l6-6c.8-.8.8-2 0-2.8l-7-7c-.4-.4-.9-.6-1.4-.6ZM6 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" stroke="currentColor" stroke-width="1.3"/></svg>
      Attributes
    </a>
    <button class="btn btn-success" id="btnAddProduct" type="button">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Add Product
    </button>
  </div>
</div>

<div class="stat-grid" id="productStats">
  <div class="stat-card"><div class="stat-label">Total Products</div><div class="stat-value" id="statTotal">—</div></div>
  <div class="stat-card"><div class="stat-label">Active</div><div class="stat-value" id="statActive">—</div></div>
  <div class="stat-card"><div class="stat-label">Draft</div><div class="stat-value" id="statDraft">—</div></div>
  <div class="stat-card"><div class="stat-label">Out of Stock</div><div class="stat-value" id="statOutOfStock">—</div></div>
</div>

<div class="card" style="margin-bottom:18px;">
  <div class="card-body" style="padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
    <div class="form-group search-field" style="margin-bottom:0;flex:1;min-width:220px;">
      <label for="searchInput">Search</label>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="top:63%;"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input type="search" id="searchInput" placeholder="Search name, SKU, description...">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="categoryFilter">Category</label>
      <select id="categoryFilter"><option value="">All Categories</option></select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="statusFilter">Status</label>
      <select id="statusFilter">
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="discontinued">Discontinued</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="stockFilter">Stock</label>
      <select id="stockFilter">
        <option value="">Any Stock</option>
        <option value="in_stock">In Stock</option>
        <option value="out_of_stock">Out of Stock</option>
        <option value="backorder">Backorder</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label for="featuredFilter">Featured</label>
      <select id="featuredFilter">
        <option value="">All</option>
        <option value="1">Featured</option>
        <option value="0">Not Featured</option>
      </select>
    </div>
    <button class="btn-square" id="btnRefreshProducts" type="button" title="Refresh">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <div class="card-header-lead">
      <span class="card-header-icon">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1 2 5v10l8 4 8-4V5l-8-4Zm0 2.2 5.6 2.8L10 8.8 4.4 6 10 3.2ZM4 7.7l5 2.5v6.1l-5-2.5V7.7Zm7 8.6v-6.1l5-2.5v6.1l-5 2.5Z"/></svg>
      </span>
      <h3>Products</h3>
    </div>
    <span class="count-pill" id="productsCount">0 products</span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Category</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Variants</th>
          <th>Status</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody id="productsTableBody">
        <tr><td colspan="7" class="table-empty">Loading products…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="productsPagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
