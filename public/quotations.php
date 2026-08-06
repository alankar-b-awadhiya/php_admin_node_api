<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Quotations'; $activeNav = 'quotations'; $pageScript = 'quotations.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header"><div><h2>Quotations</h2><p class="subtitle">Create and manage sales quotations</p></div><button class="btn btn-primary" id="addQuotation">New Quotation</button></div>
<div class="card" style="margin-bottom:18px"><div class="card-body" style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap"><div class="search-field"><input id="quotationSearch" type="search" placeholder="Search quote or customer"></div><select id="quotationStatus"><option value="">All statuses</option><option>requested</option><option>draft</option><option>sent</option><option>accepted</option><option>rejected</option><option>expired</option></select><button class="btn-square" id="quotationRefresh" title="Refresh">↻</button></div></div>
<div class="card"><div class="card-header"><div class="card-header-lead"><h3>Quotations</h3></div><span class="count-pill" id="quotationCount">0 quotations</span></div><div class="table-wrap"><table><thead><tr><th>Quotation</th><th>Customer</th><th>Valid until</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody id="quotationRows"><tr><td colspan="6" class="table-empty">Loading quotations…</td></tr></tbody></table></div></div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>