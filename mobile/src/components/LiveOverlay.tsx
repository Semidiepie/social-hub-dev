import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "@/src/theme";
import type { LiveChatMessage, LiveGift } from "@/src/lib/useLiveSocket";

interface Owner {
  id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
}

function FloatingHeart() {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const x = useRef(Math.random() * 24 - 12).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: -220, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 2400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [y, opacity]);
  return (
    <Animated.View style={{ position: "absolute", bottom: 0, right: 8, transform: [{ translateY: y }, { translateX: x }], opacity }}>
      <Ionicons name="heart" size={26} color={colors.live} />
    </Animated.View>
  );
}

export function LiveOverlay({
  owner,
  title,
  viewers,
  hearts,
  floaters,
  chat,
  gifts,
  onSendChat,
  onSendHeart,
  onSendGift,
  isOwner,
  onEnd,
  onClose,
}: {
  owner?: Owner;
  title?: string;
  viewers: number;
  hearts: number;
  floaters: { id: number }[];
  chat: LiveChatMessage[];
  gifts: LiveGift[];
  onSendChat: (t: string) => void;
  onSendHeart: () => void;
  onSendGift: (id: string) => void;
  isOwner?: boolean;
  onEnd?: () => void;
  onClose?: () => void;
}) {
  const [text, setText] = useState("");
  const [giftsOpen, setGiftsOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [chat]);

  const submit = () => {
    if (!text.trim()) return;
    onSendChat(text);
    setText("");
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.ownerPill}>
          <Image source={{ uri: owner?.avatar_url }} style={styles.ownerAvatar} />
          <View style={{ maxWidth: 120 }}>
            <Text style={styles.ownerName} numberOfLines={1}>{owner?.display_name || owner?.username}</Text>
            <Text style={styles.ownerTitle} numberOfLines={1}>{title}</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.viewerPill} testID="live-viewer-count">
            <Ionicons name="eye" size={13} color="#fff" />
            <Text style={styles.viewerText}>{viewers}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={isOwner ? onEnd : onClose}
            testID={isOwner ? "live-end-btn" : "live-close-btn"}
          >
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating hearts */}
      <View style={styles.heartLane} pointerEvents="none">
        {floaters.map((f) => <FloatingHeart key={f.id} />)}
      </View>

      {/* Bottom: chat + composer */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.bottom}>
        <ScrollView
          ref={scrollRef}
          style={styles.chatList}
          contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
          testID="live-chat-list"
        >
          {chat.length === 0 ? (
            <View style={styles.hintBubble}><Text style={styles.hintText}>Say hi 👋</Text></View>
          ) : (
            chat.map((m) =>
              m.kind === "system" ? (
                <View key={m.id} style={styles.hintBubble}><Text style={styles.hintText}>{m.text}</Text></View>
              ) : (
                <View key={m.id} style={styles.chatRow} testID="live-chat-row">
                  <Image source={{ uri: m.avatar_url }} style={styles.chatAvatar} />
                  <View style={styles.chatBubble}>
                    <Text>
                      <Text style={styles.chatName}>{m.display_name || m.username} </Text>
                      {m.is_verified && (
                        <Ionicons name="checkmark-circle" size={12} color={m.verified_color || (m.remembering ? colors.live : colors.primary)} />
                      )}
                      {m.is_verified ? <Text> </Text> : null}
                      {m.kind === "gift" ? (
                        <Text style={styles.giftText}>{m.text} {m.gift?.glyph}</Text>
                      ) : (
                        <Text style={styles.chatText}>{m.text}</Text>
                      )}
                    </Text>
                  </View>
                </View>
              ),
            )
          )}
        </ScrollView>

        {giftsOpen && (
          <View style={styles.giftTray} testID="live-gift-tray">
            {gifts.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.giftItem}
                onPress={() => { onSendGift(g.id); setGiftsOpen(false); }}
                testID={`live-gift-${g.id}`}
              >
                <Text style={styles.giftGlyph}>{g.glyph}</Text>
                <Text style={styles.giftCoins}>{g.coins}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment…"
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={styles.input}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={submit}
            testID="live-chat-input"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={submit} testID="live-chat-send">
            <Ionicons name="send" size={18} color={colors.bg} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.giftBtn} onPress={() => setGiftsOpen((v) => !v)} testID="live-gift-toggle">
            <Ionicons name="gift" size={18} color={colors.bg} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.heartBtn} onPress={onSendHeart} testID="live-heart-btn">
            <Ionicons name="heart" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.heartsCounter}>
          <Ionicons name="heart" size={12} color={colors.live} />
          <Text style={styles.heartsCounterText}>{hearts.toLocaleString()} hearts</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: spacing.md, paddingTop: spacing.lg },
  ownerPill: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radii.full, padding: 4, paddingRight: spacing.sm },
  ownerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface },
  ownerName: { color: "#fff", fontSize: 13, fontWeight: "800" },
  ownerTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.live, borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  viewerPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 5 },
  viewerText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  heartLane: { position: "absolute", right: 12, bottom: 150, width: 40, height: 240 },
  bottom: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  chatList: { maxHeight: 220, marginBottom: spacing.sm },
  hintBubble: { alignSelf: "flex-start", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  hintText: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  chatRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  chatAvatar: { width: 24, height: 24, borderRadius: 12, marginTop: 2, backgroundColor: colors.surface },
  chatBubble: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: radii.lg, paddingHorizontal: 10, paddingVertical: 6 },
  chatName: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  chatText: { color: "#fff", fontSize: 13 },
  giftText: { color: "#FCD34D", fontSize: 13, fontWeight: "700" },
  giftTray: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm },
  giftItem: { width: 56, alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: radii.md, paddingVertical: spacing.sm },
  giftGlyph: { fontSize: 24 },
  giftCoins: { color: "#FCD34D", fontSize: 10, fontWeight: "700" },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: radii.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", color: "#fff", paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  giftBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center" },
  heartBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.live, alignItems: "center", justifyContent: "center" },
  heartsCounter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  heartsCounterText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
});
