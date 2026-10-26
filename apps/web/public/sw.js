/* global self, URL */
// Shows pushed notifications. The server writes the whole message in the person's language, so
// nothing here is translated. A browser drops a subscription whose pushes show nothing, so a
// message that cannot be read still shows a bare notification.
self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // Falls through to the bare notification.
  }
  const url = typeof message.url === 'string' && message.url.startsWith('/') ? message.url : '/';
  event.waitUntil(
    self.registration.showNotification(typeof message.title === 'string' ? message.title : 'Interim', {
      body: typeof message.body === 'string' ? message.body : undefined,
      tag: typeof message.tag === 'string' ? message.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client);
      return open ? open.navigate(url).then((client) => client?.focus()) : self.clients.openWindow(url);
    }),
  );
});
