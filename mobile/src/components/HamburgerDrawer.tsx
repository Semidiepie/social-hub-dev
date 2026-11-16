import React, { useCallback, useEffect, useState } from "react";
import { Image, Modal, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { api, type WalletInfo } from "../api/client";
import { spacing } from "../theme";

/**
 * Side menu, matching the web app's side menu (frontend/src/components/AppShell.jsx
 * nav items, and HamburgerMenu.jsx on the web): same items, same order, same
 * destinations, same visibility rules.
 * Order (top to bottom): Home, Videos, Live, Reels, Music, Pet, Games
 * (only when games exist, GET /games/count > 0), Market, Wallet, Blogs,
 * Discover, Messages, Live Chat, Notifications, Post (submenu), Light mode
 * (theme toggle), Settings, Admin (admin accounts only, shield icon, links to
 * PostMePlex Studio at /admin), profile link (name + token balance), Log out.
 * Where the app has no dedicated screen for an item, the entry routes to the
 * closest existing screen (see mobile/app/pet.tsx, market.tsx, livechat.tsx,
 * games.tsx and videos.tsx).
 */
type MenuItem = { label: string; route: string; icon: keyof typeof Ionicons.glyphMap; testID: string };

const MENU: MenuItem[] = [
  { label: "Home", route: "/(tabs)/home", icon: "home-outline", testID: "drawer-home" },
  { label: "Videos", route: "/(tabs)/watch", icon: "play-circle-outline", testID: "drawer-videos" },
  { label: "Live", route: "/live", icon: "radio-outline", testID: "drawer-live" },
  { label: "Reels", route: "/(tabs)/reels", icon: "film-outline", testID: "drawer-reels" },
  { label: "Music", route: "/music", icon: "musical-notes-outline", testID: "drawer-music" },
  { label: "Pet", route: "/pet", icon: "paw-outline", testID: "drawer-pet" },
  { label: "Games", route: "/games", icon: "game-controller-outline", testID: "drawer-games" },
  { label: "Market", route: "/market", icon: "bag-outline", testID: "drawer-market" },
  { label: "Wallet", route: "/wallet", icon: "wallet-outline", testID: "drawer-wallet" },
  { label: "Blogs", route: "/blogs", icon: "book-outline", testID: "drawer-blogs" },
  { label: "Discover", route: "/(tabs)/discover", icon: "compass-outline", testID: "drawer-discover" },
  { label: "Messages", route: "/messages", icon: "paper-plane-outline", testID: "drawer-messages" },
  { label: "Live Chat", route: "/livechat", icon: "chatbubbles-outline", testID: "drawer-livechat" },
  { label: "Notifications", route: "/notifications", icon: "notifications-outline", testID: "drawer-notifications" },
];

const POST_ITEMS: MenuItem[] = [
  { label: "Post a reel", route: "/(tabs)/create", icon: "film-outline", testID: "drawer-post-reel" },
  { label: "Upload a video", route: "/video/upload", icon: "videocam-outline", testID: "drawer-post-video" },
  { label: "Write a blog", route: "/blogs/new", icon: "create-outline", testID: "drawer-post-blog" },
  { label: "Go live", route: "/live/new", icon: "radio-outline", testID: "drawer-post-live" },
];

function formatTokensLocal(n: number): string {
  return n.toLocaleString("en-CA");
}

export default function HamburgerDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, logout, patchUser } = useAuth();
  const { colors: themeColors, isLight, toggleTheme } = useAppTheme();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [hasGames, setHasGames] = useState(false);
  const [postOpen, setPostOpen] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const w = await api.get<WalletInfo>("/wallet");
      setWallet(w);
      if (typeof w.balance === "number") patchUser({ tokens: w.balance });
    } catch {}
  }, [patchUser]);

  useEffect(() => {
    if (!visible) return;
    loadWallet();
    api.get<{ count?: number }>("/games/count").then((r) => setHasGames((r?.count || 0) > 0)).catch(() => setHasGames(false));
  }, [visible, loadWallet]);

  const go = (route: string) => {
    onClose();
    router.push(route as never);
  };

  const claimDaily = async () => {
    if (claiming || (wallet && !wallet.can_claim_daily)) return;
    setClaiming(true);
    try {
      const w = await api.post<WalletInfo & { claimed?: number }>("/wallet/daily");
      setWallet((prev) => (prev ? { ...prev, balance: w.balance, can_claim_daily: false } : w));
      if (typeof w.balance === "number") patchUser({ tokens: w.balance });
    } catch {} finally {
      setClaiming(false);
    }
  };

  const balance = wallet?.balance ?? user?.tokens ?? 0;
  const isAdmin = !!(user?.is_admin || user?.is_super_admin);
  const c = themeColors;
  const items = MENU.filter((item) => item.label !== "Games" || hasGames);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} testID="hamburger-drawer-backdrop" />
        <SafeAreaView style={[styles.panel, { backgroundColor: c.bg }]}>
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <Text style={[styles.title, { color: c.textPrimary }]}>Menu</Text>
            <TouchableOpacity onPress={onClose} testID="drawer-close" accessibilityLabel="Close menu">
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <TouchableOpacity key={item.route + item.label} style={styles.link} onPress={() => go(item.route)} testID={item.testID}>
                <Ionicons name={item.icon} size={22} color={c.textSecondary} />
                <Text style={[styles.linkText, { color: c.textPrimary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.link} onPress={() => setPostOpen((v) => !v)} testID="drawer-post" accessibilityLabel="Post">
              <Ionicons name="add-circle-outline" size={22} color={c.primary} />
              <Text style={[styles.linkText, { color: c.textPrimary }]}>Post</Text>
              <Ionicons name={postOpen ? "chevron-up" : "chevron-down"} size={18} color={c.textSecondary} style={styles.chevron} />
            </TouchableOpacity>
            {postOpen && POST_ITEMS.map((item) => (
              <TouchableOpacity key={item.testID} style={[styles.link, styles.subLink]} onPress={() => go(item.route)} testID={item.testID}>
                <Ionicons name={item.icon} size={20} color={c.textSecondary} />
                <Text style={[styles.linkText, { color: c.textPrimary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.link, { justifyContent: "space-between" }]}>
              <TouchableOpacity style={styles.linkRow} onPress={toggleTheme} testID="drawer-light-mode" accessibilityLabel="Toggle light mode">
                <Ionicons name={isLight ? "moon-outline" : "sunny-outline"} size={22} color={c.textSecondary} />
                <Text style={[styles.linkText, { color: c.textPrimary }]}>{isLight ? "Dark mode" : "Light mode"}</Text>
              </TouchableOpacity>
              <Switch value={isLight} onValueChange={toggleTheme} trackColor={{ false: c.border, true: c.primary }} thumbColor="#FFFFFF" testID="drawer-light-mode-switch" />
            </View>
            <TouchableOpacity style={styles.link} onPress={() => go("/settings")} testID="drawer-settings">
              <Ionicons name="settings-outline" size={22} color={c.textSecondary} />
              <Text style={[styles.linkText, { color: c.textPrimary }]}>Settings</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity style={styles.link} onPress={() => go("/admin")} testID="drawer-admin">
                <Ionicons name="shield-outline" size={22} color={c.primary} />
                <Text style={[styles.linkText, { color: c.textPrimary }]}>Admin</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.profileCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => go("/profile")} testID="drawer-profile">
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
                  <Text style={styles.avatarFallbackText}>{(user?.display_name || user?.username || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.profileText}>
                <Text style={[styles.profileName, { color: c.textPrimary }]} numberOfLines={1}>{user?.display_name || user?.username || "Profile"}</Text>
                <Text style={[styles.profileMeta, { color: c.textSecondary }]} numberOfLines={1}>@{user?.username || ""} · {formatTokensLocal(balance)} tokens</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.walletCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => go("/wallet")} testID="drawer-wallet-balance">
              <Ionicons name="wallet-outline" size={20} color={c.primary} />
              <View style={styles.profileText}>
                <Text style={[styles.profileMeta, { color: c.textSecondary }]}>Token balance</Text>
                <Text style={[styles.profileName, { color: c.textPrimary }]}>{formatTokensLocal(balance)} tokens</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.claimButton, { backgroundColor: wallet && !wallet.can_claim_daily ? c.surface : c.primary, opacity: claiming ? 0.7 : 1 }]}
              onPress={claimDaily}
              disabled={claiming || !!(wallet && !wallet.can_claim_daily)}
              testID="drawer-claim-daily"
            >
              <Text style={[styles.claimText, { color: wallet && !wallet.can_claim_daily ? c.textSecondary : "#FFFFFF" }]}>
                {wallet && !wallet.can_claim_daily ? "Daily reward claimed" : claiming ? "Claiming..." : `Claim daily +${wallet?.daily_reward ?? 25}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.link, styles.logoutLink]}
              onPress={async () => { onClose(); await logout(); router.replace("/(auth)/welcome" as never); }}
              testID="drawer-logout"
            >
              <Ionicons name="log-out-outline" size={22} color={c.danger} />
              <Text style={[styles.linkText, { color: c.danger }]}>Log out</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,0.5)" },
  panel: { width: "88%", maxWidth: 360, height: "100%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: "800" },
  scroll: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  link: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 6 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  subLink: { paddingLeft: 28, paddingVertical: 9 },
  chevron: { marginLeft: "auto" },
  linkText: { fontSize: 16, fontWeight: "600" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  walletCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarFallbackText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  profileText: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: "700" },
  profileMeta: { fontSize: 13, marginTop: 2 },
  claimButton: { borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  claimText: { fontSize: 15, fontWeight: "700" },
  logoutLink: { marginTop: 8, marginBottom: 24 },
});

export { HamburgerDrawer };
