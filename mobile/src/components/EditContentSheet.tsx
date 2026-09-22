import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, FeedItem } from "@/src/api/client";
import { uploadToCloudinary } from "@/src/lib/cloudinary";
import { colors, spacing, radii } from "@/src/theme";

interface Props {
  item: FeedItem | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (updated: FeedItem) => void;
}

// Reusable owner-edit sheet for posts, reels and videos.
// - post / reel: caption + game tag (media unchanged)
// - video: title, description, category, tags + thumbnail replace
export function EditContentSheet({ item, visible, onClose, onSaved }: Props) {
  const isVideo = item?.type === "video";
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  const [caption, setCaption] = useState("");
  const [gameTag, setGameTag] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");

  useEffect(() => {
    if (!item) return;
    setCaption(item.caption || "");
    setGameTag(item.game_tag || "");
    setTitle(item.title || "");
    setDescription(item.description || "");
    setCategory((item as any).category || item.game_tag || "");
    setTags(Array.isArray((item as any).tags) ? (item as any).tags.join(", ") : "");
    setThumbUrl(item.thumbnail_url || "");
  }, [item]);

  const pickThumbnail = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to change the thumbnail.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingThumb(true);
    try {
      const url = await uploadToCloudinary(result.assets[0].uri, "image", result.assets[0].mimeType);
      setThumbUrl(url);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again.");
    } finally {
      setUploadingThumb(false);
    }
  };

  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      let updated: FeedItem;
      if (isVideo) {
        updated = await api.put<FeedItem>(`/videos/${item.id}`, {
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          thumbnail_url: thumbUrl || null,
        });
      } else {
        updated = await api.put<FeedItem>(`/posts/${item.id}`, {
          caption: caption.trim(),
          game_tag: gameTag.trim() || null,
        });
      }
      onSaved(updated);
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const label = isVideo ? "video" : item?.type === "reel" ? "reel" : "post";

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.grabber} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Edit {label}</Text>
              <TouchableOpacity onPress={onClose} testID="edit-sheet-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
              {isVideo ? (
                <>
                  <Text style={styles.field}>Title</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Video title"
                    placeholderTextColor={colors.textMuted}
                    testID="edit-video-title"
                  />
                  <Text style={styles.field}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe your video"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    testID="edit-video-description"
                  />
                  <Text style={styles.field}>Category</Text>
                  <TextInput
                    style={styles.input}
                    value={category}
                    onChangeText={setCategory}
                    placeholder="e.g. Gaming"
                    placeholderTextColor={colors.textMuted}
                    testID="edit-video-category"
                  />
                  <Text style={styles.field}>Tags (comma separated)</Text>
                  <TextInput
                    style={styles.input}
                    value={tags}
                    onChangeText={setTags}
                    placeholder="fps, tutorial, funny"
                    placeholderTextColor={colors.textMuted}
                    testID="edit-video-tags"
                  />
                  <Text style={styles.field}>Thumbnail</Text>
                  <View style={styles.thumbRow}>
                    <View style={styles.thumbBox}>
                      {thumbUrl ? (
                        <Image source={{ uri: thumbUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                      ) : (
                        <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.thumbBtn}
                      onPress={pickThumbnail}
                      disabled={uploadingThumb}
                      testID="edit-video-thumb-btn"
                    >
                      {uploadingThumb ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                          <Text style={styles.thumbBtnText}>Replace</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.field}>Caption</Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Write a caption"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    testID="edit-post-caption"
                  />
                  <Text style={styles.field}>Game tag (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={gameTag}
                    onChangeText={setGameTag}
                    placeholder="e.g. Valorant"
                    placeholderTextColor={colors.textMuted}
                    testID="edit-post-gametag"
                  />
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || uploadingThumb) && { opacity: 0.5 }]}
              onPress={save}
              disabled={saving || uploadingThumb}
              testID="edit-save-btn"
            >
              {saving ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.saveBtnText}>Save changes</Text>
              )}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  grabber: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "900" },
  field: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "800", marginTop: spacing.md, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  thumbRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumbBox: {
    width: 96,
    height: 60,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  thumbBtnText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { color: colors.bg, fontWeight: "900", fontSize: 15 },
});
