/**
 * /sw.js — Unified Service Worker
 *
 * Registered from:
 *   - main/includes/footer.php  (guest/public subscribers)
 *   - admin panel               (registered user subscribers)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION 1 — LIFECYCLE (install / activate)
 * ─────────────────────────────────────────────────────────────────────────────
 */

self.addEventListener('install', () => {
  console.log('sw.js() :: install event');
  // Skip waiting so this SW activates immediately without waiting for old tabs.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('sw.js() :: activate event');
  // Claim all open clients so the SW controls them right away.
  event.waitUntil(self.clients.claim());
});


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION 2 — SUBSCRIPTIONS / SUBSCRIBERS
 * Handles push events sent by the server (WebPushService::_sendToRow).
 * Displays a notification with full options including vibrate, renotify, etc.
 * ─────────────────────────────────────────────────────────────────────────────
 */

self.addEventListener('push', (event) => {
  console.log('sw.js() :: push event fired');

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.warn('sw.js() :: push event :: failed to parse JSON, falling back to text', e);
    data = {
      title: 'Notification',
      body: event.data ? event.data.text() : '',
    };
  }
  console.log('sw.js() :: push event :: data :', data);

  const title = data.title || 'New Notification';

  const options = {
    body: data.body || "",
    icon: data.icon || "",
    badge: data.badge || "",
    tag: data.tag || "default",
    actions: data.actions || [],
    vibrate: data.vibrate || [200, 100, 200, 100, 200, 100, 200],
    requireInteraction: data.requireInteraction !== undefined ? !!data.requireInteraction : true,
    renotify: data.renotify !== undefined ? !!data.renotify : true,
    sticky: data.sticky !== undefined ? !!data.sticky : true,
    // Merge any extra payload (e.g. url) into notification data
    data: {
      url: data.url || '/',
      ...(data.data || {}),
    },
  };
  console.log("sw.js() :: push event :: options: ", options);

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('sw.js() :: push event :: notification displayed successfully');
      })
      .catch((err) => {
        console.error('sw.js() :: push event :: notification display error :', err);
      })
  );
});


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION 3 — SEND NOTIFICATION / NOTIFICATION CLICK
 * Handles what happens when the user clicks a displayed notification.
 * Focuses an existing matching tab, or opens a new window to the target URL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

self.addEventListener('notificationclick', (event) => {
  console.log('sw.js() :: notificationclick event :', event);

  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  console.log('sw.js() :: notificationclick :: navigating to :', targetUrl);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus an already-open tab at the target URL if one exists
        for (const client of clients) {
          if (client.url === targetUrl && 'focus' in client) {
            console.log('sw.js() :: notificationclick :: focusing existing tab');
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (self.clients.openWindow) {
          console.log('sw.js() :: notificationclick :: opening new window');
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
