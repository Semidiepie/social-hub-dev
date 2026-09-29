import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, FeedItem, UserPublic } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { formatCount, formatDuration } from "@/src/utils/format";
import { useAuth } from "@/src/context/AuthContext";
import {
  CONTENT_MAX_WIDTH,
  useResponsive,
} from "@/src/hooks/useResponsive";

const { width: SW } = Dimensions.get("window");
const GAP = 2;
const TILE = (SW - GAP * 2) / 3;

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop";

interface Props {
  userId: string | null;
  isOwn?: boolean;
}

type Tab = "posts" | "videos";

export default function ProfileView({ userId, isOwn = false }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: me, logout: _logout } = useAuth();
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<(UserPublic & { follows_them?: boolean }) | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuTarget, setMenuTarget] = useState<FeedItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [u, p, vids] = await Promise.all([
        api.get<UserPublic & { follows_them: boolean }>(`/users/${userId}`),
        api.get<FeedItem[]>(`/users/${userId}/posts`),
        // Long-form videos posted via the + button (previously called reels).
        api.get<Array<{
          id: string;
          title: string;
          video_url: string;
          thumbnail_url: string;
          duration: number;
          views: number;
          created_at: string;
        }>>(`/users/${userId}/videos`),
      ]);
      setProfile(u);
      setPosts(p);
      setVideos(
        (vids || []).map((v) => ({
          id: v.id,
          type: "reel" as const, // reuse the grid renderer; nav is customized below
          caption: v.title || "",
          image_url: null,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url || null,
          game_tag: null,
          duration: v.duration || null,
          likes: 0,
          comments_count: 0,
          views: v.views || 0,
          created_at: v.created_at,
          liked_by_me: false,
          author: {
            id: userId,
            username: "",
            display_name: "",
            avatar_url: "",
            is_verified: false,
            is_streamer: false,
          },
        })),
      );
    } catch (e) {
      console.warn("profile load", e);
    }
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleFollow = async () => {
    if (!profile || isOwn) return;
    const wasFollowing = !!profile.follows_them;
    setProfile({
      ...profile,
      follows_them: !wasFollowing,
      followers: profile.followers + (wasFollowing ? -1 : 1),
    });
    try {
      if (wasFollowing) await api.del(`/users/${profile.id}/follow`);
      else await api.post(`/users/${profile.id}/follow`);
    } catch {
      setProfile({ ...profile, follows_them: wasFollowing });
    }
  };

  if (loading || !profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const data = tab === "posts" ? posts : videos;

  return (
    <View style={[styles.root, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          {!isOwn ? (
            <TouchableOpacity onPress={() => router.back()} testID="profile-back" style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
          <Text style={styles.usernameHeader} numberOfLines={1}>
            @{profile.username}
          </Text>
          {isOwn ? (
            <TouchableOpacity onPress={() => router.push("/settings")} testID="profile-settings" style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setProfileMenuOpen(true)}
              testID="profile-more"
              style={styles.iconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <FlatList
        data={data}
        numColumns={3}
        keyExtractor={(it) => it.id}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.identity}>
              <Image source={{ uri: profile.avatar_url || FALLBACK }} style={styles.avatar} />
              <View style={styles.stats}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{formatCount(profile.posts_count)}</Text>
                  <Text style={styles.statLabel}>Posts</Text>
                </View>
                <TouchableOpacity
                  style={styles.statBox}
                  onPress={() => router.push(`/profile/${profile.id}/followers`)}
                  testID="profile-followers"
                >
                  <Text style={styles.statValue}>{formatCount(profile.followers)}</Text>
                  <Text style={styles.statLabel}>Followers</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.statBox}
                  onPress={() => router.push(`/profile/${profile.id}/following`)}
                  testID="profile-following"
                >
                  <Text style={styles.statValue}>{formatCount(profile.following)}</Text>
                  <Text style={styles.statLabel}>Following</Text>
                </TouchableOpacity>
              </View>
            </View>

            {profile.is_live && (
              <TouchableOpacity
                onPress={() => router.push(`/live/${profile.live_stream_id || ""}`)}
                testID="profile-live-banner"
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#ef4444", marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, borderRadius: 16 }}
              >
                <Ionicons name="radio" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "900", textTransform: "uppercase", fontSize: 13 }}>
                  {profile.display_name} is live — Watch
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.bioBlock}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName}>{profile.display_name}</Text>
                {profile.is_verified && <Ionicons name="checkmark-circle" size={16} color={profile.verified_color || (profile.remembering ? "#ef4444" : colors.primary)} />}
                {profile.remembering && (
                  <View style={styles.rememberingPill} testID="remembering-label">
                    <Text style={styles.rememberingText}>REMEMBERING</Text>
                  </View>
                )}
                {profile.is_streamer && (
                  <View style={styles.streamerPill}>
                    <Ionicons name="game-controller" size={10} color={colors.primary} />
                    <Text style={styles.streamerText}>STREAMER</Text>
                  </View>
                )}
              </View>
              {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            </View>

            <View style={styles.ctaRow}>
              {isOwn ? (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => router.push("/edit-profile")}
                  testID="profile-edit-button"
                >
                  <Text style={styles.editBtnText}>Edit profile</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.followBtn, profile.follows_them && styles.followingBtn]}
                    onPress={toggleFollow}
                    testID="profile-follow-button"
                  >
                    <Text style={[styles.followBtnText, profile.follows_them && { color: colors.textPrimary }]}>
                      {profile.follows_them ? "Following" : "Follow"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.messageBtn}
                    onPress={async () => {
                      try {
                        const conv = await api.post<{ id: string }>("/conversations", {
                          member_ids: [profile.id],
                        });
                        router.push(`/messages/${conv.id}`);
                      } catch {
                        // swallow — user can retry
                      }
                    }}
                    testID="profile-message-button"
                  >
                    <Text style={styles.messageBtnText}>Message</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === "posts" && styles.tabActive]}
                onPress={() => setTab("posts")}
                testID="profile-tab-posts"
              >
                <Ionicons name="grid-outline" size={20} color={tab === "posts" ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === "videos" && styles.tabActive]}
                onPress={() => setTab("videos")}
                testID="profile-tab-videos"
              >
                <Ionicons name="videocam-outline" size={22} color={tab === "videos" ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.tabEmpty}>
            <Ionicons name={tab === "posts" ? "image-outline" : "videocam-outline"} size={48} color={colors.textMuted} />
            <Text style={styles.tabEmptyText}>
              No {tab === "posts" ? "posts" : "videos"} yet.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const hasMedia = !!(item.image_url || item.thumbnail_url);
          return (
            <TouchableOpacity
              style={styles.tile}
              onPress={() =>
                item.type === "reel"
                  ? router.push(`/video/${item.id}`)
                  : router.push(`/post/${item.id}`)
              }
              onLongPress={() => {
                if (!isOwn) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setMenuTarget(item);
              }}
              delayLongPress={350}
              activeOpacity={0.9}
              testID={`profile-grid-${item.id}`}
            >
              {hasMedia ? (
                <Image
                  source={{ uri: item.image_url || item.thumbnail_url || FALLBACK }}
                  style={styles.tileImg}
                />
              ) : (
                // Text-only post: render a distinctive card with the caption
                // instead of a placeholder image. Matches how Twitter/Threads
                // show text posts in a grid.
                <View style={styles.textTile}>
                  <Ionicons
                    name="chatbox-ellipses"
                    size={16}
                    color={colors.primary}
                    style={styles.textTileIcon}
                  />
                  <Text style={styles.textTileBody} numberOfLines={6}>
                    {item.caption?.trim() || "…"}
                  </Text>
                  {item.game_tag ? (
                    <Text style={styles.textTileTag} numberOfLines={1}>
                      #{item.game_tag}
                    </Text>
                  ) : null}
                </View>
              )}
              {item.type === "reel" && (
                <View style={styles.reelBadge}>
                  <Ionicons name="play" size={10} color="#fff" />
                  <Text style={styles.reelBadgeText}>
                    {formatDuration(item.duration) || formatCount(item.views || 0)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        testID="profile-feed"
      />

      {/* Profile-level action sheet (Block / Report) — non-own profiles */}
      <Modal
        visible={profileMenuOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => !profileBusy && setProfileMenuOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !profileBusy && setProfileMenuOpen(false)}
          />
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>@{profile.username}</Text>
            <TouchableOpacity
              style={styles.sheetItem}
              disabled={profileBusy}
              onPress={async () => {
                setProfileBusy(true);
                try {
                  await api.post(`/users/${profile.id}/block`);
                  setProfileMenuOpen(false);
                  setProfileBusy(false);
                  // Bounce back so this profile is no longer visible.
                  router.back();
                } catch {
                  setProfileBusy(false);
                }
              }}
              testID="profile-block-confirm"
            >
              {profileBusy ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="ban-outline" size={22} color={colors.danger} />
              )}
              <Text style={[styles.sheetItemText, { color: colors.danger }]}>
                {profileBusy ? "Blocking…" : `Block @${profile.username}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetItem}
              disabled={profileBusy}
              onPress={async () => {
                setProfileBusy(true);
                try {
                  await api.post("/report", {
                    target_type: "user",
                    target_id: profile.id,
                    reason: "Reported from profile",
                  });
                  setProfileMenuOpen(false);
                } finally {
                  setProfileBusy(false);
                }
              }}
              testID="profile-report-confirm"
            >
              <Ionicons name="flag-outline" size={22} color={colors.danger} />
              <Text style={[styles.sheetItemText, { color: colors.danger }]}>Report user</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancel}
              disabled={profileBusy}
              onPress={() => setProfileMenuOpen(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Long-press action sheet for own posts/reels */}
      <Modal
        visible={!!menuTarget}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => !deleting && setMenuTarget(null)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !deleting && setMenuTarget(null)}
          />
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>
              {menuTarget?.type === "reel" ? "This reel" : "This post"}
            </Text>
            <TouchableOpacity
              style={styles.sheetItem}
              disabled={deleting}
              onPress={async () => {
                if (!menuTarget) return;
                setDeleting(true);
                try {
                  await api.del(`/posts/${menuTarget.id}`);
                  const id = menuTarget.id;
                  setPosts((prev) => prev.filter((p) => p.id !== id));
                  setVideos((prev) => prev.filter((p) => p.id !== id));
                  setMenuTarget(null);
                } catch {
                  // swallow — sheet stays open so user can retry
                } finally {
                  setDeleting(false);
                }
              }}
              testID="profile-delete-confirm"
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              )}
              <Text style={[styles.sheetItemText, { color: colors.danger }]}>
                {deleting ? "Deleting…" : `Delete ${menuTarget?.type === "reel" ? "reel" : "post"}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancel}
              disabled={deleting}
              onPress={() => setMenuTarget(null)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerWrap: { borderBottomColor: colors.border, borderBottomWidth: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBtn: { padding: 4 },
  usernameHeader: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },

  identity: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.md },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
  stats: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center" },
  statValue: { color: colors.textPrimary, fontSize: 18, fontWeight: "900" },
  statLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  bioBlock: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  displayName: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  streamerPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.primaryFaint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm, marginLeft: 4 },
  streamerText: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  rememberingPill: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.sm, marginLeft: 4 },
  rememberingText: { color: "#ef4444", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  bio: { color: colors.textPrimary, fontSize: 14, marginTop: 6, lineHeight: 20 },

  ctaRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  editBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.md, alignItems: "center", borderColor: colors.border, borderWidth: 1 },
  editBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  aiCallBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.md, borderColor: colors.primary, borderWidth: 1, backgroundColor: colors.primaryFaint },
  aiCallBtnText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  followBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.md, alignItems: "center", backgroundColor: colors.primary },
  followingBtn: { backgroundColor: colors.elevated },
  followBtnText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  messageBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.md, alignItems: "center", borderColor: colors.border, borderWidth: 1 },
  messageBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },

  tabs: { flexDirection: "row", borderTopColor: colors.border, borderTopWidth: 1 },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.primary },

  tile: { width: TILE, height: TILE, backgroundColor: colors.surface, position: "relative" },
  tileImg: { width: "100%", height: "100%" },
  textTile: {
    width: "100%",
    height: "100%",
    padding: 10,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "flex-start",
  },
  textTileIcon: { marginBottom: 6, opacity: 0.9 },
  textTileBody: {
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
  },
  textTileTag: {
    color: colors.primary,
    fontSize: 10.5,
    fontWeight: "800",
    marginTop: "auto",
    paddingTop: 6,
  },
  reelBadge: { position: "absolute", bottom: 4, right: 4, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  reelBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  tabEmpty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  tabEmptyText: { color: colors.textSecondary, fontSize: 14 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: spacing.sm },
  grabber: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 8, marginBottom: spacing.sm },
  sheetTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: spacing.lg, paddingBottom: 8 },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetItemText: { fontSize: 16, fontWeight: "600" },
  sheetCancel: { paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  sheetCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "700" },
});
