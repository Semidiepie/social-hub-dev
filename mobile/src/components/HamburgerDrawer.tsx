import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, WalletInfo } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing } from "@/src/theme";

const SHORTCUTS: { label: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Live", route: "/live", icon: "radio-outline" },
  { label: "Music", route: "/music", icon: "musical-notes-outline" },
  { label: "Blogs", route: "/blogs", icon: "library-outline" },
];

const LINKS: { label: string; route: string; icon: keyof typeof Ionicons.glyphMap; testID: string }[] = [
  { label: "Wallet", route: "/wallet", icon: "wallet-outline", testID: "drawer-wallet" },
  { label: "My Profile", route: "/profile", icon: "person-outline", testID: "drawer-profile" },
  { label: "Messages", route: "/messages", icon: "paper-plane-outline", testID: "drawer-messages" },
  { label: "Notifications", route: "/notifications", icon: "notifications-outline", testID: "drawer-notifications" },
  { label: "Settings", route: "/settings", icon: "settings-outline", testID: "drawer-settings" },
];

export function HamburgerDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, logout, patchUser } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [claiming, setClaiming] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const w = await api.get<WalletInfo>("/wallet");
      setWallet(w);
      patchUser({ tokens: w.balance });
    } catch {
      /* non-blocking */
    }
  }, [patchUser]);

  useEffect(() => {
    if (visible) loadWallet();
  }, [visible, loadWallet]);

  const go = (route: string) => {
    onClose();
    router.push(route as any);
  };

  const claimDaily = async () => {
    setClaiming(true);
    try {
      const res = await api.post<WalletInfo & { claimed: number }>("/wallet/daily");
      setWallet((w) => (w ? { ...w, balance: res.balance, can_claim_daily: false } : w));
      patchUser({ tokens: res.balance });
    } catch {
      /* already claimed */
    } finally {
      setClaiming(false);
    }
  };

  if (!user) return null;
  const balance = wallet?.balance ?? user.tokens ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <SafeAreaView edges={["top", "bottom"]} style={styles.panel} testID="hamburger-drawer-panel">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>
            {/* Profile card */}
            <TouchableOpacity style={styles.profileCard} onPress={() => go("/profile")} testID="drawer-profile-card">
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.display_name}</Text>
                <Text style={styles.handle}>@{user.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Wallet card */}
            <LinearGradient colors={[colors.primaryMuted, "rgba(255,107,61,0.04)"]} style={styles.walletCard}>
              <TouchableOpacity style={styles.walletTop} onPress={() => go("/wallet")}>
                <View style={styles.coinIcon}>
                  <Ionicons name="wallet" size={20} color={colors.bg} />
                </View>
                <View>
                  <Text style={styles.walletLabel}>BALANCE</Text>
                  <Text style={styles.walletValue} testID="drawer-token-balance">{balance} tokens</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.claimBtn, (!wallet?.can_claim_daily || claiming) && styles.disabled]}
                disabled={!wallet?.can_claim_daily || claiming}
                onPress={claimDaily}
                testID="drawer-claim-daily"
              >
                <Ionicons name="gift-outline" size={15} color={colors.bg} />
                <Text style={styles.claimText}>
                  {!wallet?.can_claim_daily ? "Daily claimed" : claiming ? "Claiming…" : `Claim +${wallet?.daily_reward ?? 25}`}
                </Text>
              </TouchableOpacity>
            </LinearGradient>

            {/* Shortcuts */}
            <Text style={styles.shortcutsLabel}>Your shortcuts</Text>
            <View style={styles.shortcutsRow}>
              {SHORTCUTS.map((s) => (
                <TouchableOpacity key={s.route} style={styles.shortcut} onPress={() => go(s.route)} testID={`drawer-shortcut-${s.label.toLowerCase()}`}>
                  <Ionicons name={s.icon} size={22} color={colors.primary} />
                  <Text style={styles.shortcutText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Links */}
            <View style={{ marginTop: 10 }}>
              {LINKS.map((l) => (
                <TouchableOpacity key={l.route} style={styles.link} onPress={() => go(l.route)} testID={l.testID}>
                  <Ionicons name={l.icon} size={20} color={colors.textSecondary} />
                  <Text style={styles.linkText}>{l.label}</Text>
                </TouchableOpacity>
              ))}
              {user.is_super_admin && (
                <TouchableOpacity style={styles.link} onPress={() => go("/admin")} testID="drawer-admin">
                  <Ionicons name="shield-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.linkText}>Admin</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.logout}
              onPress={async () => {
                onClose();
                await logout();
                router.replace("/(auth)/welcome" as any);
              }}
              testID="drawer-logout"
            >
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", flexDirection: "row" },
  panel: { width: "86%", maxWidth: 400, backgroundColor: colors.bg, borderRightWidth: 1, borderRightColor: colors.border },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  name: { fontSize: 16, fontWeight: "900", color: colors.textPrimary },
  handle: { fontSize: 13, color: colors.textSecondary },
  walletCard: { marginTop: 12, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.primaryMuted },
  walletTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  coinIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  walletLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: colors.textSecondary },
  walletValue: { fontSize: 20, fontWeight: "900", color: colors.textPrimary },
  claimBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, marginTop: 12 },
  claimText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  disabled: { opacity: 0.45 },
  shortcutsLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", color: colors.textSecondary, marginTop: 18, marginBottom: 8 },
  shortcutsRow: { flexDirection: "row", gap: 8 },
  shortcut: { flex: 1, alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 14 },
  shortcutText: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
  link: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  linkText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  logout: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 4, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  logoutText: { fontSize: 15, fontWeight: "800", color: colors.danger },
});
