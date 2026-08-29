import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, FeedItem } from "@/src/api/client";
import { PostCard } from "@/src/components/PostCard";
import { CommentSheet } from "@/src/components/CommentSheet";
import { colors, spacing } from "@/src/theme";

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<FeedItem | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const p = await api.get<FeedItem>(`/posts/${id}`);
    setPost(p);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="post-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Post</Text>
        <View style={{ width: 26 }} />
      </View>
      {!post ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          <PostCard
            post={post}
            onChange={(u) => setPost(u)}
            onComment={() => setShowComments(true)}
            onDeleted={() => router.back()}
          />
        </ScrollView>
      )}

      <CommentSheet
        postId={post?.id ?? null}
        visible={showComments}
        onClose={() => setShowComments(false)}
        onPosted={() => post && setPost({ ...post, comments_count: post.comments_count + 1 })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
