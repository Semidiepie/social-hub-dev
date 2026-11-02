import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { api, Comment } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";
import { timeAgo, verifiedColor } from "@/src/utils/format";

interface Props {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export function CommentSheet({ postId, visible, onClose, onCountChange }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ topId: string; mention?: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await api.get<Comment[]>(`/posts/${postId}/comments`, false);
      setComments(data);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (visible) load();
    if (!visible) {
      setText("");
      setComments([]);
      setReplyTo(null);
      setReplyText("");
      setOpenThreads({});
      setConfirmDelete(null);
    }
  }, [visible, load]);

  const { tops, repliesOf } = useMemo(() => {
    const tops = comments.filter((c) => !c.parent_id);
    const repliesOf: Record<string, Comment[]> = {};
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

  const submit = async (value: string, parentId?: string | null) => {
    const v = value.trim();
    if (!postId || !v || posting) return;
    setPosting(true);
    try {
      const created = await api.post<Comment>(`/posts/${postId}/comments`, {
        text: v,
        parent_id: parentId || null,
      });
      setComments((prev) => (parentId ? [...prev, created] : [created, ...prev]));
      onCountChange?.(1);
      if (parentId) setOpenThreads((s) => ({ ...s, [parentId]: true }));
    } catch {
      // swallow
    } finally {
      setPosting(false);
    }
  };

  const onReply = (c: Comment) => {
    const topId = c.parent_id || c.id;
    setReplyTo({ topId, mention: c.username });
    setReplyText(c.username ? `@${c.username} ` : "");
    setOpenThreads((s) => ({ ...s, [topId]: true }));
  };

  const del = async (c: Comment) => {
    if (!postId) return;
    try {
      const r = await api.del<{ removed: number }>(`/posts/${postId}/comments/${c.id}`);
      setComments((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id));
      onCountChange?.(-(r?.removed || 1));
    } catch {
      // swallow
    } finally {
      setConfirmDelete(null);
    }
  };

  const renderRow = (c: Comment, isReply: boolean) => (
    <View style={[styles.commentRow, isReply && styles.replyRow]} testID={`comment-${c.id}`}>
      <Image
        source={{ uri: c.avatar_url || FALLBACK }}
        style={[styles.commentAvatar, isReply && styles.replyAvatar]}
      />
      <View style={{ flex: 1 }}>
        <View style={styles.commentMetaRow}>
          <Text style={styles.commentUser} numberOfLines={1}>{c.username}</Text>
          {c.is_verified && (
            <Ionicons name="checkmark-circle" size={13} color={verifiedColor(c, colors.primary)} />
          )}
          <Text style={styles.commentDot}>·</Text>
          <Text style={styles.commentAgo}>{timeAgo(c.created_at)}</Text>
        </View>
        <Text style={styles.commentText}>{c.text}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => onReply(c)} testID={`comment-reply-${c.id}`} hitSlop={8}>
            <Text style={styles.actionBtn}>Reply</Text>
          </TouchableOpacity>
          {user && c.user_id === user.id && (
            <TouchableOpacity onPress={() => setConfirmDelete(c)} testID={`comment-delete-${c.id}`} hitSlop={8}>
              <Text style={[styles.actionBtn, styles.deleteBtn]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title}>Comments</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="comments-close">
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <FlatList
                data={tops}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.md, flexGrow: 1, paddingBottom: 80 }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="chatbubble-outline" size={32} color={colors.textMuted} />
                    <Text style={styles.emptyText}>Be the first to comment.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const replies = repliesOf[item.id] || [];
                  const open = !!openThreads[item.id];
                  return (
                    <View style={{ gap: spacing.sm }}>
                      {renderRow(item, false)}

                      {replies.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setOpenThreads((s) => ({ ...s, [item.id]: !s[item.id] }))}
                          style={styles.toggleRow}
                          testID={`comment-toggle-replies-${item.id}`}
                        >
                          <Ionicons name="return-down-forward" size={14} color={colors.primary} />
                          <Text style={styles.toggleText}>
                            {open
                              ? "Hide replies"
                              : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {open && replies.map((r) => <View key={r.id}>{renderRow(r, true)}</View>)}

                      {replyTo?.topId === item.id && (
                        <View style={styles.replyComposer}>
                          <TextInput
                            autoFocus
                            value={replyText}
                            onChangeText={setReplyText}
                            placeholder={`Reply${replyTo.mention ? " to @" + replyTo.mention : ""}…`}
                            placeholderTextColor={colors.textMuted}
                            style={styles.replyInput}
                            testID={`comment-reply-input-${item.id}`}
                            returnKeyType="send"
                            onSubmitEditing={() => {
                              submit(replyText, item.id);
                              setReplyText("");
                              setReplyTo(null);
                            }}
                            blurOnSubmit={false}
                          />
                          <TouchableOpacity
                            style={[styles.replySend, (!replyText.trim() || posting) && { opacity: 0.4 }]}
                            disabled={!replyText.trim() || posting}
                            onPress={() => {
                              submit(replyText, item.id);
                              setReplyText("");
                              setReplyTo(null);
                            }}
                            testID={`comment-reply-send-${item.id}`}
                          >
                            <Ionicons name="arrow-up" size={16} color={colors.bg} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { setReplyTo(null); setReplyText(""); }}
                            testID={`comment-reply-cancel-${item.id}`}
                            hitSlop={8}
                          >
                            <Text style={styles.cancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            )}

            <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
              <View style={styles.inputBar}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Add a comment…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  testID="comment-input"
                  returnKeyType="send"
                  onSubmitEditing={() => { submit(text); setText(""); }}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[styles.send, (!text.trim() || posting) && { opacity: 0.4 }]}
                  onPress={() => { submit(text); setText(""); }}
                  disabled={!text.trim() || posting}
                  testID="comment-send"
                >
                  {posting ? (
                    <ActivityIndicator color={colors.bg} size="small" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color={colors.bg} />
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardStickyView>
          </SafeAreaView>

          {confirmDelete && (
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmCard} testID="comment-delete-confirm">
                <Text style={styles.confirmTitle}>Delete comment?</Text>
                <Text style={styles.confirmBody}>
                  {repliesOf[confirmDelete.id]?.length
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
                    onPress={() => del(confirmDelete)}
                    testID="comment-delete-confirm-btn"
                  >
                    <Text style={styles.confirmDeleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    height: "78%",
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  grabber: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  closeBtn: { padding: 6 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  commentRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  replyRow: { marginLeft: 36 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface },
  replyAvatar: { width: 26, height: 26, borderRadius: 13 },
  commentMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  commentUser: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  commentDot: { color: colors.textMuted, fontSize: 12, marginHorizontal: 2 },
  commentAgo: { color: colors.textMuted, fontSize: 12 },
  commentText: { color: colors.textPrimary, fontSize: 14, marginTop: 2, lineHeight: 19 },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: 6 },
  actionBtn: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  deleteBtn: { color: colors.danger },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 44 },
  toggleText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  replyComposer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: 44 },
  replyInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 13,
  },
  replySend: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  confirmCard: { width: "100%", maxWidth: 340, backgroundColor: colors.elevated, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  confirmTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "900" },
  confirmBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  confirmActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  confirmBtn: { flex: 1, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  confirmCancel: { backgroundColor: colors.surface },
  confirmCancelText: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  confirmDeleteBtn: { backgroundColor: colors.danger },
  confirmDeleteText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
