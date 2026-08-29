// Single source of truth for Agora SDK loading. Returns null when the SDK can't
// be loaded (e.g., running in Expo Go where native modules aren't linked, or on
// web). Callers should handle the null case with a friendly fallback.
import { Platform } from "react-native";

export interface AgoraModule {
  default: any;
  ChannelProfileType: any;
  ClientRoleType: any;
  RtcSurfaceView: any;
  VideoSourceType?: any;
}

export function loadAgora(): AgoraModule | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-agora");
    // The Expo Go runtime doesn't link Agora's native module — `createAgoraRtcEngine`
    // will be undefined or throw on call. Guard against both.
    if (!mod || typeof mod.createAgoraRtcEngine !== "function") return null;
    return mod as AgoraModule;
  } catch {
    return null;
  }
}

export function isAgoraAvailable(): boolean {
  return loadAgora() !== null;
}
