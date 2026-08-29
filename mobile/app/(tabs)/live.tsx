// Live tab — audio livestream discovery + Go Live CTA.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { api, AudioRoom } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing } from "@/src/theme";
import {
  CONTENT_MAX_WIDTH,
  useResponsive,
} from "@/src/hooks/useResponsive";

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='%23252936'/><text x='50%' y='55%' text-anchor='middle' fill='%23FF6B3D' font-family='sans-serif' font-weight='800' font-size='16'>P</text></svg>";

export default function LiveTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const { isDesktop } = useResponsive();
  const [rooms, setRooms] = useState<AudioRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading || !user) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const rows = await api.get<AudioRoom[]>("/rooms");
      setRooms(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load rooms");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 8000);
      return () => clearInterval(t);
    }, [load]),
  );

  const startRoom = useCallback(async () => {
    setComposerError(null);
    if (title.trim().length < 3) {
      setComposerError("Give your room a title (min 3 characters).");
      return;
    }
    setStarting(true);
    try {
      const room = await api.post<AudioRoom>("/rooms/start", {
        title: title.trim(),
        topic: topic.trim() || null,
      });
      setShowComposer(false);
      setTitle("");
      setTopic("");
      router.push(`/live/${room.id}`);
    } catch (e: any) {
      setComposerError(e?.message || "Could not start the room. Try again.");
    } finally {
      setStarting(false);
    }
  }, [title, topic, router]);

  const openComposer = useCallback(() => {
    if (!user) {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert("Please sign in first.");
      } else {
        Alert.alert("Sign in required", "Please sign in to go live.");
      }
      return;
    }
    setShowComposer(true);
  }, [user]);

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.headerTitle}>Live rooms</Text>
          <Text style={styles.headerSub}>Audio livestreams · voice only</Text>
        </View>
        <TouchableOpacity
          onPress={openComposer}
          style={styles.goLiveBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="live-go-live"
        >
          <LinearGradient
            colors={["#FF8C66", "#FF6B3D"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.goLivePill}
          >
            <Ionicons name="mic" size={16} color="#fff" />
            <Text style={styles.goLiveText}>Go live</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: 100 + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Ionicons name="radio" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No rooms live right now</Text>
              <Text style={styles.emptySub}>
                Tap “Go live” to start one — anyone on PostMePlex can hop in.
              </Text>
              <TouchableOpacity
                onPress={openComposer}
                style={styles.emptyBtn}
                testID="live-empty-cta"
              >
                <Ionicons name="mic" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Start a room</Text>
              </TouchableOpacity>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.roomCard, pressed && { opacity: 0.75 }]}
            onPress={() => router.push(`/live/${item.id}`)}
            testID={`room-${item.id}`}
          >
            <View style={styles.roomLive}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.roomTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {!!item.topic && (
              <Text style={styles.roomTopic} numberOfLines={1}>
                {item.topic}
              </Text>
            )}
            <View style={styles.roomHost}>
              <Image
                source={{ uri: item.host.avatar_url || AVATAR_FALLBACK }}
                style={styles.hostAvatar}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.hostRow}>
                  <Text style={styles.hostName} numberOfLines={1}>
                    {item.host.display_name}
                  </Text>
                  {item.host.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  )}
                </View>
                <Text style={styles.hostMeta}>Host · @{item.host.username}</Text>
              </View>
              <View style={styles.audienceBadge}>
                <Ionicons name="people" size={12} color={colors.textPrimary} />
                <Text style={styles.audienceText}>{item.audience_count}</Text>
              </View>
            </View>
            {item.guests.length > 0 && (
              <View style={styles.guestsRow}>
                {item.guests.slice(0, 4).map((g) => (
                  <Image
                    key={g.id}
                    source={{ uri: g.avatar_url || AVATAR_FALLBACK }}
                    style={styles.guestAvatar}
                  />
                ))}
                {item.guests.length > 4 && (
                  <View style={[styles.guestAvatar, styles.guestMore]}>
                    <Text style={styles.guestMoreText}>+{item.guests.length - 4}</Text>
                  </View>
                )}
                <Text style={styles.guestLabel}>
                  {item.guests.length} guest{item.guests.length === 1 ? "" : "s"}
                </Text>
              </View>
            )}
          </Pressable>
        )}
      />

      <Modal
        visible={showComposer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowComposer(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => !starting && setShowComposer(false)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Start an audio room</Text>
            <Text style={styles.modalHint}>
              Your voice will be broadcast to everyone who joins. You can promote listeners to
              &quot;Guest&quot; from inside the room.
            </Text>

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What are you talking about?"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
              maxLength={120}
              testID="live-composer-title"
            />
            <Text style={styles.label}>Topic (optional)</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Music, Gaming, Q&A"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={60}
              testID="live-composer-topic"
            />

            {!!composerError && <Text style={styles.errorText}>{composerError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowComposer(false)}
                style={styles.modalCancel}
                disabled={starting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={startRoom}
                style={[styles.modalSubmit, starting && { opacity: 0.6 }]}
                disabled={starting}
                testID="live-composer-submit"
              >
                {starting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="radio" size={16} color="#fff" />
                    <Text style={styles.modalSubmitText}>Go live</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
  headerSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  goLiveBtn: {},
  goLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.full,
  },
  goLiveText: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },

  centered: { padding: spacing.xl, alignItems: "center" },

  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xl * 1.5,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 14, textAlign: "center", maxWidth: 300 },
  emptyBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.full,
  },
  emptyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 10 },

  roomCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  roomLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,59,48,0.14)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginBottom: 8,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  liveText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  roomTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  roomTopic: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md },
  roomHost: { flexDirection: "row", alignItems: "center", gap: 10 },
  hostAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.elevated },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  hostName: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  hostMeta: { color: colors.textMuted, fontSize: 12 },
  audienceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.elevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  audienceText: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  guestsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  guestAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.elevated,
    borderColor: colors.surface,
    borderWidth: 2,
    marginLeft: -6,
  },
  guestMore: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
  },
  guestMoreText: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  guestLabel: { color: colors.textMuted, fontSize: 11, marginLeft: 6 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "900" },
  modalHint: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.textPrimary,
    padding: 14,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  modalCancel: {
    flex: 1,
    borderRadius: radii.full,
    paddingVertical: 14,
    alignItems: "center",
    borderColor: colors.border,
    borderWidth: 1,
  },
  modalCancelText: { color: colors.textPrimary, fontWeight: "800" },
  modalSubmit: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.full,
    paddingVertical: 14,
    backgroundColor: colors.primary,
  },
  modalSubmitText: { color: "#fff", fontWeight: "900" },
});
