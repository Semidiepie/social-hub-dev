import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, Loader2, MessageCircle, Volume2, VolumeX, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ReelWatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reel, setReel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef(null);

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/discover");
  }, [navigate]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await api.get(`/posts/${id}`);
        if (active) setReel(r);
      } catch (e) {
        toast.error(e.message || "Reel not found");
        navigate("/discover");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, navigate]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleLike = async () => {
    if (!user) return navigate("/login");
    const wasLiked = reel.liked_by_me;
    setReel((r) => ({ ...r, liked_by_me: !wasLiked, likes: r.likes + (wasLiked ? -1 : 1) }));
    try {
      const resp = wasLiked ? await api.del(`/posts/${id}/like`) : await api.post(`/posts/${id}/like`);
      setReel((r) => ({ ...r, likes: resp.likes ?? r.likes }));
    } catch (e) {
      setReel((r) => ({ ...r, liked_by_me: wasLiked, likes: r.likes + (wasLiked ? 1 : -1) }));
      toast.error(e.message || "Failed");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!reel) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black" data-testid="reel-fullscreen">
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-3">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
          data-testid="reel-back-btn"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <span className="text-sm font-bold text-white/90">Reel</span>
        <button
          onClick={() => setMuted((m) => !m)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          data-testid="reel-mute-btn"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Vertical player */}
      <div className="relative h-screen w-full max-w-[440px]" onClick={togglePlay}>
        <video
          ref={videoRef}
          key={reel.id}
          src={reel.video_url}
          poster={reel.thumbnail_url || reel.image_url || undefined}
          autoPlay
          loop
          muted={muted}
          playsInline
          className="h-full w-full bg-black object-contain"
          data-testid={`reel-player-${reel.id}`}
        />
        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/40 p-5">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}

        {/* Right action rail */}
        <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5">
          <button onClick={(e) => { e.stopPropagation(); toggleLike(); }} className="flex flex-col items-center gap-1" data-testid="reel-like-btn">
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${reel.liked_by_me ? "bg-primary" : "bg-white/15"}`}>
              <Heart size={24} className={reel.liked_by_me ? "fill-white text-white" : "text-white"} />
            </span>
            <span className="text-xs font-bold text-white">{formatNumber(reel.likes)}</span>
          </button>
          <div className="flex flex-col items-center gap-1">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
              <MessageCircle size={24} className="text-white" />
            </span>
            <span className="text-xs font-bold text-white">{formatNumber(reel.comments_count)}</span>
          </div>
        </div>

        {/* Bottom author + caption */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-16">
          {reel.author && (
            <Link
              to={`/user/${reel.author.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2"
            >
              <Avatar src={reel.author.avatar_url} size={38} />
              <span className="flex items-center gap-1 font-bold text-white">
                @{reel.author.username}
                {reel.author.is_verified && <BadgeCheck size={14} className="fill-white text-black" />}
              </span>
            </Link>
          )}
          {reel.caption && <p className="mt-2 line-clamp-3 max-w-[85%] text-sm text-white/90">{reel.caption}</p>}
        </div>
      </div>
    </div>
  );
}
