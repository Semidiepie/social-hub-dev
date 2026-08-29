// Web stub for the Agora loader. Metro picks this file on web (via `.web.ts`
// extension resolution) so the native `react-native-agora` module is never
// pulled into the web bundle. Live streaming intentionally falls back to the
// "needs development build" message on web.
export interface AgoraModule {
  default: any;
  ChannelProfileType: any;
  ClientRoleType: any;
  RtcSurfaceView: any;
  VideoSourceType?: any;
}

export function loadAgora(): AgoraModule | null {
  return null;
}

export function isAgoraAvailable(): boolean {
  return false;
}
