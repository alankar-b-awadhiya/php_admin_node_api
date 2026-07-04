<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'My Profile';
$activeNav = 'profile';
$pageScript = 'profile.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>My Profile</h2>
    <p class="subtitle">Your account details and password.</p>
  </div>
</div>

<div class="card">
  <div class="card-header"><h3>Account</h3></div>
  <div class="card-body">
    <div class="table-wrap">
      <table id="profileTable">
        <tbody>
          <tr><td class="cell-muted" style="width:180px;">Full name</td><td id="p-fullName">—</td></tr>
          <tr><td class="cell-muted">Username</td><td id="p-username">—</td></tr>
          <tr><td class="cell-muted">Email</td><td id="p-email">—</td></tr>
          <tr><td class="cell-muted">Mobile</td><td id="p-mobile">—</td></tr>
          <tr><td class="cell-muted">Role</td><td id="p-role">—</td></tr>
          <tr><td class="cell-muted">Last login</td><td id="p-lastLogin">—</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><h3>Change password</h3></div>
  <div class="card-body">
    <form id="changePasswordForm" style="max-width:420px;">
      <div id="cpErrors"></div>
      <div class="form-group">
        <label for="cp-current">Current password</label>
        <input type="password" id="cp-current" autocomplete="current-password" required>
      </div>
      <div class="form-group">
        <label for="cp-new">New password</label>
        <input type="password" id="cp-new" autocomplete="new-password" minlength="8" required>
        <p class="hint">At least 8 characters.</p>
      </div>
      <button type="submit" class="btn btn-primary" id="cpSubmit">Change password</button>
      <p class="hint">You'll be signed out on all devices after this and need to log in again.</p>
    </form>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
