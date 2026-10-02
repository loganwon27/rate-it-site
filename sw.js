// Rate It service worker: shows push notifications and opens the right page when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const url = data.url || self.registration.scope;
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'Rate It', {
      body: data.body || '',
      icon: 'icon.png',
      badge: 'icon.png',
      tag: url,
      data: { url },
    });
    if (data.badge != null && self.navigator.setAppBadge) self.navigator.setAppBadge(data.badge).catch(() => {});
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (open) {
      await open.focus();
      return open.navigate(url).catch(() => open.postMessage({ type: 'open', url }));
    }
    return self.clients.openWindow(url);
  })());
});
