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
import { useAuth } from "@/src/context/AuthContext";
import { uploadToCloudinary, isCloudinaryConfigured } from "@/src/lib/cloudinary";
import { colors, spacing, radii } from "@/src/theme";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop";

export default function EditProfile() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatar, setAvatar] = useState(user?.avatar_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]) {
      setAvatar(result.assets[0].uri);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let finalAvatar = avatar;
      // If the user picked a new image (it's a local URI or blob:), upload it to
      // Cloudinary so iOS can load it as a real https:// URL. Skip the upload
      // when the avatar is already a remote URL or a base64 data URL.
      const needsUpload = avatar && !avatar.startsWith("http") && !avatar.startsWith("data:");
      if (needsUpload) {
        if (!isCloudinaryConfigured()) {
          throw new Error("Cloudinary keys missing — can't upload your new avatar.");
        }
        finalAvatar = await uploadToCloudinary(avatar, "image");
      }
      await api.put("/auth/me", {
        display_name: displayName,
        bio,
        avatar_url: finalAvatar,
      });
      await refresh();
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="edit-profile-cancel">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit profile</Text>
          <TouchableOpacity onPress={save} disabled={busy} testID="edit-profile-save">
            {busy ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.save}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.avatarBtn} onPress={pickAvatar} testID="edit-avatar">
            <Image source={{ uri: avatar || FALLBACK }} style={styles.avatar} />
            <View style={styles.avatarEdit}>
              <Ionicons name="camera" size={16} color={colors.bg} />
            </View>
          </TouchableOpacity>

          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="edit-displayname"
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Tell the squad about you…"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
            testID="edit-bio"
          />

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  save: { color: colors.primary, fontSize: 16, fontWeight: "800" },
  body: { padding: spacing.md, alignItems: "stretch", gap: spacing.md },
  avatarBtn: { alignSelf: "center", position: "relative", marginVertical: spacing.md },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
  avatarEdit: { position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: spacing.md, color: colors.textPrimary, fontSize: 15 },
  error: { color: colors.danger, fontSize: 14 },
});
