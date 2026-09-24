import React from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

/**
 * PostMePlex custom tab bar.
 *
 * Floating pill container with a subtle border + inner shadow, orange glow on
 * the active tab, and a raised gradient FAB in the middle for "Create". This
 * intentionally departs from the flat white Instagram bar so the app has its
 * own gaming/streaming personality.
 */
function PillTab({
  onPress,
  focused,
  icon,
  iconFocused,
  testID,
}: {
  onPress: () => void;
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={styles.tabItem}
      testID={testID}
    >
      <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
        <Ionicons
          name={focused ? iconFocused : icon}
          size={22}
          color={focused ? "#fff" : colors.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );
}

function CreateFab({ onPress, testID }: { onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.fabWrap}
      testID={testID}
    >
      <LinearGradient
        colors={["#FF8C66", "#FF6B3D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fab}
      >
        <Ionicons name="add" size={26} color={colors.bg} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const barHeight = 66;
  const bottomOffset = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // We render a fully custom tab bar to get the floating pill look.
      }}
      tabBar={({ state, navigation }) => {
        // Desktop web replaces the pill bar with the DesktopSidebar
        // (which is mounted globally by GlobalDesktopShell).
        if (isDesktop) return null;
        const go = (name: string) => {
          const event = navigation.emit({
            type: "tabPress",
            target: state.routes.find((r) => r.name === name)?.key ?? name,
            canPreventDefault: true,
          });
          if (!event.defaultPrevented) {
            navigation.navigate(name as never);
          }
        };
        const isFocused = (name: string) =>
          state.routes[state.index]?.name === name;
        return (
          <View
            pointerEvents="box-none"
            style={[styles.dock, { bottom: bottomOffset }]}
          >
            <View style={[styles.bar, { height: barHeight }]}>
              <PillTab
                onPress={() => go("home")}
                focused={isFocused("home")}
                icon="home-outline"
                iconFocused="home"
                testID="tab-home"
              />
              <PillTab
                onPress={() => go("discover")}
                focused={isFocused("discover")}
                icon="compass-outline"
                iconFocused="compass"
                testID="tab-discover"
              />
              <CreateFab onPress={() => go("create")} testID="tab-create" />
              <PillTab
                onPress={() => go("reels")}
                focused={isFocused("reels")}
                icon="film-outline"
                iconFocused="film"
                testID="tab-reels"
              />
              <PillTab
                onPress={() => go("profile")}
                focused={isFocused("profile")}
                icon="person-outline"
                iconFocused="person"
                testID="tab-profile"
              />
            </View>
          </View>
        );
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="watch" options={{ href: null }} />
      <Tabs.Screen name="reels" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    maxWidth: 480,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderRadius: 24,
    backgroundColor: "rgba(26,29,39,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    // Soft shadow so the bar visually floats above content.
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  tabIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconWrapActive: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: "rgba(255,107,61,0.35)",
  },
  fabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 52,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    // Keep the FAB from clipping past the pill on native/web
    ...(Platform.OS === "web" ? { transform: [{ translateY: -1 }] } : null),
  },
});
