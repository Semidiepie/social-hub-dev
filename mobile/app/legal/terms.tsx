import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

const LAST_UPDATED = "February 2026";

export default function TermsOfService() {
  const router = useRouter();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="terms-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Terms of Service</Text>
        <Text style={styles.muted}>Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.p}>Welcome to PostMePlex. By creating an account or using the app, you agree to these Terms.</Text>

        <Text style={styles.h2}>1. Eligibility</Text>
        <Text style={styles.p}>You must be at least 13 years old to use PostMePlex (or older where required by local law). If you are between 13 and the legal age of majority in your jurisdiction, you confirm that a parent or legal guardian agrees to these Terms on your behalf.</Text>

        <Text style={styles.h2}>2. Your account</Text>
        <Text style={styles.p}>You are responsible for keeping your password secure and for everything that happens under your account. Notify us at <Text style={styles.b}>postmeplex@post.com</Text> if you suspect unauthorized use.</Text>

        <Text style={styles.h2}>3. Your content</Text>
        <Text style={styles.p}>You own the content you post. By posting, you grant PostMePlex a non-exclusive, worldwide, royalty-free license to host, display, distribute and adapt that content for the purpose of operating and promoting the service.</Text>

        <Text style={styles.h2}>4. Acceptable use — zero tolerance for abusive content</Text>
        <Text style={styles.p}>You agree NOT to post or send content that is:</Text>
        <Text style={styles.p}>• unlawful, harassing, threatening, hateful, or that incites violence{"\n"}• sexually explicit or that exploits minors in any way{"\n"}• that infringes someone else's intellectual property{"\n"}• spam, scams, or attempts to defraud other users{"\n"}• malware, phishing, or anything that compromises the security of the service or its users</Text>
        <Text style={styles.p}>We act on reports within 24 hours. Repeat offenders and any account engaging in child sexual abuse material (CSAM) are permanently banned and reported to law enforcement.</Text>

        <Text style={styles.h2}>5. Reporting + blocking</Text>
        <Text style={styles.p}>Every user can report content or other users from any profile, post, comment or DM, and can block any user at any time. Blocked users cannot follow, message, or see your activity. You can review and unblock from Settings → Account → Blocked users.</Text>

        <Text style={styles.h2}>6. Termination</Text>
        <Text style={styles.p}>You can delete your account at any time from Settings → Account → Delete account. We may suspend or terminate accounts that violate these Terms or that put the safety of our community at risk.</Text>

        <Text style={styles.h2}>7. Disclaimers</Text>
        <Text style={styles.p}>PostMePlex is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service or that any content posted is accurate or appropriate.</Text>

        <Text style={styles.h2}>8. Limitation of liability</Text>
        <Text style={styles.p}>To the maximum extent permitted by law, PostMePlex will not be liable for indirect, incidental, special, consequential or punitive damages arising from your use of the service.</Text>

        <Text style={styles.h2}>9. Changes</Text>
        <Text style={styles.p}>We may update these Terms. We will notify you of material changes inside the app. Continued use after the change means you accept the new Terms.</Text>

        <Text style={styles.h2}>10. Governing law</Text>
        <Text style={styles.p}>These Terms are governed by the laws of the jurisdiction in which PostMePlex is incorporated, without regard to conflict of laws principles.</Text>

        <Text style={styles.h2}>12. Contact</Text>
        <Text style={styles.p}>Questions about these Terms? Email <Text style={styles.b}>postmeplex@post.com</Text>.</Text>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  body: { padding: spacing.lg },
  h1: { color: colors.textPrimary, fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  muted: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.lg },
  h2: { color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm },
  p: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: spacing.sm },
  b: { color: colors.textPrimary, fontWeight: "700" },
});
