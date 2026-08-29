// Forgot password → PIN flow. Ask for the 4-digit PIN + new password.
import React, { useCallback, useState } from "react";
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

export default function ForgotPasswordPin() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { refresh } = useAuth();

  const [email] = useState((params.email ?? "").toLowerCase());
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const submit = useCallback(async () => {
    setError(null);
    if (pin.length !== 4) return setError("Enter your 4-digit PIN.");
    if (newPassword.length < 6) return setError("New password must be at least 6 characters.");
    if (newPassword !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const resp = await api.post<{ access_token: string; user: UserPublic }>(
        "/auth/forgot-password-pin",
        { email, pin, new_password: newPassword },
        false,
      );
      await setToken(resp.access_token);
      await refresh();
      router.replace("/(tabs)/home");
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("too many") || msg.includes("429"))
        setError("Too many wrong PIN attempts. Your account is locked for 15 minutes.");
      else if (msg.includes("invalid credentials") || msg.includes("403"))
        setError("Wrong PIN. Please try again — you have limited attempts.");
      else setError(e?.message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  }, [email, pin, newPassword, confirmPassword, refresh, router]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="pin-back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconBox}>
            <Ionicons name="keypad" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>Enter your PIN</Text>
          <Text style={styles.subtitle}>
            Resetting the password for <Text style={styles.emailStrong}>{email}</Text>.
          </Text>

          <Text style={styles.label}>4-digit PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(v) => setPin(digits(v))}
            placeholder="••••"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            autoFocus
            style={[styles.input, styles.pinInput]}
            testID="pin-code"
          />

          <Text style={styles.label}>New password</Text>
          <View style={styles.pwWrap}>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              style={[styles.input, { flex: 1 }]}
              testID="pin-new-password"
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
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat new password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={submit}
            testID="pin-confirm-password"
          />

          {error ? (
            <Text style={styles.error} testID="pin-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
            testID="pin-submit"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reset password</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.replace({ pathname: "/forgot-password/verify", params: { email } })
            }
            style={styles.linkBtn}
            testID="pin-switch-email"
          >
            <Ionicons name="mail-outline" size={16} color={colors.primary} />
            <Text style={styles.linkText}>Use email code instead</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  backBtn: { padding: 4, alignSelf: "flex-start" },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 6, marginBottom: spacing.md },
  emailStrong: { color: colors.textPrimary, fontWeight: "700" },
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
  pinInput: { fontSize: 24, letterSpacing: 14, textAlign: "center", fontVariant: ["tabular-nums"] },
  pwWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: 10 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: 8,
  },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
