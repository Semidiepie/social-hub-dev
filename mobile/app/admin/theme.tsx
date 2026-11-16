import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio Holiday Theme, matching the web page (frontend/src/pages/AdminTheme.jsx):
 * GET /admin/theme, POST /admin/theme/generate {prompt},
 * POST /admin/theme/apply {spec}, POST /admin/theme/off {}.
 * Theme generation is done by the backend (Sage); the app collects the prompt,
 * shows the generated preview, and can apply it or turn the theme off.
 */
export default function AdminTheme() {
  const [theme, setTheme] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setTheme(await api.get<any>("/admin/theme")); } catch { setTheme(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const generate = async () => {
    if (!prompt.trim()) { Alert.alert("Holiday Theme", "Describe the theme first (e.g. Christmas, Halloween)."); return; }
    setBusy(true);
    try { const res = await api.post<any>("/admin/theme/generate", { prompt: prompt.trim() }); setPreview(res?.spec || res?.theme || res); Alert.alert("Holiday Theme", "Theme generated. Review the preview, then apply it."); } catch (e: any) { Alert.alert("Holiday Theme", e?.message || "Failed to generate"); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview) { Alert.alert("Holiday Theme", "Generate a theme first."); return; }
    setBusy(true);
    try { await api.post("/admin/theme/apply", { spec: preview }); await load(); Alert.alert("Holiday Theme", "Theme applied."); } catch (e: any) { Alert.alert("Holiday Theme", e?.message || "Failed to apply"); } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { await api.post("/admin/theme/off", {}); await load(); setPreview(null); } catch (e: any) { Alert.alert("Holiday Theme", e?.message || "Failed"); } finally { setBusy(false); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Holiday Theme" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> : (
          <View style={styles.card}><Text style={styles.cardTitle}>Current theme</Text><Text style={styles.meta}>{theme?.name || theme?.title || theme?.id || "No holiday theme active"}</Text></View>
        )}
        <Text style={styles.section}>Generate a holiday theme</Text>
        <TextInput style={styles.input} placeholder="e.g. Cozy Christmas with snow and warm lights" placeholderTextColor={colors.textMuted} value={prompt} onChangeText={setPrompt} multiline testID="admin-theme-prompt" />
        <TouchableOpacity style={styles.btn} onPress={generate} disabled={busy}><Text style={styles.btnText}>Generate theme</Text></TouchableOpacity>
        {preview ? (<View style={styles.card}><Text style={styles.cardTitle}>Preview</Text><Text style={styles.meta}>{JSON.stringify(preview).slice(0, 500)}</Text><TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={apply} disabled={busy}><Text style={styles.btnText}>Apply this theme</Text></TouchableOpacity></View>) : null}
        <TouchableOpacity style={[styles.btn, styles.offBtn]} onPress={turnOff} disabled={busy}><Text style={styles.btnText}>Turn theme off</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  section: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 80, textAlignVertical: "top" },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 10 },
  offBtn: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginTop: 8 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
});
