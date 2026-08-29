import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

const HERO_IMAGE =
  "https://images.pexels.com/photos/6489045/pexels-photo-6489045.jpeg?auto=compress&cs=tinysrgb&w=1080";

export default function Welcome() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  return (
    <View style={styles.root} testID="welcome-screen">
      <ImageBackground source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFillObject} resizeMode="cover">
        <LinearGradient
          colors={["rgba(18,20,28,0.3)", "rgba(18,20,28,0.85)", "#12141c"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </ImageBackground>

      <SafeAreaView style={[styles.safe, isDesktop && styles.safeDesktop]} edges={["top", "bottom"]}>
        <View style={[styles.bottom, isDesktop && styles.bottomDesktop]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Ionicons name="game-controller" size={28} color={colors.bg} />
            </View>
            <Text style={styles.brand}>PostMePlex</Text>
          </View>

          <Text style={styles.headline}>Where gamers,{"\n"}streamers & clips{"\n"}live together.</Text>
          <Text style={styles.subtitle}>
            Post, scroll, squad up. The social home for everyone who hits the W.
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/(auth)/register")}
            testID="welcome-register-button"
          >
            <Text style={styles.primaryBtnText}>Create account</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.bg} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/(auth)/login")}
            testID="welcome-login-button"
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "flex-end" },
  safeDesktop: {
    // On desktop, center the whole content column so the hero fills the
    // screen behind but the copy + buttons stay a comfortable width.
    justifyContent: "center",
    alignItems: "center",
  },

  bottom: { paddingBottom: spacing.md },
  bottomDesktop: {
    width: "100%",
    maxWidth: 480,
    paddingBottom: 0,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  headline: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 40,
    marginBottom: spacing.sm,
  },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: spacing.lg },

  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  primaryBtnText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
});
