<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Services';
$activeNav = 'services';
$pageScript = 'services.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div><h2>Services</h2><p class="subtitle">Manage fixed-price and custom-quote service catalog entries</p></div>
  <button class="btn btn-primary" id="btnAddService" type="button">Add Service</button>
</div>
<div class="card" style="margin-bottom:18px"><div class="card-body" style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap">
  <div class="search-field"><input id="serviceSearch" type="search" placeholder="Search services"></div>
  <select id="serviceStatus"><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="discontinued">Discontinued</option></select>
  <select id="pricingType"><option value="">All pricing</option><option value="fixed">Fixed price</option><option value="custom_quote">Custom quote</option></select>
  <button class="btn-square" id="btnRefreshServices" type="button" title="Refresh">↻</button>
</div></div>
<div class="card"><div class="card-header"><div class="card-header-lead"><h3>Service catalog</h3></div><span class="count-pill" id="serviceCount">0 services</span></div>
  <div class="table-wrap"><table><thead><tr><th>Service</th><th>Pricing</th><th>Starting price</th><th>Delivery</th><th>Sellers</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody id="serviceRows"><tr><td colspan="7" class="table-empty">Loading services…</td></tr></tbody></table></div>
</div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>
