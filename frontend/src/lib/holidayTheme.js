// Helpers for the global Holiday Theme: convert a spec's hex palette into the
// app's HSL CSS variables and apply/clear them site-wide.

function hexToRgb(hex) {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const trip = ({ h, s, l }) => `${Math.round(h)} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}%`;

export function hexToHslTriplet(hex) {
  return trip(rgbToHsl(hexToRgb(hex)));
}

function shiftL(hsl, delta) {
  return trip({ h: hsl.h, s: hsl.s, l: clamp(hsl.l + delta, 0, 100) });
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// The CSS variables we override (and later remove on "off").
const VARS = [
  "--background", "--foreground", "--card", "--card-foreground", "--popover",
  "--popover-foreground", "--primary", "--primary-foreground", "--accent",
  "--accent-foreground", "--secondary", "--secondary-foreground", "--muted",
  "--muted-foreground", "--border", "--input", "--ring", "--elevated",
];

export function applyThemeVars(spec) {
  if (!spec) return;
  const root = document.documentElement;
  const light = spec.mode === "light";
  const bg = rgbToHsl(hexToRgb(spec.background));
  let fg = rgbToHsl(hexToRgb(spec.foreground));
  // Readability guard: if SAGE picked text too close to the background, force a
  // high-contrast text color so nothing is ever unreadable.
  if (Math.abs(luminance(spec.foreground) - luminance(spec.background)) < 0.42) {
    fg = luminance(spec.background) < 0.5 ? { h: 0, s: 0, l: 98 } : { h: 222, s: 25, l: 12 };
  }
  const primFg = luminance(spec.primary) > 0.62 ? "222 25% 12%" : "0 0% 100%";
  const accFg = luminance(spec.accent) > 0.62 ? "222 25% 12%" : "0 0% 100%";
  const set = {
    "--background": trip(bg),
    "--foreground": trip(fg),
    "--card": shiftL(bg, light ? -3 : 4),
    "--card-foreground": trip(fg),
    "--popover": shiftL(bg, light ? -3 : 4),
    "--popover-foreground": trip(fg),
    "--primary": hexToHslTriplet(spec.primary),
    "--primary-foreground": primFg,
    "--accent": hexToHslTriplet(spec.accent),
    "--accent-foreground": accFg,
    "--secondary": shiftL(bg, light ? -6 : 9),
    "--secondary-foreground": trip(fg),
    "--muted": shiftL(bg, light ? -6 : 9),
    "--muted-foreground": shiftL(fg, light ? 26 : -32),
    "--border": shiftL(bg, light ? -12 : 15),
    "--input": shiftL(bg, light ? -12 : 15),
    "--ring": hexToHslTriplet(spec.primary),
    // --elevated is consumed as a raw color (not hsl()-wrapped) by .pmp-chip /
    // .pmp-iconchip (the like/comment/share buttons). Recolor it too, or those
    // buttons keep the old gray and look like odd light blobs on a themed bg.
    "--elevated": `hsl(${shiftL(bg, light ? -8 : 12)})`,
  };
  Object.entries(set).forEach(([k, v]) => root.style.setProperty(k, v));
}

export function clearThemeVars() {
  const root = document.documentElement;
  VARS.forEach((k) => root.style.removeProperty(k));
}

export const PACK_LABELS = {
  halloween: "Halloween", christmas: "Christmas", valentines: "Valentine's",
  newyear: "New Year", thanksgiving: "Thanksgiving", easter: "Easter",
  anniversary: "Anniversary", generic: "Celebration",
};

// Quick-pick prompts shown as chips in the admin panel.
export const QUICK_PICKS = [
  { label: "🎃 Halloween", prompt: "Halloween" },
  { label: "🎄 Christmas", prompt: "Christmas" },
  { label: "💖 Valentine's Day", prompt: "Valentine's Day" },
  { label: "🎉 New Year", prompt: "New Year's Eve" },
  { label: "🦃 Thanksgiving", prompt: "Thanksgiving" },
  { label: "🐣 Easter", prompt: "Easter" },
  { label: "✨ PostMePlex 1 Year Anniversary", prompt: "PostMePlex 1 year anniversary celebration" },
];
