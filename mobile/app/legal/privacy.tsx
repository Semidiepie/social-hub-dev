import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

const LAST_UPDATED = "February 2026";

export default function PrivacyPolicy() {
  const router = useRouter();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="privacy-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>Privacy Policy</Text>
        <Text style={styles.muted}>Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.p}>PostMePlex ("we", "our", "us") respects your privacy. This policy explains what we collect, how we use it, and the rights you have over your information.</Text>

        <Text style={styles.h2}>1. Information we collect</Text>
        <Text style={styles.p}><Text style={styles.b}>Account data:</Text> email, username, display name, password (stored as a bcrypt hash), and optional bio/avatar.</Text>
        <Text style={styles.p}><Text style={styles.b}>Content you create:</Text> posts, reels, comments, likes, follows and direct messages.</Text>
        <Text style={styles.p}><Text style={styles.b}>Device data:</Text> approximate device type and OS, push notification token, and crash diagnostics needed to keep the app stable.</Text>
        <Text style={styles.p}><Text style={styles.b}>Camera, microphone, photo library:</Text> only when you tap a feature that needs them (e.g., uploading media, recording a reel). We never access them in the background.</Text>

        <Text style={styles.h2}>2. How we use your information</Text>
        <Text style={styles.p}>To operate PostMePlex (deliver your content to followers, route DMs), authenticate you, send transactional emails like password resets, deliver push notifications you opted into, prevent abuse, and improve the product.</Text>

        <Text style={styles.h2}>3. Who we share with</Text>
        <Text style={styles.p}>We do not sell your personal data. We share limited data with service providers that help us run PostMePlex:</Text>
        <Text style={styles.p}>• Resend (transactional email){"\n"}• Cloudinary (image and video hosting){"\n"}• MongoDB Atlas (database hosting){"\n"}• Expo / Firebase (push notification delivery)</Text>
        <Text style={styles.p}>These providers process data only as needed to deliver their service and are bound by their own privacy commitments.</Text>

        <Text style={styles.h2}>4. Public content</Text>
        <Text style={styles.p}>Posts, reels, comments and profile information are public to other PostMePlex users by default. Direct messages are visible only to the participants.</Text>

        <Text style={styles.h2}>5. Children</Text>
        <Text style={styles.p}>PostMePlex is not intended for users under 13. If we learn a child under 13 created an account, we will delete it. Some jurisdictions require a higher minimum age — please follow your local laws.</Text>

        <Text style={styles.h2}>6. Your rights</Text>
        <Text style={styles.p}>You can edit or delete your profile, posts, reels, comments and DMs at any time from inside the app. You may delete your entire account from Settings → Account → Delete account — this permanently removes your profile and all of your content.</Text>
        <Text style={styles.p}>Residents of the EU/EEA, UK, California, or other regions with similar laws may also have the right to access, port, correct or restrict processing of their data. Email <Text style={styles.b}>postmeplex@post.com</Text> with such requests.</Text>

        <Text style={styles.h2}>7. Data retention</Text>
        <Text style={styles.p}>We keep your data for as long as your account is active. When you delete your account we erase your profile and content within 30 days, except where law requires us to retain certain records (e.g., abuse reports).</Text>

        <Text style={styles.h2}>8. Security</Text>
        <Text style={styles.p}>We use HTTPS in transit, bcrypt password hashing at rest, and access controls on our infrastructure. No method of transmission is 100% secure — please use a strong, unique password and enable device-level protections.</Text>

        <Text style={styles.h2}>9. International transfers</Text>
        <Text style={styles.p}>PostMePlex is hosted on servers that may be located in the United States or other countries. By using the app you agree to your information being processed in those jurisdictions.</Text>

        <Text style={styles.h2}>10. Changes</Text>
        <Text style={styles.p}>We may update this policy. When we do, we will revise the "Last updated" date above. Material changes will be highlighted inside the app.</Text>

        <Text style={styles.h2}>11. Contact</Text>
        <Text style={styles.p}>Questions? Email <Text style={styles.b}>postmeplex@post.com</Text>.</Text>

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
