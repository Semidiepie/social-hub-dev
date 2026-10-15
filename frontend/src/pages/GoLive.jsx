import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Video, AlertTriangle, Mic, Radio } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { useLiveSocket } from "@/lib/useLiveSocket";
import { LiveOverlay } from "@/components/LiveOverlay";
import { LiveStage } from "@/components/LiveStage";
import { whipPublish, withPlaceholderVideo, endSession } from "@/lib/webrtc";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Continuously transcribe the broadcaster's mic so their AI characters can react to what
// they SAY OUT LOUD on the live. Records the mic in ~12s complete clips and uploads each to
// the backend (which no-ops cheaply if the user has no AI characters). Returns a stop fn.
function startSpeechCapture(streamId, micStream) {
  const audioTrack = micStream?.getAudioTracks?.()[0];
  if (!audioTrack || !window.MediaRecorder) return () => {};
  const audioStream = new MediaStream([audioTrack]);
  const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find(
    (m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
  let stopped = false;
  const cycle = () => {
    if (stopped) return;
    let rec;
    try {
      rec = mime ? new MediaRecorder(audioStream, { mimeType: mime }) : new MediaRecorder(audioStream);
    } catch { return; }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (!stopped && blob.size > 2500) {
        try {
          const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
          const fd = new FormData();
          fd.append("audio", blob, `live.${ext}`);
          await fetch(`${BACKEND_URL}/api/ai-characters/live-speech/${streamId}`, {
            method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
        } catch { /* non-blocking */ }
      }
      if (!stopped) cycle();
    };
    try { rec.start(); } catch { return; }
    setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch { /* noop */ } }, 12000);
  };
  cycle();
  return () => { stopped = true; };
}

export default function GoLivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);
  const [visibility, setVisibility] = useState("public");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [giftsEnabled, setGiftsEnabled] = useState(true);
  const [stream, setStream] = useState(null); // created live stream doc
  const [starting, setStarting] = useState(false);
  const [demo, setDemo] = useState(false);
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const rtcRef = useRef(null);
  const placeholderRef = useRef(null);
  const speechStopRef = useRef(null);

  const live = useLiveSocket(stream?.id);

  const goLive = async () => {
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia(
        audioOnly ? { audio: true } : { video: { facingMode: "user" }, audio: true }
      );
      mediaRef.current = media;
      const s = await api.post("/live", {
        title: title.trim() || "Live", mode: "webrtc",
        audio_only: audioOnly, visibility, chat_enabled: chatEnabled, gifts_enabled: giftsEnabled,
      });
      setDemo(!s.provider_configured);
      if (s.whip_url) {
        let publishStream = media;
        if (audioOnly) {
          const ph = withPlaceholderVideo(media);
          publishStream = ph.stream;
          placeholderRef.current = ph.stop;
        }
        rtcRef.current = await whipPublish(s.whip_url, publishStream);
      }
      setStream(s); // mounts the broadcasting screen; the effect below binds the preview
      speechStopRef.current = startSpeechCapture(s.id, media);
    } catch (e) {
      toast.error(e.message?.includes("getUserMedia") || e.name === "NotAllowedError"
        ? "Camera/microphone permission denied."
        : (e.message || "Couldn't start the stream"));
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
    } finally {
      setStarting(false);
    }
  };

  // Bind the local camera to the preview <video> once the broadcasting screen is mounted.
  useEffect(() => {
    if (stream && !stream.audio_only && videoRef.current && mediaRef.current) {
      videoRef.current.srcObject = mediaRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const shareLink = async () => {
    const url = `${window.location.origin}/live/${stream.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${stream.owner?.display_name || "I'm"} live on PostMePlex`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Live link copied — share it so people can watch!");
      }
      live.sendShare();
    } catch { /* user cancelled share */ }
  };

  const endStream = async () => {
    try { if (stream?.id) await api.post(`/live/${stream.id}/stop`); } catch { /* noop */ }
    speechStopRef.current?.();
    await endSession(rtcRef.current?.session);
    rtcRef.current?.pc?.close();
    placeholderRef.current?.();
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    navigate("/live");
  };

  useEffect(() => {
    return () => {
      speechStopRef.current?.();
      endSession(rtcRef.current?.session);
      rtcRef.current?.pc?.close();
      placeholderRef.current?.();
      mediaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Pre-live setup screen
  if (!stream) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6 px-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Go Live</h1>
          <p className="mt-1 text-sm text-muted-foreground">Broadcast to your community in real time.</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stream title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${user?.display_name || "My"}'s live`}
            data-testid="golive-title"
            maxLength={120}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stream type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAudioOnly(false)}
              data-testid="golive-mode-video"
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${!audioOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
            >
              <Video size={18} /> Video
            </button>
            <button
              onClick={() => setAudioOnly(true)}
              data-testid="golive-mode-audio"
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${audioOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
            >
              <Mic size={18} /> Audio only
            </button>
          </div>
          {audioOnly && <p className="text-[11px] text-muted-foreground">Viewers hear you and see your pulsing profile picture — no camera.</p>}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advanced options</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setVisibility("public")} data-testid="golive-vis-public" className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${visibility === "public" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>🌍 Public</button>
            <button onClick={() => setVisibility("followers")} data-testid="golive-vis-followers" className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${visibility === "followers" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>👥 Followers only</button>
          </div>
          <label className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold" data-testid="golive-chat-toggle">
            <span>Live chat</span>
            <input type="checkbox" checked={chatEnabled} onChange={(e) => setChatEnabled(e.target.checked)} className="h-5 w-5 accent-primary" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold" data-testid="golive-gifts-toggle">
            <span>Allow gifts</span>
            <input type="checkbox" checked={giftsEnabled} onChange={(e) => setGiftsEnabled(e.target.checked)} className="h-5 w-5 accent-primary" />
          </label>
        </div>

        <Button
          onClick={goLive}
          disabled={starting}
          data-testid="golive-start-btn"
          className="h-12 gap-2 bg-rose-600 text-base font-bold text-white hover:bg-rose-500"
        >
          {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : (audioOnly ? <Mic size={20} /> : <Video size={20} />)} Go Live
        </Button>
        <Button variant="outline" onClick={() => navigate("/live")} className="border-border bg-transparent" data-testid="golive-cancel">
          Cancel
        </Button>
      </div>
    );
  }

  // Broadcasting screen
  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto h-[100dvh] max-w-md overflow-hidden bg-black">
      {stream.audio_only ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-gradient-to-b from-zinc-900 to-black" data-testid="golive-audio-stage">
          <div className="relative">
            <span className="absolute -inset-6 animate-ping rounded-full bg-primary/30" />
            <span className="absolute -inset-3 animate-pulse rounded-full bg-primary/20" />
            <Avatar src={stream.owner?.avatar_url} size={132} ring />
          </div>
          <div className="flex items-center gap-2 text-white/80"><Mic size={16} className="text-primary" /><span className="text-sm font-bold">Audio live</span></div>
        </div>
      ) : (
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" data-testid="golive-preview" />
      )}
      {demo && (
        <div className="absolute left-1/2 top-16 z-20 flex w-[92%] -translate-x-1/2 items-start gap-2 rounded-xl bg-amber-500/90 px-3 py-2 text-xs font-semibold text-black" data-testid="golive-demo-banner">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          {stream.audio_only
            ? "Audio provider not configured — the interactive layer works, but viewers won't receive your audio until Cloudflare keys are added."
            : "Video provider not configured — you can see yourself and the live chat/hearts/gifts work, but viewers won't receive the video feed until Cloudflare keys are added."}
        </div>
      )}
      <LiveStage
        cohosts={live.cohosts}
        audioOnly={stream.audio_only}
        isOwner
        myId={user?.id}
        onRemove={live.removeCohost}
        showLocal={false}
      />
      <LiveOverlay
        owner={stream.owner}
        title={stream.title}
        viewers={live.viewers}
        hearts={live.hearts}
        floaters={live.floaters}
        chat={live.chat}
        gifts={live.gifts}
        onSendChat={live.sendChat}
        onSendHeart={live.sendHeart}
        onSendGift={live.sendGift}
        chatEnabled={stream.chat_enabled !== false}
        giftsEnabled={stream.gifts_enabled !== false}
        isOwner
        stageRequests={live.stageRequests}
        onApproveStage={live.approveStage}
        onDenyStage={live.denyStage}
        onEnd={endStream}
        onShare={shareLink}
      />
    </div>
  );
}
