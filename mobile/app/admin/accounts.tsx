import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { api, type UserPublic } from "../../src/api/client";
import { colors, spacing } from "../../src/theme";
import VerifiedBadge from "../../src/components/VerifiedBadge";
import { useAuth } from "../../src/context/AuthContext";

/**
 * Studio Accounts, matching the web page (frontend/src/pages/AdminAccounts.jsx):
 * GET /admin/users?q=, token add/remove/set POST /admin/users/{id}/tokens
 * {amount, op}, pet revive POST /admin/users/{id}/refresh-pet, ban/unban
 * POST /admin/users/{id}/ban|unban, delete DELETE /admin/users/{id}.
 * Protected accounts (is_official || is_super_admin || is_admin) cannot be
 * banned or deleted. On the web this page is super-admin only.
 */
type AdminUser = UserPublic & { is_official?: boolean; banned?: boolean; is_banned?: boolean; protected?: boolean };

export default function AdminAccounts() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
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
    return (<View style={styles.root}><Stack.Screen options={{ title: "Accounts" }} /><Text style={styles.notice}>Accounts is only available to super admins.</Text></View>);
}
  const doAction = async (id: string, fn: () => Promise<unknown>, label: string) => {
    setBusyId(id);
    try { await fn(); await load(query); } catch (e: any) { Alert.alert(label, e?.message || "That did not work. Try again."); } finally { setBusyId(null); }
  };
  const tokens = async (u: AdminUser, op: "add" | "remove" | "set") => {
    const amount = parseInt(amounts[u.id] || "100", 10);
    if (!Number.isFinite(amount)) { Alert.alert("Tokens", "Enter a token amount first."); return; }
    await doAction(u.id, () => api.post(`/admin/users/${u.id}/tokens`, { amount, op }), "Tokens");
  };
  const isProtected = (u: AdminUser) => !!(u.is_official || u.is_super_admin || u.is_admin || (u as any).protected);
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "Accounts" }} />
      <TextInput style={styles.search} placeholder="Search accounts..." placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} onSubmitEditing={() => load(query)} returnKeyType="search" testID="admin-accounts-search" />
      <TouchableOpacity style={styles.searchBtn} onPress={() => load(query)} testID="admin-accounts-search-btn"><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          {users.map((u) => {
            const banned = !!(u as any).banned || !!(u as any).is_banned;
            const prot = isProtected(u);
            return (
              <View key={u.id} style={styles.card}>
                <View style={styles.row}><Text style={styles.name}>{u.display_name || u.username}</Text><VerifiedBadge user={u} size={14} /></View>
                <Text style={styles.meta}>@{u.username} · {u.tokens ?? 0} tokens{prot ? " · Protected" : ""}{banned ? " · Banned" : ""}</Text>
                <View style={styles.tokenRow}>
                  <TextInput style={styles.amount} placeholder="100" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={amounts[u.id] || ""} onChangeText={(v) => setAmounts((p) => ({ ...p, [u.id]: v }))} testID={`admin-tokens-amount-${u.username}`} />
                  <TouchableOpacity style={styles.smallBtn} onPress={() => tokens(u, "add")} disabled={busyId === u.id}><Text style={styles.smallBtnText}>Add</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => tokens(u, "remove")} disabled={busyId === u.id}><Text style={styles.smallBtnText}>Remove</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => tokens(u, "set")} disabled={busyId === u.id}><Text style={styles.smallBtnText}>Set</Text></TouchableOpacity>
                </View>
                <View style={styles.tokenRow}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => doAction(u.id, () => api.post(`/admin/users/${u.id}/refresh-pet`, {}), "Pet revive")} disabled={busyId === u.id}><Text style={styles.smallBtnText}>Revive pet</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, prot && styles.disabledBtn]} onPress={() => doAction(u.id, () => api.post(`/admin/users/${u.id}/${banned ? "unban" : "ban"}`, banned ? {} : { reason: "" }), banned ? "Unban" : "Ban")} disabled={prot || busyId === u.id}><Text style={styles.smallBtnText}>{banned ? "Unban" : "Ban"}</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, styles.dangerBtn, prot && styles.disabledBtn]} onPress={() => Alert.alert("Delete account", `Delete @${u.username}? This cannot be undone.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => doAction(u.id, () => api.del(`/admin/users/${u.id}`), "Delete") }])} disabled={prot || busyId === u.id}><Text style={styles.smallBtnText}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            );
          })}
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
  tokenRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  amount: { flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8 },
  smallBtn: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: colors.textPrimary, fontWeight: "600" },
  dangerBtn: { borderColor: colors.danger },
  disabledBtn: { opacity: 0.4 },
  empty: { color: colors.textSecondary, fontSize: 14, marginTop: 16 },
});
