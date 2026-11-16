import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, UserPublic } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import VerifiedBadge from "../../src/components/VerifiedBadge";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export default function BlockedAccounts() {
  const router = useRouter();
  const [items, setItems] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<UserPublic[]>("/blocks");
      setItems(data);
    } catch {
      // swallow
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unblock = (u: UserPublic) => {
    Alert.alert(
      `Unblock @${u.username}?`,
      "They'll be able to see your content and message you again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          style: "destructive",
          onPress: async () => {
            setBusyId(u.id);
            try {
              await api.del(`/users/${u.id}/block`);
              setItems((prev) => prev.filter((x) => x.id !== u.id));
            } catch (e: any) {
              Alert.alert("Couldn't unblock", e?.message ?? "Try again.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="blocked-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Blocked accounts</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={42} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No blocked accounts</Text>
              <Text style={styles.emptySub}>You can block someone from any post&apos;s ⋯ menu or their profile.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`blocked-row-${item.id}`}>
              <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
                  {<VerifiedBadge user={item} size={14} />}
                </View>
                <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => unblock(item)}
                disabled={busyId === item.id}
                testID={`blocked-unblock-${item.id}`}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  emptySub: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.elevated },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  username: { color: colors.textSecondary, fontSize: 13, marginTop: 1 },
  unblockBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, backgroundColor: colors.elevated, minWidth: 86, alignItems: "center" },
  unblockText: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
});
