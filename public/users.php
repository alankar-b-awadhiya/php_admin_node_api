<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Master Users';
$activeNav = 'users';
$pageScript = 'users.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Master Users</h2>
    <p class="subtitle">Admin panel accounts, their roles, and login status.</p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary" id="btnNewUser">+ New user</button>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <h3>All users</h3>
    <div class="toolbar">
      <input type="search" id="searchInput" placeholder="Search name, username, email…" style="width:230px;">
      <select id="usertypeFilter"><option value="">All roles</option></select>
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="true">Active only</option>
        <option value="false">Inactive only</option>
      </select>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Username</th>
          <th>Contact</th>
          <th>Role</th>
          <th>Status</th>
          <th>Last login</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="usersTableBody">
        <tr><td colspan="7" class="table-empty">Loading users…</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination" id="pagination"></div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
