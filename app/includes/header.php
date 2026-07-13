<?php
/**
 * Shared header. Expects the including page to have already set:
 *   $pageTitle   (string) - shown in <title> and the top bar
 *   $activeNav   (string) - key matching sidebar.php's nav items, for highlighting
 * Include config.php BEFORE this file.
 */
if (!defined('API_BASE_URL')) {
    require_once __DIR__ . '/../config/config.php';
}
$pageTitle = $pageTitle ?? APP_NAME;
$activeNav = $activeNav ?? '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= htmlspecialchars($pageTitle) ?> · <?= htmlspecialchars(APP_NAME) ?></title>
<link rel="stylesheet" href="assets/css/style.css?v=<?= ASSET_VERSION ?>">
<script>
  window.API_BASE_URL = <?= json_encode(API_BASE_URL) ?>;
  window.APP_NAME = <?= json_encode(APP_NAME) ?>;
  window.VAPID_PUBLIC_KEY = <?= json_encode(VAPID_PUBLIC_KEY) ?>;
</script>
</head>
<body>
<div class="app-shell">
<?php include __DIR__ . '/sidebar.php'; ?>
  <div class="app-main">
    <header class="topbar">
      <button class="icon-btn" id="sidebarToggle" aria-label="Toggle menu" type="button">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
        <button class="icon-btn" id="themeToggle" aria-label="Theme settings" type="button" title="Theme settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 6a6 6 0 100 12 6 6 0 000-12z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      <h1 class="topbar-title"><?= htmlspecialchars($pageTitle) ?></h1>
      <div class="topbar-spacer"></div>
      <div class="topbar-user" id="topbarUser">
        <span class="topbar-user-name" id="topbarUserName">&nbsp;</span>
        <span class="topbar-user-role" id="topbarUserRole"></span>
        <button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Sign out</button>
      </div>
    </header>
    <main class="app-content">
