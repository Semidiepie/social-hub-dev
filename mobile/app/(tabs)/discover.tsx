import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, FeedItem, UserPublic } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { formatCount } from "@/src/utils/format";
import {
  CONTENT_MAX_WIDTH,
  useResponsive,
} from "@/src/hooks/useResponsive";

type FilterKey = "top" | "accounts" | "tags";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "accounts", label: "Accounts" },
  { key: "tags", label: "Tags" },
];

const W = Dimensions.get("window").width;
const GAP = 2;
const TILE = (W - GAP * 2) / 3;

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop";

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterKey>("top");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }
      setSearching(true);
      try {
        const r = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
        setSearchResults(r);
      } catch (e) {
        console.warn("search", e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async (key: FilterKey) => {
    setLoading(true);
    try {
      const resp = await api.get<{ type: string; items: any[] }>(`/discover?filter=${key}`);
      setData(resp.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  };

  const { isDesktop } = useResponsive();
  // Tile size adapts to the clamped column width on desktop.
  const columnWidth = isDesktop ? CONTENT_MAX_WIDTH : Dimensions.get("window").width;
  const tileSize = Math.floor((columnWidth - GAP * 2) / 3);

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Discover</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search gamers, tags, clips…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
              testID="discover-search-input"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery("")} testID="discover-search-clear">
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {!searchResults && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {FILTERS.map((f) => {
              const active = f.key === filter;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(f.key)}
                  testID={`discover-filter-${f.key}`}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          )}
        </View>
      </SafeAreaView>

      {searchResults ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 110 + insets.bottom, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
          testID="discover-search-results"
        >
          {searching && <ActivityIndicator color={colors.primary} />}

          {searchResults.users.length > 0 && (
            <View style={styles.searchSection}>
              <Text style={styles.searchSectionLabel}>Gamers</Text>
              {searchResults.users.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.accountRow}
                  onPress={() => router.push(`/profile/${u.id}`)}
                  testID={`search-user-${u.username}`}
                >
                  <Image source={{ uri: u.avatar_url || FALLBACK }} style={styles.acctAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.acctNameRow}>
                      <Text style={styles.acctName}>{u.display_name}</Text>
                      {u.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
                    </View>
                    <Text style={styles.acctMeta}>@{u.username} · {formatCount(u.followers)} followers</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {searchResults.tags.length > 0 && (
            <View style={styles.searchSection}>
              <Text style={styles.searchSectionLabel}>Tags</Text>
              {searchResults.tags.map((t) => (
                <View key={t.tag} style={styles.tagRow} testID={`search-tag-${t.tag}`}>
                  <View style={styles.tagIcon}>
                    <Text style={styles.tagHash}>#</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tagName}>#{t.tag}</Text>
                    <Text style={styles.tagCount}>{formatCount(t.count)} posts</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {searchResults.posts.length > 0 && (
            <View style={styles.searchSection}>
              <Text style={styles.searchSectionLabel}>Posts</Text>
              <View style={styles.postsGrid}>
                {searchResults.posts.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.tile, { width: tileSize, height: tileSize }]}
                    onPress={() =>
                      p.type === "reel"
                        ? router.push(`/(tabs)/reels?startId=${p.id}`)
                        : router.push(`/post/${p.id}`)
                    }
                    testID={`search-post-${p.id}`}
                  >
                    <Image source={{ uri: p.image_url || p.thumbnail_url || FALLBACK }} style={styles.tileImg} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {!searching && searchResults.users.length === 0 && searchResults.tags.length === 0 && searchResults.posts.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="search" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No matches for "{query}"</Text>
              <Text style={styles.emptySub}>Try a different keyword or @username.</Text>
            </View>
          )}
        </ScrollView>
      ) : loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filter === "top" ? (
        <FlatList
          key="top"
          data={data as FeedItem[]}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.tile, { width: tileSize, height: tileSize }]}
              onPress={() =>
                item.type === "reel"
                  ? router.push(`/(tabs)/reels?startId=${item.id}`)
                  : router.push(`/post/${item.id}`)
              }
              activeOpacity={0.85}
              testID={`discover-grid-${item.id}`}
            >
              <Image
                source={{ uri: item.image_url || item.thumbnail_url || FALLBACK }}
                style={styles.tileImg}
              />
              {item.type === "reel" && (
                <View style={styles.tileBadge}>
                  <Ionicons name="play" size={10} color="#fff" />
                  <Text style={styles.tileBadgeText}>{formatCount(item.views || item.likes)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      ) : filter === "accounts" ? (
        <FlatList
          key="accounts"
          data={data as UserPublic[]}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 110 + insets.bottom, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.accountRow}
              onPress={() => router.push(`/profile/${item.id}`)}
              testID={`discover-account-${item.username}`}
            >
              <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.acctAvatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.acctNameRow}>
                  <Text style={styles.acctName}>{item.display_name}</Text>
                  {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
                </View>
                <Text style={styles.acctMeta}>
                  @{item.username} · {formatCount(item.followers)} followers
                </Text>
              </View>
              <View style={styles.followBtn}>
                <Text style={styles.followBtnText}>Follow</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          key="tags"
          data={data}
          keyExtractor={(t) => t.tag}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 110 + insets.bottom, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.tagRow} testID={`discover-tag-${item.tag}`}>
              <View style={styles.tagIcon}>
                <Text style={styles.tagHash}>#</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tagName}>#{item.tag}</Text>
                <Text style={styles.tagCount}>{formatCount(item.count)} posts</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { backgroundColor: colors.bg, borderBottomColor: colors.border, borderBottomWidth: 1 },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, marginTop: spacing.xs, marginBottom: spacing.sm },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },
  searchSection: { gap: spacing.sm },
  searchSectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  postsGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  chipRow: { paddingVertical: spacing.sm, gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.full,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.bg },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  tile: { width: TILE, height: TILE, backgroundColor: colors.surface, position: "relative" },
  tileImg: { width: "100%", height: "100%" },
  tileBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tileBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  accountRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  acctAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface },
  acctNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  acctName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  acctMeta: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  followBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full },
  followBtnText: { color: colors.bg, fontSize: 13, fontWeight: "800" },

  liveCard: { borderRadius: radii.lg, overflow: "hidden", aspectRatio: 16 / 9, backgroundColor: colors.surface, position: "relative" },
  liveImg: { width: "100%", height: "100%" },
  liveOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(18,20,28,0.45)" },
  liveBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.live,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  liveInfo: { position: "absolute", bottom: spacing.sm, left: spacing.sm, right: spacing.sm },
  liveTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  liveSub: { color: "#fff", fontSize: 12, marginTop: 2, opacity: 0.9 },

  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
  tagIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryFaint, alignItems: "center", justifyContent: "center" },
  tagHash: { color: colors.primary, fontWeight: "900", fontSize: 20 },
  tagName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  tagCount: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },

  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  emptySub: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  searchSection: { gap: spacing.sm, marginBottom: spacing.md },
  searchSectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  postsGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
});
