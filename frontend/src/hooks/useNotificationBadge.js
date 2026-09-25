import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { enableBrowserPush, isBrowserPushEnabled, pushSupported } from "@/lib/webpush";

const BASE_TITLE = "PostMePlex";
const POLL_MS = 30000;

// Draw a favicon with a red badge dot when there are unread notifications.
function setFaviconBadge(hasUnread) {
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const draw = (img) => {
      ctx.clearRect(0, 0, size, size);
      if (img) ctx.drawImage(img, 0, 0, size, size);
      if (hasUnread) {
        ctx.beginPath();
        ctx.arc(size - 16, 16, 14, 0, Math.PI * 2);
        ctx.fillStyle = "#FF3B30";
        ctx.fill();
        ctx.strokeStyle = "#12141c";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.type = "image/png";
      link.href = canvas.toDataURL("image/png");
    };
    const img = new Image();
    img.onload = () => draw(img);
    img.onerror = () => draw(null);
    img.src = "/favicon.png";
  } catch {
    /* ignore */
  }
}

// Polls the unread notification count and reflects it in:
//  - the browser tab title  →  "(3) PostMePlex"
//  - a red dot on the favicon
//  - a native browser notification when new activity arrives while the tab is
//    hidden (in addition to Web Push, which covers the fully-closed case).
export function useNotificationBadge() {
  const { user } = useAuth();
  const lastCountRef = useRef(0);
  const pushTriedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      document.title = BASE_TITLE;
      setFaviconBadge(false);
      lastCountRef.current = 0;
      return;
    }

    let alive = true;
    let timer = null;

    // If the user already granted notifications, silently (re)subscribe to Web
    // Push so closed-tab alerts keep working. No prompt if not already granted.
    (async () => {
      if (pushTriedRef.current || !pushSupported()) return;
      pushTriedRef.current = true;
      if (Notification.permission === "granted" && !(await isBrowserPushEnabled())) {
        enableBrowserPush().catch(() => {});
      }
    })();

    const tick = async () => {
      try {
        const { count } = await api.get("/notifications/unread-count");
        if (!alive) return;
        document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
        setFaviconBadge(count > 0);
        // Foreground fallback: if new items arrived while the tab is hidden and
        // permission is granted, surface a quick browser notification.
        if (
          count > lastCountRef.current &&
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(BASE_TITLE, {
              body: `You have ${count} new notification${count === 1 ? "" : "s"}.`,
              icon: "/logo-512.png",
              tag: "postmeplex-unread",
            });
          } catch {
            /* some browsers require the SW notification instead */
          }
        }
        lastCountRef.current = count;
      } catch {
        /* ignore transient errors */
      }
    };

    tick();
    timer = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);
}
