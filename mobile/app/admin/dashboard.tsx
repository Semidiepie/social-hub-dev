import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio Dashboard, matching the web page (frontend/src/pages/AdminDashboard.jsx):
 * GET /admin/stats, stat cards users / verified / posts / reels / blogs /
 * pending_blogs / live_now, platform overview, recent activity, quick actions.
 */
const CARDS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "users", label: "Total users", icon: "people-outline" },
  { key: "verified", label: "Verified accounts", icon: "shield-checkmark-outline" },
  { key: "posts", label: "Posts", icon: "image-outline" },
  { key: "reels", label: "Reels", icon: "film-outline" },
  { key: "blogs", label: "Published blogs", icon: "book-outline" },
  { key: "pending_blogs", label: "Pending blog approvals", icon: "book-outline" },
  { key: "live_now", label: "Live right now", icon: "radio-outline" },
];

const QUICK: { label: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Verify accounts", route: "/admin/verify", icon: "shield-checkmark-outline" },
  { label: "Accounts", route: "/admin/accounts", icon: "people-outline" },
  { label: "Blog approvals", route: "/admin/blogs", icon: "book-outline" },
  { label: "Announce update", route: "/admin/announce", icon: "megaphone-outline" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await api.get<Record<string, any>>("/admin/stats")); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const activity: any[] = stats?.recent_activity || stats?.recent || stats?.activity || [];
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Dashboard" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>Platform overview</Text>
        {loading && !stats ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
          <View style={styles.grid}>
            {CARDS.map((c) => (
              <View key={c.key} style={styles.card}>
                <Ionicons name={c.icon} size={22} color={colors.primary} />
                <Text style={styles.value}>{stats?.[c.key] ?? 0}</Text>
                <Text style={styles.label}>{c.label}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {activity.length === 0 ? <Text style={styles.empty}>No recent activity to show.</Text> : activity.slice(0, 20).map((a: any, i: number) => (
          <View key={i} style={styles.row}><Text style={styles.rowText}>{a.text || a.message || a.title || a.action || JSON.stringify(a)}</Text></View>
        ))}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        {QUICK.map((q) => (
          <TouchableOpacity key={q.route} style={styles.action} onPress={() => router.push(q.route as never)} testID={`dashboard-${q.route.split("/").pop()}`}>
            <Ionicons name={q.icon} size={20} color={colors.primary} />
            <Text style={styles.actionText}>{q.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 32 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "48%", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  value: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 8 },
  label: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  sectionTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700", marginTop: 22, marginBottom: 10 },
  empty: { color: colors.textSecondary, fontSize: 14 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  rowText: { color: colors.textPrimary, fontSize: 14 },
  action: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  actionText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
