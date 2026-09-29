import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, BadgeCheck } from "lucide-react";
import { getToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { frameOf, badgeCls } from "@/lib/format";
import { toast } from "sonner";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;
const ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

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
  const pcsRef = useRef(new Map()); // remoteId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const callRef = useRef(null); // mirror of call for handlers

  const [connected, setConnected] = useState(false);
  const [call, setCall] = useState(null); // { callId, convId, media, status, from, isGroup, title }
  const [peers, setPeers] = useState({}); // remoteId -> { info, stream }
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  callRef.current = call;

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => { try { pc.close(); } catch { /* noop */ } });
    pcsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setPeers({});
    setCall(null);
    setMicOn(true);
    setCamOn(true);
  }, []);

  const getLocalStream = useCallback(async (media) => {
    if (localStreamRef.current) return localStreamRef.current;
    const constraints = { audio: true, video: media === "video" };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    return stream;
  }, []);

  const attachPeerStream = useCallback((remoteId, stream, info) => {
    setPeers((prev) => ({ ...prev, [remoteId]: { info: info || prev[remoteId]?.info, stream } }));
  }, []);

  const createPeer = useCallback(async (remoteId, info, initiator) => {
    if (pcsRef.current.has(remoteId)) return pcsRef.current.get(remoteId);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcsRef.current.set(remoteId, pc);
    const cur = callRef.current;
    const local = await getLocalStream(cur?.media || "audio");
    local.getTracks().forEach((track) => pc.addTrack(track, local));
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", call_id: cur?.callId, to: remoteId, candidate: e.candidate });
    };
    pc.ontrack = (e) => attachPeerStream(remoteId, e.streams[0], info);
    setPeers((prev) => ({ ...prev, [remoteId]: { info: info || prev[remoteId]?.info, stream: prev[remoteId]?.stream } }));
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", call_id: cur?.callId, to: remoteId, sdp: pc.localDescription });
    }
    return pc;
  }, [attachPeerStream, getLocalStream, send]);

  // ---- Incoming signaling ----
  const handleMessage = useCallback(async (m) => {
    const cur = callRef.current;
    switch (m.type) {
      case "call_invite": {
        if (cur) { send({ type: "busy", call_id: m.call_id, to: m.from?.id }); return; }
        setCall({ callId: m.call_id, convId: m.conv_id, media: m.media, status: "incoming", from: m.from, isGroup: m.is_group, title: m.conv_title });
        break;
      }
      case "call_started":
        setCall((c) => (c ? { ...c, ringing: m.ringing } : c));
        break;
      case "call_peers": {
        // I just accepted — I'm the new joiner; initiate to each existing peer.
        for (const pid of m.peers || []) {
          await createPeer(pid, null, true);
        }
        break;
      }
      case "peer_joined": {
        setCall((c) => (c && c.status !== "active" ? { ...c, status: "active" } : c));
        setPeers((prev) => ({ ...prev, [m.from.id]: { info: m.from, stream: prev[m.from.id]?.stream } }));
        break;
      }
      case "offer": {
        const pc = await createPeer(m.from, null, false);
        await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", call_id: m.call_id, to: m.from, sdp: pc.localDescription });
        setCall((c) => (c && c.status !== "active" ? { ...c, status: "active" } : c));
        break;
      }
      case "answer": {
        const pc = pcsRef.current.get(m.from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
        break;
      }
      case "ice": {
        const pc = pcsRef.current.get(m.from);
        if (pc && m.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch { /* noop */ } }
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
        const pc = pcsRef.current.get(m.from);
        if (pc) { try { pc.close(); } catch { /* noop */ } pcsRef.current.delete(m.from); }
        setPeers((prev) => { const n = { ...prev }; delete n[m.from]; return n; });
        // In a 1:1 call, the other leaving ends it.
        const c2 = callRef.current;
        if (c2 && !c2.isGroup) { toast("Call ended"); cleanup(); }
        break;
      }
      default:
        break;
    }
  }, [cleanup, createPeer, send]);

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
    try {
      await getLocalStream(media);
    } catch {
      toast.error("Allow microphone/camera access to start a call");
      return;
    }
    setCall({ callId, convId: conv.id, media, status: "outgoing", isGroup: conv.is_group, title: conv.title });
    send({ type: "invite", conv_id: conv.id, call_id: callId, media });
  }, [getLocalStream, send]);

  const acceptCall = useCallback(async () => {
    const cur = callRef.current;
    if (!cur) return;
    try {
      await getLocalStream(cur.media);
    } catch {
      toast.error("Allow microphone/camera access to answer");
      send({ type: "decline", call_id: cur.callId, to: cur.from?.id });
      cleanup();
      return;
    }
    setCall((c) => ({ ...c, status: "active" }));
    send({ type: "accept", call_id: cur.callId });
  }, [cleanup, getLocalStream, send]);

  const declineCall = useCallback(() => {
    const cur = callRef.current;
    if (!cur) return;
    send({ type: "decline", call_id: cur.callId, to: cur.from?.id });
    cleanup();
  }, [cleanup, send]);

  const hangUp = useCallback(() => {
    const cur = callRef.current;
    if (!cur) return;
    if (cur.status === "outgoing") send({ type: "cancel", call_id: cur.callId });
    else send({ type: "bye", call_id: cur.callId });
    cleanup();
  }, [cleanup, send]);

  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const on = !micOn;
    s.getAudioTracks().forEach((t) => { t.enabled = on; });
    setMicOn(on);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const on = !camOn;
    s.getVideoTracks().forEach((t) => { t.enabled = on; });
    setCamOn(on);
  }, [camOn]);

  return (
    <CallContext.Provider value={{ connected, call, startCall }}>
      {children}
      {call && (
        <CallUI
          call={call}
          peers={peers}
          localStream={localStreamRef.current}
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

function MediaTile({ stream, muted, label, avatar, frame, isVideo }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = isVideo && stream && stream.getVideoTracks && stream.getVideoTracks().some((t) => t.enabled);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${hasVideo ? "" : "hidden"}`} />
      {!hasVideo && <Avatar src={avatar} size={96} frame={frame} />}
      {label && (
        <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{label}</span>
      )}
    </div>
  );
}

function CallUI({ call, peers, localStream, micOn, camOn, onAccept, onDecline, onHangUp, onToggleMic, onToggleCam }) {
  const isVideo = call.media === "video";
  const peerList = Object.values(peers);

  // Incoming ring screen
  if (call.status === "incoming") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" data-testid="incoming-call">
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

  // Outgoing / active call screen
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950" data-testid="call-screen">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="font-bold">{call.title || "Call"}</div>
        <div className="text-xs text-white/70">
          {call.status === "outgoing" ? "Ringing…" : (isVideo ? "Video call" : "Audio call")}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden p-3 sm:grid-cols-2">
        {peerList.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-white/70">
            {call.status === "outgoing" ? "Waiting for others to join…" : "Connecting…"}
          </div>
        ) : (
          peerList.map((p, i) => (
            <MediaTile
              key={p.info?.id || i}
              stream={p.stream}
              muted={false}
              isVideo={isVideo}
              label={p.info?.display_name}
              avatar={p.info?.avatar_url}
              frame={frameOf(p.info)}
            />
          ))
        )}
      </div>

      {/* Local preview */}
      {isVideo && localStream && (
        <div className="pointer-events-none absolute bottom-24 right-4 h-40 w-28 overflow-hidden rounded-xl border border-white/20 shadow-lg">
          <MediaTile stream={localStream} muted isVideo label="You" />
        </div>
      )}

      {/* Controls */}
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
