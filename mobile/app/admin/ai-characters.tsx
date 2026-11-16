import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio AI Characters, matching the web page (frontend/src/pages/AdminAiCharacters.jsx):
 * GET /ai-characters, POST /ai-characters/{id}/thought {thought}.
 * Character creation / editing is done on the web; the app lists characters
 * and can set a thought for each one.
 */
type Character = { id: string; name?: string; display_name?: string; thought?: string; description?: string };

export default function AdminAiCharacters() {
  const [chars, setChars] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [thoughts, setThoughts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get<any>("/ai-characters"); setChars(Array.isArray(res) ? res : res.characters || res.items || []); } catch { setChars([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const setThought = async (c: Character) => {
    const thought = (thoughts[c.id] || "").trim();
    if (!thought) { Alert.alert("AI Characters", "Enter a thought first."); return; }
    setBusyId(c.id);
    try { await api.post(`/ai-characters/${c.id}/thought`, { thought }); Alert.alert("AI Characters", "Thought set."); await load(); } catch (e: any) { Alert.alert("AI Characters", e?.message || "Failed"); } finally { setBusyId(null); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "AI Characters" }} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          {chars.length === 0 ? <Text style={styles.empty}>No AI characters yet.</Text> : chars.map((c) => (
            <View key={c.id} style={styles.card}>
              <Text style={styles.name}>{c.display_name || c.name || c.id}</Text>
              {c.description ? <Text style={styles.meta}>{c.description}</Text> : null}
              {c.thought ? <Text style={styles.meta}>Current thought: {c.thought}</Text> : null}
              <TextInput style={styles.input} placeholder="New thought..." placeholderTextColor={colors.textMuted} value={thoughts[c.id] || ""} onChangeText={(v) => setThoughts((p) => ({ ...p, [c.id]: v }))} testID={`admin-ai-thought-${c.id}`} />
              <TouchableOpacity style={styles.btn} onPress={() => setThought(c)} disabled={busyId === c.id}><Text style={styles.btnText}>Set thought</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 10 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  btn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  empty: { color: colors.textSecondary, fontSize: 14, marginTop: 16 },
});
