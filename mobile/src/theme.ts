// PostMePlex theme tokens — single source of truth for design system.
export const colors = {
  bg: "#12141c",
  surface: "#1A1D27",
  elevated: "#252936",
  primary: "#FF6B3D",
  primaryHover: "#FF8C66",
  primaryMuted: "rgba(255, 107, 61, 0.18)",
  primaryFaint: "rgba(255, 107, 61, 0.08)",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A5B5",
  textMuted: "#6B7080",
  border: "#2A2D3A",
  borderLight: "#3B3F54",
  live: "#FF3B30",
  liveMuted: "rgba(255, 59, 48, 0.18)",
  overlayDim: "rgba(18, 20, 28, 0.85)",
  success: "#34C759",
  danger: "#FF3B30",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const type = {
  h1: { fontSize: 32, fontWeight: "900" as const, letterSpacing: -1, color: colors.textPrimary },
  h2: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.5, color: colors.textPrimary },
  h3: { fontSize: 18, fontWeight: "700" as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22, color: colors.textPrimary },
  bodyMuted: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22, color: colors.textSecondary },
  label: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 1, textTransform: "uppercase" as const, color: colors.textSecondary },
  small: { fontSize: 13, fontWeight: "500" as const, color: colors.textSecondary },
};
