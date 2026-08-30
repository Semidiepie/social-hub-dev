// DesktopSidebar — persistent left navigation rail for the web / desktop
// experience. Only rendered when `useResponsive().isDesktop` is true.
//
// Design intent:
//  - Mirrors the mobile bottom-tab destinations 1:1 so users switching
//    between phone and desktop see identical navigation.
//  - Adds the secondary destinations that are only icons in the header
//    on mobile (Messages, Blogs, Notifications, Settings).
//  - Highlights the active route by matching the router path prefix so
//    e.g. `/blogs/new` still marks the "Blogs" item as active.
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";

import { SIDEBAR_WIDTH } from "@/src/hooks/useResponsive";
import { colors, radii, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

interface NavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  route: string;
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: "home-outline",
    iconActive: "home",
    route: "/(tabs)/home",
    match: (p) => p === "/" || p.startsWith("/home") || p.endsWith("/(tabs)/home"),
  },
  {
    key: "discover",
    label: "Discover",
    icon: "compass-outline",
    iconActive: "compass",
    route: "/(tabs)/discover",
    match: (p) => p.includes("discover"),
  },
  {
    key: "messages",
    label: "Messages",
    icon: "paper-plane-outline",
    iconActive: "paper-plane",
    route: "/messages",
    match: (p) => p.startsWith("/messages"),
  },
  {
    key: "blogs",
    label: "Blogs",
    icon: "library-outline",
    iconActive: "library",
    route: "/blogs",
    match: (p) => p.startsWith("/blogs"),
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "notifications-outline",
    iconActive: "notifications",
    route: "/notifications",
    match: (p) => p.startsWith("/notifications"),
  },
  {
    key: "profile",
    label: "Profile",
    icon: "person-outline",
    iconActive: "person",
    route: "/(tabs)/profile",
    match: (p) => p.includes("profile"),
  },
];

export const DesktopSidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <Pressable
          style={styles.brandRow}
          onPress={() => router.push("/(tabs)/home" as never)}
          accessibilityRole="link"
        >
          <LinearGradient
            colors={["#FF8C66", "#FF6B3D"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandMark}
          >
            <Ionicons name="flash" size={20} color={colors.bg} />
          </LinearGradient>
          <Text style={styles.brand}>PostMePlex</Text>
        </Pressable>

        {/* Nav items */}
        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.route as never)}
                style={({ hovered, pressed }) => [
                  styles.navRow,
                  active && styles.navRowActive,
                  // hovered is web-only via react-native-web
                  // @ts-expect-error hovered exists on web
                  hovered && !active && styles.navRowHover,
                  pressed && styles.navRowPressed,
                ]}
                accessibilityRole="link"
              >
                <Ionicons
                  name={active ? item.iconActive : item.icon}
                  size={22}
                  color={active ? colors.primary : colors.textPrimary}
                />
                <Text
                  style={[
                    styles.navLabel,
                    active && styles.navLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Create button (matches the mobile FAB) */}
        <Pressable
          onPress={() => router.push("/(tabs)/create" as never)}
          style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={["#FF8C66", "#FF6B3D"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createBtnInner}
          >
            <Ionicons name="add-circle" size={20} color={colors.bg} />
            <Text style={styles.createBtnText}>Create</Text>
          </LinearGradient>
        </Pressable>

        {/* Spacer to push settings to bottom */}
        <View style={{ flex: 1 }} />

        {/* Footer: settings + current user chip */}
        <Pressable
          onPress={() => router.push("/settings" as never)}
          style={({ hovered, pressed }) => [
            styles.footerRow,
            // @ts-expect-error hovered exists on web
            hovered && styles.navRowHover,
            pressed && styles.navRowPressed,
          ]}
          accessibilityRole="link"
        >
          <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          <Text style={styles.navLabel}>Settings</Text>
        </Pressable>

        {user ? (
          <View style={styles.userChip}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {(user.display_name ?? user.username ?? "?").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {user.display_name || user.username}
              </Text>
              <Text style={styles.userHandle} numberOfLines={1}>
                @{user.username}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Fixed rail on the left; content columns pad by SIDEBAR_WIDTH.
    // On web this ends up as `position: fixed` because of react-native-web.
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    backgroundColor: colors.bg,
    zIndex: 20,
  },
  inner: {
    flexGrow: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  navList: {
    gap: 2,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  navRowActive: {
    backgroundColor: colors.primaryMuted,
  },
  navRowHover: {
    backgroundColor: colors.elevated,
  },
  navRowPressed: {
    opacity: 0.85,
  },
  navLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  navLabelActive: {
    color: colors.primary,
    fontWeight: "800",
  },
  createBtn: {
    marginTop: spacing.md,
    borderRadius: radii.full,
    overflow: "hidden",
  },
  createBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  createBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    color: colors.primary,
    fontWeight: "900",
    fontSize: 14,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  userHandle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
});

export default DesktopSidebar;
