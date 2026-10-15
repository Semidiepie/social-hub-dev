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

// iOS (incl. iPadOS reporting as Mac) only exposes Web Push inside an installed PWA.
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true
  );
}

// Returns a reason string when push can't be enabled here, else null.
//  - "ios-install": iPhone/iPad in a normal Safari tab → must Add to Home Screen first
//  - "unsupported": browser has no Web Push at all
export function pushUnavailableReason() {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  return null;
}

// Subscribe this browser to Web Push. Must be triggered from a user gesture on
// first run (for the permission prompt). Returns true when subscribed.
export async function enableBrowserPush() {
  const reason = pushUnavailableReason();
  if (reason === "ios-install") {
    throw new Error("On iPhone/iPad, first add PostMePlex to your Home Screen, then open it from that icon to turn on notifications.");
  }
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  // Never hang if the service worker never takes control (common on iOS Safari tabs).
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Service worker didn't start — reload the page and try again.")), 8000)),
  ]);
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
