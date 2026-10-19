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
  event.waitUntil((async () => {
    // Don't spam a banner when you're already looking at this exact chat.
    if (data.suppressIfFocused && data.url) {
      const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const focusedHere = wins.some((w) => w.focused && w.url.indexOf(data.url) !== -1);
      if (focusedHere) return;
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) {
        // Focus the already-open app and tell it to route client-side. postMessage
        // works everywhere (incl. iOS, where WindowClient.navigate() is unsupported);
        // navigate() is a best-effort fallback for odd timing on other browsers.
        return existing.focus().then(() => {
          existing.postMessage({ type: "pmp-navigate", url });
          if ("navigate" in existing) { try { existing.navigate(target); } catch (_) {} }
        });
      }
      return clients.openWindow(target);
    })
  );
});
