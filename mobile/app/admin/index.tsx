import React from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { colors, spacing } from "../../src/theme";

/**
 * PostMePlex Studio hub, matching the web admin panel at /admin
 * (frontend/src/components/AdminLayout.jsx + AdminTabs.jsx):
 * header "PostMePlex Studio" / "ADMIN CONTROL CENTER", and the same 13
 * sections in the same order. Verify accounts is super-admin only on the
 * web (AdminVerify.jsx redirects non-super-admins), so it is marked as such
 * here for admin (non-super-admin) accounts.
 */
const SECTIONS: { key: string; title: string; desc: string; route: string; icon: keyof typeof Ionicons.glyphMap; superAdminOnly?: boolean }[] = [
  { key: "dashboard", title: "Dashboard", desc: "Platform stats, recent activity and quick actions", route: "/admin/dashboard", icon: "grid-outline" },
  { key: "verify", title: "Verify accounts", desc: "Verified toggle, Gold toggle and badge colour", route: "/admin/verify", icon: "shield-checkmark-outline", superAdminOnly: true },
  { key: "curate", title: "Curated accounts", desc: "Curated accounts and clips", route: "/admin/curate", icon: "sparkles-outline" },
  { key: "accounts", title: "Accounts", desc: "Tokens, pet revive, ban and delete", route: "/admin/accounts", icon: "people-outline" },
  { key: "games", title: "Games", desc: "Manage games and game updates", route: "/admin/games", icon: "game-controller-outline" },
  { key: "ai-characters", title: "AI Characters", desc: "AI characters and their thoughts", route: "/admin/ai-characters", icon: "hardware-chip-outline" },
  { key: "notification-sounds", title: "Notification sounds", desc: "Sounds played for notifications", route: "/admin/notification-sounds", icon: "notifications-outline" },
  { key: "theme", title: "Holiday Theme", desc: "Generate and apply a holiday theme", route: "/admin/theme", icon: "color-palette-outline" },
  { key: "blogs", title: "Blog approvals", desc: "Pending blog approval requests", route: "/admin/blogs", icon: "book-outline" },
  { key: "reset-pins", title: "Reset PINs", desc: "Per-account PIN status, set and delete", route: "/admin/reset-pins", icon: "key-outline" },
  { key: "remembering", title: "Remembering", desc: "Memorial (Remembering) requests", route: "/admin/remembering", icon: "heart-outline" },
  { key: "announce", title: "Announce update", desc: "Send an update to all users", route: "/admin/announce", icon: "megaphone-outline" },
  { key: "keys", title: "API keys", desc: "API key status and checks", route: "/admin/keys", icon: "keypad-outline" },
];

export default function AdminStudioHub() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "PostMePlex Studio", headerShown: false }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>PostMePlex <Text style={{ color: colors.primary }}>Studio</Text></Text>
        <Text style={styles.subtitle}>ADMIN CONTROL CENTER</Text>
        <Text style={styles.intro}>Signed in as {user?.display_name || user?.username} ({user?.is_super_admin ? "Super admin" : "Admin"})</Text>
        {SECTIONS.map((s) => {
          const locked = s.superAdminOnly && !isSuperAdmin;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.card, locked && styles.cardLocked]}
              testID={`studio-nav-${s.key}`}
              onPress={() => {
                if (locked) { Alert.alert("Super admin only", "Verify accounts is only available to super admins."); return; }
                router.push(s.route as never);
              }}
            >
              <Ionicons name={s.icon} size={24} color={colors.primary} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{s.title}{locked ? "  ·  Super admin only" : ""}</Text>
                <Text style={styles.cardDesc}>{s.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 32 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 2, marginTop: 4 },
  intro: { color: colors.textSecondary, fontSize: 14, marginTop: 10, marginBottom: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardLocked: { opacity: 0.55 },
  cardText: { flex: 1 },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
});
