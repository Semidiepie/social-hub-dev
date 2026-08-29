// Small responsive helper — single source of breakpoints for the app.
//
// Rules of thumb:
//  - `isMobile`: phone / small tablet in portrait. Uses the mobile UX
//    (bottom tabs, edge-to-edge feed, full-width post cards).
//  - `isDesktop`: laptop/PC. Renders the sidebar rail + centered content
//    column. We deliberately trigger this only on web — native devices
//    (iPad landscape etc.) keep the mobile layout to preserve tab-bar
//    ergonomics.
//
// Consumers should use the derived flags (`isDesktop`, `sidebarWidth`,
// `contentMaxWidth`) rather than reading raw dimensions themselves so we
// have one place to tune the design.
import { Platform, useWindowDimensions } from "react-native";

/** Anything ≥ this width on web is treated as a desktop layout. */
export const DESKTOP_BREAKPOINT = 900;

/** Persistent left-rail width on desktop. */
export const SIDEBAR_WIDTH = 240;

/** Right-hand suggestions rail width (only shown ≥ this larger breakpoint). */
export const RIGHT_RAIL_BREAKPOINT = 1180;
export const RIGHT_RAIL_WIDTH = 300;

/** Max width of the primary content column on desktop. */
export const CONTENT_MAX_WIDTH = 640;

export interface Responsive {
  width: number;
  height: number;
  isDesktop: boolean;
  showRightRail: boolean;
  sidebarWidth: number;
  contentMaxWidth: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const showRightRail = isWeb && width >= RIGHT_RAIL_BREAKPOINT;
  return {
    width,
    height,
    isDesktop,
    showRightRail,
    sidebarWidth: isDesktop ? SIDEBAR_WIDTH : 0,
    contentMaxWidth: isDesktop ? CONTENT_MAX_WIDTH : width,
  };
}
