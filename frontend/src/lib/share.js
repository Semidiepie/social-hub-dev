import { toast } from "sonner";

const REF_KEY = "postmeplex.ref";

// Persist an inbound ?ref= so it survives navigation to /register.
export function captureRef() {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem(REF_KEY, ref);
  } catch {
    /* ignore */
  }
}

export function getRef() {
  try {
    return localStorage.getItem(REF_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function clearRef() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

// Native share sheet with clipboard fallback + toast.
export async function shareUrl(url, title, copiedMsg = "Link copied!") {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success(copiedMsg);
    }
  } catch {
    /* user cancelled */
  }
}

export const origin = () => window.location.origin;
