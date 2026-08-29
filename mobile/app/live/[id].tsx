// Audio live room — host + guests on stage, audience below.
// Mic streaming uses Agora on native builds; in Expo Go / web preview we still
// keep presence heartbeat + room UI working so hosts can manage the stage.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, AudioRoom, AudienceUser } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { loadAgora } from "@/src/lib/agora";
import { colors, radii, spacing } from "@/src/theme";

// Deterministic 31-bit numeric uid derived from a user id string.
// Agora joinChannel requires a numeric uid; using the user's id keeps
// the same uid across reconnects on the same device.
function uidFromUserId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%23252936'/><text x='50%' y='55%' text-anchor='middle' fill='%23FF6B3D' font-family='sans-serif' font-weight='800' font-size='30'>P</text></svg>";

export default function AudioRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [room, setRoom] = useState<AudioRoom | null>(null);
  const [audience, setAudience] = useState<AudienceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [ending, setEnding] = useState(false);
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [hasInitMute, setHasInitMute] = useState(false);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<any>(null);

  const isHost = !!(user && room && user.id === room.host.id);
  const isGuest = !!(user && room && room.guests.some((g) => g.id === user.id));
  const isSpeaker = isHost || isGuest;

  const loadRoom = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get<AudioRoom>(`/rooms/${id}`);
      setRoom(r);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Room not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAudience = useCallback(async () => {
    if (!id) return;
    try {
      const resp = await api.get<{ audience: AudienceUser[] }>(`/rooms/${id}/audience`);
      setAudience(resp.audience);
    } catch {
      // silent
    }
  }, [id]);

  const heartbeat = useCallback(async () => {
    if (!id) return;
    try {
      await api.post(`/rooms/${id}/heartbeat`, {});
    } catch {
      // silent
    }
  }, [id]);

  useEffect(() => {
    loadRoom();
    heartbeat();
    heartbeatRef.current = setInterval(heartbeat, 15000);
    refreshRef.current = setInterval(() => {
      loadRoom();
      loadAudience();
    }, 6000);
    loadAudience();
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [loadRoom, loadAudience, heartbeat]);

  // Auto-unmute the host as soon as their room loads so "Go live" actually
  // broadcasts audio immediately. Guests and audience remain muted by default.
  useEffect(() => {
    if (hasInitMute || !room || !user) return;
    setMuted(!(user.id === room.host.id));
    setHasInitMute(true);
  }, [room, user, hasInitMute]);

  // Agora RTC engine lifecycle — join the channel with the appropriate role.
  // Runs on native builds only (agora.web.ts stub returns null on web / Expo Go).
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!room || !user) return;
    const agora = loadAgora();
    if (!agora) return; // Expo Go / SDK unavailable — heartbeat + UI still work.
    if (!room.app_id || !room.channel_name) return;

    const {
      default: createAgoraRtcEngine,
      ChannelProfileType,
      ClientRoleType,
    } = agora;
    let cancelled = false;
    let engine: any = null;

    (async () => {
      try {
        if (Platform.OS === "android") {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { PermissionsAndroid } = require("react-native");
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          );
        }
        engine = createAgoraRtcEngine();
        engine.initialize({
          appId: room.app_id,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        try {
          engine.setChannelProfile(
            ChannelProfileType.ChannelProfileLiveBroadcasting,
          );
        } catch {
          /* setChannelProfile is optional in v4 when set via initialize */
        }
        const role = isSpeaker
          ? ClientRoleType.ClientRoleBroadcaster
          : ClientRoleType.ClientRoleAudience;
        engine.setClientRole(role);
        engine.enableAudio();
        try {
          engine.disableVideo();
        } catch {
          /* no-op */
        }
        const uid = uidFromUserId(user.id);
        engine.joinChannel("", room.channel_name, uid, {
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
          clientRoleType: role,
          publishMicrophoneTrack: isSpeaker,
          autoSubscribeAudio: true,
        });
        // Sync initial mute state.
        engine.muteLocalAudioStream(muted || !isSpeaker);
        if (cancelled) {
          try {
            engine.leaveChannel();
            engine.release();
          } catch {
            /* no-op */
          }
          return;
        }
        engineRef.current = engine;
        setAgoraJoined(true);
      } catch (err) {
        // Silent — UI still functional without mic streaming.
        // eslint-disable-next-line no-console
        console.warn("Agora init failed", err);
      }
    })();

    return () => {
      cancelled = true;
      const e = engineRef.current;
      engineRef.current = null;
      setAgoraJoined(false);
      if (e) {
        try {
          e.leaveChannel();
        } catch {
          /* no-op */
        }
        try {
          e.release();
        } catch {
          /* no-op */
        }
      }
    };
  }, [room?.id, room?.app_id, room?.channel_name, user?.id]);
  // NOTE: we intentionally do NOT include isSpeaker/muted in deps — role/mute
  // changes are pushed to the running engine via the effects below without
  // tearing down the channel.

  // Push mute changes to the engine without rejoining.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    try {
      e.muteLocalAudioStream(muted || !isSpeaker);
    } catch {
      /* no-op */
    }
  }, [muted, isSpeaker]);

  // If the host promotes a listener to guest (or removes them), the client
  // role must switch between Broadcaster / Audience without leaving the room.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const agora = loadAgora();
    if (!agora) return;
    try {
      e.setClientRole(
        isSpeaker
          ? agora.ClientRoleType.ClientRoleBroadcaster
          : agora.ClientRoleType.ClientRoleAudience,
      );
    } catch {
      /* no-op */
    }
  }, [isSpeaker]);

  const promoteToGuest = useCallback(
    async (userId: string) => {
      if (!id) return;
      try {
        const r = await api.post<AudioRoom>(`/rooms/${id}/invite/${userId}`, {});
        setRoom(r);
      } catch (e: any) {
        Alert.alert("Couldn't add guest", e?.message || "Try again");
      }
    },
    [id],
  );

  const removeGuest = useCallback(
    async (userId: string) => {
      if (!id) return;
      try {
        const r = await api.del<AudioRoom>(`/rooms/${id}/guest/${userId}`);
        setRoom(r);
      } catch (e: any) {
        Alert.alert("Couldn't remove", e?.message || "Try again");
      }
    },
    [id],
  );

  const endRoom = useCallback(async () => {
    if (!id || !isHost) return;
    const doEnd = async () => {
      setEnding(true);
      try {
        await api.post(`/rooms/${id}/end`, {});
        router.back();
      } catch (e: any) {
        setError(e?.message || "Could not end room");
      } finally {
        setEnding(false);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("End this room for everyone?")) doEnd();
    } else {
      Alert.alert("End room?", "This will kick everyone out.", [
        { text: "Cancel", style: "cancel" },
        { text: "End room", style: "destructive", onPress: doEnd },
      ]);
    }
  }, [id, isHost, router]);

  const stepDown = useCallback(async () => {
    if (!id || !user) return;
    await removeGuest(user.id);
  }, [id, user, removeGuest]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!room) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Room not available</Text>
          <Text style={styles.errorSub}>{error || "This room has ended."}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["rgba(255,107,61,0.15)", "transparent"]}
        style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="room-back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          {isHost ? (
            <TouchableOpacity
              onPress={endRoom}
              disabled={ending}
              style={styles.endBtn}
              testID="room-end"
            >
              <Text style={styles.endBtnText}>End</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        <Text style={styles.roomTitle}>{room.title}</Text>
        {!!room.topic && <Text style={styles.roomTopic}>{room.topic}</Text>}
      </LinearGradient>

      <FlatList
        data={audience}
        keyExtractor={(a) => a.user_id}
        numColumns={4}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: 120 + insets.bottom,
        }}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionLabel}>On stage</Text>
            <View style={styles.stageRow}>
              <StageAvatar
                userLabel="HOST"
                name={room.host.display_name}
                username={room.host.username}
                avatarUrl={room.host.avatar_url}
                isVerified={room.host.is_verified}
                large
              />
              {room.guests.map((g) => (
                <View key={g.id}>
                  <StageAvatar
                    userLabel="GUEST"
                    name={g.display_name}
                    username={g.username}
                    avatarUrl={g.avatar_url}
                    isVerified={g.is_verified}
                  />
                  {isHost && (
                    <TouchableOpacity
                      onPress={() => removeGuest(g.id)}
                      style={styles.stageKick}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {/* Empty guest slots */}
              {Array.from({ length: Math.max(0, 3 - room.guests.length) }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.stageEmpty}>
                  <Ionicons name="add" size={22} color={colors.textMuted} />
                </View>
              ))}
            </View>

            <View style={styles.audienceHeader}>
              <Text style={styles.sectionLabel}>Audience</Text>
              <Text style={styles.audienceCount}>{room.audience_count}</Text>
            </View>
            {isHost && audience.length > 0 && (
              <View style={styles.audienceHint}>
                <Ionicons name="hand-left" size={14} color={colors.primary} />
                <Text style={styles.audienceHintText}>
                  Tap any listener to invite them onto the stage.
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const canInvite = isHost && item.user_id !== room.host.id;
          return (
            <Pressable
              style={styles.audienceItem}
              onPress={() => {
                if (canInvite) {
                  if (Platform.OS === "web") {
                    if (typeof window !== "undefined" && window.confirm(`Invite @${item.username} to the stage?`))
                      promoteToGuest(item.user_id);
                  } else {
                    Alert.alert("Invite guest?", `Invite @${item.username} up to the stage.`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Invite", onPress: () => promoteToGuest(item.user_id) },
                    ]);
                  }
                }
              }}
              testID={`audience-${item.user_id}`}
            >
              <View>
                <Image
                  source={{ uri: item.avatar_url || AVATAR_FALLBACK }}
                  style={styles.audienceAvatar}
                />
                {canInvite && (
                  <View style={styles.audienceInviteBadge}>
                    <Ionicons name="mic" size={10} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={styles.audienceName} numberOfLines={1}>
                {item.display_name}
              </Text>
              {canInvite && <Text style={styles.audienceInviteText}>Invite</Text>}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.audienceEmpty}>
            <Ionicons name="people-outline" size={22} color={colors.textMuted} />
            <Text style={styles.audienceEmptyText}>
              {isHost
                ? "No listeners yet — once people join, tap their avatar to invite them onto the stage."
                : "No listeners yet — invite people!"}
            </Text>
          </View>
        }
      />

      <View style={[styles.dock, { paddingBottom: 16 + insets.bottom }]}>
        {isSpeaker ? (
          <>
            <TouchableOpacity
              onPress={() => setMuted((m) => !m)}
              style={[styles.dockBtn, styles.dockBtnPrimary, !muted && styles.dockBtnActive]}
              testID="room-mute"
            >
              <Ionicons
                name={muted ? "mic-off" : "mic"}
                size={22}
                color={muted ? colors.textPrimary : "#fff"}
              />
              <Text style={[styles.dockBtnText, !muted && styles.dockBtnTextActive]}>
                {muted ? "Muted" : "Speaking"}
              </Text>
            </TouchableOpacity>
            {!isHost && isGuest && (
              <TouchableOpacity onPress={stepDown} style={styles.dockBtn} testID="room-step-down">
                <Ionicons name="log-out-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.dockBtnText}>Step down</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={[styles.dockBtn, styles.dockBtnMuted]}>
            <Ionicons name="ear" size={22} color={colors.textPrimary} />
            <Text style={styles.dockBtnText}>Listening</Text>
          </View>
        )}
        <TouchableOpacity onPress={() => router.back()} style={styles.dockBtn} testID="room-leave">
          <Ionicons name="exit-outline" size={22} color={colors.danger} />
          <Text style={[styles.dockBtnText, { color: colors.danger }]}>Leave</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS !== "web" && isSpeaker && !agoraJoined && (
        <View style={[styles.buildNoticeWrap, { bottom: 96 + insets.bottom }]}>
          <View style={styles.buildNotice}>
            <Ionicons name="information-circle" size={14} color={colors.primary} />
            <Text style={styles.buildNoticeText}>
              Live mic streaming works in production builds only.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function StageAvatar({
  userLabel,
  name,
  username,
  avatarUrl,
  isVerified,
  large,
}: {
  userLabel: string;
  name: string;
  username: string;
  avatarUrl: string;
  isVerified: boolean;
  large?: boolean;
}) {
  const size = large ? 84 : 68;
  return (
    <View style={styles.stageAvatarWrap}>
      <LinearGradient
        colors={[colors.primary, colors.primaryHover]}
        style={{
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          alignItems: "center",
          justifyContent: "center",
          padding: 3,
        }}
      >
        <Image
          source={{ uri: avatarUrl || AVATAR_FALLBACK }}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.elevated }}
        />
      </LinearGradient>
      <View style={styles.stageLabel}>
        <Text style={styles.stageLabelText}>{userLabel}</Text>
      </View>
      <View style={styles.stageNameRow}>
        <Text style={styles.stageName} numberOfLines={1}>
          {name}
        </Text>
        {isVerified && <Ionicons name="checkmark-circle" size={12} color={colors.primary} />}
      </View>
      <Text style={styles.stageUsername}>@{username}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  errorTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  errorSub: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  errorBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorBtnText: { color: "#fff", fontWeight: "800" },

  hero: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,59,48,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.danger },
  liveText: { color: colors.danger, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  endBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  endBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  roomTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", marginTop: spacing.md },
  roomTopic: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },

  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  stageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: spacing.md,
  },
  stageAvatarWrap: {
    alignItems: "center",
    width: 96,
  },
  stageLabel: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  stageLabelText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  stageNameRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  stageName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", maxWidth: 80 },
  stageUsername: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  stageEmpty: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderColor: colors.border,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  stageKick: {
    position: "absolute",
    top: -2,
    left: 62,
    backgroundColor: colors.bg,
    borderRadius: 10,
  },

  audienceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  audienceCount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: spacing.lg,
  },
  audienceItem: { alignItems: "center", width: "25%", padding: 6 },
  audienceAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.elevated,
  },
  audienceName: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  audienceEmpty: {
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  audienceEmptyText: { color: colors.textMuted, fontSize: 12 },
  audienceInviteBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.bg,
    borderWidth: 2,
  },
  audienceInviteText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  audienceHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  audienceHintText: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  dockBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    paddingVertical: 12,
    borderColor: colors.border,
    borderWidth: 1,
  },
  dockBtnPrimary: {},
  dockBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dockBtnMuted: { opacity: 0.9 },
  dockBtnText: { color: colors.textPrimary, fontWeight: "800", fontSize: 13 },
  dockBtnTextActive: { color: "#fff" },

  buildNoticeWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  buildNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  buildNoticeText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
});
