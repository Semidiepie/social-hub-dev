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
  if (!pushSupported()) return isIOS() ? "ios-version" : "unsupported";
  return null;
}

function reasonMessage(reason) {
  switch (reason) {
    case "ios-install":
      return "On iPhone/iPad, first add PostMePlex to your Home Screen (tap Share → Add to Home Screen), then open it from that icon and try again.";
    case "ios-version":
      return "Web notifications need iOS 16.4 or newer. Update your iPhone/iPad, then try again. (If you recently added it, remove the icon, re-add it, and reopen.)";
    case "unsupported":
      return "This browser doesn't support web notifications. Try Chrome, Edge, or Safari 16.4+.";
    default:
      return "Couldn't enable notifications — please try again.";
  }
}

// Subscribe this browser to Web Push. Must be triggered from a user gesture on
// first run (for the permission prompt). Returns true when subscribed.
export async function enableBrowserPush() {
  const reason = pushUnavailableReason();
  if (reason) throw new Error(reasonMessage(reason));
  // iOS only prompts once; if it's stuck blocked, tapping again does nothing — guide a reset.
  if (Notification.permission === "denied") {
    throw new Error(
      isIOS()
        ? "Notifications are blocked. Remove PostMePlex from your Home Screen, re-add it (Share → Add to Home Screen), open it from that icon, then try again."
        : "Notifications are blocked in your browser — enable them for this site in your browser settings, then retry."
    );
  }
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission wasn't granted. Tap again and choose Allow.");

  // Explicitly (re)register the push SW — on an installed iOS PWA the 'load'-time
  // registration may have been missed, so serviceWorker.ready can hang forever. We
  // register here and wait for it to actually activate.
  const registration = await getActivePushRegistration();
  if (!registration) throw new Error("Couldn't start the notifications service. Fully close the app, reopen it from the Home Screen, and try again.");
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.get("/push/vapid-public-key");
    if (!publicKey) throw new Error("Notifications aren't configured on the server. Please try again later.");
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api.post("/push/web-subscribe", sub.toJSON());
  return true;
}

// Register /push-sw.js and resolve once it's active (with a bounded wait). Returns the
// registration, or null if it never activates.
async function getActivePushRegistration() {
  let registration;
  try {
    registration =
      (await navigator.serviceWorker.getRegistration("/push-sw.js")) ||
      (await navigator.serviceWorker.register("/push-sw.js"));
  } catch {
    return null;
  }
  if (registration.active) return registration;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 10000);
    const sw = registration.installing || registration.waiting;
    if (sw) {
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") { clearTimeout(timer); resolve(); }
      });
    }
    navigator.serviceWorker.ready.then(() => { clearTimeout(timer); resolve(); }).catch(() => {});
  });
  return (await navigator.serviceWorker.getRegistration("/push-sw.js")) || registration;
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
