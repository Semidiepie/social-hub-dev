// PostMePlex Market catalog — all cosmetics are FREE to equip.
export const FRAMES = [
  { id: "gold", name: "Golden Glow", blurb: "Pulsing gold aura" },
  { id: "hearts", name: "Sweetheart", blurb: "Soft pink pulse" },
  { id: "emerald", name: "Emerald Aura", blurb: "Green energy" },
  { id: "violet", name: "Violet Pulse", blurb: "Mystic purple" },
  { id: "neon", name: "Neon Cycle", blurb: "Spinning neon" },
  { id: "rainbow", name: "Rainbow Spin", blurb: "Full spectrum" },
  { id: "fire", name: "Blaze", blurb: "Spinning flames" },
  { id: "frost", name: "Frostbite", blurb: "Icy shimmer" },
  { id: "ocean", name: "Deep Ocean", blurb: "Aqua swirl" },
];

// primary = HSL triplet matching the app's --primary variable format.
export const THEMES = [
  { id: "fall", name: "Autumn Fall", emoji: "🍂", primary: "25 90% 52%", blurb: "Falling leaves" },
  { id: "winter", name: "Winter Frost", emoji: "❄️", primary: "205 85% 60%", blurb: "Gentle snowfall" },
  { id: "halloween", name: "Halloween", emoji: "🦇", primary: "270 70% 58%", blurb: "Spooky bats" },
  { id: "christmas", name: "Christmas", emoji: "🎄", primary: "0 75% 52%", blurb: "Snow & cheer" },
  { id: "valentine", name: "Valentine's", emoji: "💖", primary: "335 85% 62%", blurb: "Floating hearts" },
  { id: "spring", name: "Spring Bloom", emoji: "🌸", primary: "330 72% 66%", blurb: "Cherry blossoms" },
  { id: "summer", name: "Summer Sun", emoji: "☀️", primary: "42 95% 55%", blurb: "Sunny sparkles" },
  { id: "newyear", name: "New Year", emoji: "🎉", primary: "46 92% 55%", blurb: "Confetti party" },
  { id: "stpatrick", name: "St. Patrick's", emoji: "🍀", primary: "140 60% 42%", blurb: "Lucky clovers" },
];

export const frameById = (id) => FRAMES.find((f) => f.id === id) || null;
export const themeById = (id) => THEMES.find((t) => t.id === id) || null;
