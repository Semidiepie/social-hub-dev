import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useMusic, type Track } from "@/src/context/MusicPlayer";
import { uploadToCloudinary } from "@/src/lib/cloudinary";
import { colors, spacing, radii } from "@/src/theme";

export default function MusicScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { play, current, playing, toggle } = useMusic();
  const [songs, setSongs] = useState<Track[] | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const isAdmin = !!user?.is_super_admin;

  const load = async () => {
    try {
      setSongs(await api.get<Track[]>("/songs"));
    } catch {
      setSongs([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRow = (i: number) => {
    if (current && songs && songs[i].id === current.id) toggle();
    else if (songs) play(songs, i);
  };

  const remove = async (s: Track) => {
    setSongs((rows) => (rows || []).filter((x) => x.id !== s.id));
    try {
      await api.del(`/songs/${s.id}`);
    } catch {
      load();
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="music-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Music</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={() => setShowUpload(true)} testID="music-add">
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      {songs === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.md, gap: 4, paddingBottom: 160 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No songs yet.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const active = current && current.id === item.id;
            return (
              <TouchableOpacity style={[styles.row, active && styles.rowActive]} onPress={() => onRow(index)} testID={`music-row-${item.id}`}>
                {item.cover_url ? (
                  <Image source={{ uri: item.cover_url }} style={styles.cover} />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <Ionicons name="musical-notes" size={18} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.songTitle, active && { color: colors.primary }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
                </View>
                <Ionicons name={active && playing ? "pause" : "play"} size={20} color={colors.textSecondary} />
                {isAdmin && (
                  <TouchableOpacity onPress={() => remove(item)} hitSlop={10} testID={`music-delete-${item.id}`} style={{ marginLeft: spacing.sm }}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          testID="music-list"
        />
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={(s) => { setSongs((r) => [s, ...(r || [])]); setShowUpload(false); }} />}
    </SafeAreaView>
  );
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (s: Track) => void }) {
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [busy, setBusy] = useState<"audio" | "cover" | "save" | null>(null);

  const pickAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy("audio");
    try {
      const url = await uploadToCloudinary(a.uri, "video", a.mimeType);
      setAudioUrl(url);
      if (!title) setTitle((a.name || "Untitled").replace(/\.[^.]+$/, ""));
    } catch {
      /* noop */
    } finally {
      setBusy(null);
    }
  };

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy("cover");
    try {
      setCoverUrl(await uploadToCloudinary(res.assets[0].uri, "image", res.assets[0].mimeType));
    } catch {
      /* noop */
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!title.trim() || !audioUrl) return;
    setBusy("save");
    try {
      const s = await api.post<Track>("/songs", { title: title.trim(), audio_url: audioUrl, cover_url: coverUrl || null });
      onDone(s);
    } catch {
      setBusy(null);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Add a song</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textMuted} style={styles.input} testID="song-title-input" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={styles.pick} onPress={pickAudio} disabled={!!busy} testID="song-pick-audio">
              {busy === "audio" ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="musical-note" size={22} color={audioUrl ? colors.primary : colors.textSecondary} />}
              <Text style={styles.pickText}>{audioUrl ? "Audio ready" : "Audio file"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pick} onPress={pickCover} disabled={!!busy} testID="song-pick-cover">
              {busy === "cover" ? <ActivityIndicator color={colors.primary} /> : coverUrl ? <Image source={{ uri: coverUrl }} style={{ width: 26, height: 26, borderRadius: 4 }} /> : <Ionicons name="image" size={22} color={colors.textSecondary} />}
              <Text style={styles.pickText}>{coverUrl ? "Cover ready" : "Cover"}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.save, (!title.trim() || !audioUrl || !!busy) && { opacity: 0.5 }]} onPress={submit} disabled={!title.trim() || !audioUrl || !!busy} testID="song-save">
              {busy === "save" ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.saveText}>Add song</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  rowActive: { borderColor: colors.primary, borderWidth: 1 },
  cover: { width: 48, height: 48, borderRadius: radii.sm },
  coverFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  songTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  songArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  sheetTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginBottom: spacing.sm },
  input: { backgroundColor: colors.bg, borderRadius: radii.md, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15 },
  pick: { flex: 1, alignItems: "center", gap: 6, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radii.md },
  pickText: { color: colors.textSecondary, fontSize: 12 },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radii.md },
  cancel: { borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textSecondary, fontWeight: "700" },
  save: { backgroundColor: colors.primary },
  saveText: { color: colors.bg, fontWeight: "800" },
});
