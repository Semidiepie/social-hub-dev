import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../src/api/client";
import { colors, spacing } from "../src/theme";

/**
 * My Pet, matching the web page (frontend/src/pages/Pet.jsx):
 * GET /pet, actions POST /pet/{action} where action is "play", "feed" or
 * "bath", rename PATCH /pet {name}.
 */
type Pet = { name?: string; species?: string; level?: number; hunger?: number; happiness?: number; energy?: number; [k: string]: any };

export default function PetScreen() {
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get<any>("/pet"); setPet(res?.pet || res); } catch { setPet(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string) => {
    setBusy(action);
    try { const res = await api.post<any>(`/pet/${action}`); setPet(res?.pet || res); } catch (e: any) { Alert.alert("Pet", e?.message || "Your pet is not ready for that yet."); } finally { setBusy(null); }
  };
  const rename = async () => {
    if (!name.trim()) { Alert.alert("Pet", "Enter a new name first."); return; }
    setBusy("rename");
    try { const res = await api.patch<any>("/pet", { name: name.trim() }); setPet(res?.pet || res); setName(""); } catch (e: any) { Alert.alert("Pet", e?.message || "Failed to rename"); } finally { setBusy(null); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "My Pet" }} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : !pet ? <Text style={styles.empty}>You do not have a pet yet. Adopt one on the web to get started.</Text> : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={styles.name}>{pet.name || "My Pet"}</Text>
          {pet.species ? <Text style={styles.meta}>{pet.species}</Text> : null}
          <View style={styles.card}>
            {pet.level !== undefined ? <Text style={styles.stat}>Level: {pet.level}</Text> : null}
            {pet.hunger !== undefined ? <Text style={styles.stat}>Hunger: {pet.hunger}</Text> : null}
            {pet.happiness !== undefined ? <Text style={styles.stat}>Happiness: {pet.happiness}</Text> : null}
            {pet.energy !== undefined ? <Text style={styles.stat}>Energy: {pet.energy}</Text> : null}
          </View>
          <View style={styles.row}>
            {(["play", "feed", "bath"] as const).map((a) => (
              <TouchableOpacity key={a} style={styles.btn} onPress={() => act(a)} disabled={!!busy}><Text style={styles.btnText}>{busy === a ? "..." : a[0].toUpperCase() + a.slice(1)}</Text></TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Rename your pet</Text>
          <TextInput style={styles.input} placeholder="New name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} testID="pet-rename" />
          <TouchableOpacity style={styles.btn} onPress={rename} disabled={!!busy}><Text style={styles.btnText}>Rename</Text></TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  name: { color: colors.textPrimary, fontSize: 24, fontWeight: "800" },
  meta: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 16 },
  stat: { color: colors.textPrimary, fontSize: 15, marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, marginTop: 16 },
  btn: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 8 },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  label: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 18 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 6 },
  empty: { color: colors.textSecondary, fontSize: 14, marginTop: 24 },
});
