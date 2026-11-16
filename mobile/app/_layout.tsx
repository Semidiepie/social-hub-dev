import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { ThemeProvider, useAppTheme } from "@/src/context/ThemeContext";
import { colors } from "@/src/theme";
import { NotificationPermissionPrimer } from "@/src/components/NotificationPermissionPrimer";
import { GlobalDesktopShell } from "@/src/components/GlobalDesktopShell";
import { MusicPlayerProvider } from "@/src/context/MusicPlayer";

// Keep the native splash visible from cold start until icon fonts register.
SplashScreen.preventAutoHideAsync();

// --- Push: foreground handler (module scope, web-guarded) ---
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// --- Push: Android channel (module scope) ---
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Push: tap handlers
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleUrl = (url?: string) => {
      if (!url) return;
      if (url.startsWith("http")) {
        Linking.openURL(url);
      } else {
        router.push(url as never);
      }
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      handleUrl((data.deeplink as string) || (data.action_url as string));
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data || {};
      handleUrl((data.deeplink as string) || (data.action_url as string));
    });

    return () => {
      tapSub.remove();
    };
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider><AuthProvider>
            <ThemedStatusBar />
            <MusicPlayerProvider>
              <GlobalDesktopShell>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    animation: "fade",
                  }}
                />
              </GlobalDesktopShell>
            </MusicPlayerProvider>
            <NotificationPermissionPrimer />
          </AuthProvider></ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  const { isLight } = useAppTheme();
  return <StatusBar style={isLight ? "dark" : "light"} />;
}
