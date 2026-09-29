// Admin — review + grant/revoke blog publishing permission.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, BlogRequest } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing } from "@/src/theme";

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='%23252936'/></svg>";

export default function AdminBlogs() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<BlogRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const isAdmin = !!(user && (user.is_super_admin || user.is_admin));

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await api.get<BlogRequest[]>("/admin/blog-requests");
      setItems(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [load, isAdmin]);

  const grant = useCallback(
    async (r: BlogRequest) => {
      setPending((p) => ({ ...p, [r.user_id]: true }));
      try {
        await api.post(`/admin/blogs/grant/${r.user_id}`, {});
        setItems((prev) => prev.filter((x) => x.user_id !== r.user_id));
      } catch (e: any) {
        if (Platform.OS === "web") window.alert(e?.message || "Failed");
        else Alert.alert("Failed", e?.message || "Try again");
      } finally {
        setPending((p) => {
          const c = { ...p };
          delete c[r.user_id];
          return c;
        });
      }
    },
    [],
  );

  const deny = useCallback(
    async (r: BlogRequest) => {
      const doDeny = async () => {
        setPending((p) => ({ ...p, [r.user_id]: true }));
        try {
          await api.post(`/admin/blogs/revoke/${r.user_id}`, {});
          setItems((prev) => prev.filter((x) => x.user_id !== r.user_id));
        } catch (e: any) {
          if (Platform.OS === "web") window.alert(e?.message || "Failed");
          else Alert.alert("Failed", e?.message || "Try again");
        } finally {
          setPending((p) => {
            const c = { ...p };
            delete c[r.user_id];
            return c;
          });
        }
      };
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.confirm(`Deny @${r.username}'s request?`)) doDeny();
      } else {
        Alert.alert("Deny request?", `@${r.username}`, [
          { text: "Cancel", style: "cancel" },
          { text: "Deny", style: "destructive", onPress: doDeny },
        ]);
      }
    },
    [],
  );

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={30} color={colors.textMuted} />
          <Text style={styles.centerTitle}>Admins only</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.centerBtn}>
            <Text style={styles.centerBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Blog approvals</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={30} color={colors.success} />
              <Text style={styles.emptyText}>No pending requests</Text>
              <Text style={styles.emptySub}>You&apos;re all caught up.</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowTop}>
              <Image source={{ uri: item.avatar_url || AVATAR_FALLBACK }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={item.verified_color || colors.primary} />}
                </View>
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              {!!item.requested_at && (
                <Text style={styles.date}>{new Date(item.requested_at).toLocaleDateString()}</Text>
              )}
            </View>
            <Text style={styles.reason}>{item.reason}</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => deny(item)}
                disabled={!!pending[item.user_id]}
                style={[styles.actionBtn, styles.deny]}
                testID={`admin-blog-deny-${item.user_id}`}
              >
                <Ionicons name="close" size={16} color={colors.danger} />
                <Text style={[styles.actionText, { color: colors.danger }]}>Deny</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => grant(item)}
                disabled={!!pending[item.user_id]}
                style={[styles.actionBtn, styles.grant]}
                testID={`admin-blog-grant-${item.user_id}`}
              >
                {pending[item.user_id] ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={[styles.actionText, { color: "#fff" }]}>Grant</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  centerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  centerBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.full, marginTop: 10 },
  centerBtnText: { color: "#fff", fontWeight: "800" },
  headerWrap: { backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  emptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: 12 },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 10 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  username: { color: colors.textMuted, fontSize: 12 },
  date: { color: colors.textMuted, fontSize: 11 },
  reason: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: 10, marginTop: spacing.md, justifyContent: "flex-end" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full },
  deny: { borderColor: "rgba(255,59,48,0.4)", borderWidth: 1 },
  grant: { backgroundColor: colors.primary },
  actionText: { fontWeight: "800", fontSize: 13 },
});
