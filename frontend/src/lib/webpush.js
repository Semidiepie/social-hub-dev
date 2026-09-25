import { api } from "@/lib/api";

// Browser Web Push helpers (VAPID). Independent of the Expo mobile push.
function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Subscribe this browser to Web Push. Must be triggered from a user gesture on
// first run (for the permission prompt). Returns true when subscribed.
export async function enableBrowserPush() {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.get("/push/vapid-public-key");
    if (!publicKey) return false;
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api.post("/push/web-subscribe", sub.toJSON());
  return true;
}

export async function disableBrowserPush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;
  await api.post("/push/web-unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function isBrowserPushEnabled() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return !!(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}
