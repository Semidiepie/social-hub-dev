import React, { useEffect, useRef, useState } from "react";
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

const LEN = 6;

export default function VerifyCode() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; dev_code?: string }>();
  const email = params.email ?? "";
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    // Auto-fill from dev code (no Resend key configured)
    if (params.dev_code && params.dev_code.length === LEN) {
      setDigits(params.dev_code.split(""));
    }
  }, [params.dev_code]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const handleChange = (i: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      // user pasted a code
      const arr = clean.slice(0, LEN).split("");
      const next = Array(LEN).fill("");
      for (let k = 0; k < arr.length; k++) next[k] = arr[k];
      setDigits(next);
      const last = Math.min(arr.length, LEN) - 1;
      inputs.current[last]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (i < LEN - 1) inputs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, key: string) => {
    if (key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const submit = async () => {
    if (code.length !== LEN) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/verify-reset-code", { email, code }, false);
      router.push({ pathname: "/forgot-password/reset", params: { email, code } });
    } catch (e: any) {
      setError(e?.message ?? "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email }, false);
      setCooldown(30);
    } catch (e: any) {
      setError(e?.message ?? "Could not resend");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="verify-code-back">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons name="mail-open" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to <Text style={styles.email}>{email}</Text>. The code expires in 15 minutes.
          </Text>

          <View style={styles.boxes}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                value={d}
                onChangeText={(v) => handleChange(i, v)}
                onKeyPress={(e) => handleKey(i, e.nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                style={[styles.box, !!d && styles.boxFilled]}
                selectTextOnFocus
                testID={`verify-code-digit-${i}`}
              />
            ))}
          </View>

          {error && (
            <Text style={styles.error} testID="verify-code-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, (busy || code.length !== LEN) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={busy || code.length !== LEN}
            testID="verify-code-submit"
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryBtnText}>Verify code</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={resend} disabled={cooldown > 0 || resending} style={styles.linkBtn} testID="verify-code-resend">
            <Text style={[styles.linkText, (cooldown > 0 || resending) && { opacity: 0.5 }]}>
              {resending ? "Resending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get it? Resend"}
            </Text>
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
  email: { color: colors.textPrimary, fontWeight: "700" },
  boxes: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: spacing.md },
  box: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 56,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    textAlign: "center",
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
  },
  boxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryFaint, color: colors.primary },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: radii.md, alignItems: "center", marginTop: spacing.sm },
  primaryBtnText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
  linkBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
});
