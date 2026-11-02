// Maps incoming deep links (iOS Universal Links / Android App Links opened from a
// notification tap) onto the right Expo Router screen. Web notification URLs use
// paths like /posts/:id and /reels/:id that differ from the mobile routes, so we
// rewrite them here and fall back to the notifications inbox for anything unmapped.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    let p = path || "/";
    // Universal links arrive as full URLs (https://www.postmeplex.com/...); strip
    // the scheme + host down to the pathname. Custom-scheme links already are paths.
    const url = p.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i);
    if (url) p = url[1] || "/";
    const pathname = p.split(/[?#]/)[0] || "/";

    if (pathname === "/" || pathname === "") return "/";

    // Rewrite web-only paths to their mobile equivalents.
    let out = pathname;
    if (/^\/posts\//.test(out)) out = out.replace(/^\/posts\//, "/post/");
    else if (/^\/reels\//.test(out)) out = out.replace(/^\/reels\//, "/post/");

    // Route prefixes the mobile app can open directly.
    const known = [
      "/post/", "/profile/", "/messages", "/video/", "/live/", "/blogs",
      "/notifications", "/wallet", "/story/", "/settings", "/music", "/admin",
    ];
    if (known.some((k) => out === k || out.startsWith(k))) return out;

    // Unmapped notifications (collab, pet, etc.) land on the inbox.
    return "/notifications";
  } catch {
    return "/notifications";
  }
}
