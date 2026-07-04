<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Dashboard';
$activeNav = 'dashboard';
$pageScript = 'dashboard.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2 id="welcomeHeading">Dashboard</h2>
    <p class="subtitle">A quick look at your account and where things live.</p>
  </div>
</div>

<div class="stat-grid" id="statGrid">
  <div class="stat-card"><span class="stat-label">Account</span><div class="stat-value skeleton-bar">&nbsp;</div></div>
  <div class="stat-card"><span class="stat-label">Role</span><div class="stat-value skeleton-bar">&nbsp;</div></div>
  <div class="stat-card"><span class="stat-label">Last login</span><div class="stat-value skeleton-bar">&nbsp;</div></div>
  <div class="stat-card"><span class="stat-label">Login method</span><div class="stat-value skeleton-bar">&nbsp;</div></div>
</div>

<div class="card">
  <div class="card-header"><h3>Where to go</h3></div>
  <div class="card-body">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Area</th><th>What it manages</th><th>API resource</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Master Users</strong></td>
            <td class="cell-muted">Admin panel logins, roles, lock/unlock, password resets</td>
            <td><code>/master-users</code></td>
            <td class="text-right"><a class="btn btn-secondary btn-sm" href="users.php">Open</a></td>
          </tr>
          <tr>
            <td><strong>Usertypes</strong></td>
            <td class="cell-muted">Roles such as SUPERADMIN / ADMIN and their permission tags</td>
            <td><code>/master-usertypes</code></td>
            <td class="text-right"><a class="btn btn-secondary btn-sm" href="usertypes.php">Open</a></td>
          </tr>
          <tr>
            <td><strong>Resources</strong></td>
            <td class="cell-muted">Modules / menus / APIs that can be permissioned</td>
            <td><code>/master-rbac/resources</code></td>
            <td class="text-right"><a class="btn btn-secondary btn-sm" href="rbac-resources.php">Open</a></td>
          </tr>
          <tr>
            <td><strong>Permissions</strong></td>
            <td class="cell-muted">Actions like <code>VIEW</code> / <code>EDIT</code> that can be granted</td>
            <td><code>/master-rbac/permissions</code></td>
            <td class="text-right"><a class="btn btn-secondary btn-sm" href="rbac-permissions.php">Open</a></td>
          </tr>
          <tr>
            <td><strong>Role Grants</strong></td>
            <td class="cell-muted">Ties a role to a resource + permission, allow/deny</td>
            <td><code>/master-rbac/grants</code></td>
            <td class="text-right"><a class="btn btn-secondary btn-sm" href="rbac-grants.php">Open</a></td>
          </tr>
          <tr>
            <td><strong>My Sessions</strong></td>
            <td class="cell-muted">Devices currently signed in, with revoke</td>
            <td><code>/auth/sessions</code></td>
            <td class="text-right"><a class="btn btn-secondary btn-sm" href="sessions.php">Open</a></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
<?php include __DIR__ . '/../app/includes/footer.php'; ?>
