import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radii, spacing } from "@/src/theme";
import { useLiveSocket } from "@/src/lib/useLiveSocket";
import { LiveOverlay } from "@/src/components/LiveOverlay";

interface LiveStream {
  id: string;
  title: string;
  hls_url: string | null;
  whep_url: string | null;
  is_owner: boolean;
  owner: { id: string; username: string; display_name: string; avatar_url: string; is_verified: boolean };
}

function HlsVideo({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url, contentType: "hls" } as never, (p) => { p.loop = false; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} testID="live-video" />;
}

export default function LiveWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useLiveSocket(id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get<LiveStream>(`/live/${id}`);
        if (!cancelled) setStream(s);
      } catch {
        if (!cancelled) router.back();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, router]);

  if (loading || !stream) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const endStream = async () => {
    try { await api.post(`/live/${id}/stop`); } catch { /* noop */ }
    router.replace("/live");
  };

  return (
    <View style={styles.root} testID="live-watch">
      {stream.hls_url ? (
        <HlsVideo url={stream.hls_url} />
      ) : (
        <View style={styles.placeholder}>
          <Image source={{ uri: stream.owner.avatar_url }} style={styles.placeholderAvatar} />
          <View style={styles.waiting}>
            <Ionicons name="radio" size={16} color={colors.live} />
            <Text style={styles.waitingText}>Waiting for video…</Text>
          </View>
        </View>
      )}

      {live.ended ? (
        <View style={styles.endedWrap} testID="live-ended">
          <Text style={styles.endedText}>Stream ended</Text>
          <TouchableOpacity style={styles.endedBtn} onPress={() => router.replace("/live")} testID="live-ended-back">
            <Text style={styles.endedBtnText}>Back to Live</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
          isOwner={stream.is_owner}
          onEnd={endStream}
          onClose={() => router.replace("/live")}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: spacing.md },
  placeholderAvatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: colors.primary },
  waiting: { flexDirection: "row", alignItems: "center", gap: 6 },
  waitingText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },
  endedWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.8)", gap: spacing.md },
  endedText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  endedBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  endedBtnText: { color: colors.bg, fontWeight: "800" },
});
