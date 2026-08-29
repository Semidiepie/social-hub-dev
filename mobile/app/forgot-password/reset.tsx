import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken, UserPublic } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await api.post<{ access_token: string; user: UserPublic }>(
        "/auth/reset-password",
        { email: params.email, code: params.code, new_password: password },
        false,
      );
      await setToken(resp.access_token);
      await refresh();
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message ?? "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="reset-back">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons name="key" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>Pick something strong. You'll be logged in automatically after.</Text>

          <Text style={styles.label}>New password</Text>
          <View style={styles.row}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={secure}
              autoComplete="new-password"
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              testID="reset-password-input"
            />
            <TouchableOpacity style={styles.eye} onPress={() => setSecure((s) => !s)} testID="reset-toggle-visibility">
              <Ionicons name={secure ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={secure}
            style={styles.input}
            testID="reset-confirm-input"
          />

          {error && (
            <Text style={styles.error} testID="reset-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
            onPress={submit}
            disabled={busy}
            testID="reset-submit"
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnText}>Reset password & log in</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  back: { width: 40, height: 40, marginBottom: spacing.md, justifyContent: "center" },
  iconCircle: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primaryFaint, borderColor: colors.primaryMuted, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, marginTop: spacing.sm, marginBottom: spacing.xl },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 14, color: colors.textPrimary, fontSize: 16, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  eye: { padding: spacing.md, position: "absolute", right: 0 },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: radii.md, alignItems: "center", marginTop: spacing.sm },
  primaryBtnText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
});
