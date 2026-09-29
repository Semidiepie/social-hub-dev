import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ConversationPreview } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { timeAgo } from "@/src/utils/format";
import { useAuth } from "@/src/context/AuthContext";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export default function Messages() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDesktop } = useResponsive();
  const [convos, setConvos] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ConversationPreview | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<ConversationPreview[]>("/conversations");
      setConvos(data);
    } catch (e) {
      console.warn("convos", e);
    }
  }, []);

  const removeConv = useCallback(async (conv: ConversationPreview) => {
    setPendingDelete(null);
    setConvos((prev) => prev.filter((c) => c.id !== conv.id));
    try {
      await api.del(`/conversations/${conv.id}`);
    } catch (e) {
      console.warn("remove conv", e);
      load(); // restore on failure
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="messages-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{user ? `@${user.username}` : "Messages"}</Text>
        <TouchableOpacity onPress={() => router.push("/messages/new")} testID="messages-new">
          <Ionicons name="create-outline" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={convos}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: spacing.md, gap: spacing.xs, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySub}>Tap the pencil icon to DM a friend or start a squad chat.</Text>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => router.push("/messages/new")}
                testID="messages-empty-cta"
              >
                <Text style={styles.startBtnText}>Start a chat</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/messages/${item.id}`)}
              onLongPress={() => setPendingDelete(item)}
              delayLongPress={350}
              testID={`conv-${item.id}`}
            >
              <View style={styles.avatarWrap}>
                <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
                {item.is_group && (
                  <View style={styles.groupBadge}>
                    <Ionicons name="people" size={10} color="#fff" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.convTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.last_message && (
                    <Text style={styles.time}>{timeAgo(item.last_message.created_at)}</Text>
                  )}
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {item.last_message && item.last_message.text
                      ? (item.last_message.sender_id === user?.id ? "You: " : "") + item.last_message.text
                      : "Say hi 👋"}
                  </Text>
                  {item.unread > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
          testID="messages-list"
        />
      )}
      </View>

      <Modal
        visible={!!pendingDelete}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setPendingDelete(null)}
      >
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setPendingDelete(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Remove conversation?</Text>
            <Text style={styles.sheetSub} numberOfLines={2}>
              This removes “{pendingDelete?.title}” from your list. A new message will bring it back.
            </Text>
            <TouchableOpacity
              style={styles.sheetDelete}
              onPress={() => pendingDelete && removeConv(pendingDelete)}
              testID="conv-remove-confirm"
            >
              <Text style={styles.sheetDeleteText}>Remove from list</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setPendingDelete(null)} testID="conv-remove-cancel">
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  startBtn: { marginTop: spacing.md, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radii.full },
  startBtnText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radii.md },
  avatarWrap: { position: "relative" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface },
  groupBadge: { position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderColor: colors.bg, borderWidth: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1, marginRight: spacing.sm },
  time: { color: colors.textSecondary, fontSize: 12 },
  previewRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: spacing.sm },
  preview: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  previewUnread: { color: colors.textPrimary, fontWeight: "700" },
  unreadBadge: { backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  unreadText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  sheetSub: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.sm },
  sheetDelete: { backgroundColor: "#ef4444", borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  sheetDeleteText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  sheetCancel: { paddingVertical: 14, alignItems: "center" },
  sheetCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "700" },
});
