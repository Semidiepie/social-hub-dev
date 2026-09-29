import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
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

export default function AdminVerify() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.get<UserPublic[]>(`/admin/users?q=${encodeURIComponent(query)}`);
      setUsers(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = async (u: UserPublic) => {
    if (busyId) return;
    setBusyId(u.id);
    try {
      const resp = await api.post<{ id: string; is_verified: boolean }>(`/admin/users/${u.id}/verify`);
      setUsers((prev) => prev.map((x) => (x.id === resp.id ? { ...x, is_verified: resp.is_verified } : x)));
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="verify-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Verify accounts</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by username, name or email…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          testID="verify-search-input"
        />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} testID="verify-error">{error}</Text>
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
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No matches.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`verify-row-${item.username}`}>
              <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
                  {item.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={item.verified_color || colors.primary} />
                  )}
                </View>
                <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggleBtn, item.is_verified ? styles.toggleOn : styles.toggleOff]}
                onPress={() => toggle(item)}
                disabled={busyId === item.id}
                testID={`verify-toggle-${item.username}`}
              >
                {busyId === item.id ? (
                  <ActivityIndicator color={item.is_verified ? colors.bg : colors.primary} size="small" />
                ) : (
                  <Text style={[styles.toggleText, item.is_verified ? { color: colors.bg } : { color: colors.primary }]}>
                    {item.is_verified ? "Verified" : "Verify"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          testID="verify-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radii.md },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },
  errorBox: { marginHorizontal: spacing.md, padding: spacing.sm, backgroundColor: "rgba(255,59,48,0.1)", borderRadius: radii.sm },
  errorText: { color: colors.danger, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  username: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  email: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  toggleBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, minWidth: 90, alignItems: "center" },
  toggleOn: { backgroundColor: colors.primary },
  toggleOff: { borderColor: colors.primary, borderWidth: 1 },
  toggleText: { fontSize: 13, fontWeight: "800" },
});
