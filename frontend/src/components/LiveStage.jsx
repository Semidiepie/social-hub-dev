import React, { useEffect, useRef } from "react";
import { X, Mic } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { whepPlay, endSession } from "@/lib/webrtc";

// A single co-host tile. Plays the co-host's WHEP feed, or shows their avatar
// (audio-only, or when no media provider is configured / not publishing yet).
function CohostTile({ cohost, audioOnly, canRemove, onRemove }) {
  const videoRef = useRef(null);
  const rtcRef = useRef(null);

  useEffect(() => {
    if (audioOnly || !cohost.whep_url || !videoRef.current) return undefined;
    const el = videoRef.current;
    el.muted = true; // co-host audio comes through the main stream mix; tiles stay muted to avoid echo
    whepPlay(cohost.whep_url, el)
      .then((r) => { rtcRef.current = r; el.play().catch(() => {}); })
      .catch(() => {});
    return () => {
      endSession(rtcRef.current?.session);
      rtcRef.current?.pc?.close();
      rtcRef.current = null;
    };
  }, [cohost.whep_url, audioOnly]);

  return (
    <div className="relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-white/20 bg-black/60" data-testid={`live-cohost-${cohost.user_id}`}>
      {audioOnly || !cohost.whep_url ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <Avatar src={cohost.avatar_url} size={40} ring />
          <Mic size={12} className="text-primary" />
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-center text-[9px] font-bold text-white">
        {cohost.display_name || cohost.username}
      </div>
      {canRemove && (
        <button
          onClick={() => onRemove(cohost.user_id)}
          data-testid={`live-cohost-remove-${cohost.user_id}`}
          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-rose-600"
          title="Remove from stage"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// My own local tile when I've been brought on stage (shows my camera, muted).
function LocalTile({ localStream, audioOnly, avatarUrl }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (audioOnly || !localStream || !videoRef.current) return;
    videoRef.current.srcObject = localStream;
    videoRef.current.play().catch(() => {});
  }, [localStream, audioOnly]);

  return (
    <div className="relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 border-primary bg-black/60" data-testid="live-cohost-self">
      {audioOnly || !localStream ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <Avatar src={avatarUrl} size={40} ring />
          <Mic size={12} className="text-primary" />
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-primary/80 px-1 py-0.5 text-center text-[9px] font-black text-white">You</div>
    </div>
  );
}

/**
 * Horizontal strip of on-stage co-hosts, rendered over the live video just below
 * the top bar. Shows remote co-hosts (WHEP) and, when I'm on stage, my local tile.
 */
export function LiveStage({ cohosts = [], audioOnly, isOwner, myId, onRemove, localStream, showLocal, myAvatar }) {
  const remotes = cohosts.filter((c) => c.user_id !== myId);
  if (remotes.length === 0 && !showLocal) return null;
  return (
    <div className="pointer-events-auto absolute left-0 right-0 top-[72px] z-20 flex gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="live-stage-strip">
      {showLocal && <LocalTile localStream={localStream} audioOnly={audioOnly} avatarUrl={myAvatar} />}
      {remotes.map((c) => (
        <CohostTile key={c.user_id} cohost={c} audioOnly={audioOnly} canRemove={isOwner} onRemove={onRemove} />
      ))}
    </div>
  );
}
