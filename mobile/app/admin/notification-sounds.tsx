import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio Notification sounds, matching the web page
 * (frontend/src/pages/AdminNotificationSounds.jsx): GET /notification-sounds,
 * POST /admin/notification-sounds {group, url} to set a sound, and the same
 * endpoint with url: null to remove it. File picking is not available in the
 * app, so sounds are set by URL.
 */
type Sound = { group?: string; name?: string; url?: string | null };

export default function AdminNotificationSounds() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get<any>("/notification-sounds"); setSounds(Array.isArray(res) ? res : res.sounds || res.items || []); } catch { setSounds([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (g: string, u: string | null) => {
    if (!g.trim()) { Alert.alert("Notification sounds", "Enter a sound group first."); return; }
    setBusy(true);
    try { await api.post("/admin/notification-sounds", { group: g.trim(), url: u }); await load(); } catch (e: any) { Alert.alert("Notification sounds", e?.message || "Failed"); } finally { setBusy(false); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Notification sounds" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.section}>Set a notification sound (by URL)</Text>
        <TextInput style={styles.input} placeholder="Group (e.g. message)" placeholderTextColor={colors.textMuted} value={group} onChangeText={setGroup} autoCapitalize="none" testID="admin-sounds-group" />
        <TextInput style={styles.input} placeholder="Sound URL" placeholderTextColor={colors.textMuted} value={url} onChangeText={setUrl} autoCapitalize="none" testID="admin-sounds-url" />
        <TouchableOpacity style={styles.btn} onPress={() => save(group, url.trim() || null)} disabled={busy}><Text style={styles.btnText}>Save sound</Text></TouchableOpacity>
        <Text style={styles.section}>Current sounds</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : sounds.length === 0 ? <Text style={styles.empty}>No notification sounds configured.</Text> : sounds.map((s, i) => (
          <View key={s.group || i} style={styles.card}>
            <Text style={styles.name}>{s.group || s.name || "Sound"}</Text>
            {s.url ? <Text style={styles.meta}>{s.url}</Text> : <Text style={styles.meta}>No sound set</Text>}
            <TouchableOpacity style={[styles.btn, styles.removeBtn]} onPress={() => save(s.group || s.name || "", null)} disabled={busy}><Text style={styles.btnText}>Remove</Text></TouchableOpacity>
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
  removeBtn: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, marginTop: 8, marginBottom: 0 },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  empty: { color: colors.textSecondary, fontSize: 14 },
});
