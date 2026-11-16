import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radii } from "@/src/theme";
import { CONTENT_MAX_WIDTH, useResponsive } from "@/src/hooks/useResponsive";
import VerifiedBadge from "../src/components/VerifiedBadge";

const FALLBACK =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";

export default function Settings() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const { isDesktop } = useResponsive();
  const isAdmin = !!user?.is_super_admin;
  const [testing, setTesting] = React.useState(false);

  const runPushDiagnostic = React.useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Push notifications don't run on the web build.");
      return;
    }
    if (!Device.isDevice) {
      Alert.alert(
        "Need a real device",
        "Push notifications only work on a physical iOS/Android device — not the simulator or web preview.",
      );
      return;
    }
    setTesting(true);
    try {
      // 1. Ensure permission
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted" && existing.canAskAgain !== false) {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") {
        Alert.alert(
          "Notifications blocked",
          "Enable notifications for PostMePlex in iOS Settings → Notifications → PostMePlex, then try again.",
        );
        return;
      }
      // 2. Re-register the device with backend (with retry-friendly getter)
      let tokenPreview = "unknown";
      try {
        // Small helper: retry the native call — on iOS the token can be
        // unavailable for the first ~1-2 seconds after permission grant.
        let tokenData: string | null = null;
        for (const delay of [0, 400, 1200]) {
          if (delay) await new Promise((r) => setTimeout(r, delay));
          try {
            const t = await Notifications.getDevicePushTokenAsync();
            if (t?.data) {
              tokenData = String(t.data);
              break;
            }
          } catch {
            /* try again */
          }
        }
        if (tokenData) {
          tokenPreview = tokenData.slice(0, 12) + "…";
          if (user?.id) {
            await api.post(
              "/register-push",
              { user_id: user.id, platform: Platform.OS, device_token: tokenData },
              true,
            );
          }
        } else {
          tokenPreview = "<no token>";
        }
      } catch (e) {
        console.warn("[push-diag] register step failed", e);
      }
      // 3. Ask backend to send us a test push
      const result = await api.get<{
        key_configured: boolean;
        upstream_status: number | null;
        upstream_body: string;
      }>("/push/debug");
      if (!result.key_configured) {
        Alert.alert(
          "Push not configured yet",
          "EMERGENT_PUSH_KEY is a placeholder on this server. Publish the app once via the Emergent Publish button — the key is injected during deploy.",
        );
        return;
      }
      const ok = (result.upstream_status ?? 0) >= 200 && (result.upstream_status ?? 0) < 300;
      Alert.alert(
        ok ? "Test push sent!" : "Push provider error",
        ok
          ? `Token: ${tokenPreview}\n\nYou should receive a notification in a few seconds. If nothing arrives:\n• Kill the app (swipe up) so it delivers via APNs, not the in-app foreground handler.\n• Make sure Notifications are enabled in iOS Settings.\n• iOS may throttle repeated test pushes — wait ~30s.`
          : `Status ${result.upstream_status}\n${result.upstream_body || ""}`,
      );
    } catch (e: any) {
      Alert.alert("Diagnostic failed", String(e?.message || e));
    } finally {
      setTesting(false);
    }
  }, [user?.id]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, isDesktop && { alignItems: "center" }]}>
      <View style={isDesktop ? { width: "100%", maxWidth: CONTENT_MAX_WIDTH, flex: 1 } : { flex: 1, width: "100%" }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => router.push(`/profile/${user?.id}`)}
          testID="settings-view-profile"
        >
          <Image source={{ uri: user?.avatar_url || FALLBACK }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName}>{user?.display_name}</Text>
              {<VerifiedBadge user={user} size={14} />}
            </View>
            <Text style={styles.username}>@{user?.username}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.group}>
          <Row icon="person-outline" label="Edit profile" onPress={() => router.push("/edit-profile")} testID="settings-edit-profile" />
          <Row icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} testID="settings-notifications" />
          <Row
            icon="paper-plane-outline"
            label={testing ? "Sending test push…" : "Send test push"}
            hint="Verify push delivery to this device"
            onPress={runPushDiagnostic}
            testID="settings-test-push"
          />
          <Row icon="chatbubbles-outline" label="Messages" onPress={() => router.push("/messages")} testID="settings-messages" />
          <Row icon="ban-outline" label="Blocked accounts" hint="Manage who you've blocked" onPress={() => router.push("/account/blocked")} testID="settings-blocked" />
          <Row icon="lock-closed-outline" label="Privacy" hint="Hide your followers / following lists" onPress={() => router.push("/account/privacy")} testID="settings-privacy" />
          <Row
            icon="key-outline"
            label="Change password"
            hint="Update your password while logged in"
            onPress={() => router.push("/account/change-password")}
            testID="settings-change-password"
          />
          <Row
            icon="heart-outline"
            label={
              user?.remembering
                ? "Remembering account"
                : user?.remembering_status === "pending"
                ? "Remembering — pending"
                : "Apply for Remembering"
            }
            hint={
              user?.remembering
                ? "Your account is memorialized"
                : user?.remembering_status === "pending"
                ? "Awaiting admin review"
                : "Memorialize this account (admin approval)"
            }
            onPress={
              user?.remembering || user?.remembering_status === "pending"
                ? undefined
                : async () => {
                    try {
                      await api.post("/remembering/apply", {});
                      await refresh();
                    } catch {
                      // non-fatal
                    }
                  }
            }
            testID="settings-apply-remembering"
          />
        </View>

        <Text style={styles.sectionLabel}>Discover</Text>
        <View style={styles.group}>
          <Row
            icon="musical-notes-outline"
            label="Music"
            hint="Listen to semidiepie's tracks"
            onPress={() => router.push("/music")}
            testID="settings-music"
          />
          <Row
            icon="library-outline"
            label="Blogs"
            hint="Read & publish long-form articles"
            onPress={() => router.push("/blogs")}
            testID="settings-blogs"
          />
          <Row
            icon="document-text-outline"
            label={user?.blog_permission === "granted" ? "My blogs" : "Apply to blog"}
            hint={
              user?.blog_permission === "granted"
                ? "Manage your drafts & published posts"
                : user?.blog_permission === "pending"
                ? "Request pending"
                : "Request permission to publish"
            }
            onPress={() =>
              router.push(user?.blog_permission === "granted" ? "/blogs/mine" : "/blogs/request")
            }
            testID="settings-my-blogs"
          />
        </View>

        {isAdmin && (
          <>
            <Text style={styles.sectionLabel}>Admin</Text>
            <View style={[styles.group, { borderColor: colors.primaryMuted, backgroundColor: colors.primaryFaint }]}>
              <Row
                icon="shield-checkmark"
                label="Verify accounts"
                hint="Grant or revoke the blue checkmark"
                onPress={() => router.push("/admin/verify")}
                accent
                testID="settings-admin-verify"
              />
              <Row
                icon="newspaper-outline"
                label="Blog approvals"
                hint="Approve or deny blog permission requests"
                onPress={() => router.push("/admin/blogs")}
                accent
                testID="settings-admin-blogs"
              />
              <Row
                icon="keypad-outline"
                label="Reset PINs"
                hint="Set a 4-digit password-reset PIN for any user"
                onPress={() => router.push("/admin/reset-pins")}
                accent
                testID="settings-admin-reset-pins"
              />
              <Row
                icon="heart-outline"
                label="Remembering requests"
                hint="Approve accounts requesting a Remembering label"
                onPress={() => router.push("/admin/remembering")}
                accent
                testID="settings-admin-remembering"
              />
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.group}>
          <Row
            icon="call-outline"
            label="Call support · Sage AI"
            hint="+1 800-507-6788"
            onPress={() => Linking.openURL("tel:+18005076788")}
            testID="settings-support-call"
          />
        </View>

        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.group}>
          <Row icon="information-circle-outline" label="About PostMePlex" onPress={() => router.push("/about")} testID="settings-about" />
        </View>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.group}>
          <Row icon="shield-outline" label="Privacy Policy" onPress={() => router.push("/legal/privacy")} testID="settings-legal-privacy" />
          <Row icon="document-text-outline" label="Terms of Service" onPress={() => router.push("/legal/terms")} testID="settings-terms" />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.danger }]}>Danger zone</Text>
        <View style={styles.group}>
          <Row icon="trash-outline" label="Delete account" hint="Permanently remove your profile and content" onPress={() => router.push("/account/delete")} testID="settings-delete" />
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} testID="settings-logout">
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Row({ icon, label, hint, onPress, accent, testID }: any) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={accent ? colors.primary : colors.textPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, accent && { color: colors.primary, fontWeight: "800" }]}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  body: { padding: spacing.md, gap: spacing.md },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.elevated, borderWidth: 2, borderColor: colors.primary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  username: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  group: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  rowHint: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: 14, borderRadius: radii.md, borderColor: colors.danger, borderWidth: 1, marginTop: spacing.md },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: "800" },
});
