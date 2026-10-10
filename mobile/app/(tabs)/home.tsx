import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, FeedItem, StoryUser } from "@/src/api/client";
import { colors, spacing } from "@/src/theme";
import { StoryBar } from "@/src/components/StoryBar";
import { HamburgerDrawer } from "@/src/components/HamburgerDrawer";
import { PostCard } from "@/src/components/PostCard";
import { VideoFeedCard } from "@/src/components/VideoFeedCard";
import { ReelFeedCard } from "@/src/components/ReelFeedCard";
import { CommentSheet } from "@/src/components/CommentSheet";
import {
  CONTENT_MAX_WIDTH,
  useResponsive,
} from "@/src/hooks/useResponsive";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stories, setStories] = useState<StoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentTarget, setCommentTarget] = useState<FeedItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([
        api.get<FeedItem[]>("/feed"),
        api.get<StoryUser[]>("/stories", false),
      ]);
      setFeed(f);
      setStories(s);
    } catch (e) {
      console.warn("home load", e);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <LinearGradient
          colors={[colors.bg, "rgba(18,20,28,0)"]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <LinearGradient
              colors={["#FF8C66", "#FF6B3D"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandMark}
            >
              <Ionicons name="flash" size={18} color={colors.bg} />
            </LinearGradient>
            <View>
              <Text style={styles.brand}>PostMePlex</Text>
              <View style={styles.brandUnderline}>
                <View style={styles.brandUnderlineFill} />
                <Text style={styles.brandTag}>THE HOME FOR CREATORS</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/live")}
              testID="header-live-button"
            >
              <Ionicons name="radio-outline" size={22} color={colors.live} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/blogs")}
              testID="header-blogs-button"
            >
              <Ionicons name="library-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/notifications")}
              testID="header-notifications-button"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/messages")}
              testID="header-messages-button"
            >
              <Ionicons name="paper-plane-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setMenuOpen(true)}
              testID="header-menu-button"
            >
              <Ionicons name="menu" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <HamburgerDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={<StoryBar users={stories} />}
          contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) =>
            item.type === "video" ? (
              <VideoFeedCard
                post={item}
                onChange={(updated) =>
                  setFeed((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
                onDeleted={(id) => setFeed((prev) => prev.filter((p) => p.id !== id))}
              />
            ) : item.type === "reel" ? (
              <ReelFeedCard
                post={item}
                onChange={(updated) =>
                  setFeed((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
                onDeleted={(id) => setFeed((prev) => prev.filter((p) => p.id !== id))}
              />
            ) : (
              <PostCard
                post={item}
                onChange={(updated) =>
                  setFeed((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
                onComment={(p) => setCommentTarget(p)}
                onDeleted={(id) => setFeed((prev) => prev.filter((p) => p.id !== id))}
              />
            )
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="game-controller-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>Be the first to drop a post!</Text>
            </View>
          }
          testID="home-feed-list"
        />
      )}

      <CommentSheet
        postId={commentTarget?.id ?? null}
        visible={!!commentTarget}
        onClose={() => setCommentTarget(null)}
        onCountChange={(delta) => {
          if (!commentTarget) return;
          setFeed((prev) =>
            prev.map((p) =>
              p.id === commentTarget.id
                ? { ...p, comments_count: Math.max(0, p.comments_count + delta) }
                : p,
            ),
          );
        }}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
    lineHeight: 24,
  },
  brandUnderline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  brandUnderlineFill: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  brandTag: {
    color: colors.textMuted,
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerActions: { flexDirection: "row", gap: 6 },
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
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 14 },
});
