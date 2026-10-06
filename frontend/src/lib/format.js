// Small time-ago formatter — avoids pulling in another date lib.
export function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d > 365 ? "numeric" : undefined,
  });
}

export function formatNumber(n) {
  if (n == null) return "0";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}:${String(rem).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

// Fallback SVG avatar for missing images.
export const AVATAR_FALLBACK =
  "https://res.cloudinary.com/dpnrol54k/image/upload/v1790317297/postmeplex_icon_v2.png";

// Clean channel-handle URLs. Prefer /@username; fall back to legacy /user/:id.
export function userPath(u) {
  if (u?.username) return `/@${u.username}`;
  if (u?.id) return `/user/${u.id}`;
  return "/";
}

// A video lives under its author's handle: /@username/{videoId}.
export function videoPath(v) {
  if (v?.author?.username) return `/@${v.author.username}/${v.id}`;
  return `/videos/${v?.id}`;
}

// Cosmetic profile frame to render around an author's avatar — only when the
// user has one equipped AND frames enabled. Returns the frame id or null.
export function frameOf(u) {
  if (!u) return null;
  const enabled = u.frame_enabled !== false; // default true
  if (!enabled) return null;
  if (u.equipped_frame === "custom") return u.custom_frame || null; // Sage-designed spec object
  return u.equipped_frame || null;
}

// Verified-badge color: RED for approved "Remembering" accounts, brand otherwise.
export function badgeCls(entity, base = "") {
  const red = !!entity?.remembering;
  return `${base} ${red ? "fill-red-500 text-background" : "fill-primary text-background"}`.trim();
}

// Admin-assigned custom verified-badge color. Returns an inline style that
// recolors ONLY the badge body (the check-mark tick keeps its class color).
// Inline `fill` overrides whatever fill class badgeCls set. Undefined when no
// custom color, so the default brand/red styling applies.
export function badgeStyle(entity) {
  const color = entity?.verified_color;
  return color ? { fill: color } : undefined;
}
