import React, { useCallback, useEffect, useState } from "react";
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
import { colors, spacing, radii } from "@/src/theme";
import { timeAgo } from "@/src/utils/format";

interface Props {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onPosted?: () => void;
}

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export function CommentSheet({ postId, visible, onClose, onPosted }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

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
    }
  }, [visible, load]);

  const submit = async () => {
    if (!postId || !text.trim() || posting) return;
    setPosting(true);
    try {
      const created = await api.post<Comment>(`/posts/${postId}/comments`, { text: text.trim() });
      setComments((prev) => [created, ...prev]);
      setText("");
      onPosted?.();
    } catch {
      // swallow
    } finally {
      setPosting(false);
    }
  };

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
                data={comments}
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
                renderItem={({ item }) => (
                  <View style={styles.commentRow} testID={`comment-${item.id}`}>
                    <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.commentAvatar} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentMetaRow}>
                        <Text style={styles.commentUser} numberOfLines={1}>{item.username}</Text>
                        {item.is_verified && <Ionicons name="checkmark-circle" size={13} color={item.verified_color || colors.primary} />}
                        <Text style={styles.commentDot}>·</Text>
                        <Text style={styles.commentAgo}>{timeAgo(item.created_at)}</Text>
                      </View>
                      <Text style={styles.commentText}>{item.text}</Text>
                    </View>
                  </View>
                )}
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
                  onSubmitEditing={submit}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[styles.send, (!text.trim() || posting) && { opacity: 0.4 }]}
                  onPress={submit}
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
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface },
  commentMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  commentUser: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  commentDot: { color: colors.textMuted, fontSize: 12, marginHorizontal: 2 },
  commentAgo: { color: colors.textMuted, fontSize: 12 },
  commentText: { color: colors.textPrimary, fontSize: 14, marginTop: 2, lineHeight: 19 },
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
});
