import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  ViewToken,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView, VideoPlayerStatus } from "expo-video";
import { useEvent } from "expo";
import * as Haptics from "expo-haptics";
import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, FeedItem } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { formatCount } from "@/src/utils/format";
import { CommentSheet } from "@/src/components/CommentSheet";
import { useAuth } from "@/src/context/AuthContext";
import { OwnerContentMenu } from "@/src/components/OwnerContentMenu";
import VerifiedBadge from "../../src/components/VerifiedBadge";

const FALLBACK_THUMB =
  "https://images.pexels.com/photos/6489045/pexels-photo-6489045.jpeg?auto=compress&cs=tinysrgb&w=1080";

interface ReelItemProps {
  reel: FeedItem;
  active: boolean;
  height: number;
  width: number;
  tabBarSpace: number;
  onChange: (updated: FeedItem) => void;
  onComment: (reel: FeedItem) => void;
  onDeleted: (id: string) => void;
}

function ReelItem({ reel, active, height, width, tabBarSpace, onChange, onComment, onDeleted }: ReelItemProps) {
  const { user } = useAuth();
  const isOwn = !!user && !!reel.author && user.id === reel.author.id;
  const router = useRouter();
  const [liked, setLiked] = useState(reel.liked_by_me);
  const [likes, setLikes] = useState(reel.likes);
  const [paused, setPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const lastTapRef = useRef(0);

  // Start the player muted so iOS auto-plays without user-gesture friction —
  // matches TikTok/Reels behaviour. User taps to unmute via the pause overlay.
  const player = useVideoPlayer(reel.video_url ?? "", (p) => {
    p.loop = true;
    p.muted = true;
    // Do NOT call .play() here — the source may not be loaded yet on iOS,
    // and calling play() before `readyToPlay` is a no-op / can error on some
    // devices. We drive playback from the statusChange event below.
  });

  // Track load status + actual playing state so we can (a) start playback
  // only after the URL is decoded and (b) show a "Tap to play" fallback if
  // iOS ever refuses autoplay despite everything being ready.
  const statusEvent = useEvent(player, "statusChange", {
    status: player.status ?? ("idle" as VideoPlayerStatus),
  });
  const status: VideoPlayerStatus = (statusEvent?.status ?? "idle") as VideoPlayerStatus;
  const playingEvent = useEvent(player, "playingChange", { isPlaying: player.playing ?? false });
  const isPlaying: boolean = !!playingEvent?.isPlaying;

  useEffect(() => {
    if (!player) return;
    if (status === "error") {
      console.warn(`[reels] player error for ${reel.id}`, (statusEvent as any)?.error);
      return;
    }
    if (status !== "readyToPlay") return;
    try {
      if (active && !paused) {
        player.muted = false; // audible once the reel is the active one
        player.play();
      } else {
        player.pause();
      }
    } catch (e) {
      console.warn(`[reels] play/pause threw for ${reel.id}`, e);
    }
  }, [player, status, active, paused, reel.id, statusEvent]);

  const sendLike = async (wantLike: boolean) => {
    setLiked(wantLike);
    setLikes((n) => n + (wantLike ? (liked ? 0 : 1) : (liked ? -1 : 0)));
    try {
      const path = `/posts/${reel.id}/like`;
      const resp = wantLike
        ? await api.post<{ likes: number }>(path)
        : await api.del<{ likes: number }>(path);
      if (typeof resp.likes === "number") setLikes(resp.likes);
      onChange({ ...reel, liked_by_me: wantLike, likes: resp.likes ?? likes });
    } catch {
      setLiked(!wantLike);
    }
  };

  const toggleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    sendLike(!liked);
  };

  const handlePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      // Double tap → like + heart pop
      lastTapRef.current = 0;
      if (!liked) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        sendLike(true);
      }
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 700);
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current && Date.now() - lastTapRef.current >= 280) {
          // Single tap → pause/play
          setPaused((p) => !p);
          lastTapRef.current = 0;
        }
      }, 290);
    }
  };

  return (
    <View style={[styles.reel, { height, width }]} testID={`reel-${reel.id}`}>
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={handlePress}
        testID={`reel-tap-${reel.id}`}
      >
        {reel.thumbnail_url && (
          <Image
            source={{ uri: reel.thumbnail_url || FALLBACK_THUMB }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}
        <VideoView
          player={player}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          nativeControls={false}
        />

        <LinearGradient
          colors={["transparent", "rgba(18,20,28,0.85)"]}
          locations={[0.5, 1]}
          style={[StyleSheet.absoluteFillObject, { pointerEvents: "none" }]}
        />

        {paused && (
          <View style={styles.pauseOverlay} pointerEvents="none">
            <Ionicons name="play" size={64} color="rgba(255,255,255,0.9)" />
          </View>
        )}
        {status === "loading" && (
          <View style={styles.pauseOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
          </View>
        )}
        {status === "error" && (
          <View style={styles.pauseOverlay} pointerEvents="none">
            <Ionicons name="warning-outline" size={48} color="rgba(255,255,255,0.9)" />
            <Text style={styles.errorText}>Video failed to load</Text>
          </View>
        )}
        {/* Explicit fallback — if the video is ready AND meant to be playing
            but iOS still hasn't started it (a documented autoplay quirk),
            surface a big Tap-to-play affordance so the user has a way in.  */}
        {active && !paused && status === "readyToPlay" && !isPlaying && (
          <View style={styles.tapToPlayOverlay} pointerEvents="none">
            <View style={styles.tapToPlayPill}>
              <Ionicons name="play" size={22} color="#fff" />
              <Text style={styles.tapToPlayText}>Tap to play</Text>
            </View>
          </View>
        )}
        {showHeart && (
          <View style={styles.heartOverlay} pointerEvents="none">
            <Ionicons name="heart" size={120} color={colors.primary} />
          </View>
        )}
      </TouchableOpacity>

      {/* Right action bar — glassmorphism pill-style, distinct from IG */}
      <View style={[styles.actions, { bottom: tabBarSpace + 16 }]}>
        <TouchableOpacity
          onPress={toggleLike}
          style={[styles.actionPill, liked && styles.actionPillActive]}
          testID={`reel-like-${reel.id}`}
        >
          <Ionicons name={liked ? "heart" : "heart-outline"} size={26} color={liked ? "#fff" : "#fff"} />
          <Text style={styles.actionText}>{formatCount(likes)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onComment(reel)} style={styles.actionPill} testID={`reel-comment-${reel.id}`}>
          <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
          <Text style={styles.actionText}>{formatCount(reel.comments_count)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionPill} testID={`reel-share-${reel.id}`}>
          <Ionicons name="paper-plane" size={22} color="#fff" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.creatorRing}
          onPress={() => reel.author && router.push(`/profile/${reel.author.id}`)}
          testID={`reel-creator-${reel.id}`}
        >
          <Image source={{ uri: reel.author?.avatar_url || FALLBACK_THUMB }} style={styles.creatorAvatar} />
        </TouchableOpacity>
        {isOwn && (
          <View style={styles.ownerMenuWrap}>
            <OwnerContentMenu item={reel} onChange={onChange} onDeleted={onDeleted} color="#fff" />
          </View>
        )}
      </View>

      {/* Bottom info */}
      <View style={[styles.bottom, { bottom: tabBarSpace + 12 }]}>
        <View style={styles.nameRow}>
          <Text style={styles.authorName}>@{reel.author?.username}</Text>
          {<VerifiedBadge user={reel.author} size={15} />}
          {reel.author?.is_streamer && (
            <View style={styles.streamerPill}>
              <Ionicons name="game-controller" size={9} color="#fff" />
              <Text style={styles.streamerText}>STREAMER</Text>
            </View>
          )}
        </View>
        {!!reel.caption && (
          <Text style={styles.caption} numberOfLines={2}>
            {reel.caption}
          </Text>
        )}
        {!!reel.game_tag && (
          <View style={styles.tagRow}>
            <Ionicons name="game-controller" size={12} color="#fff" />
            <Text style={styles.tagText}>#{reel.game_tag}</Text>
            <Feather name="eye" size={11} color="#fff" />
            <Text style={styles.tagText}>{formatCount(reel.views)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function ReelsScreen() {
  const router = useRouter();
  const { startId } = useLocalSearchParams<{ startId?: string }>();
  const insets = useSafeAreaInsets();
  // Use reactive window dimensions — Dimensions.get('window') is captured at
  // module load and stale after orientation/foldable changes. This was also
  // returning stale numbers on some iOS builds where the initial value was
  // measured before the safe area was applied, causing the reel to overflow
  // (i.e. "reels don't fit the screen properly").
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const [reels, setReels] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [commentTarget, setCommentTarget] = useState<FeedItem | null>(null);
  const listRef = useRef<FlatList<FeedItem>>(null);

  // Match the floating pill tab bar (66 tall + bottom safe-area gap + margin).
  const tabBarSpace = 66 + Math.max(insets.bottom, 8) + 16;
  // Reel height MUST equal the FlatList viewport height so that
  // `pagingEnabled` snaps each item to fill the entire viewport exactly.
  const reelHeight = SCREEN_H;

  useEffect(() => {
    api.get<FeedItem[]>("/reels")
      .then(setReels)
      .catch((e) => console.warn("reels", e))
      .finally(() => setLoading(false));
  }, []);

  // Scroll to startId once reels have loaded.
  useEffect(() => {
    if (!startId || reels.length === 0) return;
    const idx = reels.findIndex((r) => r.id === startId);
    if (idx >= 0) {
      setActiveIndex(idx);
      // Defer a tick so FlatList has measured.
      setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        } catch {}
      }, 50);
    }
  }, [startId, reels]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  return (
    <View style={styles.root}>
      <View
        style={[styles.header, { paddingTop: insets.top + spacing.sm, pointerEvents: "box-none" }]}
      >
        <LinearGradient
          colors={["rgba(18,20,28,0.9)", "transparent"]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.brandRow} pointerEvents="none">
          <View style={styles.brandDot} />
          <Text style={styles.title}>REELS</Text>
          <View style={styles.pmpChip}>
            <Text style={styles.pmpChipText}>PMP</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.push("/(tabs)/create")}
          testID="reels-create-button"
        >
          <Ionicons name="videocam" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="play-circle-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No reels yet</Text>
          <Text style={styles.emptySub}>Tap + to drop the first clip.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={reels}
          keyExtractor={(r) => r.id}
          // `pagingEnabled` is the reliable native primitive for TikTok-style
          // full-screen paging. `snapToInterval` alone is unreliable when the
          // item height equals the viewport height, especially on iOS.
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToAlignment="start"
          disableIntervalMomentum
          getItemLayout={(_, i) => ({ length: reelHeight, offset: reelHeight * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewabilityConfig}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={Platform.OS === "android"}
          renderItem={({ item, index }) => (
            <ReelItem
              reel={item}
              active={focused && index === activeIndex && Platform.OS !== "web"}
              height={reelHeight}
              width={SCREEN_W}
              tabBarSpace={tabBarSpace}
              onChange={(u) => setReels((prev) => prev.map((p) => (p.id === u.id ? u : p)))}
              onComment={(r) => setCommentTarget(r)}
              onDeleted={(delId) => {
                setReels((prev) => {
                  const next = prev.filter((p) => p.id !== delId);
                  if (next.length === 0) router.back();
                  return next;
                });
              }}
            />
          )}
          testID="reels-list"
        />
      )}

      <CommentSheet
        postId={commentTarget?.id ?? null}
        visible={!!commentTarget}
        onClose={() => setCommentTarget(null)}
        onCountChange={(delta) => {
          if (!commentTarget) return;
          setReels((prev) =>
            prev.map((r) =>
              r.id === commentTarget.id
                ? { ...r, comments_count: Math.max(0, r.comments_count + delta) }
                : r,
            ),
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  pmpChip: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pmpChipText: { color: colors.bg, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 14 },

  reel: { backgroundColor: colors.bg, position: "relative" },
  actions: {
    position: "absolute",
    right: spacing.md,
    gap: 14,
    alignItems: "center",
  },
  actionPill: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 56,
    backgroundColor: "rgba(20,22,32,0.55)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  actionPillActive: {
    backgroundColor: "rgba(255,107,61,0.35)",
    borderColor: colors.primary,
  },
  actionText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  creatorRing: {
    marginTop: 4,
    padding: 2,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  creatorAvatar: { width: 40, height: 40, borderRadius: 20 },

  ownerMenuWrap: {
    marginTop: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  bottom: { position: "absolute", left: spacing.md, right: 90, gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  authorName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  streamerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,107,61,0.25)",
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  streamerText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  caption: { color: "#fff", fontSize: 14, lineHeight: 20 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  tagText: { color: "#fff", fontSize: 12, fontWeight: "600", marginRight: spacing.sm },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8 },
  heartOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  errorText: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700" },
  tapToPlayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  tapToPlayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(18,20,28,0.72)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  tapToPlayText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
