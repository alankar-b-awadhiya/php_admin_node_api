<?php
/**
 * Left navigation. $activeNav is set by the including page before header.php
 * is required. Grouped to match the API domains under src/api/v1:
 *   auth (session/profile), master-users, master-usertypes, master-rbac
 */
$navGroups = [
  ['key' => 'main', 'title' => 'Main', 'items' => [
    ['key' => 'dashboard', 'href' => 'dashboard.php', 'label' => 'Dashboard', 'icon' => 'grid'],
    ['key' => 'users', 'href' => 'users.php', 'label' => 'Master Users', 'icon' => 'users'],
    ['key' => 'usertypes', 'href' => 'usertypes.php', 'label' => 'Usertypes', 'icon' => 'tag'],
    ['key' => 'rbac-resources', 'href' => 'rbac-resources.php', 'label' => 'Master Resources', 'icon' => 'box'],
    ['key' => 'rbac-permissions', 'href' => 'rbac-permissions.php', 'label' => 'Permissions', 'icon' => 'key'],
  ]],
  ['key' => 'content', 'title' => 'Content', 'items' => [
    ['key' => 'categories', 'href' => 'categories.php', 'label' => 'Categories', 'icon' => 'layers'],
    ['key' => 'media', 'href' => 'media.php', 'label' => 'Media Library', 'icon' => 'folder'],
    ['key' => 'blogs', 'href' => 'blogs.php', 'label' => 'Blogs', 'icon' => 'blog'],
    ['key' => 'clientele', 'href' => 'clientele.php', 'label' => 'Clientele', 'icon' => 'clientele'],
  ]],
  ['key' => 'ecommerce', 'title' => 'Ecommerce', 'items' => [
    ['key' => 'products', 'href' => 'products.php', 'label' => 'Products', 'icon' => 'package'],
    ['key' => 'services', 'href' => 'services.php', 'label' => 'Services', 'icon' => 'layers'],
    ['key' => 'sellers', 'href' => 'sellers.php', 'label' => 'Sellers', 'icon' => 'users'],
    ['key' => 'purchase-orders', 'href' => 'purchase-orders.php', 'label' => 'Orders', 'icon' => 'package'],
    ['key' => 'quotations', 'href' => 'quotations.php', 'label' => 'Quotations', 'icon' => 'tag'],
    ['key' => 'invoices', 'href' => 'invoices.php', 'label' => 'Invoices', 'icon' => 'blog'],
    ['key' => 'payments', 'href' => 'payments.php', 'label' => 'Payments', 'icon' => 'key'],
  ]],
  ['key' => 'social', 'title' => 'Social Media', 'items' => [
    ['key' => 'social-clients', 'href' => 'social-clients.php', 'label' => 'Clients', 'icon' => 'clientele'],
    ['key' => 'social-accounts', 'href' => 'social-accounts.php', 'label' => 'Connected Accounts', 'icon' => 'device'],
    ['key' => 'posts', 'href' => 'posts.php', 'label' => 'Posts', 'icon' => 'blog'],
    ['key' => 'calendar', 'href' => 'calendar.php', 'label' => 'Calendar', 'icon' => 'calendar'],
    ['key' => 'social-inbox', 'href' => 'social-inbox.php', 'label' => 'Inbox', 'icon' => 'bell'],
    ['key' => 'social-comments', 'href' => 'social-comments.php', 'label' => 'Comments', 'icon' => 'enquiry'],
    ['key' => 'social-webhooks', 'href' => 'social-webhooks.php', 'label' => 'Webhook Events', 'icon' => 'key'],
    ['key' => 'social-platforms', 'href' => 'social-platforms.php', 'label' => 'Platforms', 'icon' => 'shield'],
  ]],
  ['key' => 'support', 'title' => 'Support', 'items' => [
    ['key' => 'enquiries', 'href' => 'enquiries.php', 'label' => 'Enquiries', 'icon' => 'enquiry'],
    ['key' => 'feedback', 'href' => 'feedback.php', 'label' => 'Feedback', 'icon' => 'star'],
    ['key' => 'notification', 'href' => 'notification.php', 'label' => 'Notifications', 'icon' => 'bell'],
    ['key' => 'webpush', 'href' => 'webpush.php', 'label' => 'Web Push', 'icon' => 'device'],
  ]],
  ['key' => 'settings', 'title' => 'Settings', 'items' => [
    ['key' => 'sessions', 'href' => 'sessions.php', 'label' => 'My Sessions', 'icon' => 'device'],
    ['key' => 'settings', 'href' => 'settings.php', 'label' => 'Site Settings', 'icon' => 'gear'],
    ['key' => 'profile', 'href' => 'profile.php', 'label' => 'My Profile', 'icon' => 'user'],
  ]],
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
        'layers' => '<path d="M10 1.5 18 6l-8 4.5L2 6l8-4.5Zm0 8.6 6.4-3.6L18 7.4v.1L10 12 2 7.5v-.1l1.6-.9L10 10.1Zm0 4.4 6.4-3.6L18 12v.1L10 16.5 2 12v-.1l1.6-.9L10 14.5Z"/>',
        'folder' => '<path d="M2 4a1 1 0 0 1 1-1h4.4l1.6 2H17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z"/>',
        'package' => '<path d="M10 1.5 18 6l-8 4.5L2 6l8-4.5Zm-7 6.2 6.3 3.5v7.3L3 14.9V7.7Zm14 0v7.2l-6.3 3.6v-7.3L17 7.7Z"/>',
        'blog'   => '<path d="M4 2h9l4 4v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V6h2.5L12 3.5ZM5 9h9v1.3H5V9Zm0 3h9v1.3H5V12Zm0 3h6v1.3H5V15Z"/>',
        'calendar' => '<path d="M6 1.5a1 1 0 0 1 1 1V3h6v-.5a1 1 0 1 1 2 0V3h1a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1v-.5a1 1 0 0 1 1-1ZM5 8v9h10V8H5Zm2 2h2v2H7v-2Zm4 0h2v2h-2v-2Z"/>',
        'enquiry' => '<path d="M2.5 5.5h15v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9Zm.4 0L10 10.6l7.1-5.1H2.9Z"/>',
        'star' => '<path d="M10 1.7l2.7 5.5 6.1.9-4.4 4.3 1 6.1L10 15.4l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L10 1.7Z"/>',
        'clientele' => '<path d="M4 2h4v4H4V2Zm6 0h6v4h-6V2ZM4 8h4v4H4V8Zm6 0h6v4h-6V8ZM4 14h4v4H4v-4Zm6 0h6v4h-6v-4Z"/>',
        'gear'   => '<path d="M10 6.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm7.4 3.2c0 .4 0 .8-.1 1.1l1.6 1.3-1.6 2.7-1.9-.6c-.6.5-1.3.9-2 1.1L13 18h-3l-.4-2.3c-.7-.2-1.4-.6-2-1.1l-1.9.6-1.6-2.7 1.6-1.3a6 6 0 0 1 0-2.2L4.1 7.7l1.6-2.7 1.9.6c.6-.5 1.3-.9 2-1.1L10 2h3l.4 2.3c.7.2 1.4.6 2 1.1l1.9-.6 1.6 2.7-1.6 1.3c.1.3.1.7.1 1.1Z" stroke="currentColor" stroke-width="0.4"/>',
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
      <?php foreach ($navGroups as $group): ?>
        <div class="sidebar-group" data-group="<?= htmlspecialchars($group['key']) ?>">
          <button class="sidebar-group-header" type="button" aria-expanded="true" title="<?= htmlspecialchars($group['title']) ?>">
            <span class="group-title"><?= htmlspecialchars($group['title']) ?></span>
            <svg class="group-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="sidebar-group-body">
            <?php foreach ($group['items'] as $item): ?>
              <a href="<?= htmlspecialchars($item['href']) ?>" class="sidebar-link <?= $activeNav === $item['key'] ? 'is-active' : '' ?>">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><?= nav_icon($item['icon']) ?></svg>
                <span><?= htmlspecialchars($item['label']) ?></span>
              </a>
            <?php endforeach; ?>
          </div>
        </div>
      <?php endforeach; ?>
    </nav>
  <div class="sidebar-footer">
    <span class="sidebar-footer-label">API</span>
    <code class="sidebar-footer-url"><?= htmlspecialchars(parse_url(API_BASE_URL, PHP_URL_HOST) ?: API_BASE_URL) ?></code>
  </div>
</aside>
