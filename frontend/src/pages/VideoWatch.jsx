import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Heart, Eye, ArrowLeft, BadgeCheck, Trash2, Pencil, Share2 } from "lucide-react";
import Hls from "hls.js";
import { api } from "@/lib/api";
import { shareUrl, origin } from "@/lib/share";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { formatDuration, formatNumber, timeAgo, userPath, videoPath, badgeCls, badgeStyle, frameOf } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import CommentThread from "@/components/CommentThread";
import { EditContentModal } from "@/components/EditContentModal";
import { toast } from "sonner";

export default function VideoWatchPage() {
  const { id: routeId, videoId } = useParams();
  const id = videoId || routeId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [video, setVideo] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const viewFiredRef = useRef(false);
  const videoElRef = useRef(null);

  // Back returns to wherever the user came from (profile/discover) at the same
  // scroll position. Falls back to Discover on a cold/direct load.
  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/discover");
  }, [navigate]);

  const load = useCallback(async () => {
    try {
      const [v, r] = await Promise.all([
        api.get(`/videos/${id}`),
        api.get(`/videos/${id}/related`).catch(() => []),
      ]);
      setVideo(v);
      setRelated(r);
      // Canonical URL: rewrite a legacy /videos/:id link to /@handle/{videoId}.
      if (!videoId && v.author?.username) {
        navigate(`/@${v.author.username}/${v.id}`, { replace: true });
      }
    } catch (e) {
      toast.error(e.message || "Video not found");
      navigate("/discover");
    } finally {
      setLoading(false);
    }
  }, [id, videoId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    viewFiredRef.current = false;
  }, [id]);

  // Attach the right source: adaptive HLS for Cloudflare Stream videos (hls.js,
  // with native HLS on Safari), plain MP4 for legacy Cloudinary videos.
  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !video) return undefined;
    const isStream = video.provider === "stream" && video.hls_url;
    if (isStream) {
      if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = video.hls_url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls.loadSource(video.hls_url);
        hls.attachMedia(el);
        return () => hls.destroy();
      } else {
        el.src = video.hls_url;
      }
    } else if (video.video_url) {
      el.src = video.video_url;
    }
    return undefined;
  }, [video]);

  const registerView = () => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    api.post(`/videos/${id}/view`).catch(() => {});
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this video? This can't be undone.")) return;
    try {
      await api.del(`/videos/${id}`);
      toast.success("Video deleted");
      goBack();
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const toggleLike = async () => {
    if (!user) return navigate("/login");
    const prev = { liked: video.liked_by_me, likes: video.likes };
    setVideo((v) => ({ ...v, liked_by_me: !v.liked_by_me, likes: v.likes + (v.liked_by_me ? -1 : 1) }));
    try {
      const resp = video.liked_by_me
        ? await api.del(`/videos/${id}/like`)
        : await api.post(`/videos/${id}/like`);
      setVideo((v) => ({ ...v, liked_by_me: resp.liked_by_me, likes: resp.likes }));
    } catch (e) {
      setVideo((v) => ({ ...v, liked_by_me: prev.liked, likes: prev.likes }));
      toast.error(e.message || "Failed");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!video) return null;

  return (
    <div className="text-foreground" data-testid="video-fullscreen">
      {/* Back */}
      <button
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        data-testid="video-back-btn"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Player in a contained, rounded card that matches the site theme */}
      <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-xl">
        {video.provider === "stream" && !video.hls_url ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black text-sm text-muted-foreground" data-testid="video-processing">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Still processing — this video will play shortly.
          </div>
        ) : (
          <video
            key={video.id}
            ref={videoElRef}
            controls
            autoPlay
            playsInline
            poster={video.thumbnail_url || undefined}
            onPlay={registerView}
            className="mx-auto max-h-[72vh] w-full bg-black object-contain"
            data-testid={`video-player-${video.id}`}
          />
        )}
      </div>

      {/* Details */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <h1 className="text-2xl font-black leading-snug tracking-tight md:text-3xl">{video.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-y border-border py-3">
            {video.author && (
              <Link to={userPath(video.author)} className="flex items-center gap-3">
                <Avatar src={video.author.avatar_url} size={40} frame={frameOf(video.author)} />
                <div>
                  <div className="flex items-center gap-1 font-semibold hover:text-primary">
                    {video.author.display_name}
                    {video.author.is_verified && <BadgeCheck size={14} className={badgeCls(video.author)} style={badgeStyle(video.author)} />}
                  </div>
                  <div className="text-xs text-muted-foreground">@{video.author.username}</div>
                </div>
              </Link>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                onClick={toggleLike}
                variant={video.liked_by_me ? "default" : "outline"}
                className={`gap-2 ${
                  video.liked_by_me ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                }`}
                data-testid="video-like-btn"
              >
                <Heart size={16} className={video.liked_by_me ? "fill-current" : ""} />
                {formatNumber(video.likes)}
              </Button>
              <Button
                onClick={() => shareUrl(`${origin()}/api/share/video/${video.id}`, video.title, "Video link copied!")}
                variant="outline"
                className="gap-2"
                data-testid="video-share-btn"
              >
                <Share2 size={16} /> Share
              </Button>
              {user?.id && video.author?.id === user.id && (
                <>
                  <Button
                    onClick={() => setEditing(true)}
                    variant="outline"
                    className="gap-2"
                    data-testid="video-edit-btn"
                  >
                    <Pencil size={16} /> Edit
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                    data-testid="video-delete-btn"
                  >
                    <Trash2 size={16} /> Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Eye size={12} /> {formatNumber(video.views)} views</span>
            {video.duration && <span>· {formatDuration(video.duration)}</span>}
            <span>· {timeAgo(video.created_at)}</span>
          </div>

          {video.description && (
            <div className="mt-4 whitespace-pre-wrap rounded-xl bg-card/60 p-4 text-sm text-foreground/90">
              {video.description}
            </div>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-black">Comments · {formatNumber(video.comments_count || 0)}</h2>
            <CommentThread
              type="video"
              id={id}
              onCountChange={(d) => setVideo((v) => (v ? { ...v, comments_count: Math.max(0, (v.comments_count || 0) + d) } : v))}
            />
          </section>
        </div>

        <aside className="min-w-0">
          <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-muted-foreground">
            Up next
          </h3>
          <div className="space-y-3">
            {related.map((v) => (
              <Link
                key={v.id}
                to={videoPath(v)}
                className="flex gap-3 rounded-xl hover:bg-secondary/50"
                data-testid={`video-related-${v.id}`}
              >
                <div className="relative aspect-video w-32 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                  {v.duration && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-mono text-white">
                      {formatDuration(v.duration)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <div className="line-clamp-2 text-sm font-bold leading-tight">{v.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{v.author?.display_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatNumber(v.views)} views · {timeAgo(v.created_at)}
                  </div>
                </div>
              </Link>
            ))}
            {related.length === 0 && (
              <div className="rounded-xl border border-border p-4 text-center text-sm text-muted-foreground">
                No related videos yet.
              </div>
            )}
          </div>
        </aside>
      </div>

      <EditContentModal
        item={{ ...video, type: "video" }}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(updated) => setVideo((v) => ({ ...v, ...updated }))}
      />
    </div>
  );
}
