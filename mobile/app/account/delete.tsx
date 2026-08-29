import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";

const CONFIRM_WORD = "DELETE";

export default function DeleteAccount() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirm.trim().toUpperCase() === CONFIRM_WORD;

  const submit = async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.del("/auth/me");
      await logout();
      router.replace("/(auth)/welcome");
    } catch (e: any) {
      setError(e?.message || "Could not delete account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="delete-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delete account</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.warnIcon}>
          <Ionicons name="warning" size={28} color={colors.danger} />
        </View>
        <Text style={styles.title}>This is permanent.</Text>
        <Text style={styles.sub}>
          Deleting <Text style={styles.bold}>@{user?.username}</Text> will erase your profile, all your posts and reels, comments, likes, follows, direct messages and live streams. We cannot recover it.
        </Text>

        <View style={styles.bulletGroup}>
          <Bullet text="All posts and reels removed" />
          <Bullet text="Comments and likes deleted" />
          <Bullet text="Follower and following relationships unlinked" />
          <Bullet text="DMs and squad chats removed" />
          <Bullet text="Your username may become available to others after 30 days" />
        </View>

        <Text style={styles.label}>To confirm, type <Text style={styles.bold}>{CONFIRM_WORD}</Text></Text>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder={CONFIRM_WORD}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          testID="delete-confirm-input"
        />

        {error && (
          <Text style={styles.error} testID="delete-error">{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.deleteBtn, (!canDelete || busy) && { opacity: 0.4 }]}
          onPress={submit}
          disabled={!canDelete || busy}
          testID="delete-confirm-button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteText}>Delete my account permanently</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancel} onPress={() => router.back()} testID="delete-cancel">
          <Text style={styles.cancelText}>Cancel — keep my account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name="ellipse" size={6} color={colors.danger} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  body: { padding: spacing.lg },
  warnIcon: { width: 64, height: 64, borderRadius: 16, backgroundColor: "rgba(255,59,48,0.12)", borderColor: "rgba(255,59,48,0.3)", borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: spacing.sm, marginBottom: spacing.lg },
  bold: { color: colors.textPrimary, fontWeight: "700" },
  bulletGroup: { gap: 10, marginBottom: spacing.lg },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletText: { color: colors.textSecondary, fontSize: 14 },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 14, color: colors.textPrimary, fontSize: 18, fontWeight: "700", letterSpacing: 2, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm },
  deleteBtn: { backgroundColor: colors.danger, paddingVertical: 16, borderRadius: radii.md, alignItems: "center", marginTop: spacing.sm },
  deleteText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  cancel: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
});
