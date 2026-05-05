/* Nexus service worker — handles Web Push notifications.
 *
 * The dashboard registers this SW once the user opts into browser
 * notifications in Settings → Notifications. It does not cache any
 * resources (Nexus dashboard is intentionally network-first; the SW
 * only exists for the push API).
 */

self.addEventListener('install', (event) => {
  // Activate immediately on first install so the registration is usable
  // without forcing a page reload.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { title: 'Nexus', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Nexus';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'nexus-alert',
    data: payload.data || {},
    timestamp: payload.timestamp || Date.now(),
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // If a Nexus tab is already open, focus it and navigate.
      for (const w of wins) {
        if ('focus' in w) {
          w.focus();
          if ('navigate' in w) w.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
