// ResponsiveContent — clamps a screen's content column to a comfortable
// reading width on desktop, and offsets it away from the persistent
// sidebar. On mobile it renders as a plain flex:1 wrapper so the mobile
// UX is untouched.
//
// Usage:
//   <ResponsiveContent>
//     <YourScreenContent />
//   </ResponsiveContent>
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import {
  CONTENT_MAX_WIDTH,
  SIDEBAR_WIDTH,
  useResponsive,
} from "@/src/hooks/useResponsive";

interface Props {
  children: React.ReactNode;
  /** Extra style forwarded to the outer wrapper. */
  style?: ViewStyle | ViewStyle[];
  /**
   * When true (default), the content column is capped at CONTENT_MAX_WIDTH
   * on desktop. Turn OFF for full-bleed pages like a livestream stage.
   */
  clampWidth?: boolean;
}

export const ResponsiveContent: React.FC<Props> = ({
  children,
  style,
  clampWidth = true,
}) => {
  const { isDesktop } = useResponsive();

  if (!isDesktop) {
    return <View style={[styles.mobile, style]}>{children}</View>;
  }

  return (
    <View style={[styles.desktopOuter, style]}>
      <View
        style={[
          styles.desktopColumn,
          clampWidth && { maxWidth: CONTENT_MAX_WIDTH },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mobile: {
    flex: 1,
  },
  desktopOuter: {
    flex: 1,
    // Push content away from the sidebar.
    paddingLeft: SIDEBAR_WIDTH,
    alignItems: "center",
  },
  desktopColumn: {
    flex: 1,
    width: "100%",
  },
});

export default ResponsiveContent;
