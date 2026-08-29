import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";

/**
 * Reset PIN management screen.
 *
 * Lets the user set, change, or remove their 4-digit password-reset PIN.
 * Requires the current password for every mutation — a stolen JWT alone
 * cannot install a PIN and hijack the recovery flow.
 */
export default function ResetPinScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [enabled, setEnabled] = useState(!!user?.reset_pin_enabled);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get<{ enabled: boolean }>("/auth/reset-pin");
        setEnabled(!!s.enabled);
      } catch {
        /* fall back to context value */
      }
    })();
  }, []);

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const save = useCallback(async () => {
    setError(null);
    if (!currentPassword) {
      setError("Enter your current password to confirm.");
      return;
    }
    if (pin.length !== 4) {
      setError("Your PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    // Reject the obvious guessables.
    if (["0000", "1234", "1111", "2222", "3333", "4321", "9999"].includes(pin)) {
      setError("Choose a less obvious PIN (avoid 1234, 0000, 1111 etc.).");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-pin", { current_password: currentPassword, pin }, true);
      setEnabled(true);
      setPin("");
      setConfirmPin("");
      setCurrentPassword("");
      await refresh();
      Alert.alert("PIN saved", "Use this PIN on the Forgot Password screen if you ever lose your password.");
    } catch (e: any) {
      setError(e?.message || "Could not save PIN.");
    } finally {
      setBusy(false);
    }
  }, [pin, confirmPin, currentPassword, refresh]);

  const remove = useCallback(() => {
    if (!currentPassword) {
      setError("Enter your current password to remove the PIN.");
      return;
    }
    Alert.alert(
      "Remove PIN?",
      "You won't be able to reset your password without email or contacting support.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post(
                "/auth/reset-pin",
                { current_password: currentPassword, pin: null },
                true,
              );
              setEnabled(false);
              setCurrentPassword("");
              await refresh();
            } catch (e: any) {
              setError(e?.message || "Could not remove PIN.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [currentPassword, refresh]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} testID="pin-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Reset PIN</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.statusCard}>
            <Ionicons
              name={enabled ? "shield-checkmark" : "shield-outline"}
              size={22}
              color={enabled ? colors.primary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {enabled ? "PIN is set" : "No PIN set"}
              </Text>
              <Text style={styles.statusBody}>
                {enabled
                  ? "You can use this PIN on the Forgot Password screen to reset your password without email."
                  : "Add a 4-digit PIN so you can reset your password without email if you ever forget it."}
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Current password</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
            testID="pin-current-password"
          />

          <Text style={styles.label}>{enabled ? "New 4-digit PIN" : "4-digit PIN"}</Text>
          <TextInput
            value={pin}
            onChangeText={(v) => setPin(digits(v))}
            placeholder="1234"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            style={[styles.input, styles.pinInput]}
            testID="pin-new"
          />

          <Text style={styles.label}>Confirm PIN</Text>
          <TextInput
            value={confirmPin}
            onChangeText={(v) => setConfirmPin(digits(v))}
            placeholder="1234"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            style={[styles.input, styles.pinInput]}
            testID="pin-confirm"
          />

          {error ? (
            <Text style={styles.error} testID="pin-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={save}
            disabled={busy}
            testID="pin-save"
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>{enabled ? "Update PIN" : "Save PIN"}</Text>
            )}
          </TouchableOpacity>

          {enabled ? (
            <TouchableOpacity
              style={[styles.dangerBtn, busy && { opacity: 0.5 }]}
              onPress={remove}
              disabled={busy}
              testID="pin-remove"
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={styles.dangerBtnText}>Remove PIN</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.helper}>
            After 5 wrong PIN attempts, the account is temporarily locked for 15 minutes.
            The PIN is never sent by email — you use it directly on the Forgot Password screen.
          </Text>
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
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  scroll: { padding: spacing.md, gap: spacing.sm },
  statusCard: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  statusTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  statusBody: { color: colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.textPrimary,
    padding: spacing.md,
    fontSize: 15,
  },
  pinInput: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 8,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.bg, fontWeight: "900", fontSize: 15 },
  dangerBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    marginTop: spacing.xs,
  },
  dangerBtnText: { color: colors.danger, fontWeight: "800", fontSize: 14 },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
