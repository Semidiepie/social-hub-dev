// Admin → Reset PINs: super-admin sets/updates/clears a 4-digit password-reset
// PIN for any user. Users then reset their password with email + this PIN.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";

const FALLBACK = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

type AdminUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  email?: string;
  is_verified?: boolean;
  has_reset_pin?: boolean;
};

export default function AdminResetPins() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.get<AdminUser[]>(`/admin/users?q=${encodeURIComponent(query)}`);
      setUsers(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const openEditor = (u: AdminUser) => {
    setSelected(u);
    setPin("");
    setError(null);
  };

  const savePin = async (clear: boolean) => {
    if (!selected) return;
    if (!clear && !/^\d{4}$/.test(pin)) {
      setError("Enter a 4-digit PIN.");
      return;
    }
    setSaving(true);
    try {
      const resp = await api.post<{ id: string; has_reset_pin: boolean }>(
        `/admin/users/${selected.id}/reset-pin`,
        { pin: clear ? null : pin },
        true,
      );
      setUsers((prev) => prev.map((x) => (x.id === resp.id ? { ...x, has_reset_pin: resp.has_reset_pin } : x)));
      setSelected(null);
      setPin("");
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="resetpins-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Reset PINs</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by username, name or email…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          testID="resetpins-search-input"
        />
      </View>

      {error && !selected && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} testID="resetpins-error">{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No matches.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`resetpins-row-${item.username}`}>
              <Image source={{ uri: item.avatar_url || FALLBACK }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
                <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
                <View style={styles.pinBadge}>
                  <Ionicons
                    name={item.has_reset_pin ? "keypad" : "keypad-outline"}
                    size={12}
                    color={item.has_reset_pin ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.pinBadgeText, item.has_reset_pin && { color: colors.primary }]}>
                    {item.has_reset_pin ? "PIN set" : "No PIN"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEditor(item)}
                testID={`resetpins-edit-${item.username}`}
              >
                <Text style={styles.editText}>{item.has_reset_pin ? "Change" : "Set PIN"}</Text>
              </TouchableOpacity>
            </View>
          )}
          testID="resetpins-list"
        />
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selected?.has_reset_pin ? "Change" : "Set"} PIN for @{selected?.username}
            </Text>
            <Text style={styles.modalHint}>
              A 4-digit code this user enters (with their email) to reset their password.
            </Text>
            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              style={styles.pinInput}
              autoFocus
              testID="resetpins-pin-input"
            />
            {error && selected && <Text style={styles.errorText} testID="resetpins-modal-error">{error}</Text>}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={() => savePin(false)}
              disabled={saving}
              testID="resetpins-save"
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save PIN</Text>}
            </TouchableOpacity>
            {selected?.has_reset_pin && (
              <TouchableOpacity onPress={() => savePin(true)} disabled={saving} testID="resetpins-clear">
                <Text style={styles.clearText}>Remove PIN</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSelected(null)} disabled={saving} testID="resetpins-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radii.md },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },
  errorBox: { marginHorizontal: spacing.md, padding: spacing.sm, backgroundColor: "rgba(255,59,48,0.1)", borderRadius: radii.sm },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  displayName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  username: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  pinBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  pinBadgeText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  editBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.full, borderColor: colors.primary, borderWidth: 1, minWidth: 84, alignItems: "center" },
  editText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "900" },
  modalHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  pinInput: { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, color: colors.textPrimary, fontSize: 30, fontWeight: "800", textAlign: "center", letterSpacing: 16, paddingVertical: 12, marginTop: 6 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  clearText: { color: colors.danger, fontWeight: "800", fontSize: 14, textAlign: "center", paddingVertical: 8 },
  cancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: 14, textAlign: "center", paddingVertical: 4 },
});
