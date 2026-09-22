import React, { useEffect, useState } from "react";
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
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, getLastAccount, forgetAccount, LastAccount } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function Login() {
  const { loginWithPin } = useAuth();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [remembered, setRemembered] = useState<LastAccount | null>(null);
  const [useDifferent, setUseDifferent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLastAccount().then((acc) => {
      if (acc) {
        setRemembered(acc);
        setIdentifier(acc.identifier);
      } else {
        setUseDifferent(true);
      }
    });
  }, []);

  const submit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter your 4-digit PIN.");
      return;
    }
    if (!identifier.trim()) {
      setError("Enter your email or username.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithPin(identifier, pin);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const switchAccount = async () => {
    await forgetAccount();
    setRemembered(null);
    setUseDifferent(true);
    setIdentifier("");
    setPin("");
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

          <Text style={styles.title}>Enter your PIN</Text>
          <Text style={styles.subtitle}>Sign in with the 4-digit PIN you chose at signup.</Text>

          {remembered && !useDifferent ? (
            <View style={styles.account} testID="login-remembered-account">
              <Image source={{ uri: remembered.avatar_url || undefined }} style={styles.accountAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName} numberOfLines={1}>{remembered.display_name}</Text>
                <Text style={styles.accountHandle} numberOfLines={1}>@{remembered.identifier}</Text>
              </View>
              <TouchableOpacity onPress={switchAccount} testID="login-switch-account">
                <Text style={styles.forgotText}>Not you?</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email or username</Text>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={styles.input}
                testID="login-identifier-input"
              />
            </>
          )}

          <Text style={styles.label}>PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            style={[styles.input, styles.pinInput]}
            testID="login-pin-input"
          />

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
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
          </TouchableOpacity>

          <Text style={styles.hint} testID="login-pin-hint">
            Forgot your PIN? Ask an admin to reset it for you.
          </Text>

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
  pinInput: { textAlign: "center", fontSize: 24, fontWeight: "800", letterSpacing: 12 },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: spacing.md },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  accountAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.elevated },
  accountName: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  accountHandle: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
});
