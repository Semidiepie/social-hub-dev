/* PostMePlex Web Push service worker. Displays system notifications even when
   the tab/site is closed, and focuses/opens the app when clicked. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "PostMePlex", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "PostMePlex";
  const options = {
    body: data.body || "",
    icon: data.icon || "/logo-512.png",
    badge: data.badge || "/favicon.png",
    tag: data.tag || "postmeplex-activity",
    data: { url: data.url || "/notifications" },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return clients.openWindow(target);
    })
  );
});
