// Deep-link landing route: postmeplex://reset-complete?token=<jwt>
// The web reset page redirects here after a successful password reset so the
// app can store the fresh session token and drop the user straight onto Home.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setToken } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";

export default function ResetComplete() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { refresh } = useAuth();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!token) {
        setFailed(true);
        return;
      }
      try {
        await setToken(String(token));
        await refresh();
        router.replace("/(tabs)/home");
      } catch {
        setFailed(true);
      }
    })();
  }, [token, refresh, router]);

  if (failed) {
    return (
      <View style={styles.root}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
        <Text style={styles.title}>Couldn&apos;t sign you in</Text>
        <Text style={styles.body}>Please open the app and log in with your new password.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/(auth)/login")} testID="reset-complete-login">
          <Text style={styles.btnText}>Go to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.title}>Signing you in…</Text>
      <Text style={styles.body}>Your password was updated. Taking you to PostMePlex.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 12 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: "900", marginTop: 8 },
  body: { color: colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  btn: { backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: 13, paddingHorizontal: 28, marginTop: 12 },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
