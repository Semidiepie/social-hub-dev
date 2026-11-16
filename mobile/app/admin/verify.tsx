import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api, type UserPublic } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";
import VerifiedBadge from "../../src/components/VerifiedBadge";
import { useAuth } from "../../src/context/AuthContext";

/**
 * Studio Verify accounts, matching the web page (frontend/src/pages/AdminVerify.jsx):
 * search GET /admin/users?q=; Verified toggle POST /admin/users/{id}/verify
 * (no body, the server toggles); Gold toggle POST /admin/users/{id}/verify-gold
 * {gold} - the "X-style gold verified badge" (crown icon on the web, gold circle
 * with a dark check); badge colour via POST /admin/users/{id}/verify-color
 * {description} ("Set with Sage" - describe a colour, e.g. "royal gold"),
 * empty description resets the colour to default. On the web this page is
 * super-admin only.
 */
type VerifyUser = UserPublic & { verified_color?: string | null };

export default function AdminVerify() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<VerifyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [goldBusyId, setGoldBusyId] = useState<string | null>(null);
  const [colorBusyId, setColorBusyId] = useState<string | null>(null);
  const [colorText, setColorText] = useState<Record<string, string>>({});
  const isSuperAdmin = !!user?.is_super_admin;
  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await api.get<any>(`/admin/users?q=${encodeURIComponent(q)}`);
      setUsers(Array.isArray(res) ? res : res.users || res.items || []);
    } catch { setUsers([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(""); }, [load]);
  if (!isSuperAdmin) {
    return (<View style={styles.root}><Stack.Screen options={{ title: "Verify accounts" }} /><Text style={styles.notice}>Verify accounts is only available to super admins.</Text></View>);
}
  const updateUser = (id: string, patch: Partial<VerifyUser>) => setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const toggleVerify = async (u: VerifyUser) => {
    if (busyId) return; setBusyId(u.id);
    try { const resp = await api.post<{ id: string; is_verified: boolean }>(`/admin/users/${u.id}/verify`); updateUser(u.id, { is_verified: resp.is_verified }); } catch (e: any) { Alert.alert("Verify", e?.message || "Failed"); } finally { setBusyId(null); }
  };
  const toggleGold = async (u: VerifyUser) => {
    if (goldBusyId) return; const next = u.verified_color !== "gold"; setGoldBusyId(u.id);
    try { const resp = await api.post<{ id: string; verified_color: string | null; is_verified: boolean }>(`/admin/users/${u.id}/verify-gold`, { gold: next }); updateUser(u.id, { verified_color: resp.verified_color, is_verified: resp.is_verified }); } catch (e: any) { Alert.alert("Gold badge", e?.message || "Failed"); } finally { setGoldBusyId(null); }
  };
  const setColor = async (u: VerifyUser, clear = false) => {
    if (colorBusyId) return;
    const description = clear ? "" : (colorText[u.id] || "").trim();
    if (!clear && !description) { Alert.alert("Badge colour", 'Describe a color first (e.g. "royal gold")'); return; }
    setColorBusyId(u.id);
    try { const resp = await api.post<{ id: string; verified_color: string | null; is_verified: boolean }>(`/admin/users/${u.id}/verify-color`, { description }); updateUser(u.id, { verified_color: resp.verified_color, is_verified: resp.is_verified }); if (clear) setColorText((p) => ({ ...p, [u.id]: "" })); } catch (e: any) { Alert.alert("Badge colour", e?.message || "Failed"); } finally { setColorBusyId(null); }
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Verify accounts" }} />
      <TextInput style={styles.search} placeholder="Search accounts..." placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} onSubmitEditing={() => load(query)} returnKeyType="search" testID="admin-verify-search" />
      <TouchableOpacity style={styles.searchBtn} onPress={() => load(query)}><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          {users.map((u) => (
            <View key={u.id} style={styles.card}>
              <View style={styles.row}><Text style={styles.name}>{u.display_name || u.username}</Text><VerifiedBadge user={u} size={15} /></View>
              <Text style={styles.meta}>@{u.username}{u.verified_color ? ` · badge: ${u.verified_color}` : ""}</Text>
              <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Verified</Text><Switch value={!!u.is_verified} onValueChange={() => toggleVerify(u)} disabled={busyId === u.id} testID={`admin-verify-toggle-${u.username}`} /></View>
              <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Gold (X-style gold verified badge)</Text><Switch value={u.verified_color === "gold"} onValueChange={() => toggleGold(u)} disabled={goldBusyId === u.id} trackColor={{ false: colors.border, true: "#F5C542" }} testID={`admin-gold-toggle-${u.username}`} /></View>
              <TextInput style={styles.colorInput} placeholder='Describe a color — e.g. royal gold, ocean teal' placeholderTextColor={colors.textMuted} value={colorText[u.id] ?? ""} onChangeText={(v) => setColorText((p) => ({ ...p, [u.id]: v }))} testID={`admin-color-input-${u.username}`} />
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btn} onPress={() => setColor(u, false)} disabled={colorBusyId === u.id}><Text style={styles.btnText}>Set with Sage</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setColor(u, true)} disabled={colorBusyId === u.id}><Text style={styles.btnText}>Reset colour</Text></TouchableOpacity>
              </View>
            </View>
          ))}
          {users.length === 0 && <Text style={styles.empty}>No accounts found.</Text>}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  notice: { color: colors.textSecondary, fontSize: 15, marginTop: 24 },
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  searchBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  searchBtnText: { color: "#FFFFFF", fontWeight: "700" },
  scroll: { flex: 1, marginTop: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  toggleLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "600", flex: 1, paddingRight: 8 },
  colorInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  btnGhost: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  btnText: { color: "#FFFFFF", fontWeight: "700" },
  empty: { color: colors.textSecondary, fontSize: 14, marginTop: 16 },
});
