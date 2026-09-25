// NotificationPermissionPrimer — first-launch / post-update permission modal.
//
// Contract:
//  • Runs only on native devices (skipped on web, simulators, blocked-forever).
//  • Shows a friendly pre-permission explainer BEFORE the OS-level dialog.
//  • Re-appears once per app version bump (so users see it again after updates).
//  • On "Enable", triggers the native permission popup and, if granted,
//    the AuthContext's normal push-registration flow will pick up the token
//    on the next foreground event / login.
//  • On "Not now", stamps the version so we don't nag on every cold start.
//
// This is intentionally decoupled from auth state — an unauthenticated user
// opening the app for the first time still sees the primer.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

import { storage } from "@/src/utils/storage";
import { colors, radii, spacing, type as tp } from "@/src/theme";

const PRIMER_VERSION_KEY = "postmeplex.pushPrimerVersion";
// Weekly throttle for nudging users who have permanently blocked notifications.
const NUDGE_AT_KEY = "postmeplex.pushNudgeAt";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type PrimerMode = "prime" | "settings";

/** Read the version string we treat as the app's "current version". */
function currentAppVersion(): string {
  const v = Constants.expoConfig?.version ?? "0.0.0";
  // On native we can also incorporate the buildNumber / versionCode so
  // internal builds re-trigger the primer.
  const build =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;
  return build ? `${v}+${build}` : v;
}

async function alreadyPrimedForThisVersion(): Promise<boolean> {
  const stamp = await storage.getItem<string>(PRIMER_VERSION_KEY, "");
  return !!stamp && stamp === currentAppVersion();
}

async function markPrimed(): Promise<void> {
  await storage.setItem(PRIMER_VERSION_KEY, currentAppVersion());
}

async function nudgedWithinAWeek(): Promise<boolean> {
  const stamp = await storage.getItem<string>(NUDGE_AT_KEY, "");
  return !!stamp && Date.now() - Number(stamp) <= ONE_WEEK_MS;
}

async function markNudged(): Promise<void> {
  await storage.setItem(NUDGE_AT_KEY, String(Date.now()));
}

export const NotificationPermissionPrimer: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<PrimerMode>("prime");
  const [busy, setBusy] = useState(false);

  // Decide on mount whether the primer should be shown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Skip on web — no native push there.
      if (Platform.OS === "web") return;
      // Skip on simulators / emulators — no real notifications anyway.
      if (!Device.isDevice) return;

      try {
        const perm = await Notifications.getPermissionsAsync();
        // Already granted → nothing to prompt for.
        if (perm.status === "granted") {
          await markPrimed();
          return;
        }
        // Blocked forever ("Don't ask again" on Android or 2× denial on iOS)
        // → the OS won't show the dialog anymore, so we can only deep-link the
        // user to system Settings. Nudge at most once per week.
        if (perm.status === "denied" && perm.canAskAgain === false) {
          if (await nudgedWithinAWeek()) return;
          if (!cancelled) {
            setMode("settings");
            setVisible(true);
          }
          return;
        }
        // Already primed for this version → don't nag again this launch cycle.
        if (await alreadyPrimedForThisVersion()) return;

        if (!cancelled) {
          setMode("prime");
          setVisible(true);
        }
      } catch {
        // Non-fatal: keep the app open even if the permissions API misbehaves.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    } catch {
      // The OS dialog can bail on rare races — swallow so we still close.
    } finally {
      await markPrimed();
      setBusy(false);
      setVisible(false);
    }
  }, []);

  // Blocked-forever path: open system Settings so the user can flip it back on.
  const handleOpenSettings = useCallback(async () => {
    await markNudged();
    setVisible(false);
    try {
      await Linking.openSettings();
    } catch {
      // ignore — nothing else we can do from JS
    }
  }, []);

  const handleDismiss = useCallback(async () => {
    if (mode === "settings") {
      await markNudged();
    } else {
      await markPrimed();
    }
    setVisible(false);
  }, [mode]);

  if (!visible) return null;

  const isSettings = mode === "settings";

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications" size={34} color={colors.primary} />
          </View>

          <Text style={styles.title}>
            {isSettings ? "Notifications are off" : "Stay in the loop"}
          </Text>

          <Text style={styles.body}>
            {isSettings
              ? "You've turned off notifications. Re-enable them in Settings to hear about new messages, squad activity, and reactions."
              : "Turn on notifications to hear about new messages, squad activity, and reactions on your posts."}
          </Text>

          <View style={styles.bullets}>
            <Bullet icon="chatbubble" text="Direct messages & squad chats" />
            <Bullet icon="heart" text="Likes, comments, and mentions" />
            <Bullet icon="people" text="New followers & squad activity" />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={isSettings ? handleOpenSettings : handleEnable}
            disabled={busy}
            testID="push-primer-primary"
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || busy) && styles.btnPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#0B0C13" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isSettings ? "Open Settings" : "Enable notifications"}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleDismiss}
            hitSlop={12}
            testID="push-primer-dismiss"
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </Pressable>

          <Text style={styles.footnote}>
            You can change this anytime from Settings.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const Bullet: React.FC<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = ({
  icon,
  text,
}) => (
  <View style={styles.bulletRow}>
    <Ionicons name={icon} size={16} color={colors.primary} />
    <Text style={styles.bulletText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(6, 7, 12, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "stretch",
  },
  iconWrap: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    ...tp.h2,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  body: {
    ...tp.bodyMuted,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  bullets: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bulletText: {
    ...tp.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnPressed: {
    opacity: 0.85,
  },
  primaryBtnText: {
    color: "#0B0C13",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  footnote: {
    marginTop: spacing.sm,
    ...tp.small,
    textAlign: "center",
    color: colors.textMuted,
  },
});

export default NotificationPermissionPrimer;
