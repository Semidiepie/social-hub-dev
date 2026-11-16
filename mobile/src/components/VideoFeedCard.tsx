// A long-form video rendered as a home-feed card. Tapping opens the fullscreen
// watch screen (/video/[id]); stats are read-only (no inline post like/comment).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/src/theme";
import { FeedItem } from "@/src/api/client";
import { formatCount, timeAgo } from "@/src/utils/format";
import { useAuth } from "@/src/context/AuthContext";
import { OwnerContentMenu } from "@/src/components/OwnerContentMenu";
import VerifiedBadge from "./VerifiedBadge";

const FALLBACK_AVATAR =
  `${process.env.EXPO_PUBLIC_BACKEND_URL ?? ""}/api/files/postmeplex/branding/default_avatar.png`;

function formatDuration(secs?: number | null): string | null {
  if (secs == null) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoFeedCard({
  post,
  onChange,
  onDeleted,
}: {
  post: FeedItem;
  onChange?: (updated: FeedItem) => void;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const author = post.author;
  const duration = formatDuration(post.duration);
  const title = post.title || post.caption;
  const isOwn = !!user && !!author && user.id === author.id;

  return (
    <View style={styles.card} testID={`feed-video-${post.id}`}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => author && router.push(`/profile/${author.id}`)}
          testID={`feed-video-author-${post.id}`}
        >
          <View style={styles.avatarRing}>
            <Image source={{ uri: author?.avatar_url || FALLBACK_AVATAR }} style={styles.avatar} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {author?.display_name ?? "Unknown"}
              </Text>
              {<VerifiedBadge user={author} size={14} />}
            </View>
            <Text style={styles.subline} numberOfLines={1}>
              @{author?.username} · {timeAgo(post.created_at)}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.videoPill}>
          <Ionicons name="videocam" size={10} color={colors.primary} />
          <Text style={styles.videoPillText}>VIDEO</Text>
        </View>
        {isOwn && (
          <OwnerContentMenu item={post} onChange={onChange} onDeleted={onDeleted} />
        )}
      </View>

      {!!title && (
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      )}

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(`/video/${post.id}`)}
        style={styles.thumbWrap}
        testID={`feed-video-thumb-${post.id}`}
      >
        {post.thumbnail_url ? (
          <Image source={{ uri: post.thumbnail_url }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="film-outline" size={40} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playBtn}>
            <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
        {!!duration && (
          <View style={styles.durationBadge} pointerEvents="none">
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.statText}>{formatCount(post.views)}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={16}
            color={post.liked_by_me ? colors.primary : colors.textSecondary}
          />
          <Text style={styles.statText}>{formatCount(post.likes)}</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.statText}>{formatCount(post.comments_count)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.sm,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  authorRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.sm },
  avatarRing: { padding: 2, borderRadius: 22, borderWidth: 1.5, borderColor: colors.primary },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.elevated },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", maxWidth: 180 },
  subline: { color: colors.textSecondary, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  videoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,107,61,0.35)",
  },
  videoPillText: { color: colors.primary, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  title: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: "700",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  thumbWrap: {
    marginHorizontal: 8,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.elevated,
    aspectRatio: 16 / 9,
  },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,107,61,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
  },
  stat: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "700" },
});
