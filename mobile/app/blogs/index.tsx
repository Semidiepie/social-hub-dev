// Blog feed — public list of published blogs + your own drafts button.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { api, Blog, BlogPermission } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing } from "@/src/theme";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='%23252936'/></svg>";

export default function BlogFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [perm, setPerm] = useState<BlogPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [feed, permission] = await Promise.all([
        api.get<Blog[]>("/blogs", false),
        user ? api.get<BlogPermission>("/blogs/me/permission") : Promise.resolve(null as any),
      ]);
      setBlogs(feed);
      setPerm(permission);
    } catch (e: any) {
      setError(e?.message || "Failed to load blogs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="blogs-back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Blogs</Text>
          {user && (
            <TouchableOpacity
              onPress={() => router.push("/blogs/mine")}
              style={styles.iconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="blogs-mine"
            >
              <Ionicons name="documents-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          {!user && <View style={{ width: 32 }} />}
        </View>
      </SafeAreaView>

      <FlatList
        data={blogs}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: 40 + insets.bottom,
        }}
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
        ListHeaderComponent={
          <>
            {user && (
              <LinearGradient
                colors={[colors.primaryMuted, "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <View style={styles.heroIcon}>
                  <Ionicons name="create" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>
                    {perm?.granted
                      ? "Your voice, your blog"
                      : perm?.pending
                      ? "Request pending"
                      : "Write on PostMePlex"}
                  </Text>
                  <Text style={styles.heroBody}>
                    {perm?.granted
                      ? "Publish long-form articles with rich formatting."
                      : perm?.pending
                      ? "Waiting for an admin to review your request."
                      : "Apply to become a blog author — admin approval required."}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.heroCta}
                  onPress={() =>
                    perm?.granted
                      ? router.push("/blogs/new")
                      : router.push("/blogs/request")
                  }
                  testID="blogs-cta"
                >
                  <Ionicons
                    name={perm?.granted ? "add" : perm?.pending ? "time" : "paper-plane"}
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.heroCtaText}>
                    {perm?.granted ? "New blog" : perm?.pending ? "Pending" : "Apply"}
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            )}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <Text style={styles.sectionLabel}>Latest</Text>
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox}>
              <Ionicons name="library-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyText}>No blogs yet</Text>
              <Text style={styles.emptySub}>Be the first to publish.</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )
        }
        renderItem={({ item }) => <BlogCard blog={item} onPress={() => router.push(`/blogs/${item.id}`)} />}
      />
      </View>
    </View>
  );
}

export function BlogCard({ blog, onPress }: { blog: Blog; onPress?: () => void }) {
  const [liked, setLiked] = useState(blog.liked_by_me);
  const [likes, setLikes] = useState(blog.likes);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  const toggle = useCallback(async () => {
    if (!user) return;
    const was = liked;
    setLiked(!was);
    setLikes((n) => Math.max(0, n + (was ? -1 : 1)));
    setBusy(true);
    try {
      const r = await api.post<{ liked: boolean; likes: number }>(`/blogs/${blog.id}/like`, {});
      setLiked(r.liked);
      setLikes(r.likes);
    } catch {
      setLiked(was);
      setLikes(blog.likes);
    } finally {
      setBusy(false);
    }
  }, [blog.id, blog.likes, liked, user]);

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} onPress={onPress}>
      {blog.cover_url ? (
        <Image source={{ uri: blog.cover_url }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="document-text" size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {blog.title}
        </Text>
        {!!blog.subtitle && (
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            {blog.subtitle}
          </Text>
        )}
        <View style={styles.cardMeta}>
          <Image
            source={{ uri: blog.author?.avatar_url || AVATAR_FALLBACK }}
            style={styles.avatarSmall}
          />
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {blog.author?.display_name || "Anonymous"}
          </Text>
          {blog.author?.is_verified && (
            <Ionicons name="checkmark-circle" size={12} color={blog.author?.verified_color || colors.primary} />
          )}
          <Text style={styles.cardDot}>·</Text>
          <Text style={styles.cardMetaText}>{blog.reading_time} min</Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            toggle();
          }}
          disabled={busy || !user}
          style={styles.cardLike}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID={`blog-card-like-${blog.id}`}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.cardLikeText, liked && { color: colors.primary }]}>
            {likes}
          </Text>
        </TouchableOpacity>
      </View>
    </Pressable>
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
    paddingBottom: spacing.sm,
    paddingTop: 4,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderColor: colors.border,
    borderWidth: 1,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  heroBody: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  heroCtaText: { color: "#fff", fontSize: 12, fontWeight: "900" },

  errorBox: {
    backgroundColor: "rgba(255,59,48,0.12)",
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    borderColor: "rgba(255,59,48,0.4)",
    borderWidth: 1,
  },
  errorText: { color: colors.danger, fontSize: 13 },

  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  emptyBox: { alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  emptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: 12 },

  card: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  cover: {
    width: 96,
    height: 96,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
  },
  coverPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  cardSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  avatarSmall: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.elevated },
  cardAuthor: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  cardDot: { color: colors.textMuted, fontSize: 11 },
  cardMetaText: { color: colors.textMuted, fontSize: 11 },
  cardLike: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
  },
  cardLikeText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
});
