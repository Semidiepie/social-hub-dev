import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Heart, Eye, ArrowLeft, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { formatDuration, formatNumber, timeAgo } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function VideoWatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [video, setVideo] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const viewFiredRef = useRef(false);

  // Back returns to wherever the user came from (profile/discover) at the same
  // scroll position. Falls back to Discover on a cold/direct load.
  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/discover");
  }, [navigate]);

  const load = useCallback(async () => {
    try {
      const [v, r, c] = await Promise.all([
        api.get(`/videos/${id}`),
        api.get(`/videos/${id}/related`).catch(() => []),
        api.get(`/videos/${id}/comments`).catch(() => []),
      ]);
      setVideo(v);
      setRelated(r);
      setComments(c);
    } catch (e) {
      toast.error(e.message || "Video not found");
      navigate("/discover");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    viewFiredRef.current = false;
  }, [id]);

  const registerView = () => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    api.post(`/videos/${id}/view`).catch(() => {});
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

  const postComment = async (e) => {
    e.preventDefault();
    if (!user) return navigate("/login");
    if (commentText.trim().length < 1) return;
    setPosting(true);
    try {
      const c = await api.post(`/videos/${id}/comments`, { text: commentText.trim() });
      setComments((rows) => [c, ...rows]);
      setCommentText("");
    } catch (err) {
      toast.error(err.message || "Failed");
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!video) return null;

  return (
    <div className="min-h-screen bg-black text-foreground" data-testid="video-fullscreen">
      {/* Sticky top bar with back */}
      <div className="sticky top-0 z-40 flex items-center gap-3 bg-black/80 px-4 py-3 backdrop-blur">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
          data-testid="video-back-btn"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <span className="truncate text-sm font-semibold text-white/80">{video.title}</span>
      </div>

      {/* Fullscreen player */}
      <div className="flex w-full items-center justify-center bg-black">
        <video
          key={video.id}
          src={video.video_url}
          controls
          autoPlay
          poster={video.thumbnail_url || undefined}
          onPlay={registerView}
          className="max-h-[calc(100vh-56px)] w-full bg-black object-contain"
          data-testid={`video-player-${video.id}`}
        />
      </div>

      {/* Details */}
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-2xl font-black leading-snug tracking-tight md:text-3xl">{video.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-y border-border py-3">
            {video.author && (
              <Link to={`/user/${video.author.id}`} className="flex items-center gap-3">
                <Avatar src={video.author.avatar_url} size={40} />
                <div>
                  <div className="flex items-center gap-1 font-semibold hover:text-primary">
                    {video.author.display_name}
                    {video.author.is_verified && <BadgeCheck size={14} className="fill-primary text-background" />}
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
            <h2 className="text-lg font-black">Comments · {comments.length}</h2>
            <form onSubmit={postComment} className="mt-3 flex items-start gap-3">
              {user && <Avatar src={user.avatar_url} size={36} />}
              <div className="flex-1">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={user ? "Add a comment…" : "Sign in to comment"}
                  disabled={!user}
                  data-testid="video-comment-input"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/60"
                  rows={2}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="submit"
                    disabled={posting || !commentText.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid="video-comment-submit"
                  >
                    {posting ? <Loader2 size={14} className="animate-spin" /> : "Post"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-6 space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3" data-testid={`video-comment-${c.id}`}>
                  <Avatar src={c.author?.avatar_url || c.avatar_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-semibold">{c.author?.display_name || c.display_name}</span>
                      {(c.is_verified || c.author?.is_verified) && (
                        <BadgeCheck size={13} className="shrink-0 fill-primary text-background" data-testid={`video-comment-verified-${c.id}`} />
                      )}
                      <span className="text-xs text-muted-foreground">· {timeAgo(c.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/95">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
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
                to={`/videos/${v.id}`}
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
    </div>
  );
}
