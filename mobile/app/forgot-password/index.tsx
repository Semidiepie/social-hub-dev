// Forgot password — email-only. We email a one-time reset LINK that opens the
// web reset page; after the user sets a new password there, they're deep-linked
// back into the app and auto-signed-in.
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
  Linking,
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
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !/.+@.+\..+/.test(em)) {
      setError("Enter your email to continue.");
      return;
    }
    setBusy(true);
    try {
      const resp = await api.post<{ status: string; email_status?: string; dev_link?: string }>(
        "/auth/forgot-password",
        { email: em },
        false,
      );
      setDevLink(resp.dev_link ?? null);
      setSent(true);
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [email]);

  if (sent) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            style={styles.backBtn}
            testID="forgot-back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.lockIcon}>
            <Ionicons name="mail-unread-outline" size={30} color={colors.primary} />
          </View>

          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.subtitle}>
            If an account exists for{" "}
            <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{email.trim().toLowerCase()}</Text>
            , we&apos;ve sent a secure link to reset your password. Tap it, set a new
            password, and you&apos;ll be signed right back into the app.
          </Text>
          <Text style={styles.hint}>The link expires in 60 minutes and can only be used once.</Text>

          {devLink ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => Linking.openURL(devLink)}
              testID="forgot-dev-link"
            >
              <Text style={styles.primaryBtnText}>Open reset link</Text>
              <Ionicons name="open-outline" size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            style={styles.linkBtn}
            testID="forgot-back-to-login"
          >
            <Text style={styles.linkText}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
            No worries — enter your email and we&apos;ll send you a secure link to
            reset your password.
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
            returnKeyType="go"
            onSubmitEditing={submit}
            testID="forgot-email"
          />

          {error ? (
            <Text style={styles.error} testID="forgot-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
            testID="forgot-continue"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Send reset link</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({ pathname: "/forgot-password/pin", params: { email: email.trim() } })}
            style={styles.linkBtn}
            testID="forgot-use-pin"
          >
            <Text style={styles.linkText}>Have a reset PIN? Use it here</Text>
          </TouchableOpacity>

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
  hint: { color: colors.textMuted, fontSize: 12.5, marginTop: -8, marginBottom: spacing.md },
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
  linkBtn: { alignItems: "center", marginTop: spacing.lg },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
