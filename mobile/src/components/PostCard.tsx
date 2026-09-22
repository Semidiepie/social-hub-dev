import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radii } from "@/src/theme";
import { api, FeedItem } from "@/src/api/client";
import { formatCount, timeAgo } from "@/src/utils/format";
import { useAuth } from "@/src/context/AuthContext";
import { EditContentSheet } from "@/src/components/EditContentSheet";

interface Props {
  post: FeedItem;
  onChange?: (post: FeedItem) => void;
  onComment?: (post: FeedItem) => void;
  onDeleted?: (postId: string) => void;
}

const FALLBACK_AVATAR =
  "https://res.cloudinary.com/dpnrol54k/image/upload/v1790110483/postmeplex_default_avatar.png";

const REPORT_REASONS = [
  "Spam or scam",
  "Hate speech or harassment",
  "Nudity or sexual content",
  "Violence or harm",
  "Self-harm",
  "Misinformation",
  "Intellectual property",
  "Other",
];

export function PostCard({ post, onChange, onComment, onDeleted }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.likes);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  const author = post.author;
  const isOwn = !!user && !!author && user.id === author.id;

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes((n) => n + (wasLiked ? -1 : 1));
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const path = `/posts/${post.id}/like`;
      const resp = wasLiked
        ? await api.del<{ likes: number }>(path)
        : await api.post<{ likes: number }>(path);
      if (typeof resp.likes === "number") setLikes(resp.likes);
      onChange?.({ ...post, liked_by_me: !wasLiked, likes: resp.likes ?? likes });
    } catch {
      setLiked(wasLiked);
      setLikes((n) => n + (wasLiked ? 1 : -1));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert(
      "Delete post?",
      "This will permanently remove your post and its comments. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await api.del(`/posts/${post.id}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onDeleted?.(post.id);
            } catch (e: any) {
              Alert.alert("Couldn't delete", e?.message ?? "Try again in a moment.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const submitReport = async (reason: string) => {
    setReporting(true);
    try {
      await api.post("/report", { target_type: "post", target_id: post.id, reason });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setReportOpen(false);
      Alert.alert("Report sent", "Thanks — our team will review this post.");
    } catch (e: any) {
      Alert.alert("Couldn't report", e?.message ?? "Try again in a moment.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <View style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => author && router.push(`/profile/${author.id}`)}
          testID={`post-author-${post.id}`}
        >
          <View style={styles.avatarRing}>
            <Image source={{ uri: author?.avatar_url || FALLBACK_AVATAR }} style={styles.avatar} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {author?.display_name ?? "Unknown"}
              </Text>
              {author?.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
              {author?.is_streamer && (
                <View style={styles.streamerPill}>
                  <Ionicons name="game-controller" size={9} color={colors.primary} />
                  <Text style={styles.streamerPillText}>STREAMER</Text>
                </View>
              )}
            </View>
            <Text style={styles.subline} numberOfLines={1}>
              @{author?.username} · {timeAgo(post.created_at)}
            </Text>
          </View>
          {post.game_tag ? (
            <View style={styles.tagChip}>
              <Ionicons name="game-controller" size={10} color={colors.primary} />
              <Text style={styles.tagChipText} numberOfLines={1}>#{post.game_tag}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.more}
          onPress={() => setMenuOpen(true)}
          disabled={deleting}
          testID={`post-more-${post.id}`}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {post.image_url && (
        <TouchableOpacity activeOpacity={0.95} onPress={() => router.push(`/post/${post.id}`)}>
          <View style={styles.mediaWrap}>
            <Image source={{ uri: post.image_url }} style={styles.media} resizeMode="cover" />
            {/* Floating stat pills on the media */}
            <View style={styles.mediaStats} pointerEvents="none">
              <View style={styles.statChip}>
                <Ionicons name="heart" size={11} color={colors.primary} />
                <Text style={styles.statChipText}>{formatCount(likes)}</Text>
              </View>
              {post.comments_count > 0 && (
                <View style={styles.statChip}>
                  <Ionicons name="chatbubble" size={11} color="#fff" />
                  <Text style={styles.statChipText}>{formatCount(post.comments_count)}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={toggleLike}
          style={[styles.actionChip, liked && styles.actionChipActive]}
          testID={`post-like-button-${post.id}`}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? "#fff" : colors.textPrimary}
          />
          <Text style={[styles.actionChipText, liked && { color: "#fff" }]}>
            {formatCount(likes)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onComment?.(post)}
          style={styles.actionChip}
          testID={`post-comment-button-${post.id}`}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.actionChipText}>{formatCount(post.comments_count)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionIconOnly} testID={`post-share-button-${post.id}`}>
          <Ionicons name="paper-plane-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.actionIconOnly} testID={`post-bookmark-button-${post.id}`}>
          <Ionicons name="bookmark-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {!!post.caption && (
        <View style={styles.captionWrap}>
          <View style={styles.captionBar} />
          <Text style={styles.caption} numberOfLines={3}>
            {post.caption}
          </Text>
        </View>
      )}

      {post.comments_count > 0 && (
        <TouchableOpacity onPress={() => onComment?.(post)}>
          <Text style={styles.viewComments}>
            View all {formatCount(post.comments_count)} comments →
          </Text>
        </TouchableOpacity>
      )}

      {/* Action sheet (three-dots menu) */}
      <Modal
        visible={menuOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={sheetStyles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setMenuOpen(false)}
          />
          <SafeAreaView edges={["bottom"]} style={sheetStyles.sheet}>
            <View style={sheetStyles.grabber} />
            {isOwn ? (
              <TouchableOpacity
                style={sheetStyles.item}
                onPress={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                testID={`post-menu-edit-${post.id}`}
              >
                <Ionicons name="create-outline" size={22} color={colors.textPrimary} />
                <Text style={sheetStyles.itemText}>Edit post</Text>
              </TouchableOpacity>
            ) : null}
            {isOwn ? (
              <TouchableOpacity
                style={sheetStyles.item}
                onPress={confirmDelete}
                testID={`post-menu-delete-${post.id}`}
              >
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
                <Text style={[sheetStyles.itemText, { color: colors.danger }]}>Delete post</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={sheetStyles.item}
                  onPress={() => {
                    setMenuOpen(false);
                    setReportOpen(true);
                  }}
                  testID={`post-menu-report-${post.id}`}
                >
                  <Ionicons name="flag-outline" size={22} color={colors.danger} />
                  <Text style={[sheetStyles.itemText, { color: colors.danger }]}>Report post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sheetStyles.item}
                  onPress={async () => {
                    if (!author) return;
                    setMenuOpen(false);
                    try {
                      await api.post(`/users/${author.id}/block`);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      // Remove this user's post from the feed locally.
                      onDeleted?.(post.id);
                      Alert.alert("User blocked", "Their posts won't appear in your feed anymore. You can unblock anytime from Settings → Blocked accounts.");
                    } catch (e: any) {
                      Alert.alert("Couldn't block", e?.message ?? "Try again in a moment.");
                    }
                  }}
                  testID={`post-menu-block-${post.id}`}
                >
                  <Ionicons name="ban-outline" size={22} color={colors.danger} />
                  <Text style={[sheetStyles.itemText, { color: colors.danger }]}>
                    Block @{author?.username}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={sheetStyles.cancel}
              onPress={() => setMenuOpen(false)}
              testID={`post-menu-cancel-${post.id}`}
            >
              <Text style={sheetStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Report reasons sheet */}
      <Modal
        visible={reportOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setReportOpen(false)}
      >
        <View style={sheetStyles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !reporting && setReportOpen(false)}
          />
          <SafeAreaView edges={["bottom"]} style={sheetStyles.sheet}>
            <View style={sheetStyles.grabber} />
            <Text style={sheetStyles.title}>Why are you reporting this post?</Text>
            <Text style={sheetStyles.subtitle}>Your report is anonymous.</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={sheetStyles.reasonItem}
                onPress={() => submitReport(r)}
                disabled={reporting}
                testID={`post-report-reason-${r}`}
              >
                <Text style={sheetStyles.reasonText}>{r}</Text>
                {reporting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={sheetStyles.cancel}
              onPress={() => !reporting && setReportOpen(false)}
              disabled={reporting}
            >
              <Text style={sheetStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      <EditContentSheet
        item={editing ? post : null}
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={(u) => onChange?.(u)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Card is now a rounded, elevated surface with margin — not a full-bleed
  // Instagram-style wall. This is one of the biggest visual differentiators.
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
  avatarRing: {
    padding: 2,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.elevated },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", maxWidth: 160 },
  subline: { color: colors.textSecondary, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,107,61,0.35)",
    marginLeft: spacing.xs,
  },
  tagChipText: {
    color: colors.primary,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.3,
    maxWidth: 90,
  },
  streamerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginLeft: 4,
  },
  streamerPillText: { color: colors.primary, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  more: { padding: spacing.xs, minWidth: 28, alignItems: "center" },

  // Media wrap with rounded corners inside the card (subtle inset)
  mediaWrap: {
    marginHorizontal: 8,
    marginTop: 2,
    marginBottom: spacing.sm,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.elevated,
  },
  media: { width: "100%", aspectRatio: 1, backgroundColor: colors.elevated },
  mediaStats: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    gap: 6,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(18,20,28,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  statChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // Action row: rounded pill-shaped buttons instead of the IG icon strip
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
    paddingBottom: 4,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 54,
    justifyContent: "center",
  },
  actionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionChipText: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  actionIconOnly: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // Caption with a small orange accent bar on the left
  captionWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: spacing.md,
    marginTop: 8,
  },
  captionBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: colors.primary,
    minHeight: 16,
  },
  caption: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
    flex: 1,
  },
  viewComments: {
    color: colors.primary,
    fontSize: 12.5,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    marginTop: 8,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: spacing.sm },
  grabber: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 8, marginBottom: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  subtitle: { color: colors.textSecondary, fontSize: 13, paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: spacing.sm },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  itemText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  reasonItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  reasonText: { color: colors.textPrimary, fontSize: 15 },
  cancel: { paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "700" },
});
