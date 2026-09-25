import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radii, spacing } from "@/src/theme";

interface LiveStream {
  id: string;
  title: string;
  viewer_count: number;
  hearts: number;
  owner: { username: string; display_name: string; avatar_url: string; is_verified: boolean };
}

export default function LiveFeedScreen() {
  const router = useRouter();
  const [streams, setStreams] = useState<LiveStream[] | null>(null);

  const load = useCallback(async () => {
    try {
      setStreams(await api.get<LiveStream[]>("/live"));
    } catch {
      setStreams([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="live-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Live</Text>
        <TouchableOpacity onPress={() => router.push("/live/new")} style={styles.goLiveBtn} testID="golive-nav-btn">
          <Ionicons name="radio" size={16} color="#fff" />
          <Text style={styles.goLiveText}>Go Live</Text>
        </TouchableOpacity>
      </View>

      {streams === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={streams}
          keyExtractor={(s) => s.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.sm }}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 140 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="radio-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No one is live right now.</Text>
              <TouchableOpacity onPress={() => router.push("/live/new")} style={styles.goLiveBtn} testID="golive-empty-btn">
                <Ionicons name="radio" size={16} color="#fff" />
                <Text style={styles.goLiveText}>Go Live</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/live/${item.id}`)} testID={`live-card-${item.id}`}>
              <View style={styles.cardBody}>
                <Image source={{ uri: item.owner.avatar_url }} style={styles.cardAvatar} />
              </View>
              <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
              <View style={styles.viewerPill}><Ionicons name="eye" size={11} color="#fff" /><Text style={styles.viewerText}>{item.viewer_count}</Text></View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardOwner} numberOfLines={1}>{item.owner.display_name || item.owner.username}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              </View>
            </TouchableOpacity>
          )}
          testID="live-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  goLiveBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.live, borderRadius: radii.full, paddingHorizontal: 14, paddingVertical: 8 },
  goLiveText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  card: { flex: 1, aspectRatio: 0.62, borderRadius: radii.lg, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardBody: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.elevated },
  cardAvatar: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: colors.primary },
  liveBadge: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.live, borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  viewerPill: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 3 },
  viewerText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  cardFooter: { position: "absolute", left: 8, right: 8, bottom: 8 },
  cardOwner: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cardTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
});
