import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing } from "@/src/theme";
import { useLiveSocket } from "@/src/lib/useLiveSocket";
import { LiveOverlay } from "@/src/components/LiveOverlay";

interface CreatedStream {
  id: string;
  title: string;
  provider_configured: boolean;
  owner: { id: string; username: string; display_name: string; avatar_url: string; is_verified: boolean };
}

export default function GoLiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [title, setTitle] = useState("");
  const [stream, setStream] = useState<CreatedStream | null>(null);
  const [starting, setStarting] = useState(false);
  const endedRef = useRef(false);
  const live = useLiveSocket(stream?.id);

  const goLive = async () => {
    setStarting(true);
    try {
      // Contextual camera/mic permission before broadcasting.
      let perm = permission;
      if (!perm?.granted) {
        perm = await requestPermission();
      }
      const s = await api.post<CreatedStream>("/live", { title: title.trim() || "Live", mode: "webrtc" });
      setStream(s);
    } catch {
      /* noop */
    } finally {
      setStarting(false);
    }
  };

  const endStream = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    try { if (stream?.id) await api.post(`/live/${stream.id}/stop`); } catch { /* noop */ }
    router.replace("/live");
  };

  useEffect(() => {
    return () => {
      if (stream?.id && !endedRef.current) {
        api.post(`/live/${stream.id}/stop`).catch(() => {});
      }
    };
  }, [stream?.id]);

  // Setup screen
  if (!stream) {
    const blocked = permission && !permission.granted && !permission.canAskAgain;
    return (
      <SafeAreaView style={styles.setup}>
        <View style={styles.setupHeader}>
          <TouchableOpacity onPress={() => router.back()} testID="golive-cancel">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.setupTitle}>Go Live</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.setupBody}>
          <Text style={styles.label}>Stream title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={`${user?.display_name || "My"}'s live`}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            maxLength={120}
            testID="golive-title"
          />
          <Text style={styles.hint}>Camera & microphone are used to broadcast your live video.</Text>
          {blocked ? (
            <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="golive-open-settings">
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
              <Text style={styles.settingsText}>Enable camera in Settings</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.liveBtn} onPress={goLive} disabled={starting} testID="golive-start-btn">
              {starting ? <ActivityIndicator color="#fff" /> : <Ionicons name="radio" size={20} color="#fff" />}
              <Text style={styles.liveBtnText}>Go Live</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Broadcasting screen
  return (
    <View style={styles.root}>
      {permission?.granted ? (
        <CameraView style={StyleSheet.absoluteFill} facing="front" testID="golive-preview" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCam]}>
          <Ionicons name="videocam-off-outline" size={40} color={colors.textMuted} />
          <Text style={styles.noCamText}>Camera unavailable</Text>
        </View>
      )}

      <View style={styles.notice} testID="golive-notice">
        <Ionicons name="information-circle" size={16} color="#000" />
        <Text style={styles.noticeText}>
          {stream.provider_configured
            ? "Broadcasting requires a published native build — viewers see your video after you Publish the app."
            : "Video provider not set up yet. Your chat, hearts & gifts are live now; add Cloudflare keys + Publish a build to send video to viewers."}
        </Text>
      </View>

      <LiveOverlay
        owner={stream.owner}
        title={stream.title}
        viewers={live.viewers}
        hearts={live.hearts}
        floaters={live.floaters}
        chat={live.chat}
        gifts={live.gifts}
        onSendChat={live.sendChat}
        onSendHeart={live.sendHeart}
        onSendGift={live.sendGift}
        isOwner
        onEnd={endStream}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  setup: { flex: 1, backgroundColor: colors.bg },
  setupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  setupTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  setupBody: { padding: spacing.lg, gap: spacing.md },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12 },
  liveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.live, borderRadius: radii.md, paddingVertical: 14, marginTop: spacing.sm },
  liveBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  settingsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, marginTop: spacing.sm },
  settingsText: { color: colors.primary, fontWeight: "800" },
  noCam: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: spacing.sm },
  noCamText: { color: colors.textMuted, fontSize: 14 },
  notice: { position: "absolute", top: Platform.OS === "web" ? 70 : 90, left: "5%", right: "5%", flexDirection: "row", gap: spacing.sm, backgroundColor: "rgba(245,158,11,0.92)", borderRadius: radii.md, padding: spacing.sm, zIndex: 5 },
  noticeText: { flex: 1, color: "#000", fontSize: 11, fontWeight: "600" },
});
