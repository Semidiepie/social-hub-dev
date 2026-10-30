import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { attachHls } from "@/lib/hlsAttach";
import { Loader2, Radio, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { useLiveSocket } from "@/lib/useLiveSocket";
import { LiveOverlay } from "@/components/LiveOverlay";
import { useAuth } from "@/context/AuthContext";
import { whepPlay, whipPublish, withPlaceholderVideo, endSession } from "@/lib/webrtc";
import { LiveStage } from "@/components/LiveStage";
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
  const [soundOn, setSoundOn] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [stageRequested, setStageRequested] = useState(false);
  const stageRtcRef = useRef(null);
  const stagePlaceholderRef = useRef(null);

  const live = useLiveSocket(id);

  const isCohost = !!(stream && live.cohosts.some((c) => c.user_id === user?.id));

  // When the host brings me on stage, publish my camera/mic to the slot they provisioned.
  useEffect(() => {
    if (!live.stageGrant || !stream) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia(
          stream.audio_only ? { audio: true } : { video: { facingMode: "user" }, audio: true }
        );
        if (cancelled) { media.getTracks().forEach((t) => t.stop()); return; }
        setLocalStream(media);
        if (live.stageGrant.whip_url) {
          let publishStream = media;
          if (stream.audio_only) {
            const ph = withPlaceholderVideo(media);
            publishStream = ph.stream;
            stagePlaceholderRef.current = ph.stop;
          }
          stageRtcRef.current = await whipPublish(live.stageGrant.whip_url, publishStream);
        }
      } catch {
        toast.error("Couldn't start your camera/microphone for the stage.");
      }
    })();
    return () => { cancelled = true; };
  }, [live.stageGrant, stream]);

  // Tear down my publish when I leave the stage or get removed by the host.
  const stopPublishing = () => {
    endSession(stageRtcRef.current?.session);
    stageRtcRef.current?.pc?.close();
    stageRtcRef.current = null;
    stagePlaceholderRef.current?.();
    stagePlaceholderRef.current = null;
    setLocalStream((s) => { s?.getTracks().forEach((t) => t.stop()); return null; });
  };
  useEffect(() => {
    if (localStream && stream && !isCohost && !live.stageGrant) stopPublishing();
  }, [isCohost, live.stageGrant]);

  useEffect(() => {
    if (live.stageDenied) { setStageRequested(false); toast("The host didn't add you this time."); }
  }, [live.stageDenied]);

  // Browsers block autoplay of media WITH sound until a user gesture, so we start
  // muted (video shows / audio connects) and let the viewer tap to turn on sound.
  const enableSound = () => {
    const el = videoRef.current;
    if (el) { el.muted = false; el.volume = 1; el.play().catch(() => {}); }
    setSoundOn(true);
  };

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
    el.muted = true; // start muted so playback is allowed without a gesture
    if (stream.whep_url) {
      whepPlay(stream.whep_url, el)
        .then((r) => { rtcRef.current = r; el.play().catch(() => {}); })
        .catch(() => {});
    } else if (stream.hls_url) {
      hlsRef.current = attachHls(el, stream.hls_url, { lowLatencyMode: true });
    }
    return () => {
      endSession(rtcRef.current?.session);
      rtcRef.current?.pc?.close();
      rtcRef.current = null;
      hlsRef.current?.();
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
          muted={!soundOn}
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

      <LiveStage
        cohosts={live.cohosts}
        audioOnly={audioOnly}
        isOwner={stream.is_owner}
        myId={user?.id}
        onRemove={live.removeCohost}
        localStream={localStream}
        showLocal={isCohost || !!live.stageGrant}
        myAvatar={user?.avatar_url}
      />

      {hasStream && !soundOn && !live.ended && (
        <button
          onClick={enableSound}
          data-testid="live-enable-sound"
          className="absolute inset-x-0 bottom-32 z-20 mx-auto flex w-fit items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-black text-black shadow-lg active:scale-95"
        >
          <Volume2 size={16} /> Tap for sound
        </button>
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
          isCohost={isCohost}
          stageRequested={stageRequested}
          stageRequests={live.stageRequests}
          onApproveStage={live.approveStage}
          onDenyStage={live.denyStage}
          onRequestStage={() => { live.requestStage(); setStageRequested(true); toast.success("Request sent to the host."); }}
          onLeaveStage={() => { live.leaveStage(); stopPublishing(); }}
          onEnd={async () => { try { await api.post(`/live/${id}/stop`); } catch { /* noop */ } navigate("/live"); }}
          onClose={() => navigate("/live")}
          onShare={async () => {
            const url = `${window.location.origin}/live/${id}`;
            try {
              if (navigator.share) await navigator.share({ title: stream.title, url });
              else { await navigator.clipboard.writeText(url); toast.success("Live link copied!"); }
              live.sendShare();
            } catch { /* cancelled */ }
          }}
        />
      )}
    </div>
  );
}
