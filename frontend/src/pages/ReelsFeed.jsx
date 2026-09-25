import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Volume2,
  VolumeX,
  BadgeCheck,
  Send,
  Loader2,
  Trash2,
  Pencil,
  Film,
  Plus,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { formatNumber, timeAgo, userPath } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { EditContentModal } from "@/components/EditContentModal";
import { toast } from "sonner";

// Web "For You" reels feed — a vertical snap-scroll column of reels only,
// mirroring the mobile Reels tab. Each reel autoplays when scrolled into view.
export default function ReelsFeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reels, setReels] = useState(null);
  const [muted, setMuted] = useState(true);
  const [commentReel, setCommentReel] = useState(null);
  const [editReel, setEditReel] = useState(null);

  useEffect(() => {
    api
      .get("/reels")
      .then(setReels)
      .catch(() => setReels([]));
  }, []);

  const onUpdated = (updated) =>
    setReels((rows) => (rows || []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  const onDeleted = (id) => setReels((rows) => (rows || []).filter((r) => r.id !== id));

  return (
    <div className="flex flex-col" data-testid="reels-feed-page">
      <div className="mb-3 flex items-center gap-2">
        <Film className="text-primary" size={22} />
        <h1 className="text-2xl font-black tracking-tight">Reels</h1>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">For You</span>
        {user && (
          <button
            type="button"
            onClick={() => navigate("/reels/new")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            data-testid="reels-create-btn"
          >
            <Plus size={16} /> Create reel
          </button>
        )}
      </div>

      {reels === null ? (
        <div className="flex h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : reels.length === 0 ? (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-2 text-center">
          <Film size={48} className="text-muted-foreground" />
          <p className="text-lg font-bold">No reels yet</p>
          <p className="text-sm text-muted-foreground">Be the first to share a reel.</p>
        </div>
      ) : (
        <div
          className="mx-auto h-[calc(100vh-8rem)] w-full max-w-[440px] snap-y snap-mandatory overflow-y-scroll rounded-2xl bg-black"
          style={{ scrollbarWidth: "none" }}
          data-testid="reels-scroller"
        >
          {reels.map((reel) => (
            <WebReel
              key={reel.id}
              reel={reel}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              canManage={user?.id && user.id === reel.author?.id}
              onOpenComments={() => setCommentReel(reel)}
              onEdit={() => setEditReel(reel)}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}

      {commentReel && (
        <CommentsModal
          reel={commentReel}
          user={user}
          onClose={() => setCommentReel(null)}
          onPosted={() =>
            onUpdated({ ...commentReel, comments_count: (commentReel.comments_count || 0) + 1 })
          }
          onRemoved={() =>
            onUpdated({ ...commentReel, comments_count: Math.max(0, (commentReel.comments_count || 0) - 1) })
          }
        />
      )}

      <EditContentModal
        item={editReel}
        open={!!editReel}
        onClose={() => setEditReel(null)}
        onSaved={onUpdated}
      />
    </div>
  );
}

function WebReel({ reel, muted, onToggleMute, canManage, onOpenComments, onEdit, onDeleted }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [liked, setLiked] = useState(reel.liked_by_me);
  const [likes, setLikes] = useState(reel.likes || 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) {
          vid.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          vid.pause();
          setPlaying(false);
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play();
      setPlaying(true);
    } else {
      vid.pause();
      setPlaying(false);
    }
  };

  const toggleLike = async () => {
    if (!user) return navigate("/login");
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      if (next) await api.post(`/posts/${reel.id}/like`);
      else await api.del(`/posts/${reel.id}/like`);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this reel? This can't be undone.")) return;
    try {
      await api.del(`/posts/${reel.id}`);
      toast.success("Reel deleted");
      onDeleted(reel.id);
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black"
      data-testid={`reels-feed-item-${reel.id}`}
    >
      <video
        ref={videoRef}
        src={reel.video_url}
        poster={reel.thumbnail_url || undefined}
        loop
        muted={muted}
        playsInline
        onClick={togglePlay}
        className="h-full w-full object-contain"
        data-testid={`reels-feed-player-${reel.id}`}
      />

      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/40 p-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      )}

      {/* Top-right mute + owner controls */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <button
          onClick={onToggleMute}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          data-testid={`reels-feed-mute-${reel.id}`}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        {canManage && (
          <>
            <button
              onClick={onEdit}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              data-testid={`reels-feed-edit-${reel.id}`}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={handleDelete}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-red-500/80"
              data-testid={`reels-feed-delete-${reel.id}`}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {/* Right action rail */}
      <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-5">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1" data-testid={`reels-feed-like-${reel.id}`}>
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${liked ? "bg-primary" : "bg-white/15"}`}>
            <Heart size={24} className={liked ? "fill-white text-white" : "text-white"} />
          </span>
          <span className="text-xs font-bold text-white">{formatNumber(likes)}</span>
        </button>
        <button onClick={onOpenComments} className="flex flex-col items-center gap-1" data-testid={`reels-feed-comment-${reel.id}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
            <MessageCircle size={24} className="text-white" />
          </span>
          <span className="text-xs font-bold text-white">{formatNumber(reel.comments_count)}</span>
        </button>
      </div>

      {/* Bottom author + caption */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-16">
        {reel.author && (
          <Link to={userPath(reel.author)} className="flex items-center gap-2">
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
  );
}

function CommentsModal({ reel, user, onClose, onPosted, onRemoved }) {
  const navigate = useNavigate();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api
      .get(`/posts/${reel.id}/comments`)
      .then(setComments)
      .catch(() => setComments([]));
  }, [reel.id]);

  const removeComment = async (c) => {
    if (!window.confirm("Delete this comment?")) return;
    const prev = comments || [];
    setComments(prev.filter((x) => x.id !== c.id));
    try {
      await api.del(`/posts/${reel.id}/comments/${c.id}`);
      onRemoved?.();
    } catch (e) {
      setComments(prev);
      toast.error(e.message || "Failed to delete");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate("/login");
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      await api.post(`/posts/${reel.id}/comments`, { text: text.trim() });
      setText("");
      const rows = await api.get(`/posts/${reel.id}/comments`);
      setComments(rows);
      onPosted?.();
    } catch (err) {
      toast.error(err.message || "Failed to comment");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose} data-testid="reels-comments-modal">
      <div
        className="max-h-[70vh] w-full max-w-[460px] overflow-hidden rounded-t-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-bold">Comments</span>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[45vh] overflow-y-auto px-4 py-3">
          {comments === null ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Be the first.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="group flex items-start gap-2.5" data-testid={`reels-comment-${c.id}`}>
                  <Avatar src={c.avatar_url} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-semibold">{c.display_name || c.username}</span>
                      {c.is_verified && <BadgeCheck size={13} className="fill-primary text-background" />}
                      <span className="text-xs text-muted-foreground">· {timeAgo(c.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.text}</p>
                  </div>
                  {user && c.user_id === user.id && (
                    <button
                      type="button"
                      onClick={() => removeComment(c)}
                      title="Delete comment"
                      aria-label="Delete comment"
                      data-testid={`reels-comment-delete-${c.id}`}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={user ? "Add a comment…" : "Sign in to comment"}
            disabled={!user}
            data-testid="reels-comment-input"
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary/60 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={posting || !text.trim() || !user}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            data-testid="reels-comment-submit"
          >
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
