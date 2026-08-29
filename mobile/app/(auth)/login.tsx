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
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function Login() {
  const { login } = useAuth();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, isDesktop && { alignItems: "center" }]} edges={["top", "bottom"]}>
      <View style={isDesktop ? { width: "100%", maxWidth: 440, flex: 1 } : { flex: 1, width: "100%" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="login-back-button">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Ionicons name="game-controller" size={22} color={colors.bg} />
            </View>
            <Text style={styles.brandText}>PostMePlex</Text>
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to keep the squad updated.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            testID="login-email-input"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={secure}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              testID="login-password-input"
            />
            <TouchableOpacity onPress={() => setSecure((s) => !s)} style={styles.eye} testID="login-toggle-password">
              <Ionicons name={secure ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {error && (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
            testID="login-submit-button"
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnText}>Log in</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({ pathname: "/forgot-password", params: { email: email.trim() } })}
            style={styles.forgotBtn}
            testID="login-forgot-password"
            hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
          >
            <Ionicons name="help-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to PostMePlex? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity testID="login-goto-register">
                <Text style={styles.footerLink}>Create one</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  backBtn: { width: 40, height: 40, marginBottom: spacing.md, justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { color: colors.textPrimary, fontSize: 18, fontWeight: "900" },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginTop: spacing.xs, marginBottom: spacing.xl },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  inputRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  eye: { padding: spacing.md, position: "absolute", right: 0 },
  error: { color: colors.danger, marginBottom: spacing.sm, fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  footerText: { color: colors.textSecondary, fontSize: 14 },
  footerLink: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  forgotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
    marginTop: 4,
  },
  forgotText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
});
