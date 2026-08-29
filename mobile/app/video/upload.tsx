import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, VideoItem, VideoVisibility } from "@/src/api/client";
import {
  uploadVideoChunked,
  uploadToCloudinary,
  isCloudinaryConfigured,
  derivePosterFromVideoUrl,
} from "@/src/lib/cloudinary";
import { compressVideoIfNeeded } from "@/src/lib/videoCompress";
import { colors, spacing, radii } from "@/src/theme";

const CATEGORIES = [
  "Gaming",
  "Vlogs",
  "Music",
  "Tech",
  "Comedy",
  "Sports",
  "Learning",
  "Other",
];

const VISIBILITIES: { key: VideoVisibility; label: string; icon: any; desc: string }[] = [
  { key: "public", label: "Public", icon: "globe-outline", desc: "Anyone can watch" },
  { key: "unlisted", label: "Unlisted", icon: "eye-off-outline", desc: "Only people with the link" },
  { key: "private", label: "Private", icon: "lock-closed", desc: "Only you can watch" },
];

function formatBytes(n: number | null): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v > 10 ? 0 : 1)} ${units[i]}`;
}

export default function UploadVideoScreen() {
  const router = useRouter();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | null>(null);
  const [videoBytes, setVideoBytes] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Gaming");
  const [visibility, setVisibility] = useState<VideoVisibility>("public");
  const [tagsRaw, setTagsRaw] = useState("");
  const [progress, setProgress] = useState<number>(0);
  const [phase, setPhase] = useState<
    "idle" | "compressing" | "uploading-video" | "uploading-thumb" | "saving"
  >("idle");
  const [compressionInfo, setCompressionInfo] = useState<{
    originalBytes: number;
    newBytes: number;
    saved: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = phase !== "idle";

  const pickVideo = useCallback(async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "We need access to your media library to upload a video.");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (r.canceled || r.assets.length === 0) return;
    const a = r.assets[0];
    setVideoUri(a.uri);
    setVideoMime(a.mimeType ?? "video/mp4");
    setVideoBytes(a.fileSize ?? null);
    setVideoDuration(a.duration ? a.duration / 1000 : null);
  }, []);

  const pickThumb = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (r.canceled) return;
    setThumbUri(r.assets[0].uri);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (!videoUri) {
      setError("Choose a video file first.");
      return;
    }
    if (!title.trim()) {
      setError("Give your video a title.");
      return;
    }
    if (!isCloudinaryConfigured()) {
      setError("Cloudinary isn't configured on this build.");
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // 1. Compress if the file is too big for our upload budget. This is a
      //    no-op for smaller clips and on web. Runs before the upload so
      //    the resulting URI is used everywhere below.
      setPhase("compressing");
      setProgress(0);
      setCompressionInfo(null);
      const compressed = await compressVideoIfNeeded(videoUri, {
        signal: ac.signal,
        onProgress: (f) => setProgress(f),
      });
      const finalUri = compressed.uri;
      const finalBytes = compressed.bytes || videoBytes || null;
      if (compressed.wasCompressed) {
        setCompressionInfo({
          originalBytes: videoBytes ?? 0,
          newBytes: compressed.bytes,
          saved: compressed.savedBytes,
        });
      }
      // If even after compression we're still over the single-shot cap AND
      // we can't use chunked upload (Cloudinary Free plan), warn early with
      // an actionable message instead of letting the upload fail deep in.
      // We still let the chunked path attempt anything ≤ ~5 GB — if the
      // account plan supports chunked uploads this will succeed.

      // 2. Chunked upload to Cloudinary.
      setPhase("uploading-video");
      setProgress(0);
      const result = await uploadVideoChunked(finalUri, {
        mime: videoMime,
        signal: ac.signal,
        onProgress: (f) => setProgress(f),
      });

      let finalThumb: string | null = result.thumbnailUrl;
      if (thumbUri) {
        setPhase("uploading-thumb");
        try {
          finalThumb = await uploadToCloudinary(thumbUri, "image");
        } catch (e) {
          console.warn("[upload] thumbnail upload failed", e);
        }
      }
      // If no user thumb and no Cloudinary poster, keep null — server accepts null.
      if (!finalThumb) finalThumb = derivePosterFromVideoUrl(result.secureUrl);

      setPhase("saving");
      const tags = tagsRaw
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean);
      const body = {
        title: title.trim(),
        description: description.trim(),
        video_url: result.secureUrl,
        thumbnail_url: finalThumb,
        duration: result.duration ?? videoDuration,
        size_bytes: result.bytes ?? finalBytes,
        visibility,
        tags,
        category,
      };
      const created = await api.post<VideoItem>("/videos", body, true);
      router.replace(`/video/${created.id}`);
    } catch (e: any) {
      const msg = String(e?.message || "Upload failed");
      // Cloudinary sends a 400 with "File size too large" when the account
      // plan's per-upload cap is hit; surface an actionable hint.
      if (/file size too large|too large|max.*size/i.test(msg)) {
        setError(
          `Video is still too large after compression. Your Cloudinary plan caps single uploads at ${Math.round(
            (100 * 1024 * 1024) / (1024 * 1024),
          )} MB. Try a shorter clip, or upgrade your Cloudinary plan for larger uploads.`,
        );
      } else if (/media\s*recorder|not supported/i.test(msg)) {
        setError(
          "Your browser can't compress video locally. Please try the mobile app, or use a smaller clip.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setPhase("idle");
      abortRef.current = null;
    }
  }, [
    videoUri,
    videoMime,
    videoBytes,
    videoDuration,
    thumbUri,
    title,
    description,
    tagsRaw,
    category,
    visibility,
    router,
  ]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const progressLabel = useMemo(() => {
    if (phase === "compressing") {
      const p = Math.round(progress * 100);
      return `Compressing video · ${p}%`;
    }
    if (phase === "uploading-video") {
      const p = Math.round(progress * 100);
      const bytesDone = videoBytes ? Math.round((videoBytes * progress) / (1024 * 1024)) : 0;
      const total = videoBytes ? Math.round(videoBytes / (1024 * 1024)) : 0;
      return `Uploading video · ${p}%${total ? ` · ${bytesDone}/${total} MB` : ""}`;
    }
    if (phase === "uploading-thumb") return "Uploading thumbnail…";
    if (phase === "saving") return "Publishing…";
    return "";
  }, [phase, progress, videoBytes]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} testID="upload-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Upload video</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Video picker */}
          <TouchableOpacity
            style={styles.pickCard}
            onPress={pickVideo}
            activeOpacity={0.85}
            disabled={busy}
            testID="upload-pick-video"
          >
            {videoUri ? (
              <View style={styles.pickedRow}>
                <View style={styles.pickedIcon}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickedName} numberOfLines={1}>
                    Video selected
                  </Text>
                  <Text style={styles.pickedSub}>
                    {formatBytes(videoBytes)}
                    {videoDuration ? ` · ${Math.round(videoDuration)}s` : ""}
                  </Text>
                  {compressionInfo ? (
                    <Text style={styles.compressedNote}>
                      Compressed to {formatBytes(compressionInfo.newBytes)}
                      {compressionInfo.saved > 0 ? ` (−${formatBytes(compressionInfo.saved)})` : ""}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.replaceHint}>Replace</Text>
              </View>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={40} color={colors.primary} />
                <Text style={styles.pickTitle}>Choose a video</Text>
                <Text style={styles.pickHint}>
                  MP4 recommended · large clips are auto-compressed to fit the upload cap
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Thumbnail */}
          <Text style={styles.sectionLabel}>Thumbnail</Text>
          <TouchableOpacity
            style={styles.thumbCard}
            onPress={pickThumb}
            activeOpacity={0.85}
            disabled={busy}
            testID="upload-pick-thumb"
          >
            {thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.thumbPreview} resizeMode="cover" />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
                <Text style={styles.thumbHint}>
                  Optional — we&apos;ll pick a frame from your video if you skip
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            placeholder="A catchy title"
            placeholderTextColor={colors.textMuted}
            maxLength={140}
            testID="upload-title"
          />

          {/* Description */}
          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            placeholder="Tell viewers about your video, add timestamps, links…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={5000}
            testID="upload-description"
          />

          {/* Category */}
          <Text style={styles.sectionLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`upload-cat-${c}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Tags */}
          <Text style={styles.sectionLabel}>Tags</Text>
          <TextInput
            value={tagsRaw}
            onChangeText={setTagsRaw}
            style={styles.input}
            placeholder="fortnite, tutorial, funnymoments"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            testID="upload-tags"
          />

          {/* Visibility */}
          <Text style={styles.sectionLabel}>Visibility</Text>
          {VISIBILITIES.map((v) => {
            const active = visibility === v.key;
            return (
              <TouchableOpacity
                key={v.key}
                onPress={() => setVisibility(v.key)}
                style={[styles.visRow, active && styles.visRowActive]}
                testID={`upload-vis-${v.key}`}
              >
                <Ionicons
                  name={v.icon}
                  size={20}
                  color={active ? colors.primary : colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.visLabel}>{v.label}</Text>
                  <Text style={styles.visDesc}>{v.desc}</Text>
                </View>
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={active ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>
            );
          })}

          {/* Progress */}
          {busy && (
            <View style={styles.progressBox}>
              <Text style={styles.progressLabel}>{progressLabel}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${Math.max(2, Math.round(progress * 100))}%` },
                  ]}
                />
              </View>
              <TouchableOpacity onPress={cancel} style={styles.cancelBtn} testID="upload-cancel">
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {error ? (
            <Text style={styles.error} testID="upload-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.publishBtn, busy && { opacity: 0.5 }]}
            onPress={submit}
            disabled={busy}
            testID="upload-publish"
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={18} color={colors.bg} />
                <Text style={styles.publishText}>Publish</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  scroll: { padding: spacing.md, gap: 6, paddingBottom: 60 },

  pickCard: {
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radii.lg,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
  },
  pickTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginTop: 6 },
  pickHint: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  pickedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, width: "100%" },
  pickedIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  pickedName: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  pickedSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  compressedNote: { color: colors.primary, fontSize: 11.5, fontWeight: "800", marginTop: 2 },
  replaceHint: { color: colors.primary, fontWeight: "800", fontSize: 12 },

  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 6,
  },
  thumbCard: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPreview: { width: "100%", height: "100%" },
  thumbPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 12 },
  thumbHint: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },

  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.textPrimary,
    padding: 12,
    fontSize: 14,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },

  chipsScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 6,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.bg },

  visRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    marginTop: 6,
  },
  visRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryFaint },
  visLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  visDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  progressBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    gap: 8,
  },
  progressLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  progressTrack: {
    height: 8,
    backgroundColor: colors.elevated,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: colors.primary },
  cancelBtn: { alignSelf: "flex-start" },
  cancelText: { color: colors.danger, fontWeight: "800", fontSize: 12.5 },

  error: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: spacing.md },

  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  publishText: { color: colors.bg, fontSize: 15, fontWeight: "900" },
});
