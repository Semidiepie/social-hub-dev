import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { uploadToCloudinary, derivePosterFromVideoUrl } from "@/src/lib/cloudinary";
import {
  CONTENT_MAX_WIDTH,
  useResponsive,
} from "@/src/hooks/useResponsive";
import { useWebDropZone } from "@/src/hooks/useWebDropZone";

const GAME_TAGS = ["valorant", "warzone", "apex", "fortnite", "minecraft", "stardew", "fanart", "setup"];

type Mode = "post" | "reel";

export default function Create() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const [mode, setMode] = useState<Mode>("post");
  const [caption, setCaption] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle a File (from drag-and-drop on web).
  const acceptWebFile = (file: File) => {
    setError(null);
    const url = URL.createObjectURL(file);
    setMediaUri(url);
    setMediaMime(file.type || null);
    setMediaDuration(null);
    // If they dropped a video into "post" mode, hop to reel; and vice versa.
    if (file.type.startsWith("video/") && mode !== "reel") setMode("reel");
    if (file.type.startsWith("image/") && mode !== "post") setMode("post");
  };

  const { isOver: isDropOver } = useWebDropZone({
    onFile: acceptWebFile,
    disabled: busy,
  });

  const pickMedia = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        mode === "reel"
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaMime(asset.mimeType ?? null);
      // expo-image-picker returns video duration in milliseconds.
      const ms = (asset as any).duration as number | undefined;
      setMediaDuration(typeof ms === "number" && ms > 0 ? ms / 1000 : null);
    }
  };

  const submit = async () => {
    setError(null);
    if (mode === "reel" && !mediaUri) {
      setError("Pick a video first.");
      return;
    }
    if (mode === "post" && !mediaUri && !caption.trim()) {
      setError("Add an image or write something.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "post") {
        const imageUrl = mediaUri ? await uploadToCloudinary(mediaUri, "image", mediaMime) : null;
        await api.post("/posts", {
          caption,
          image_url: imageUrl,
          game_tag: tag,
        });
      } else {
        const videoUrl = await uploadToCloudinary(mediaUri!, "video", mediaMime);
        const thumb = derivePosterFromVideoUrl(videoUrl);
        await api.post("/reels", {
          caption,
          video_url: videoUrl,
          thumbnail_url: thumb,
          game_tag: tag,
          duration: mediaDuration,
        });
      }
      // reset and go home
      setCaption("");
      setMediaUri(null);
      setMediaMime(null);
      setMediaDuration(null);
      setTag(null);
      router.replace(mode === "post" ? "/(tabs)/home" : "/(tabs)/reels");
    } catch (e: any) {
      setError(e?.message ?? "Could not publish.");
    } finally {
      setBusy(false);
    }
  };

  const isVideo = mode === "reel";

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="create-cancel">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>New {mode === "reel" ? "reel" : "post"}</Text>
          <TouchableOpacity
            style={[styles.publish, busy && { opacity: 0.4 }]}
            onPress={submit}
            disabled={busy}
            testID="create-publish-button"
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Text style={styles.publishText}>Share</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.modeRow}>
            {(["post", "reel"] as const).map((k) => {
              const active = k === mode;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.modePill, active && styles.modePillActive]}
                  onPress={() => {
                    setMode(k);
                    setMediaUri(null);
                    setMediaMime(null);
                    setMediaDuration(null);
                  }}
                  testID={`create-mode-${k}`}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={k === "post" ? "image-outline" : "play-circle-outline"}
                    size={16}
                    color={active ? colors.bg : colors.textPrimary}
                  />
                  <Text style={[styles.modeText, active && { color: colors.bg }]}>
                    {k === "post" ? "Post" : "Reel"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.mediaPicker}
            onPress={pickMedia}
            activeOpacity={0.9}
            testID="create-pick-media"
          >
            {mediaUri ? (
              isVideo ? (
                <View style={styles.videoPreviewWrap}>
                  <Ionicons name="videocam" size={42} color={colors.primary} />
                  <Text style={styles.videoPreviewText} numberOfLines={1}>
                    Video selected
                  </Text>
                  <Text style={styles.videoPreviewHint}>Tap to pick a different one</Text>
                </View>
              ) : (
                <Image source={{ uri: mediaUri }} style={styles.mediaPreview} />
              )
            ) : (
              <View style={styles.mediaEmpty}>
                <Ionicons
                  name={isVideo ? "videocam-outline" : "image-outline"}
                  size={36}
                  color={colors.textSecondary}
                />
                <Text style={styles.mediaEmptyText}>
                  Tap to pick {isVideo ? "a video" : "an image"}
                </Text>
                <Text style={styles.mediaEmptySub}>
                  {isVideo ? "Vertical 9:16 works best — up to 60s" : "Square or portrait recommended"}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="What's the play? Tag your squad…"
            placeholderTextColor={colors.textMuted}
            style={styles.captionInput}
            multiline
            testID="create-caption-input"
          />

          <Text style={styles.label}>Game tag</Text>
          <View style={styles.tagWrap}>
            {GAME_TAGS.map((g) => {
              const active = g === tag;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.tagPill, active && styles.tagPillActive]}
                  onPress={() => setTag(active ? null : g)}
                  testID={`create-tag-${g}`}
                >
                  <Text style={[styles.tagPillText, active && { color: colors.bg }]}>#{g}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {error && (
            <Text style={styles.error} testID="create-error">
              {error}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {isDesktop && isDropOver ? (
        <View pointerEvents="none" style={styles.dropOverlay}>
          <View style={styles.dropCard}>
            <Ionicons name="cloud-upload" size={44} color={colors.primary} />
            <Text style={styles.dropTitle}>Drop to upload</Text>
            <Text style={styles.dropSub}>
              Release the file to attach it to your {mode === "reel" ? "reel" : "post"}
            </Text>
          </View>
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  publish: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, minWidth: 72, alignItems: "center" },
  publishText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  modeRow: { flexDirection: "row", gap: spacing.sm },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
  },
  modePillActive: { backgroundColor: colors.primary },
  modeText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },

  mediaPicker: {
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  mediaPreview: { width: "100%", height: "100%" },
  mediaEmpty: { alignItems: "center", gap: 6, padding: spacing.lg },
  mediaEmptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 8 },
  mediaEmptySub: { color: colors.textSecondary, fontSize: 13 },
  videoPreviewWrap: { alignItems: "center", gap: 6, padding: spacing.lg },
  videoPreviewText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 4 },
  videoPreviewHint: { color: colors.textSecondary, fontSize: 12 },

  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  captionInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: "top",
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tagPill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, backgroundColor: colors.elevated },
  tagPillActive: { backgroundColor: colors.primary },
  tagPillText: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },

  error: { color: colors.danger, fontSize: 14 },

  // Web-only drag-and-drop overlay.
  dropOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(18,20,28,0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  dropCard: {
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 8,
    maxWidth: 360,
  },
  dropTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  dropSub: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
});
