<?php require_once __DIR__ . '/../app/config/config.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in · <?= htmlspecialchars(APP_NAME) ?></title>
<link rel="stylesheet" href="assets/css/style.css?v=<?= ASSET_VERSION ?>">
<script>
  window.API_BASE_URL = <?= json_encode(API_BASE_URL) ?>;
  window.APP_NAME = <?= json_encode(APP_NAME) ?>;
</script>
</head>
<body>
<div class="auth-screen">
  <div class="auth-card">
    <div class="auth-brand">
      <span class="auth-brand-mark">A</span>
      <span class="auth-brand-name"><?= htmlspecialchars(APP_NAME) ?></span>
    </div>

    <div class="tabs" id="loginTabs">
      <button type="button" class="tab-btn is-active" data-tab="password">Password</button>
      <button type="button" class="tab-btn" data-tab="otp">OTP</button>
      <button type="button" class="tab-btn" data-tab="master">Master</button>
    </div>

    <!-- Password login -->
    <form id="form-password" class="login-form">
      <h2 class="auth-title">Welcome back</h2>
      <p class="auth-subtitle">Sign in with your username, email or mobile.</p>
      <div id="errors-password"></div>
      <div class="form-group">
        <label for="pw-identifier">Username / email / mobile</label>
        <input type="text" id="pw-identifier" name="identifier" autocomplete="username" required>
      </div>
      <div class="form-group">
        <label for="pw-password">Password</label>
        <input type="password" id="pw-password" name="password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" id="pw-submit">Sign in</button>
    </form>

    <!-- OTP login -->
    <form id="form-otp" class="login-form" style="display:none;">
      <h2 class="auth-title">Sign in with OTP</h2>
      <p class="auth-subtitle">We'll send a one-time code to your registered email or mobile.</p>
      <div id="errors-otp"></div>
      <div class="form-group">
        <label for="otp-identifier">Email or mobile</label>
        <input type="text" id="otp-identifier" name="identifier" required>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="otp-request-btn">Send OTP</button>
      <div class="form-group" id="otp-code-group" style="display:none; margin-top:14px;">
        <label for="otp-code">Enter OTP</label>
        <input type="text" id="otp-code" name="otp" inputmode="numeric" autocomplete="one-time-code">
        <p class="hint" id="otp-resend-hint"></p>
      </div>
      <button type="submit" class="btn btn-primary btn-block" id="otp-submit" style="display:none; margin-top:10px;">Verify &amp; sign in</button>
    </form>

    <!-- Master password login -->
    <form id="form-master" class="login-form" style="display:none;">
      <h2 class="auth-title">Master sign-in</h2>
      <p class="auth-subtitle">Support/superadmin override — logs in as the given account using the system master password. This is audited.</p>
      <div id="errors-master"></div>
      <div class="form-group">
        <label for="master-identifier">Username / email / mobile</label>
        <input type="text" id="master-identifier" name="identifier" required>
      </div>
      <div class="form-group">
        <label for="master-password">Master password</label>
        <input type="password" id="master-password" name="masterPassword" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" id="master-submit">Sign in as user</button>
    </form>

  </div>
</div>

<div class="toast-stack" id="toastStack"></div>
<script src="assets/js/common.js?v=<?= ASSET_VERSION ?>"></script>
<script src="assets/js/login.js?v=<?= ASSET_VERSION ?>"></script>
</body>
</html>
