import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Video, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useLiveSocket } from "@/lib/useLiveSocket";
import { LiveOverlay } from "@/components/LiveOverlay";
import { whipPublish, endSession } from "@/lib/webrtc";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function GoLivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [stream, setStream] = useState(null); // created live stream doc
  const [starting, setStarting] = useState(false);
  const [demo, setDemo] = useState(false);
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const rtcRef = useRef(null);

  const live = useLiveSocket(stream?.id);

  const goLive = async () => {
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      mediaRef.current = media;
      const s = await api.post("/live", { title: title.trim() || "Live", mode: "webrtc" });
      setStream(s);
      setDemo(!s.provider_configured);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play().catch(() => {});
      }
      if (s.whip_url) {
        rtcRef.current = await whipPublish(s.whip_url, media);
      }
    } catch (e) {
      toast.error(e.message?.includes("getUserMedia") || e.name === "NotAllowedError"
        ? "Camera/microphone permission denied."
        : (e.message || "Couldn't start the stream"));
      // cleanup media if stream creation failed
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
    } finally {
      setStarting(false);
    }
  };

  const endStream = async () => {
    try { if (stream?.id) await api.post(`/live/${stream.id}/stop`); } catch { /* noop */ }
    await endSession(rtcRef.current?.session);
    rtcRef.current?.pc?.close();
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    navigate("/live");
  };

  useEffect(() => {
    return () => {
      endSession(rtcRef.current?.session);
      rtcRef.current?.pc?.close();
      mediaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Pre-live setup screen
  if (!stream) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5">
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
        <Button
          onClick={goLive}
          disabled={starting}
          data-testid="golive-start-btn"
          className="h-12 gap-2 bg-rose-600 text-base font-bold text-white hover:bg-rose-500"
        >
          {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video size={20} />} Go Live
        </Button>
        <Button variant="outline" onClick={() => navigate("/live")} className="border-border bg-transparent" data-testid="golive-cancel">
          Cancel
        </Button>
      </div>
    );
  }

  // Broadcasting screen
  return (
    <div className="relative mx-auto h-screen max-w-md overflow-hidden bg-black">
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" data-testid="golive-preview" />
      {demo && (
        <div className="absolute left-1/2 top-16 z-20 flex w-[92%] -translate-x-1/2 items-start gap-2 rounded-xl bg-amber-500/90 px-3 py-2 text-xs font-semibold text-black" data-testid="golive-demo-banner">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          Video provider not configured — you can see yourself and the live chat/hearts/gifts work, but viewers won&apos;t receive the video feed until Cloudflare keys are added.
        </div>
      )}
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
        isOwner
        onEnd={endStream}
      />
    </div>
  );
}
