<?php
/**
 * Left navigation. $activeNav is set by the including page before header.php
 * is required. Grouped to match the API domains under src/api/v1:
 *   auth (session/profile), master-users, master-usertypes, master-rbac
 */
$navItems = [
    ['key' => 'dashboard',        'href' => 'dashboard.php',        'label' => 'Dashboard',        'icon' => 'grid'],
    ['key' => 'users',            'href' => 'users.php',            'label' => 'Master Users',      'icon' => 'users'],
    ['key' => 'usertypes',        'href' => 'usertypes.php',        'label' => 'Usertypes',         'icon' => 'tag'],
    ['key' => 'rbac-resources',   'href' => 'rbac-resources.php',   'label' => 'Master Resources',  'icon' => 'box'],
    ['key' => 'rbac-permissions', 'href' => 'rbac-permissions.php', 'label' => 'Permissions',       'icon' => 'key'],
    ['key' => 'notification',     'href' => 'notification.php',     'label' => 'Notifications',      'icon' => 'bell'],
    ['key' => 'webpush',          'href' => 'webpush.php',          'label' => 'Web Push',           'icon' => 'device'],
    ['key' => 'sessions',         'href' => 'sessions.php',         'label' => 'My Sessions',        'icon' => 'device'],
    ['key' => 'profile',          'href' => 'profile.php',          'label' => 'My Profile',         'icon' => 'user'],
];

function nav_icon($name) {
    $icons = [
        'grid'   => '<path d="M3 3h6v6H3V3Zm8 0h6v6h-6V3ZM3 11h6v6H3v-6Zm8 0h6v6h-6v-6Z"/>',
        'users'  => '<path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1 17c0-3 2.7-5 6-5s6 2 6 5v1H1v-1Zm11.2-4c2.2.4 3.8 2 3.8 4v1h3v-1c0-2.5-2.1-4.2-4.6-4.4Z"/>',
        'tag'    => '<path d="M10.6 2H4a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l7 7c.8.8 2 .8 2.8 0l6-6c.8-.8.8-2 0-2.8l-7-7c-.4-.4-.9-.6-1.4-.6ZM6 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>',
        'box'    => '<path d="M10 1 2 5v10l8 4 8-4V5l-8-4Zm0 2.2 5.6 2.8L10 8.8 4.4 6 10 3.2ZM4 7.7l5 2.5v6.1l-5-2.5V7.7Zm7 8.6v-6.1l5-2.5v6.1l-5 2.5Z"/>',
        'key'    => '<path d="M13 2a5 5 0 0 0-4.8 6.4L2 14.6V18h3.4l1-1v-1.5H8V14h1.5v-1.5L11 11h1.6A5 5 0 1 0 13 2Zm1.5 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>',
        'shield' => '<path d="M10 1 3 4v5.4c0 4.3 3 8.3 7 9.6 4-1.3 7-5.3 7-9.6V4l-7-3Zm0 8.9 3.3-3.3 1.1 1.1L10 12.2 6.6 8.7l1.1-1.1L10 9.9Z"/>',
        'device' => '<path d="M3 3h14v10H3V3Zm-1 12h16v2H2v-2ZM8 6h4v1H8V6Z"/>',
        'user'   => '<path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 9c-4.4 0-7 2.2-7 5v2h14v-2c0-2.8-2.6-5-7-5Z"/>',
        'bell'   => '<path d="M10 1.5a1.4 1.4 0 0 0-1.4 1.4v.6C6 4.1 4.4 6.1 4.4 8.6v3.3L2.7 14.5c-.3.5.1 1.1.7 1.1h13.2c.6 0 1-.6.7-1.1l-1.7-2.6V8.6c0-2.5-1.6-4.5-4.2-5.1v-.6A1.4 1.4 0 0 0 10 1.5Zm0 17a2.2 2.2 0 0 0 2.2-2H7.8A2.2 2.2 0 0 0 10 18.5Z"/>',
    ];
    return $icons[$name] ?? '';
}
?>
<aside class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <span class="sidebar-brand-mark">A</span>
    <span class="sidebar-brand-name"><?= htmlspecialchars(APP_NAME) ?></span>
  </div>
  <nav class="sidebar-nav">
    <?php foreach ($navItems as $item): ?>
      <a href="<?= htmlspecialchars($item['href']) ?>"
         class="sidebar-link <?= $activeNav === $item['key'] ? 'is-active' : '' ?>">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><?= nav_icon($item['icon']) ?></svg>
        <span><?= htmlspecialchars($item['label']) ?></span>
      </a>
    <?php endforeach; ?>
  </nav>
  <div class="sidebar-footer">
    <span class="sidebar-footer-label">API</span>
    <code class="sidebar-footer-url"><?= htmlspecialchars(parse_url(API_BASE_URL, PHP_URL_HOST) ?: API_BASE_URL) ?></code>
  </div>
</aside>
