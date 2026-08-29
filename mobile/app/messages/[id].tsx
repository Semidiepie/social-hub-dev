import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardStickyView, KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, ConversationPreview, Message, TypingResponse } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { uploadToCloudinary } from "@/src/lib/cloudinary";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user: me } = useAuth();
  const { isDesktop } = useResponsive();
  const [conv, setConv] = useState<ConversationPreview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingResponse["users"]>([]);
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const lastTypingPingRef = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [allConvos, msgs] = await Promise.all([
        api.get<ConversationPreview[]>("/conversations"),
        api.get<Message[]>(`/conversations/${id}/messages`),
      ]);
      setConv(allConvos.find((c) => c.id === id) ?? null);
      setMessages(msgs);
    } catch (e) {
      console.warn("chat load", e);
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Poll for new messages + typing every 3 seconds.
  useEffect(() => {
    if (!id) return;
    const tick = setInterval(async () => {
      try {
        const [msgs, typingResp] = await Promise.all([
          api.get<Message[]>(`/conversations/${id}/messages`),
          api.get<TypingResponse>(`/conversations/${id}/typing`),
        ]);
        setMessages((prev) => (msgs.length !== prev.length || (msgs[msgs.length - 1]?.id !== prev[prev.length - 1]?.id) ? msgs : prev.map((p) => {
          const fresh = msgs.find((m) => m.id === p.id);
          return fresh ?? p;
        })));
        setTypingUsers(typingResp.users || []);
      } catch {
        // network blip – ignore
      }
    }, 3000);
    return () => clearInterval(tick);
  }, [id]);

  // Notify backend we're typing whenever the input has content.
  const onChangeText = (next: string) => {
    setText(next);
    const now = Date.now();
    if (next.length > 0 && id && now - lastTypingPingRef.current > 2500) {
      lastTypingPingRef.current = now;
      api.post(`/conversations/${id}/typing`, {}).catch(() => {});
    }
  };

  const send = async (overrides?: { text?: string; image_url?: string }) => {
    const t = (overrides?.text ?? text).trim();
    const imageUrl = overrides?.image_url ?? null;
    if ((!t && !imageUrl) || sending || !id) return;
    setSending(true);
    if (!overrides) setText("");
    try {
      const created = await api.post<Message>(`/conversations/${id}/messages`, {
        text: t,
        image_url: imageUrl,
      });
      setMessages((prev) => [...prev, created]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      if (!overrides) setText(t);
      console.warn("send", e);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo library access to send an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(result.assets[0].uri, "image", result.assets[0].mimeType);
      await send({ image_url: url, text: "" });
    } catch (e: any) {
      Alert.alert("Couldn't send image", e?.message ?? "Try again.");
    } finally {
      setUploading(false);
    }
  };

  const react = async (msg: Message, emoji: string) => {
    setReactionTarget(null);
    // Optimistic
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              reactions: [
                ...(m.reactions || []).filter((r) => r.user_id !== me?.id),
                { user_id: me!.id, username: me!.username, emoji, at: new Date().toISOString() },
              ],
            }
          : m,
      ),
    );
    try {
      const resp = await api.post<{ reactions: Message["reactions"] }>(
        `/messages/${msg.id}/reactions`,
        { emoji },
      );
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: resp.reactions } : m)));
    } catch {
      // best-effort
    }
  };

  // Index of last message I sent (used to render "Seen" indicator below it).
  const lastMineIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === me?.id) return i;
    }
    return -1;
  }, [messages, me?.id]);

  const otherMembers = conv?.member_ids.filter((mid) => mid !== me?.id) ?? [];
  const lastMineRead =
    lastMineIndex >= 0 &&
    otherMembers.length > 0 &&
    otherMembers.some((other) => (messages[lastMineIndex].read_by || []).includes(other));

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="chat-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.titleWrap}
          activeOpacity={0.7}
          onPress={() => {
            if (!conv) return;
            if (!conv.is_group) {
              const other = conv.members.find((m) => m.id !== me?.id);
              if (other) router.push(`/profile/${other.id}`);
            }
          }}
          testID="chat-title-open-profile"
        >
          {conv && (
            <>
              <Image source={{ uri: conv.avatar_url || FALLBACK }} style={styles.headerAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{conv.title}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {typingUsers.length > 0
                    ? `${typingUsers[0].display_name} is typing…`
                    : conv.is_group ? `${conv.members.length} members` : "Tap to view profile"}
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ padding: spacing.md, gap: spacing.xs, paddingBottom: 80 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Send the first message ✌️</Text>
            </View>
          }
          ListFooterComponent={
            <View>
              {lastMineIndex >= 0 && lastMineRead && (
                <Text style={styles.seenRow}>Seen</Text>
              )}
              {typingUsers.length > 0 && (
                <View style={styles.typingBubble}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const mine = item.sender_id === me?.id;
            const prev = messages[index - 1];
            const showAvatar = !mine && (!prev || prev.sender_id !== item.sender_id);
            const reactions = item.reactions || [];
            return (
              <View style={{ marginBottom: 2 }} testID={`msg-${item.id}`}>
                <TouchableOpacity
                  style={[styles.msgRow, mine && { justifyContent: "flex-end" }]}
                  activeOpacity={1}
                  onLongPress={() => setReactionTarget(item)}
                  delayLongPress={350}
                >
                  {!mine && (
                    <View style={styles.msgAvatarSlot}>
                      {showAvatar && (
                        <Image source={{ uri: item.sender_avatar || FALLBACK }} style={styles.msgAvatar} />
                      )}
                    </View>
                  )}
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.image_url && styles.bubbleImage]}>
                    {conv?.is_group && !mine && showAvatar && (
                      <Text style={styles.bubbleSender}>@{item.sender_username}</Text>
                    )}
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.msgImage} resizeMode="cover" />
                    ) : null}
                    {!!item.text && (
                      <Text style={[styles.bubbleText, mine && { color: colors.bg }, item.image_url ? { marginTop: 6 } : null]}>
                        {item.text}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                {reactions.length > 0 && (
                  <View style={[styles.reactionRow, mine && { alignSelf: "flex-end" }]}>
                    {Object.entries(
                      reactions.reduce<Record<string, number>>((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                        return acc;
                      }, {}),
                    ).map(([emoji, count]) => (
                      <View key={emoji} style={styles.reactionChip}>
                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                        {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
          testID="chat-list"
        />
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={pickImage}
            disabled={uploading || sending}
            testID="chat-image-button"
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons name="image-outline" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            testID="chat-input"
          />
          <TouchableOpacity
            style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={() => send()}
            disabled={!text.trim() || sending}
            testID="chat-send"
          >
            {sending ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Ionicons name="arrow-up" size={18} color={colors.bg} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      {/* Reaction picker */}
      <Modal
        visible={!!reactionTarget}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setReactionTarget(null)}
      >
        <TouchableOpacity
          style={styles.reactionBackdrop}
          activeOpacity={1}
          onPress={() => setReactionTarget(null)}
        >
          <View style={styles.reactionPicker}>
            {REACTION_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={styles.reactionPickerItem}
                onPress={() => reactionTarget && react(reactionTarget, e)}
                testID={`reaction-${e}`}
              >
                <Text style={{ fontSize: 26 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, marginHorizontal: spacing.sm },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { color: colors.textSecondary, fontSize: 14 },

  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, maxWidth: "100%" },
  msgAvatarSlot: { width: 28 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface },
  bubble: { maxWidth: "78%", paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 18 },
  bubbleImage: { padding: 4, overflow: "hidden" },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleSender: { color: colors.primary, fontSize: 11, fontWeight: "800", marginBottom: 2, paddingLeft: 4, paddingTop: 4 },
  bubbleText: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
  msgImage: { width: 220, height: 220, borderRadius: 14, backgroundColor: colors.elevated },

  seenRow: { color: colors.textSecondary, fontSize: 11, textAlign: "right", paddingRight: 4, marginTop: 2 },
  typingBubble: { flexDirection: "row", gap: 3, backgroundColor: colors.surface, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, marginTop: 6, marginLeft: 36 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textSecondary },

  reactionRow: { flexDirection: "row", gap: 4, marginTop: 2, marginLeft: 36, alignSelf: "flex-start" },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginLeft: 1 },

  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bg },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.textPrimary, fontSize: 15, maxHeight: 120 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },

  reactionBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  reactionPicker: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, gap: 4 },
  reactionPickerItem: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
});

// Keep import used (KeyboardAwareScrollView reserved for a future polish)
const _unused = KeyboardAwareScrollView;
void _unused;
