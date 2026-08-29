// Change password while logged in. Requires current password.
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, setToken, UserPublic } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing } from "@/src/theme";

export default function ChangePassword() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    if (!currentPw) return setError("Enter your current password.");
    if (newPw.length < 6) return setError("New password must be at least 6 characters.");
    if (newPw === currentPw)
      return setError("New password must be different from your current password.");
    if (newPw !== confirmPw) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const resp = await api.post<{ access_token: string; user: UserPublic }>(
        "/auth/change-password",
        { current_password: currentPw, new_password: newPw },
      );
      await setToken(resp.access_token);
      await refresh();
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert("Password updated ✅");
        router.back();
      } else {
        Alert.alert("Password updated", "Your password has been changed.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (e: any) {
      setError(e?.message || "Could not change password.");
    } finally {
      setBusy(false);
    }
  }, [currentPw, newPw, confirmPw, refresh, router]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="change-pw-back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Change password</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Enter your current password, then choose a new one (at least 6 characters).
          </Text>

          <Text style={styles.label}>Current password</Text>
          <TextInput
            value={currentPw}
            onChangeText={setCurrentPw}
            placeholder="Your current password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            style={styles.input}
            testID="change-pw-current"
          />

          <Text style={styles.label}>New password</Text>
          <View style={styles.pwWrap}>
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              style={[styles.input, { flex: 1 }]}
              testID="change-pw-new"
            />
            <TouchableOpacity
              onPress={() => setShowPw((s) => !s)}
              style={styles.eyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            value={confirmPw}
            onChangeText={setConfirmPw}
            placeholder="Repeat new password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={submit}
            testID="change-pw-confirm"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
            testID="change-pw-submit"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Update password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/forgot-password")}
            style={styles.linkBtn}
            testID="change-pw-forgot"
          >
            <Text style={styles.linkText}>Forgot your current password?</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: 4,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.textPrimary,
    padding: spacing.md,
    fontSize: 16,
  },
  pwWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: 10 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  linkBtn: { alignItems: "center", marginTop: spacing.md, paddingVertical: 8 },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
