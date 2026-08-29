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

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!displayName.trim() || !username.trim() || !email.trim() || !password) {
      setError("Fill every field to continue.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), username.trim(), password, displayName.trim());
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e?.message ?? "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, isDesktop && { alignItems: "center" }]} edges={["top", "bottom"]}>
      <View style={isDesktop ? { width: "100%", maxWidth: 440, flex: 1 } : { flex: 1, width: "100%" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="register-back-button">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title}>Join the squad</Text>
          <Text style={styles.subtitle}>Free forever. No ads. Just gaming.</Text>

          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Alex Gaming"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="register-displayname-input"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
            placeholder="alexgg"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
            testID="register-username-input"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            testID="register-email-input"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={secure}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              testID="register-password-input"
            />
            <TouchableOpacity onPress={() => setSecure((s) => !s)} style={styles.eye} testID="register-toggle-password">
              <Ionicons name={secure ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {error && (
            <Text style={styles.error} testID="register-error">
              {error}
            </Text>
          )}

          <View style={styles.legalNote}>
            <Text style={styles.legalText}>
              By tapping <Text style={styles.legalBold}>Create my profile</Text>, you agree to PostMePlex's{" "}
              <Text style={styles.legalLink} onPress={() => router.push("/legal/terms")}>Terms of Service</Text>
              {" "}and{" "}
              <Text style={styles.legalLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
            testID="register-submit-button"
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnText}>Create my profile</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="register-goto-login">
                <Text style={styles.footerLink}>Log in</Text>
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
  legalNote: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  legalText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  legalBold: { color: colors.textPrimary, fontWeight: "700" },
  legalLink: { color: colors.primary, fontWeight: "700" },
});
