import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";

interface RelUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio?: string;
  is_verified?: boolean;
  follows_them: boolean;
  is_me: boolean;
}

interface Resp {
  private: boolean;
  users: RelUser[];
}

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export default function FollowersScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RelList userId={id} kind="followers" onBack={() => router.back()} />;
}

export function FollowingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RelList userId={id} kind="following" onBack={() => router.back()} />;
}

export function RelList({
  userId,
  kind,
  onBack,
}: {
  userId: string;
  kind: "followers" | "following";
  onBack: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Resp>(`/users/${userId}/${kind}`);
      setData(r);
    } catch {
      setData({ private: false, users: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, kind]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async (u: RelUser) => {
    if (u.is_me) return;
    setBusyId(u.id);
    try {
      if (u.follows_them) {
        await api.del(`/users/${u.id}/follow`);
      } else {
        await api.post(`/users/${u.id}/follow`);
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((x) =>
                x.id === u.id ? { ...x, follows_them: !x.follows_them } : x,
              ),
            }
          : prev,
      );
    } catch {
      // swallow
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{kind === "followers" ? "Followers" : "Following"}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : data?.private ? (
        <View style={styles.private}>
          <Ionicons name="lock-closed" size={42} color={colors.textMuted} />
          <Text style={styles.privateTitle}>This list is private</Text>
          <Text style={styles.privateSub}>
            Only the account owner can see {kind === "followers" ? "their followers" : "who they follow"}.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data?.users ?? []}
          keyExtractor={(u) => u.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={42} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {kind === "followers" ? "No followers yet" : "Not following anyone yet"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`rel-row-${item.id}`}>
              <TouchableOpacity
                style={styles.rowLeft}
                onPress={() => router.push(`/profile/${item.id}`)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
                    {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
                  </View>
                  <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
              {!item.is_me && (
                <TouchableOpacity
                  style={[styles.followBtn, item.follows_them && styles.followingBtn]}
                  onPress={() => toggleFollow(item)}
                  disabled={busyId === item.id}
                  testID={`rel-follow-${item.id}`}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={item.follows_them ? colors.textPrimary : colors.bg} />
                  ) : (
                    <Text style={[styles.followBtnText, item.follows_them && { color: colors.textPrimary }]}>
                      {item.follows_them ? "Following" : "Follow"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
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
  private: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
  privateTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  privateSub: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingTop: spacing.xxl },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.elevated },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  username: { color: colors.textSecondary, fontSize: 13, marginTop: 1 },
  followBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, minWidth: 88, alignItems: "center" },
  followingBtn: { backgroundColor: colors.elevated },
  followBtnText: { color: colors.bg, fontSize: 13, fontWeight: "800" },
});
