// Reset password using an admin-assigned 4-digit PIN (offline, no email needed).
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
import { api, setToken } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";

export default function ForgotPasswordPin() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.email ?? "");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !/.+@.+\..+/.test(em)) return setError("Enter your email.");
    if (!/^\d{4}$/.test(pin)) return setError("Enter the 4-digit PIN.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const resp = await api.post<{ access_token: string }>(
        "/auth/reset-with-pin",
        { email: em, pin, new_password: password },
        false,
      );
      await setToken(resp.access_token);
      await refresh();
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message || "Invalid email or PIN.");
    } finally {
      setBusy(false);
    }
  }, [email, pin, password, refresh, router]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="pin-back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.icon}>
            <Ionicons name="keypad" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Reset with PIN</Text>
          <Text style={styles.subtitle}>
            Enter your email, the 4-digit reset PIN an admin gave you, and a new password.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            testID="pin-email"
          />

          <Text style={styles.label}>4-digit PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            style={[styles.input, styles.pinInput]}
            testID="pin-code"
          />

          <Text style={styles.label}>New password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
            testID="pin-new-password"
          />

          {error ? <Text style={styles.error} testID="pin-error">{error}</Text> : null}

          <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} testID="pin-submit">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reset password</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/(auth)/login")} style={styles.linkBtn} testID="pin-back-to-login">
            <Text style={styles.linkText}>Back to sign in</Text>
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
  icon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primaryFaint, alignItems: "center", justifyContent: "center", marginTop: spacing.md, marginBottom: spacing.md },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: spacing.lg },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, color: colors.textPrimary, padding: spacing.md, fontSize: 16 },
  pinInput: { fontSize: 26, fontWeight: "800", textAlign: "center", letterSpacing: 14 },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: 10 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: 15, marginTop: spacing.lg },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  linkBtn: { alignItems: "center", marginTop: spacing.lg },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
