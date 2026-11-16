import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { verifiedColor } from "../utils/format";

export const GOLD_BADGE = "gold";
export const GOLD_BADGE_COLOR = "#F5C542";
export const DEFAULT_BADGE_COLOR = "#2563EB";

export type BadgeUser = {
  is_verified?: boolean | null;
  verified_color?: string | null;
  remembering?: boolean | null;
} | null | undefined;

export function isGoldBadge(user: BadgeUser): boolean {
  return !!user && user.verified_color === GOLD_BADGE;
}

/**
 * Verified badge, matching the web app (frontend/src/lib/format.js):
 * a coloured circle with a check next to the display name.
 * - Default (no custom colour): blue #2563EB.
 * - Admin-set colour: user.verified_color (set in Admin -> Verify accounts
 *   via the "Set with Sage" colour-description field, POST
 *   /admin/users/{id}/verify-color {description}).
 * - Gold: verified_color === "gold" (the "Gold" toggle in Verify accounts,
 *   POST /admin/users/{id}/verify-gold {gold}) -> gold/yellow circle
 *   #F5C542 with a DARK check (all other colours use a white check).
 * - Memorial ("Remembering") accounts: red #ef4444.
 * Rendered only when user.is_verified is true.
 */
export default function VerifiedBadge({ user, size = 14 }: { user: BadgeUser; size?: number }) {
  if (!user || !user.is_verified) return null;
  const colour = verifiedColor({ verified_color: user.verified_color, remembering: user.remembering ?? undefined }, DEFAULT_BADGE_COLOR);
  const gold = isGoldBadge(user);
  const checkColour = gold ? "#231A00" : "#FFFFFF";
  return (
    <View
      testID="verified-badge"
      accessibilityLabel={gold ? "Gold verified account" : "Verified account"}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colour }]}
    >
      <Ionicons name="checkmark" size={Math.round(size * 0.68)} color={checkColour} style={styles.check} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  check: { fontWeight: "700" },
});
