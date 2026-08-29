import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, VideoItem } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { formatCount } from "@/src/utils/format";

const CATEGORIES = [
  "All",
  "Gaming",
  "Vlogs",
  "Music",
  "Tech",
  "Comedy",
  "Sports",
  "Learning",
];

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / 86400 / 30)}mo ago`;
  return `${Math.floor(diff / 86400 / 365)}y ago`;
}

const FALLBACK_THUMB =
  "https://images.pexels.com/photos/1181673/pexels-photo-1181673.jpeg?auto=compress&cs=tinysrgb&w=1080";

function VideoCard({ video, onPress }: { video: VideoItem; onPress: () => void }) {
  const thumb = video.thumbnail_url || FALLBACK_THUMB;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88} testID={`video-card-${video.id}`}>
      <View style={styles.thumbWrap}>
        <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
        <View style={styles.durationPill}>
          <Text style={styles.durationText}>{formatDuration(video.duration)}</Text>
        </View>
        {video.visibility !== "public" && (
          <View style={styles.visibilityPill}>
            <Ionicons
              name={video.visibility === "private" ? "lock-closed" : "eye-off-outline"}
              size={11}
              color="#fff"
            />
            <Text style={styles.visibilityText}>
              {video.visibility === "private" ? "PRIVATE" : "UNLISTED"}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Image source={{ uri: video.author?.avatar_url || FALLBACK_THUMB }} style={styles.channelAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {video.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.channelName} numberOfLines={1}>
              {video.author?.display_name ?? "Unknown"}
            </Text>
            {video.author?.is_verified && (
              <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
            )}
          </View>
          <Text style={styles.metaLine} numberOfLines={1}>
            {formatCount(video.views)} views · {timeAgo(video.created_at)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function WatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const cat = category === "All" ? "" : category;
      const params = new URLSearchParams();
      if (cat) params.set("category", cat);
      if (query.trim()) params.set("q", query.trim());
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const rows = await api.get<VideoItem[]>(`/videos${suffix}`);
      setVideos(rows);
    } catch (e) {
      console.warn("[watch] load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openVideo = useCallback(
    (id: string) => router.push(`/video/${id}`),
    [router],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        {searchOpen ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={load}
              placeholder="Search videos, channels"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              autoFocus
              testID="watch-search-input"
            />
            <TouchableOpacity
              onPress={() => {
                setSearchOpen(false);
                setQuery("");
                setTimeout(load, 0);
              }}
              testID="watch-search-close"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brand}>Watch</Text>
              <View style={styles.pmpChip}>
                <Text style={styles.pmpChipText}>PMP</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setSearchOpen(true)}
                testID="watch-search-button"
              >
                <Ionicons name="search" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, styles.uploadBtn]}
                onPress={() => router.push("/video/upload")}
                testID="watch-upload-button"
              >
                <Ionicons name="videocam" size={18} color={colors.bg} />
                <Text style={styles.uploadText}>Upload</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Category chips */}
      <View style={styles.chipsWrap}>
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
          renderItem={({ item }) => {
            const active = category === item;
            return (
              <TouchableOpacity
                onPress={() => setCategory(item)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`watch-chip-${item}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="film-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptySub}>Be the first to upload — tap Upload above.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push("/video/upload")}
            testID="watch-empty-upload"
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.bg} />
            <Text style={styles.emptyBtnText}>Upload video</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => <VideoCard video={item} onPress={() => openVideo(item.id)} />}
          contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          testID="watch-feed"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  pmpChip: { backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pmpChipText: { color: colors.bg, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtn: {
    width: "auto",
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  uploadText: { color: colors.bg, fontWeight: "900", fontSize: 13 },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 0,
  },

  chipsWrap: { paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  chipsScroll: { paddingHorizontal: spacing.md, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.bg },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 8 },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "800", marginTop: 8 },
  emptySub: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  emptyBtnText: { color: colors.bg, fontWeight: "900", fontSize: 14 },

  card: { marginBottom: spacing.md },
  thumbWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.surface, position: "relative" },
  thumb: { width: "100%", height: "100%" },
  durationPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  durationText: { color: "#fff", fontSize: 11.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  visibilityPill: {
    position: "absolute",
    left: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  visibilityText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  cardBody: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.md, paddingTop: 10 },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  videoTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  channelName: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "700" },
  metaLine: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
