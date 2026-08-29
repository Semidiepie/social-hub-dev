import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";
import { uploadToCloudinary } from "@/src/lib/cloudinary";

export default function CreateStory() {
  const router = useRouter();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async (kind: "image" | "video") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo library access to add a story.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        kind === "video"
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setMediaUri(a.uri);
      setMediaMime(a.mimeType ?? null);
      setMediaType(kind);
      const ms = (a as any).duration as number | undefined;
      setMediaDuration(typeof ms === "number" && ms > 0 ? ms / 1000 : null);
    }
  };

  const share = async () => {
    if (!mediaUri) return;
    setBusy(true);
    try {
      const url = await uploadToCloudinary(mediaUri, mediaType, mediaMime);
      await api.post("/stories", {
        media_url: url,
        media_type: mediaType,
        caption: caption.trim() || null,
        duration: mediaDuration,
      });
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Couldn't post story", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="story-cancel">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Add to story</Text>
          <TouchableOpacity
            style={[styles.share, (!mediaUri || busy) && { opacity: 0.4 }]}
            onPress={share}
            disabled={!mediaUri || busy}
            testID="story-share"
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.shareText}>Share</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {mediaUri ? (
            <View style={styles.previewWrap}>
              {mediaType === "image" ? (
                <Image source={{ uri: mediaUri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={[styles.preview, styles.videoPreview]}>
                  <Ionicons name="videocam" size={64} color={colors.primary} />
                  <Text style={styles.videoText}>Video story ready</Text>
                </View>
              )}
              <TouchableOpacity style={styles.replaceBtn} onPress={() => { setMediaUri(null); setMediaMime(null); setMediaDuration(null); }}>
                <Ionicons name="refresh" size={16} color={colors.textPrimary} />
                <Text style={styles.replaceText}>Change</Text>
              </TouchableOpacity>

              <View style={styles.captionWrap}>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Say something… (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.caption}
                  multiline
                  maxLength={200}
                />
              </View>
            </View>
          ) : (
            <View style={styles.pickerWrap}>
              <Text style={styles.hero}>Share a moment</Text>
              <Text style={styles.heroSub}>Your story disappears in 24 hours.</Text>
              <TouchableOpacity style={styles.pickBtn} onPress={() => pick("image")} testID="story-pick-image">
                <Ionicons name="image-outline" size={26} color={colors.primary} />
                <Text style={styles.pickText}>Pick a photo</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickBtn} onPress={() => pick("video")} testID="story-pick-video">
                <Ionicons name="videocam-outline" size={26} color={colors.primary} />
                <Text style={styles.pickText}>Pick a video</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  share: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, minWidth: 76, alignItems: "center" },
  shareText: { color: colors.bg, fontSize: 14, fontWeight: "800" },
  body: { flex: 1, padding: spacing.md },

  pickerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  hero: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  heroSub: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.lg },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: 16, width: "100%" },
  pickText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 },

  previewWrap: { flex: 1, gap: spacing.md },
  preview: { flex: 1, borderRadius: radii.lg, backgroundColor: colors.surface, aspectRatio: 9 / 16 },
  videoPreview: { alignItems: "center", justifyContent: "center", gap: spacing.sm },
  videoText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  replaceBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", backgroundColor: colors.elevated, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full },
  replaceText: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  captionWrap: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md },
  caption: { padding: spacing.md, color: colors.textPrimary, fontSize: 14, minHeight: 60, textAlignVertical: "top" },
});
