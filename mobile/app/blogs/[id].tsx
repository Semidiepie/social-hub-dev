// Blog reader — public view of a published blog.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, Blog } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { renderMarkdownToBlocks } from "@/src/lib/mdRender";
import { colors, radii, spacing } from "@/src/theme";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";
import VerifiedBadge from "../../src/components/VerifiedBadge";

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='%23252936'/></svg>";

export default function BlogReader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();

  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const b = await api.get<Blog>(`/blogs/${id}`, false);
        setBlog(b);
      } catch (e: any) {
        setError(e?.message || "Blog not available");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isAuthor = !!(user && blog && blog.author?.id === user.id);

  const toggleLike = useCallback(async () => {
    if (!blog) return;
    if (!user) {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert("Sign in to like blogs.");
      } else {
        Alert.alert("Sign in required", "Please sign in to like this blog.");
      }
      return;
    }
    // Optimistic
    const wasLiked = blog.liked_by_me;
    setBlog((b) =>
      b
        ? {
            ...b,
            liked_by_me: !wasLiked,
            likes: Math.max(0, b.likes + (wasLiked ? -1 : 1)),
          }
        : b,
    );
    setLikeBusy(true);
    try {
      const r = await api.post<{ liked: boolean; likes: number }>(`/blogs/${blog.id}/like`, {});
      setBlog((b) => (b ? { ...b, liked_by_me: r.liked, likes: r.likes } : b));
    } catch {
      // Roll back on error
      setBlog((b) =>
        b
          ? {
              ...b,
              liked_by_me: wasLiked,
              likes: Math.max(0, b.likes + (wasLiked ? 1 : -1)),
            }
          : b,
      );
    } finally {
      setLikeBusy(false);
    }
  }, [blog, user]);

  const del = useCallback(() => {
    if (!blog) return;
    const doDel = async () => {
      try {
        await api.del(`/blogs/${blog.id}`);
        router.replace("/blogs");
      } catch (e: any) {
        if (Platform.OS === "web") {
          if (typeof window !== "undefined") window.alert(e?.message || "Delete failed");
        } else {
          Alert.alert("Delete failed", e?.message || "Try again");
        }
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this blog forever?")) doDel();
    } else {
      Alert.alert("Delete blog?", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDel },
      ]);
    }
  }, [blog, router]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!blog) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Blog not available</Text>
          <Text style={styles.errorSub}>{error || "It may have been removed."}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const blocks = renderMarkdownToBlocks(blog.body_md);

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          {isAuthor ? (
            <View style={{ flexDirection: "row", gap: 4 }}>
              <TouchableOpacity
                onPress={() => router.push(`/blogs/edit/${blog.id}`)}
                style={styles.iconBtn}
                testID="blog-edit"
              >
                <Ionicons name="create-outline" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={del} style={styles.iconBtn} testID="blog-delete">
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 + insets.bottom }}>
        {!!blog.cover_url && <Cover uri={blog.cover_url} />}
        <Text style={styles.title}>{blog.title}</Text>
        {!!blog.subtitle && <Text style={styles.subtitle}>{blog.subtitle}</Text>}

        <View style={styles.metaRow}>
          <Image source={{ uri: blog.author?.avatar_url || AVATAR_FALLBACK }} style={styles.authorAvatar} />
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.authorName}>{blog.author?.display_name}</Text>
              {<VerifiedBadge user={blog.author} size={14} />}
            </View>
            <Text style={styles.metaText}>
              @{blog.author?.username} · {blog.reading_time} min read · {blog.views} views
            </Text>
          </View>
        </View>

        {!!blog.tags.length && (
          <View style={styles.tags}>
            {blog.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>#{t}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: spacing.md }}>{blocks}</View>

        <View style={styles.reactBar}>
          <TouchableOpacity
            onPress={toggleLike}
            disabled={likeBusy}
            style={[styles.likeBtn, blog.liked_by_me && styles.likeBtnActive]}
            testID="blog-like"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={blog.liked_by_me ? "heart" : "heart-outline"}
              size={22}
              color={blog.liked_by_me ? "#fff" : colors.textPrimary}
            />
            <Text style={[styles.likeText, blog.liked_by_me && { color: "#fff" }]}>
              {blog.likes} {blog.likes === 1 ? "like" : "likes"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

function Cover({ uri }: { uri: string }) {
  if (Platform.OS === "web") {
    return (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      <img src={uri} style={{ width: "100%", borderRadius: 12, marginBottom: 16, objectFit: "cover", maxHeight: 220 }} />
    );
  }
  return <Image source={{ uri }} style={{ width: "100%", height: 220, borderRadius: 12, marginBottom: 16 }} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  errorTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  errorSub: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  errorBtn: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radii.full, paddingHorizontal: 24, paddingVertical: 12 },
  errorBtnText: { color: "#fff", fontWeight: "800" },

  headerWrap: { backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: 4 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  title: { color: colors.textPrimary, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 17, marginTop: 8, lineHeight: 24 },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  authorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated },
  authorName: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  metaText: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { backgroundColor: colors.surface, borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  reactBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  likeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  likeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  likeText: { color: colors.textPrimary, fontWeight: "800", fontSize: 14 },
});
