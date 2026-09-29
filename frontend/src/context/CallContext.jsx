import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, BadgeCheck } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { frameOf, badgeCls } from "@/lib/format";
import { toast } from "sonner";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const CallContext = createContext(null);
export const useCall = () => useContext(CallContext);

function wsUrl() {
  const token = getToken();
  const base = BASE_URL.replace(/^http/, "ws");
  return `${base}/api/rtc/ws?token=${encodeURIComponent(token || "")}`;
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const wsRef = useRef(null);
  const clientRef = useRef(null);        // Agora client
  const localTracksRef = useRef([]);     // [micTrack, camTrack?]
  const userMapRef = useRef({});         // agora_uid -> user info (from signaling)
  const callRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [call, setCall] = useState(null); // { callId, convId, media, status, from, isGroup, title }
  const [peers, setPeers] = useState({}); // agoraUid -> { info, videoTrack, hasVideo }
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  callRef.current = call;

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const leaveAgora = useCallback(async () => {
    localTracksRef.current.forEach((t) => { try { t.stop(); t.close(); } catch { /* noop */ } });
    localTracksRef.current = [];
    setLocalVideoTrack(null);
    const client = clientRef.current;
    if (client) { try { await client.leave(); } catch { /* noop */ } clientRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    leaveAgora();
    setPeers({});
    setCall(null);
    setMicOn(true);
    setCamOn(true);
  }, [leaveAgora]);

  const joinAgora = useCallback(async (channel, media) => {
    let data;
    try {
      data = await api.post("/rtc/agora-token", { channel });
    } catch {
      toast.error("Calling isn't available right now");
      throw new Error("token");
    }
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("user-published", async (u, mediaType) => {
      await client.subscribe(u, mediaType);
      if (mediaType === "audio") { try { u.audioTrack.play(); } catch { /* noop */ } }
      setPeers((prev) => ({
        ...prev,
        [u.uid]: {
          info: userMapRef.current[u.uid] || prev[u.uid]?.info,
          videoTrack: mediaType === "video" ? u.videoTrack : prev[u.uid]?.videoTrack,
          hasVideo: mediaType === "video" ? true : prev[u.uid]?.hasVideo,
        },
      }));
      setCall((c) => (c && c.status !== "active" ? { ...c, status: "active" } : c));
    });
    client.on("user-unpublished", (u, mediaType) => {
      if (mediaType === "video") {
        setPeers((prev) => (prev[u.uid] ? { ...prev, [u.uid]: { ...prev[u.uid], videoTrack: null, hasVideo: false } } : prev));
      }
    });
    client.on("user-left", (u) => {
      setPeers((prev) => { const n = { ...prev }; delete n[u.uid]; return n; });
      const cur = callRef.current;
      if (cur && !cur.isGroup) { toast("Call ended"); cleanup(); }
    });
    client.on("token-privilege-will-expire", async () => {
      try { const fresh = await api.post("/rtc/agora-token", { channel }); await client.renewToken(fresh.token); } catch { /* noop */ }
    });

    await client.join(data.app_id, channel, data.token, data.uid);
    const mic = await AgoraRTC.createMicrophoneAudioTrack();
    const tracks = [mic];
    let cam = null;
    if (media === "video") {
      cam = await AgoraRTC.createCameraVideoTrack();
      tracks.push(cam);
      setLocalVideoTrack(cam);
    }
    localTracksRef.current = tracks;
    await client.publish(tracks);
  }, [cleanup]);

  // ---- Incoming signaling ----
  const handleMessage = useCallback(async (m) => {
    const cur = callRef.current;
    switch (m.type) {
      case "call_invite": {
        if (cur) { send({ type: "busy", call_id: m.call_id, to: m.from?.id }); return; }
        if (m.from?.agora_uid) userMapRef.current[m.from.agora_uid] = m.from;
        setCall({ callId: m.call_id, convId: m.conv_id, media: m.media, status: "incoming", from: m.from, isGroup: m.is_group, title: m.conv_title });
        break;
      }
      case "call_started":
        setCall((c) => (c ? { ...c, ringing: m.ringing } : c));
        break;
      case "peer_joined": {
        if (m.from?.agora_uid) userMapRef.current[m.from.agora_uid] = m.from;
        setCall((c) => (c && c.status === "outgoing" ? { ...c, status: "ringing_joined" } : c));
        break;
      }
      case "decline":
      case "busy": {
        if (cur && !cur.isGroup) { toast(m.type === "busy" ? "User is busy" : "Call declined"); cleanup(); }
        break;
      }
      case "cancel": {
        if (cur?.status === "incoming") { toast("Call cancelled"); cleanup(); }
        break;
      }
      case "peer_left": {
        const cur2 = callRef.current;
        if (cur2 && !cur2.isGroup) { toast("Call ended"); cleanup(); }
        break;
      }
      default:
        break;
    }
  }, [cleanup, send]);

  // ---- Socket lifecycle ----
  useEffect(() => {
    if (!user) return undefined;
    let closed = false;
    let pingTimer = null;
    let reconnectTimer = null;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        pingTimer = setInterval(() => { try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ } }, 25000);
      };
      ws.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch { /* noop */ } };
      ws.onclose = () => {
        setConnected(false);
        clearInterval(pingTimer);
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };
    connect();

    return () => {
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [user, handleMessage]);

  // ---- Public actions ----
  const startCall = useCallback(async (conv, media) => {
    if (callRef.current) { toast("You're already in a call"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Calls aren't supported in this browser"); return; }
    const callId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`;
    setCall({ callId, convId: conv.id, media, status: "outgoing", isGroup: conv.is_group, title: conv.title });
    try {
      await joinAgora(callId, media);
    } catch {
      cleanup();
      toast.error("Couldn't start the call — allow mic/camera access");
      return;
    }
    send({ type: "invite", conv_id: conv.id, call_id: callId, media });
  }, [joinAgora, cleanup, send]);

  const acceptCall = useCallback(async () => {
    const cur = callRef.current;
    if (!cur) return;
    send({ type: "accept", call_id: cur.callId });
    setCall((c) => ({ ...c, status: "active" }));
    try {
      await joinAgora(cur.callId, cur.media);
    } catch {
      send({ type: "decline", call_id: cur.callId, to: cur.from?.id });
      cleanup();
    }
  }, [joinAgora, cleanup, send]);

  const declineCall = useCallback(() => {
    const cur = callRef.current;
    if (!cur) return;
    send({ type: "decline", call_id: cur.callId, to: cur.from?.id });
    cleanup();
  }, [cleanup, send]);

  const hangUp = useCallback(() => {
    const cur = callRef.current;
    if (!cur) return;
    if (cur.status === "outgoing" || cur.status === "ringing_joined") send({ type: "cancel", call_id: cur.callId });
    else send({ type: "bye", call_id: cur.callId });
    cleanup();
  }, [cleanup, send]);

  const toggleMic = useCallback(async () => {
    const t = localTracksRef.current[0];
    if (!t) return;
    const on = !micOn;
    await t.setEnabled(on);
    setMicOn(on);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const t = localTracksRef.current[1];
    if (!t) return;
    const on = !camOn;
    await t.setEnabled(on);
    setCamOn(on);
  }, [camOn]);

  return (
    <CallContext.Provider value={{ connected, call, startCall }}>
      {children}
      {call && (
        <CallUI
          call={call}
          peers={peers}
          localVideoTrack={localVideoTrack}
          micOn={micOn}
          camOn={camOn}
          onAccept={acceptCall}
          onDecline={declineCall}
          onHangUp={hangUp}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
        />
      )}
    </CallContext.Provider>
  );
}

function AgoraTile({ videoTrack, label, avatar, frame }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (videoTrack && el) { try { videoTrack.play(el); } catch { /* noop */ } }
    return () => { if (videoTrack) { try { videoTrack.stop(); } catch { /* noop */ } } };
  }, [videoTrack]);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
      <div ref={ref} className={`h-full w-full ${videoTrack ? "" : "hidden"}`} />
      {!videoTrack && <Avatar src={avatar} size={96} frame={frame} />}
      {label && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{label}</span>}
    </div>
  );
}

function CallUI({ call, peers, localVideoTrack, micOn, camOn, onAccept, onDecline, onHangUp, onToggleMic, onToggleCam }) {
  const isVideo = call.media === "video";
  const peerList = Object.values(peers);

  if (call.status === "incoming") {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ height: "100dvh" }} data-testid="incoming-call">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <Avatar src={call.from?.avatar_url} size={88} frame={frameOf(call.from)} />
          </div>
          <div className="flex items-center justify-center gap-1 text-xl font-black">
            {call.from?.display_name}
            {call.from?.is_verified && <BadgeCheck size={18} className={badgeCls(call.from)} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Incoming {isVideo ? "video" : "audio"} call{call.isGroup ? ` · ${call.title}` : ""}
          </p>
          <div className="mt-8 flex items-center justify-center gap-10">
            <button onClick={onDecline} className="flex flex-col items-center gap-2" data-testid="call-decline">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white"><PhoneOff size={26} /></span>
              <span className="text-xs font-semibold">Decline</span>
            </button>
            <button onClick={onAccept} className="flex flex-col items-center gap-2" data-testid="call-accept">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white">{isVideo ? <Video size={26} /> : <Phone size={26} />}</span>
              <span className="text-xs font-semibold">Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ringing = call.status === "outgoing" || call.status === "ringing_joined";
  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-950" style={{ height: "100dvh" }} data-testid="call-screen">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="font-bold">{call.title || "Call"}</div>
        <div className="text-xs text-white/70">{ringing ? "Ringing…" : (isVideo ? "Video call" : "Audio call")}</div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden p-3 sm:grid-cols-2">
        {peerList.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-white/70">
            {ringing ? "Waiting for others to join…" : "Connecting…"}
          </div>
        ) : (
          peerList.map((p, i) => (
            <AgoraTile
              key={i}
              videoTrack={p.hasVideo ? p.videoTrack : null}
              label={p.info?.display_name || "Guest"}
              avatar={p.info?.avatar_url}
              frame={frameOf(p.info)}
            />
          ))
        )}
      </div>

      {isVideo && localVideoTrack && (
        <div className="absolute bottom-24 right-4 h-40 w-28 overflow-hidden rounded-xl border border-white/20 shadow-lg">
          <AgoraTile videoTrack={camOn ? localVideoTrack : null} label="You" />
        </div>
      )}

      <div className="flex items-center justify-center gap-6 py-6">
        <button onClick={onToggleMic} className={`flex h-14 w-14 items-center justify-center rounded-full ${micOn ? "bg-white/15 text-white" : "bg-white text-black"}`} data-testid="call-toggle-mic">
          {micOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
        {isVideo && (
          <button onClick={onToggleCam} className={`flex h-14 w-14 items-center justify-center rounded-full ${camOn ? "bg-white/15 text-white" : "bg-white text-black"}`} data-testid="call-toggle-cam">
            {camOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>
        )}
        <button onClick={onHangUp} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white" data-testid="call-hangup">
          <PhoneOff size={26} />
        </button>
      </div>
    </div>
  );
}
