import Hls from "hls.js";

// Attach an HLS (.m3u8) source to a <video> element the robust way.
//
// Prefer hls.js wherever Media Source Extensions exist (Android Chrome, desktop
// browsers) and fall back to NATIVE HLS only on iOS/Safari (where hls.js isn't
// supported). This ordering matters: some Android Chrome builds falsely report
// canPlayType("application/vnd.apple.mpegurl") === "maybe" and then fail to
// actually play HLS natively — which is why Videos played on iPhone but not on
// Android. Checking Hls.isSupported() first avoids that trap.
//
// Returns a cleanup function to call on unmount / source change.
export function attachHls(el, url, opts = {}) {
  if (!el || !url) return () => {};
  if (Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, ...opts });
    hls.loadSource(url);
    hls.attachMedia(el);
    return () => hls.destroy();
  }
  // iOS Safari / anything with native HLS support.
  el.src = url;
  return () => { el.removeAttribute("src"); try { el.load(); } catch { /* noop */ } };
}
