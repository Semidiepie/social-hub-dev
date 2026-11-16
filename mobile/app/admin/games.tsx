import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio Games, matching the web page (frontend/src/pages/AdminGames.jsx):
 * GET /admin/games, POST /admin/games, PATCH /admin/games/{id},
 * GET /games/{id}/updates and POST /admin/games/{id}/updates {title, message}.
 */
type Game = { id: string; title?: string; name?: string; description?: string; url?: string };

export default function AdminGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get<any>("/admin/games"); setGames(Array.isArray(res) ? res : res.games || res.items || []); } catch { setGames([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const createGame = async () => {
    if (!title.trim()) { Alert.alert("Games", "Enter a game title first."); return; }
    setBusy(true);
    try { await api.post("/admin/games", { title: title.trim(), description: description.trim(), url: url.trim() || undefined }); setTitle(""); setDescription(""); setUrl(""); await load(); } catch (e: any) { Alert.alert("Games", e?.message || "Failed"); } finally { setBusy(false); }
  };
  const postUpdate = async (g: Game) => {
    if (!updateTitle.trim() || !updateMessage.trim()) { Alert.alert("Game update", "Enter an update title and message first."); return; }
    setBusy(true);
    try { await api.post(`/admin/games/${g.id}/updates`, { title: updateTitle.trim(), message: updateMessage.trim() }); setUpdateTitle(""); setUpdateMessage(""); Alert.alert("Game update", "Update posted."); } catch (e: any) { Alert.alert("Game update", e?.message || "Failed"); } finally { setBusy(false); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Games" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.section}>Add a game</Text>
        <TextInput style={styles.input} placeholder="Title" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} testID="admin-games-title" />
        <TextInput style={styles.input} placeholder="Description" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} testID="admin-games-description" />
        <TextInput style={styles.input} placeholder="URL (optional)" placeholderTextColor={colors.textMuted} value={url} onChangeText={setUrl} autoCapitalize="none" testID="admin-games-url" />
        <TouchableOpacity style={styles.btn} onPress={createGame} disabled={busy}><Text style={styles.btnText}>Add game</Text></TouchableOpacity>
        <Text style={styles.section}>Post a game update</Text>
        <TextInput style={styles.input} placeholder="Update title" placeholderTextColor={colors.textMuted} value={updateTitle} onChangeText={setUpdateTitle} testID="admin-games-update-title" />
        <TextInput style={styles.input} placeholder="Update message" placeholderTextColor={colors.textMuted} value={updateMessage} onChangeText={setUpdateMessage} testID="admin-games-update-message" />
        <Text style={styles.section}>Games</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : games.length === 0 ? <Text style={styles.empty}>No games yet.</Text> : games.map((g) => (
          <View key={g.id} style={styles.card}>
            <Text style={styles.cardTitle}>{g.title || g.name || g.id}</Text>
            {g.description ? <Text style={styles.cardMeta}>{g.description}</Text> : null}
            <TouchableOpacity style={[styles.btn, styles.smallBtn]} onPress={() => postUpdate(g)} disabled={busy}><Text style={styles.btnText}>Post update to this game</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  section: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  smallBtn: { marginTop: 8, marginBottom: 0 },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  cardMeta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  empty: { color: colors.textSecondary, fontSize: 14 },
});
