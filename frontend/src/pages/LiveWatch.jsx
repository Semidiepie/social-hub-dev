import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Hls from "hls.js";
import { Loader2, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { useLiveSocket } from "@/lib/useLiveSocket";
import { LiveOverlay } from "@/components/LiveOverlay";
import { useAuth } from "@/context/AuthContext";
import { whepPlay, endSession } from "@/lib/webrtc";
import { toast } from "sonner";

export default function LiveWatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, patchUser } = useAuth();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);
  const rtcRef = useRef(null);
  const hlsRef = useRef(null);

  const live = useLiveSocket(id);

  // Keep the global token balance in sync when the live socket reports a spend.
  useEffect(() => {
    if (live.balance != null) patchUser({ tokens: live.balance });
  }, [live.balance, patchUser]);

  useEffect(() => {
    if (live.walletError) toast.error("Not enough tokens — top up in your Wallet.");
  }, [live.walletError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get(`/live/${id}`);
        if (cancelled) return;
        setStream(s);
      } catch (e) {
        toast.error(e.message || "Stream not found");
        navigate("/live");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  // Attach video playback once we know the playback URL.
  useEffect(() => {
    if (!stream || !videoRef.current) return;
    const el = videoRef.current;
    if (stream.whep_url) {
      whepPlay(stream.whep_url, el)
        .then((r) => { rtcRef.current = r; el.play().catch(() => {}); })
        .catch(() => {});
    } else if (stream.hls_url) {
      if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = stream.hls_url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true });
        hls.loadSource(stream.hls_url);
        hls.attachMedia(el);
        hlsRef.current = hls;
      }
    }
    return () => {
      endSession(rtcRef.current?.session);
      rtcRef.current?.pc?.close();
      rtcRef.current = null;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [stream]);

  if (loading || !stream) {
    return (
      <div className="fixed inset-x-0 top-0 z-40 flex h-[100dvh] items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const audioOnly = !!stream.audio_only;
  const hasStream = !!(stream.whep_url || stream.hls_url);

  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto h-[100dvh] max-w-md overflow-hidden bg-black" data-testid="live-watch">
      {/* playback element — hidden in audio mode but still plays the sound */}
      {hasStream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={audioOnly ? "absolute h-px w-px opacity-0" : "h-full w-full object-cover"}
          data-testid="live-video"
        />
      )}
      {(audioOnly || !hasStream) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900 to-black" data-testid="live-audio-stage">
          <div className="relative">
            {audioOnly && <span className="absolute -inset-6 animate-ping rounded-full bg-primary/30" />}
            {audioOnly && <span className="absolute -inset-3 animate-pulse rounded-full bg-primary/20" />}
            <Avatar src={stream.owner?.avatar_url} size={120} ring />
          </div>
          <div className="flex items-center gap-2 text-white/70">
            <Radio size={16} className="animate-pulse text-rose-500" />
            <span className="text-sm font-semibold">{audioOnly ? "Audio live" : "Waiting for video…"}</span>
          </div>
        </div>
      )}

      {live.ended ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80" data-testid="live-ended">
          <div className="text-xl font-black text-white">Stream ended</div>
          <Button onClick={() => navigate("/live")} className="bg-primary text-primary-foreground" data-testid="live-ended-back">
            Back to Live
          </Button>
        </div>
      ) : (
        <LiveOverlay
          owner={stream.owner}
          title={stream.title}
          viewers={live.viewers}
          hearts={live.hearts}
          floaters={live.floaters}
          chat={live.chat}
          gifts={live.gifts}
          balance={live.balance ?? user?.tokens ?? 0}
          onSendChat={live.sendChat}
          onSendHeart={live.sendHeart}
          onSendGift={live.sendGift}
          chatEnabled={stream.chat_enabled !== false}
          giftsEnabled={stream.gifts_enabled !== false}
          isOwner={stream.is_owner}
          onEnd={async () => { try { await api.post(`/live/${id}/stop`); } catch { /* noop */ } navigate("/live"); }}
          onClose={() => navigate("/live")}
          onShare={async () => {
            const url = `${window.location.origin}/live/${id}`;
            try {
              if (navigator.share) await navigator.share({ title: stream.title, url });
              else { await navigator.clipboard.writeText(url); toast.success("Live link copied!"); }
            } catch { /* cancelled */ }
          }}
        />
      )}
    </div>
  );
}
