// GlobalDesktopShell — mounts the persistent DesktopSidebar and applies
// the corresponding left-padding to the rest of the app content so pages
// never render underneath the sidebar.
//
// Rules for when the sidebar is shown:
//   • Web + width ≥ DESKTOP_BREAKPOINT (see useResponsive).
//   • User is authenticated (no sidebar on the welcome / login screens).
//   • Current route is NOT in the `(auth)` group.
//
// The shell wraps its `children` in a plain <View> that gets a dynamic
// paddingLeft. When the sidebar is not shown the wrapper is a pass-through
// so the mobile experience is completely untouched.
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";

import { DesktopSidebar } from "@/src/components/DesktopSidebar";
import { SIDEBAR_WIDTH, useResponsive } from "@/src/hooks/useResponsive";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme";

/** Path patterns where the sidebar should NEVER show. */
const HIDE_ON: RegExp[] = [
  /^\/?\(auth\)/,
  /^\/?welcome/,
  /^\/?login/,
  /^\/?register/,
  /^\/?forgot-password/,
];

interface Props {
  children: React.ReactNode;
}

export const GlobalDesktopShell: React.FC<Props> = ({ children }) => {
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const pathname = usePathname() ?? "";

  const onAuthRoute = HIDE_ON.some((re) => re.test(pathname));
  const showSidebar =
    Platform.OS === "web" && isDesktop && !!user && !onAuthRoute;

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <View style={styles.root}>
      <DesktopSidebar />
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    // Push the whole Stack past the sidebar. The sidebar itself is a
    // position:absolute overlay on the left so this padding aligns the
    // content column with its right edge.
    paddingLeft: SIDEBAR_WIDTH,
  },
});

export default GlobalDesktopShell;
