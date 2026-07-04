<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Usertypes';
$activeNav = 'usertypes';
$pageScript = 'usertypes.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Usertypes</h2>
    <p class="subtitle">Roles like SUPERADMIN or ADMIN, and the permission tags they carry.</p>
  </div>
  <div class="toolbar">
    <select id="statusFilter">
      <option value="">All statuses</option>
      <option value="true">Active only</option>
      <option value="false">Inactive only</option>
    </select>
    <button class="btn btn-primary" id="btnNewUsertype">+ New usertype</button>
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Type code</th>
          <th>Name</th>
          <th>Description</th>
          <th>Permissions</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="usertypesTableBody">
        <tr><td colspan="6" class="table-empty">Loading usertypes…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
