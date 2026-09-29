import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Dimensions, Animated, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, Story, UserStoriesResponse } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { timeAgo } from "@/src/utils/format";
import { useAuth } from "@/src/context/AuthContext";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const IMAGE_DURATION_MS = 5000;

export default function StoryViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { user: me } = useAuth();
  const [data, setData] = useState<UserStoriesResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!userId) return;
    api.get<UserStoriesResponse>(`/stories/user/${userId}`)
      .then((res) => {
        setData(res);
        if (!res?.stories?.length) {
          // Nothing active → bounce back
          router.replace("/(tabs)/home");
        }
      })
      .catch(() => router.back());
  }, [userId, router]);

  const current = data?.stories?.[idx] as Story | undefined;
  const isMine = !!me && data?.user?.id === me.id;
  const isVideo = current?.media_type === "video";

  // Video player for video stories.
  const player = useVideoPlayer(isVideo ? current!.media_url : "", (p) => {
    p.loop = false;
    p.muted = false;
  });

  // Mark current story viewed once.
  useEffect(() => {
    if (!current) return;
    api.post(`/stories/${current.id}/view`, {}).catch(() => {});
  }, [current?.id]);

  const advance = useCallback(() => {
    setIdx((prev) => {
      const next = prev + 1;
      if (!data || next >= data.stories.length) {
        router.back();
        return prev;
      }
      return next;
    });
  }, [data, router]);

  const back = useCallback(() => {
    setIdx((prev) => Math.max(0, prev - 1));
  }, []);

  // Drive the progress animation per item.
  useEffect(() => {
    if (!current) return;
    progress.setValue(0);
    if (animRef.current) animRef.current.stop();
    const dur = isVideo
      ? Math.min((current.duration || 15) * 1000, 60000)
      : IMAGE_DURATION_MS;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: dur,
      useNativeDriver: false,
    });
    animRef.current = anim;
    if (!paused) {
      anim.start(({ finished }) => {
        if (finished) advance();
      });
    }
    return () => {
      anim.stop();
    };
  }, [current?.id, paused, isVideo, current?.duration, advance, progress]);

  // Sync video play/pause with viewer.
  useEffect(() => {
    if (!player || !isVideo) return;
    if (paused) {
      try { player.pause(); } catch {}
    } else {
      try { player.play(); } catch {}
    }
  }, [paused, player, isVideo, current?.id]);

  // Pause auto-advance whenever the action sheet is open.
  useEffect(() => {
    if (menuOpen) setPaused(true);
  }, [menuOpen]);

  const deleteStory = async () => {
    if (!current) return;
    setDeleting(true);
    try {
      await api.del(`/stories/${current.id}`);
      const remaining = (data?.stories ?? []).filter((s) => s.id !== current.id);
      setMenuOpen(false);
      if (remaining.length === 0) {
        router.back();
      } else {
        // Stay on the same index, which now shows the next story (since list shrunk).
        setData(data ? { ...data, stories: remaining } : data);
        setIdx((cur) => Math.min(cur, remaining.length - 1));
        setPaused(false);
      }
    } catch {
      setMenuOpen(false);
      setPaused(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!data || !current) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      {/* Media */}
      <View style={styles.media}>
        {isVideo ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFillObject}
            contentFit="contain"
            nativeControls={false}
          />
        ) : (
          <Image source={{ uri: current.media_url }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
        )}
      </View>

      {/* Tap zones (left = back, right = forward, hold = pause) */}
      <TouchableOpacity
        style={styles.zoneLeft}
        activeOpacity={1}
        onPress={back}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />
      <TouchableOpacity
        style={styles.zoneRight}
        activeOpacity={1}
        onPress={advance}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />

      {/* Top overlay */}
      <SafeAreaView edges={["top"]} style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {data.stories.map((s, i) => (
            <View key={s.id} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        i < idx ? "100%" : i > idx ? "0%" : "0%",
                        i < idx ? "100%" : i > idx ? "0%" : "100%",
                      ],
                    }),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.header}>
          <View style={styles.user}>
            <Image source={{ uri: data.user?.avatar_url || "" }} style={styles.avatar} />
            <View>
              <View style={styles.nameRow}>
                <Text style={styles.username}>{data.user?.username}</Text>
                {data.user?.is_verified && (
                  <Ionicons name="checkmark-circle" size={14} color={data.user?.verified_color || colors.primary} />
                )}
              </View>
              <Text style={styles.timestamp}>{timeAgo(current.created_at)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {isMine && (
              <TouchableOpacity
                onPress={() => setMenuOpen(true)}
                style={styles.iconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                testID="story-menu-button"
              >
                <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.iconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="story-close"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom caption */}
      {!!current.caption && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomOverlay} pointerEvents="none">
          <Text style={styles.caption}>{current.caption}</Text>
        </SafeAreaView>
      )}

      {/* Owner action sheet */}
      <Modal
        visible={menuOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => { setMenuOpen(false); setPaused(false); }}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => { if (!deleting) { setMenuOpen(false); setPaused(false); } }}
          />
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={deleteStory}
              disabled={deleting}
              testID="story-delete-confirm"
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              )}
              <Text style={[styles.sheetItemText, { color: colors.danger }]}>
                {deleting ? "Deleting…" : "Delete story"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => { if (!deleting) { setMenuOpen(false); setPaused(false); } }}
              disabled={deleting}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  media: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  zoneLeft: { position: "absolute", left: 0, top: 100, bottom: 100, width: SCREEN_W * 0.3 },
  zoneRight: { position: "absolute", right: 0, top: 100, bottom: 100, width: SCREEN_W * 0.4 },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
  progressRow: { flexDirection: "row", gap: 4, paddingHorizontal: spacing.md, marginTop: 8 },
  progressTrack: { flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  user: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { color: "#fff", fontSize: 14, fontWeight: "800" },
  timestamp: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6 },
  bottomOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: "rgba(0,0,0,0.45)" },
  caption: { color: "#fff", fontSize: 15, lineHeight: 22 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: spacing.sm },
  grabber: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 8, marginBottom: spacing.sm },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetItemText: { fontSize: 16, fontWeight: "600" },
  sheetCancel: { paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  sheetCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "700" },

  _h: { height: SCREEN_H }, // placeholder to keep import used
  _r: { borderRadius: radii.sm },
});
