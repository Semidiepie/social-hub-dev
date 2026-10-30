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

// Compact token/balance formatting: 999 → "999", 1300 → "1.3K",
// 134600 → "134.6K", 1000000 → "1M", 1200000 → "1.2M", 2500000000 → "2.5B".
export function formatTokens(n) {
  const num = Number(n) || 0;
  const neg = num < 0;
  const abs = Math.abs(num);
  const trim = (x) => {
    const s = x.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  let out;
  if (abs < 1000) out = String(Math.round(abs));
  else if (abs < 1_000_000) out = `${trim(abs / 1000)}K`;
  else if (abs < 1_000_000_000) out = `${trim(abs / 1_000_000)}M`;
  else out = `${trim(abs / 1_000_000_000)}B`;
  return (neg ? "-" : "") + out;
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

// Fallback SVG avatar for missing images. Hosted on PostMePlex storage.
export const AVATAR_FALLBACK =
  `${process.env.REACT_APP_BACKEND_URL || ""}/api/files/postmeplex/branding/default_avatar.png`;

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
// Special sentinel "gold" → premium X-style gold badge with a soft glow.
export const GOLD_BADGE = "gold";
export function badgeStyle(entity) {
  const color = entity?.verified_color;
  if (!color) return undefined;
  if (color === GOLD_BADGE) {
    return { fill: "url(#pmp-gold)", filter: "drop-shadow(0 1px 1px rgba(120,80,10,0.55)) drop-shadow(0 0 2px rgba(240,190,70,0.5))" };
  }
  return { fill: color };
}
