import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { api, VideoItem, VideoComment } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";
import { formatCount } from "@/src/utils/format";
import { EditContentSheet } from "@/src/components/EditContentSheet";

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
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WatchVideoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [related, setRelated] = useState<VideoItem[]>([]);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replyTo, setReplyTo] = useState<{ topId: string; mention?: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<VideoComment | null>(null);
  const viewRegistered = useRef(false);

  const player = useVideoPlayer(video?.video_url ?? "", (p) => {
    p.loop = false;
    p.muted = false;
  });
  const statusEvent = useEvent(player, "statusChange", {
    status: player.status ?? ("idle" as const),
  });
  const status = String(statusEvent?.status ?? "idle");

  useEffect(() => {
    if (!video || !player) return;
    if (status !== "readyToPlay") return;
    try {
      player.play();
    } catch {}
  }, [video, player, status]);

  const load = useCallback(async () => {
    try {
      const v = await api.get<VideoItem>(`/videos/${id}`);
      setVideo(v);
      const [rel, cmts] = await Promise.all([
        api.get<VideoItem[]>(`/videos/${id}/related`).catch(() => []),
        api.get<VideoComment[]>(`/videos/${id}/comments`).catch(() => []),
      ]);
      setRelated(rel);
      setComments(cmts);
      // Check subscribe state from author's follows_them (author is not the viewer)
      if (v.author?.id && user?.id && v.author.id !== user.id) {
        try {
          const u = await api.get<{ follows_them: boolean }>(`/users/${v.author.id}`);
          setSubscribed(!!u.follows_them);
        } catch {}
      }
    } catch (e) {
      console.warn("[watch] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Register a view after 3s of playback so scroll-throughs don't count.
  useEffect(() => {
    if (!video || viewRegistered.current) return;
    const t = setTimeout(async () => {
      try {
        const r = await api.post<{ views: number }>(`/videos/${video.id}/view`, {}, true);
        viewRegistered.current = true;
        setVideo((cur) => (cur ? { ...cur, views: r.views ?? cur.views } : cur));
      } catch {}
    }, 3000);
    return () => clearTimeout(t);
  }, [video]);

  const toggleLike = useCallback(async () => {
    if (!video) return;
    const wantLike = !video.liked_by_me;
    setVideo({ ...video, liked_by_me: wantLike, likes: Math.max(0, video.likes + (wantLike ? 1 : -1)) });
    try {
      const path = `/videos/${video.id}/like`;
      const resp = wantLike
        ? await api.post<{ likes: number }>(path, {}, true)
        : await api.del<{ likes: number }>(path);
      setVideo((cur) =>
        cur ? { ...cur, liked_by_me: wantLike, likes: resp.likes ?? cur.likes } : cur,
      );
    } catch {
      // revert
      setVideo({ ...video });
    }
  }, [video]);

  const toggleSubscribe = useCallback(async () => {
    if (!video?.author?.id || video.author.id === user?.id) return;
    const wantSub = !subscribed;
    setSubscribed(wantSub);
    try {
      const path = `/users/${video.author.id}/follow`;
      if (wantSub) await api.post(path, {}, true);
      else await api.del(path);
    } catch {
      setSubscribed(!wantSub);
    }
  }, [subscribed, video?.author?.id, user?.id]);

  const postComment = useCallback(
    async (value: string, parentId?: string | null) => {
      const v = value.trim();
      if (!video || !v || sending) return;
      setSending(true);
      try {
        const created = await api.post<VideoComment>(
          `/videos/${video.id}/comments`,
          { text: v, parent_id: parentId || null },
          true,
        );
        setComments((prev) => (parentId ? [...prev, created] : [created, ...prev]));
        setVideo((cur) => (cur ? { ...cur, comments_count: cur.comments_count + 1 } : cur));
        if (parentId) setOpenThreads((s) => ({ ...s, [parentId]: true }));
      } catch (e: any) {
        Alert.alert("Comment failed", e?.message || "Try again.");
      } finally {
        setSending(false);
      }
    },
    [video, sending],
  );

  const submitComment = useCallback(() => {
    postComment(commentText);
    setCommentText("");
  }, [postComment, commentText]);

  const onReply = useCallback((c: VideoComment) => {
    const topId = c.parent_id || c.id;
    setReplyTo({ topId, mention: c.author?.username });
    setReplyText(c.author?.username ? `@${c.author.username} ` : "");
    setOpenThreads((s) => ({ ...s, [topId]: true }));
  }, []);

  const deleteComment = useCallback(
    async (c: VideoComment) => {
      if (!video) return;
      try {
        const r = await api.del<{ removed: number }>(`/videos/${video.id}/comments/${c.id}`);
        setComments((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id));
        setVideo((cur) =>
          cur ? { ...cur, comments_count: Math.max(0, cur.comments_count - (r?.removed || 1)) } : cur,
        );
      } catch (e: any) {
        Alert.alert("Delete failed", e?.message || "Try again.");
      } finally {
        setConfirmDelete(null);
      }
    },
    [video],
  );

  const { tops, repliesOf } = useMemo(() => {
    const tops = comments.filter((c) => !c.parent_id);
    const repliesOf: Record<string, VideoComment[]> = {};
    comments
      .filter((c) => c.parent_id)
      .forEach((r) => {
        (repliesOf[r.parent_id as string] ||= []).push(r);
      });
    Object.values(repliesOf).forEach((arr) =>
      arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    );
    return { tops, repliesOf };
  }, [comments]);

  const isOwner = video?.author?.id && user?.id && video.author.id === user.id;

  const deleteVideo = useCallback(() => {
    if (!video) return;
    Alert.alert("Delete video?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.del(`/videos/${video.id}`);
            router.back();
          } catch (e: any) {
            Alert.alert("Delete failed", e?.message || "Try again.");
          }
        },
      },
    ]);
  }, [video, router]);

  if (loading || !video) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          {/* Player — locked to 16:9 so portrait sources letterbox inside
              the frame rather than stretching the container (which was
              pushing description + comments over the video on web). */}
          <View style={styles.playerWrap}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFillObject}
              contentFit="contain"
              allowsFullscreen
              allowsPictureInPicture
              nativeControls
            />
            {status === "loading" && (
              <View style={styles.playerOverlay} pointerEvents="none">
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => router.back()}
              testID="watch-close"
            >
              <Ionicons name="chevron-down" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Title + meta */}
          <View style={styles.section}>
            <Text style={styles.title}>{video.title}</Text>
            <Text style={styles.meta}>
              {formatCount(video.views)} views · {timeAgo(video.created_at)}
              {video.category ? ` · ${video.category}` : ""}
            </Text>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionPill, video.liked_by_me && styles.actionPillActive]}
                onPress={toggleLike}
                testID="watch-like"
              >
                <Ionicons
                  name={video.liked_by_me ? "thumbs-up" : "thumbs-up-outline"}
                  size={18}
                  color={video.liked_by_me ? "#fff" : colors.textPrimary}
                />
                <Text style={[styles.actionText, video.liked_by_me && { color: "#fff" }]}>
                  {formatCount(video.likes)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPill} testID="watch-share">
                <Ionicons name="share-social-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
              {isOwner && (
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => setEditing(true)}
                  testID="watch-edit"
                >
                  <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
              )}
              {isOwner && (
                <TouchableOpacity
                  style={[styles.actionPill, styles.dangerPill]}
                  onPress={deleteVideo}
                  testID="watch-delete"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Channel row */}
          {video.author && (
            <TouchableOpacity
              style={styles.channelRow}
              onPress={() => router.push(`/profile/${video.author!.id}`)}
              testID="watch-channel"
            >
              <Image
                source={{ uri: video.author.avatar_url || "" }}
                style={styles.channelAvatarLarge}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.channelNameRow}>
                  <Text style={styles.channelDisplay}>{video.author.display_name}</Text>
                  {video.author.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={video.author.verified_color || colors.primary} />
                  )}
                </View>
                <Text style={styles.channelHandle}>@{video.author.username}</Text>
              </View>
              {!isOwner && (
                <TouchableOpacity
                  onPress={toggleSubscribe}
                  style={[styles.subBtn, subscribed && styles.subBtnActive]}
                  testID="watch-subscribe"
                >
                  <Text style={[styles.subBtnText, subscribed && styles.subBtnTextActive]}>
                    {subscribed ? "Subscribed" : "Subscribe"}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}

          {/* Description */}
          {!!video.description && (
            <TouchableOpacity
              style={styles.descBox}
              activeOpacity={0.85}
              onPress={() => setDescExpanded((x) => !x)}
              testID="watch-desc"
            >
              <Text style={styles.descText} numberOfLines={descExpanded ? undefined : 3}>
                {video.description}
              </Text>
              <Text style={styles.descToggle}>{descExpanded ? "Show less" : "Show more"}</Text>
            </TouchableOpacity>
          )}

          {/* Tags */}
          {video.tags && video.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {video.tags.map((t) => (
                <View key={t} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Comments */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionHeader}>
              {formatCount(video.comments_count)} Comments
            </Text>
            {user && (
              <View style={styles.commentInputRow}>
                <Image
                  source={{ uri: user.avatar_url || "" }}
                  style={styles.myCommentAvatar}
                />
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment…"
                  placeholderTextColor={colors.textMuted}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  testID="watch-comment-input"
                />
                <TouchableOpacity
                  onPress={submitComment}
                  disabled={!commentText.trim() || sending}
                  style={[styles.postBtn, (!commentText.trim() || sending) && { opacity: 0.4 }]}
                  testID="watch-comment-post"
                >
                  {sending ? (
                    <ActivityIndicator color={colors.bg} size="small" />
                  ) : (
                    <Text style={styles.postBtnText}>Post</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            {tops.map((c) => {
              const replies = repliesOf[c.id] || [];
              const open = !!openThreads[c.id];
              const renderRow = (cm: VideoComment, isReply: boolean) => (
                <View style={[styles.commentRow, isReply && styles.replyRow]} testID={`comment-${cm.id}`}>
                  <Image
                    source={{ uri: cm.author?.avatar_url || "" }}
                    style={[styles.commentAvatar, isReply && styles.replyAvatar]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>
                      @{cm.author?.username ?? "unknown"} · {timeAgo(cm.created_at)}
                    </Text>
                    <Text style={styles.commentText}>{cm.text}</Text>
                    <View style={styles.cActionRow}>
                      <TouchableOpacity onPress={() => onReply(cm)} testID={`comment-reply-${cm.id}`} hitSlop={8}>
                        <Text style={styles.cActionBtn}>Reply</Text>
                      </TouchableOpacity>
                      {user && cm.author?.id === user.id && (
                        <TouchableOpacity onPress={() => setConfirmDelete(cm)} testID={`comment-delete-${cm.id}`} hitSlop={8}>
                          <Text style={[styles.cActionBtn, styles.cDeleteBtn]}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
              return (
                <View key={c.id} style={{ marginBottom: 14, gap: 8 }}>
                  {renderRow(c, false)}
                  {replies.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setOpenThreads((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      style={styles.cToggleRow}
                      testID={`comment-toggle-replies-${c.id}`}
                    >
                      <Ionicons name="return-down-forward" size={14} color={colors.primary} />
                      <Text style={styles.cToggleText}>
                        {open
                          ? "Hide replies"
                          : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {open && replies.map((r) => <View key={r.id}>{renderRow(r, true)}</View>)}
                  {replyTo?.topId === c.id && user && (
                    <View style={styles.cReplyComposer}>
                      <TextInput
                        autoFocus
                        value={replyText}
                        onChangeText={setReplyText}
                        placeholder={`Reply${replyTo.mention ? " to @" + replyTo.mention : ""}…`}
                        placeholderTextColor={colors.textMuted}
                        style={styles.cReplyInput}
                        testID={`comment-reply-input-${c.id}`}
                        multiline
                      />
                      <TouchableOpacity
                        style={[styles.cReplySend, (!replyText.trim() || sending) && { opacity: 0.4 }]}
                        disabled={!replyText.trim() || sending}
                        onPress={() => {
                          postComment(replyText, c.id);
                          setReplyText("");
                          setReplyTo(null);
                        }}
                        testID={`comment-reply-send-${c.id}`}
                      >
                        <Ionicons name="arrow-up" size={16} color={colors.bg} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setReplyTo(null); setReplyText(""); }}
                        testID={`comment-reply-cancel-${c.id}`}
                        hitSlop={8}
                      >
                        <Text style={styles.cCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Related */}
          {related.length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.sectionHeader}>Up next</Text>
              {related.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.relatedRow}
                  onPress={() => router.push(`/video/${r.id}`)}
                  testID={`watch-related-${r.id}`}
                >
                  <View style={styles.relatedThumbWrap}>
                    <Image
                      source={{ uri: r.thumbnail_url || "" }}
                      style={styles.relatedThumb}
                    />
                    <View style={styles.relatedDur}>
                      <Text style={styles.relatedDurText}>{formatDuration(r.duration)}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.relatedTitle} numberOfLines={2}>
                      {r.title}
                    </Text>
                    <Text style={styles.relatedMeta} numberOfLines={1}>
                      {r.author?.display_name} · {formatCount(r.views)} views
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <EditContentSheet
        item={editing ? ({ ...video, type: "video" } as any) : null}
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={(u) => setVideo((cur) => (cur ? { ...cur, ...(u as any) } : cur))}
      />

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard} testID="comment-delete-confirm">
            <Text style={styles.confirmTitle}>Delete comment?</Text>
            <Text style={styles.confirmBody}>
              {confirmDelete && repliesOf[confirmDelete.id]?.length
                ? "This also removes its replies. This can't be undone."
                : "This can't be undone."}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmCancel]}
                onPress={() => setConfirmDelete(null)}
                testID="comment-delete-cancel"
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmDeleteBtn]}
                onPress={() => confirmDelete && deleteComment(confirmDelete)}
                testID="comment-delete-confirm-btn"
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: spacing.xxl },
  playerWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
    overflow: "hidden",
  },
  playerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  closeBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  section: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800", lineHeight: 22 },
  meta: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "600", marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  dangerPill: { borderColor: colors.danger },

  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  channelAvatarLarge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface },
  channelNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  channelDisplay: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  channelHandle: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  subBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.textPrimary,
    borderRadius: 999,
  },
  subBtnActive: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  subBtnText: { color: colors.bg, fontWeight: "900", fontSize: 13 },
  subBtnTextActive: { color: colors.textSecondary },

  descBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  descText: { color: colors.textPrimary, fontSize: 13.5, lineHeight: 19 },
  descToggle: { color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 6 },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: spacing.md,
    marginTop: 8,
  },
  tagChip: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: { color: colors.primary, fontSize: 11, fontWeight: "800" },

  commentsSection: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  sectionHeader: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  commentInputRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: spacing.md },
  myCommentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface },
  commentInput: {
    flex: 1,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 10,
    color: colors.textPrimary,
    fontSize: 13.5,
    minHeight: 44,
    maxHeight: 120,
  },
  postBtn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    height: 44,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  postBtnText: { color: colors.bg, fontWeight: "900", fontSize: 13 },
  commentRow: { flexDirection: "row", gap: 10 },
  replyRow: { marginLeft: 36 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface },
  replyAvatar: { width: 26, height: 26, borderRadius: 13 },
  commentAuthor: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "700" },
  commentText: { color: colors.textPrimary, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  cActionRow: { flexDirection: "row", gap: spacing.md, marginTop: 6 },
  cActionBtn: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  cDeleteBtn: { color: colors.danger },
  cToggleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 42 },
  cToggleText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  cReplyComposer: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 42 },
  cReplyInput: {
    flex: 1,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 13,
    maxHeight: 100,
  },
  cReplySend: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  cCancelText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  confirmCard: { width: "100%", maxWidth: 340, backgroundColor: colors.elevated, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  confirmTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "900" },
  confirmBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  confirmActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  confirmBtn: { flex: 1, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  confirmCancel: { backgroundColor: colors.surface },
  confirmCancelText: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  confirmDeleteBtn: { backgroundColor: colors.danger },
  confirmDeleteText: { color: "#fff", fontSize: 14, fontWeight: "900" },

  relatedRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  relatedThumbWrap: { width: 160, aspectRatio: 16 / 9, position: "relative" },
  relatedThumb: { width: "100%", height: "100%", backgroundColor: colors.surface, borderRadius: 8 },
  relatedDur: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  relatedDurText: { color: "#fff", fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] },
  relatedTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  relatedMeta: { color: colors.textSecondary, fontSize: 11.5, marginTop: 3 },
});
