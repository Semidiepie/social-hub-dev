import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";

/**
 * Studio API keys, matching the web page (frontend/src/pages/AdminKeys.jsx):
 * GET /admin/keys/status, POST /admin/keys/check {}.
 * Key values are never shown in the app; key editing is done on the web,
 * so this screen shows status and can run a check.
 */
export default function AdminKeys() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setStatus(await api.get<any>("/admin/keys/status")); } catch { setStatus(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const check = async () => {
    setChecking(true);
    try { const res = await api.post<any>("/admin/keys/check", {}); setStatus(res); Alert.alert("API keys", "Key check complete."); } catch (e: any) { Alert.alert("API keys", e?.message || "Check failed"); } finally { setChecking(false); }
  };
  const entries: [string, any][] = status && typeof status === "object" ? Object.entries(status) : [];
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "API keys" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.note}>Key values are never shown here. Editing API keys is done on the web.</Text>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : entries.length === 0 ? <Text style={styles.empty}>No API key status available.</Text> : entries.map(([k, v]) => (
          <View key={k} style={styles.card}><Text style={styles.name}>{k}</Text><Text style={styles.meta}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Text></View>
        ))}
        <TouchableOpacity style={styles.btn} onPress={check} disabled={checking}><Text style={styles.btnText}>{checking ? "Checking..." : "Check API keys"}</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  scroll: { flex: 1 },
  note: { color: colors.textSecondary, fontSize: 14, marginTop: 8, marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  empty: { color: colors.textSecondary, fontSize: 14 },
});
