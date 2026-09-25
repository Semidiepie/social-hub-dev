import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, UserPublic } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export default function AdminRemembering() {
  const router = useRouter();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.get<UserPublic[]>("/admin/remembering/requests");
      setUsers(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (u: UserPublic, action: "approve" | "revoke") => {
    if (busyId) return;
    setBusyId(u.id);
    try {
      await api.post(`/admin/users/${u.id}/remembering`, { action });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="remembering-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Remembering requests</Text>
        <View style={{ width: 26 }} />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} testID="remembering-error">{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No pending requests.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`remembering-row-${item.username}`}>
              <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
                <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
              </View>
              <TouchableOpacity
                style={[styles.btn, styles.approve]}
                onPress={() => act(item, "approve")}
                disabled={busyId === item.id}
                testID={`remembering-approve-${item.username}`}
              >
                {busyId === item.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.approveText}>Approve</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.deny]}
                onPress={() => act(item, "revoke")}
                disabled={busyId === item.id}
                testID={`remembering-deny-${item.username}`}
              >
                <Text style={styles.denyText}>Deny</Text>
              </TouchableOpacity>
            </View>
          )}
          testID="remembering-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  errorBox: { marginHorizontal: spacing.md, padding: spacing.sm, backgroundColor: "rgba(255,59,48,0.1)", borderRadius: radii.sm },
  errorText: { color: colors.danger, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  displayName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  username: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  btn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, alignItems: "center" },
  approve: { backgroundColor: "#ef4444" },
  approveText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  deny: { borderColor: colors.border, borderWidth: 1 },
  denyText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
});
