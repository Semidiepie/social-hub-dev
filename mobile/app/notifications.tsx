import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Notification } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { timeAgo } from "@/src/utils/format";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

function iconFor(type: Notification["type"]) {
  if (type === "like") return { name: "heart" as const, color: colors.primary };
  if (type === "comment") return { name: "chatbubble" as const, color: "#4FC3F7" };
  if (type === "live") return { name: "radio" as const, color: "#EF4444" };
  return { name: "person-add" as const, color: colors.success };
}

export default function Notifications() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await api.get<Notification[]>("/notifications");
    setItems(data);
  }, []);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
    api.post("/notifications/read-all", {}).catch(() => {});
  }, [load]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="notif-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Activity</Text>
        <View style={{ width: 26 }} />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptySub}>Likes, comments and follows show up here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const ic = iconFor(item.type);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  if (item.type === "live") router.push(`/live/${item.live_stream_id || (item.link || "").split("/live/")[1] || ""}`);
                  else if (item.post_id) router.push(`/post/${item.post_id}`);
                  else router.push(`/profile/${item.actor_id}`);
                }}
                testID={`notif-${item.id}`}
              >
                <View style={styles.avatarWrap}>
                  <Image source={{ uri: item.actor_avatar || FALLBACK }} style={styles.avatar} />
                  <View style={[styles.iconBadge, { backgroundColor: ic.color }]}>
                    <Ionicons name={ic.name} size={11} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.text}>
                    <Text style={styles.actor}>{item.actor_name} </Text>
                    {item.text}
                  </Text>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          testID="notif-list"
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  iconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg,
  },
  text: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
  actor: { fontWeight: "800" },
  time: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
});
