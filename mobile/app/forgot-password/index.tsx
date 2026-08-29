// Forgot password — single unified flow. Users only need to enter their
// email; we automatically detect whether they have a PIN set and route them
// to the right recovery method (PIN or emailed code).
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
import { api } from "@/src/api/client";
import { colors, spacing, radii } from "@/src/theme";

export default function ForgotPasswordEntry() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = useCallback(async () => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !/.+@.+\..+/.test(em)) {
      setError("Enter your email to continue.");
      return;
    }
    setBusy(true);
    try {
      // Ask the backend whether this account has a PIN configured. If yes,
      // route straight to the PIN flow (fully offline). Otherwise, fire the
      // email code flow.
      const check = await api.post<{ has_pin: boolean }>(
        "/auth/has-pin",
        { email: em },
        false,
      );
      if (check.has_pin) {
        router.push({ pathname: "/forgot-password/pin", params: { email: em } });
      } else {
        // Fire the email code send, then push to verify. Backend surfaces
        // `dev_code` in dev/sandbox so the UI can autofill it.
        const resp = await api.post<{ ok: boolean; dev_code?: string }>(
          "/auth/forgot-password",
          { email: em },
          false,
        );
        router.push({
          pathname: "/forgot-password/verify",
          params: { email: em, dev_code: resp.dev_code ?? "" },
        });
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [email, router]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            testID="forgot-back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.lockIcon}>
            <Ionicons name="lock-open" size={30} color={colors.primary} />
          </View>

          <Text style={styles.title}>Forgot password?</Text>
          <Text style={styles.subtitle}>
            No worries — enter your email and we&apos;ll take you to the fastest way
            to get back into your account.
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
            autoFocus
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={next}
            testID="forgot-email"
          />

          {error ? (
            <Text style={styles.error} testID="forgot-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={next}
            disabled={busy}
            testID="forgot-continue"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.optionsBox}>
            <Text style={styles.optionsLabel}>Recovery methods</Text>
            <View style={styles.optionRow}>
              <Ionicons name="keypad-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>4-digit PIN</Text>
                <Text style={styles.optionBody}>
                  Instant reset if you set a PIN in Settings.
                </Text>
              </View>
            </View>
            <View style={styles.optionRow}>
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Email code</Text>
                <Text style={styles.optionBody}>
                  We&apos;ll send a 6-digit code to your inbox.
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            style={styles.linkBtn}
            testID="forgot-back-to-login"
          >
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
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
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
  error: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: 15,
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  optionsBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
    gap: spacing.md,
  },
  optionsLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  optionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  optionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  optionBody: { color: colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  linkBtn: { alignItems: "center", marginTop: spacing.lg },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
