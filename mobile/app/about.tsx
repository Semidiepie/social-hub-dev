import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { colors, spacing, radii } from "@/src/theme";

const SUPPORT_EMAIL = "postmeplex@post.com";

export default function About() {
  const router = useRouter();
  const version =
    (Constants.expoConfig?.version as string | undefined) ?? "1.0.0";

  const openMail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="about-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>About</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.brandCard}>
          <View style={styles.logoCircle}>
            <Ionicons name="game-controller" size={36} color={colors.bg} />
          </View>
          <Text style={styles.brandName}>PostMePlex</Text>
          <Text style={styles.tagline}>Where gamers, streamers & clips live together.</Text>
          <Text style={styles.version}>Version {version}</Text>
        </View>

        <Text style={styles.sectionLabel}>What is PostMePlex?</Text>
        <View style={styles.card}>
          <Text style={styles.p}>
            PostMePlex is a social home built for gamers. Share your highlights,
            watch short vertical clips, go live to your squad, and chat in 1:1
            DMs or group Squad chats — all designed around streams, squads and
            clutch moments.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>What you can do</Text>
        <View style={styles.card}>
          <Feature icon="image-outline" label="Share posts" hint="Drop screenshots, art, and clutch moments to your feed." />
          <Feature icon="film-outline" label="Watch & post reels" hint="Bite-sized vertical clips in an immersive player." />
          <Feature icon="chatbubbles-outline" label="DMs & Squad chats" hint="1:1 messages or group chats with your crew." />
          <Feature icon="search-outline" label="Discover gamers" hint="Find streamers, creators and squads to follow." />
          <Feature icon="checkmark-circle-outline" label="Verified badges" hint="Trusted creators get the blue checkmark." />
        </View>

        <Text style={styles.sectionLabel}>Contact</Text>
        <TouchableOpacity style={styles.card} onPress={openMail} testID="about-email">
          <View style={styles.row}>
            <Ionicons name="mail-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Email us</Text>
              <Text style={styles.rowHint}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push("/legal/privacy")} testID="about-privacy">
            <Ionicons name="shield-outline" size={22} color={colors.textPrimary} />
            <Text style={[styles.rowLabel, { flex: 1 }]}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => router.push("/legal/terms")} testID="about-terms">
            <Ionicons name="document-text-outline" size={22} color={colors.textPrimary} />
            <Text style={[styles.rowLabel, { flex: 1 }]}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.fineprint}>
          {`Made with ❤️ by the PostMePlex team.\nRunning on ${Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}.`}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ icon, label, hint }: { icon: any; label: string; hint: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  brandCard: { alignItems: "center", paddingVertical: spacing.lg, gap: 8 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  brandName: { color: colors.textPrimary, fontSize: 26, fontWeight: "900" },
  tagline: { color: colors.textSecondary, fontSize: 14, textAlign: "center", paddingHorizontal: spacing.md, marginTop: 4 },
  version: { color: colors.textMuted, fontSize: 12, marginTop: 8, letterSpacing: 1 },

  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  rowHint: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  p: { color: colors.textPrimary, fontSize: 15, lineHeight: 22, padding: spacing.md },
  fineprint: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
});
