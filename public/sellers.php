<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Sellers'; $activeNav = 'sellers'; $pageScript = 'sellers.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header"><div><h2>Sellers</h2><p class="subtitle">Onboard and manage marketplace sellers</p></div><button class="btn btn-primary" id="addSeller">Add Seller</button></div>
<div class="card" style="margin-bottom:18px"><div class="card-body" style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap"><div class="search-field"><input id="sellerSearch" type="search" placeholder="Search business, email or GSTIN"></div><select id="sellerStatus"><option value="">All statuses</option><option>pending</option><option>active</option><option>suspended</option><option>inactive</option></select><button class="btn-square" id="refreshSellers" title="Refresh">↻</button></div></div>
<div class="card"><div class="card-header"><div class="card-header-lead"><h3>Seller directory</h3></div><span class="count-pill" id="sellerCount">0 sellers</span></div><div class="table-wrap"><table><thead><tr><th>Business</th><th>Contact</th><th>GSTIN</th><th>Commission</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody id="sellerRows"><tr><td colspan="7" class="table-empty">Loading sellers…</td></tr></tbody></table></div></div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>
