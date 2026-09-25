import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { colors, spacing, radii } from "@/src/theme";

export interface Track {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url?: string | null;
  duration?: number | null;
}

interface MusicCtx {
  tracks: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  play: (list: Track[], i: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
}

const Ctx = createContext<MusicCtx | null>(null);

// Global music player. Uses expo-audio configured for background playback so
// music keeps playing when the user switches tabs or locks the screen.
// NOTE: true background/locked-screen audio only works in a native build
// (Publish → build) — not in Expo Go or the web preview.
export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);

  const current = index >= 0 && index < tracks.length ? tracks[index] : null;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (i >= 0 && i < tracks.length - 1 ? i + 1 : i));
  }, [tracks.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const play = useCallback((list: Track[], i: number) => {
    setTracks(list);
    setIndex(i);
  }, []);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.playing) {
      p.pause();
      setPlaying(false);
    } else {
      p.play();
      setPlaying(true);
    }
  }, []);

  // Load + play whenever the selected track changes.
  useEffect(() => {
    if (!current) return;
    try {
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer({ uri: current.audio_url });
      } else {
        playerRef.current.replace({ uri: current.audio_url });
      }
      const p = playerRef.current;
      const sub = p.addListener("playbackStatusUpdate", (status: any) => {
        setPlaying(!!status.playing);
        if (status.didJustFinish) next();
      });
      p.play();
      setPlaying(true);
      return () => sub?.remove?.();
    } catch {
      /* noop */
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        /* noop */
      }
    };
  }, []);

  return (
    <Ctx.Provider value={{ tracks, index, current, playing, play, toggle, next, prev }}>
      {children}
      <MiniPlayer />
    </Ctx.Provider>
  );
}

export function useMusic(): MusicCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMusic must be used within MusicPlayerProvider");
  return c;
}

function MiniPlayer() {
  const { current, playing, toggle, next, prev } = useMusic();
  if (!current) return null;
  return (
    <View style={styles.bar} testID="mini-player">
      {current.cover_url ? (
        <Image source={{ uri: current.cover_url }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="musical-notes" size={18} color={colors.primary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{current.artist}</Text>
      </View>
      <Pressable onPress={prev} hitSlop={10} testID="mini-prev">
        <Ionicons name="play-skip-back" size={20} color={colors.textSecondary} />
      </Pressable>
      <Pressable onPress={toggle} style={styles.playBtn} hitSlop={10} testID="mini-toggle">
        <Ionicons name={playing ? "pause" : "play"} size={20} color={colors.bg} />
      </Pressable>
      <Pressable onPress={next} hitSlop={10} testID="mini-next">
        <Ionicons name="play-skip-forward" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: { width: 40, height: 40, borderRadius: radii.sm },
  coverFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  artist: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  playBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
