import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Loader2, Play, Eye, Trash2, Send, BadgeCheck, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { PostComposer } from "@/components/PostComposer";
import { EditContentModal } from "@/components/EditContentModal";
import { timeAgo, formatNumber } from "@/lib/format";
import { toast } from "sonner";

function formatDuration(secs) {
  if (!secs && secs !== 0) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function HomePage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get("/feed");
      setItems(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async (post) => {
    const liked = post.liked_by_me;
    // optimistic
    setItems((rows) =>
      rows.map((r) =>
        r.id === post.id
          ? { ...r, liked_by_me: !liked, likes: r.likes + (liked ? -1 : 1) }
          : r,
      ),
    );
    try {
      if (liked) await api.del(`/posts/${post.id}/like`);
      else await api.post(`/posts/${post.id}/like`);
    } catch (e) {
      setItems((rows) =>
        rows.map((r) =>
          r.id === post.id ? { ...r, liked_by_me: liked, likes: post.likes } : r,
        ),
      );
      toast.error(e.message || "Failed");
    }
  };

  const deletePost = async (post) => {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    const prev = items;
    setItems((rows) => rows.filter((r) => r.id !== post.id));
    try {
      if (post.type === "video") await api.del(`/videos/${post.id}`);
      else await api.del(`/posts/${post.id}`);
      toast.success("Post deleted");
    } catch (e) {
      setItems(prev);
      toast.error(e.message || "Failed to delete");
    }
  };

  const onUpdated = (updated) =>
    setItems((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">
          Welcome{user ? `, ${user.display_name}` : ""}
        </h1>
        <p className="text-muted-foreground">Fresh from your community.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <PostComposer onPosted={(created) => setItems((rows) => [created, ...rows])} />
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {items.map((p) =>
                p.type === "video" ? (
                  <VideoCard
                    key={p.id}
                    video={p}
                    canManage={user?.id && user.id === p.author?.id}
                    onDelete={() => deletePost(p)}
                    onUpdated={onUpdated}
                  />
                ) : p.type === "reel" ? (
                  <ReelCard
                    key={p.id}
                    reel={p}
                    canManage={user?.id && user.id === p.author?.id}
                    onDelete={() => deletePost(p)}
                    onUpdated={onUpdated}
                  />
                ) : (
                  <PostCard
                    key={p.id}
                    post={p}
                    user={user}
                    onToggleLike={() => toggleLike(p)}
                    canManage={user?.id && user.id === p.author?.id}
                    onDelete={() => deletePost(p)}
                    onUpdated={onUpdated}
                  />
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Heart className="text-primary" size={28} />
      </div>
      <h3 className="text-xl font-bold">Your feed is empty</h3>
      <p className="mt-1 text-muted-foreground">
        Follow creators from the Discover page to see their latest posts here.
      </p>
      <Link to="/discover">
        <Button className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90">
          Explore Discover
        </Button>
      </Link>
    </div>
  );
}

function PostCard({ post, user, onToggleLike, canManage, onDelete, onUpdated }) {
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [editing, setEditing] = useState(false);
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border bg-card"
      data-testid={`post-${post.id}`}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        {post.author ? (
          <Link to={`/user/${post.author.id}`}>
            <Avatar src={post.author.avatar_url} size={40} />
          </Link>
        ) : (
          <Avatar size={40} />
        )}
        <div className="min-w-0 flex-1">
          <UsernameLine user={post.author} className="text-sm" />
          <div className="text-xs text-muted-foreground">
            @{post.author?.username} · {timeAgo(post.created_at)}
          </div>
        </div>
        {post.game_tag && (
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            #{post.game_tag}
          </span>
        )}
        {canManage && (
          <>
            <button
              onClick={() => setEditing(true)}
              title="Edit post"
              aria-label="Edit post"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              data-testid={`post-edit-${post.id}`}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={onDelete}
              title="Delete post"
              aria-label="Delete post"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid={`post-delete-${post.id}`}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {post.caption && (
        <p className="px-4 pt-3 text-[15px] leading-relaxed">{post.caption}</p>
      )}

      {post.image_url && (
        <img
          src={post.image_url}
          alt=""
          className="mt-3 max-h-[600px] w-full object-cover"
        />
      )}
      {post.video_url && !post.image_url && (
        <video
          src={post.video_url}
          controls
          poster={post.thumbnail_url || undefined}
          className="mt-3 max-h-[720px] w-full bg-black"
        />
      )}

      <footer className="flex items-center gap-5 px-4 py-3">
        <button
          onClick={onToggleLike}
          className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors ${
            post.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`post-like-${post.id}`}
        >
          <Heart size={18} className={post.liked_by_me ? "fill-primary" : ""} />
          {formatNumber(post.likes)}
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors ${
            showComments ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`post-comment-toggle-${post.id}`}
        >
          <MessageCircle size={18} />
          {formatNumber(commentsCount)}
        </button>
      </footer>

      {showComments && (
        <PostComments
          postId={post.id}
          user={user}
          onCountChange={setCommentsCount}
        />
      )}

      <EditContentModal
        item={post}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={onUpdated}
      />
    </article>
  );
}

function PostComments({ postId, user, onCountChange }) {
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(`/posts/${postId}/comments`)
      .then((rows) => {
        if (active) setComments(rows);
      })
      .catch(() => {
        if (active) setComments([]);
      });
    return () => {
      active = false;
    };
  }, [postId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user || !text.trim() || posting) return;
    setPosting(true);
    try {
      await api.post(`/posts/${postId}/comments`, { text: text.trim() });
      setText("");
      const rows = await api.get(`/posts/${postId}/comments`);
      setComments(rows);
      onCountChange(rows.length);
    } catch (err) {
      toast.error(err.message || "Failed to comment");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="border-t border-border px-4 py-3" data-testid={`post-comments-${postId}`}>
      <form onSubmit={submit} className="flex items-center gap-2">
        {user && <Avatar src={user.avatar_url} size={32} />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? "Add a comment…" : "Sign in to comment"}
          disabled={!user}
          data-testid={`post-comment-input-${postId}`}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={posting || !text.trim() || !user}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          data-testid={`post-comment-submit-${postId}`}
        >
          {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>

      {comments === null ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No comments yet. Be the first to comment.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5" data-testid={`post-comment-${c.id}`}>
              <Avatar src={c.author?.avatar_url || c.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-semibold">
                    {c.author?.display_name || c.display_name || c.author?.username}
                  </span>
                  {(c.is_verified || c.author?.is_verified) && (
                    <BadgeCheck size={13} className="shrink-0 fill-primary text-background" />
                  )}
                  <span className="text-xs text-muted-foreground">· {timeAgo(c.created_at)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/95">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function VideoCard({ video, canManage, onDelete, onUpdated }) {
  const duration = formatDuration(video.duration);
  const [editing, setEditing] = useState(false);
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border bg-card"
      data-testid={`feed-video-${video.id}`}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        {video.author ? (
          <Link to={`/user/${video.author.id}`}>
            <Avatar src={video.author.avatar_url} size={40} />
          </Link>
        ) : (
          <Avatar size={40} />
        )}
        <div className="min-w-0 flex-1">
          <UsernameLine user={video.author} className="text-sm" />
          <div className="text-xs text-muted-foreground">
            @{video.author?.username} · {timeAgo(video.created_at)}
          </div>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
          Video
        </span>
        {canManage && (
          <>
            <button
              onClick={() => setEditing(true)}
              title="Edit video"
              aria-label="Edit video"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              data-testid={`feed-video-edit-${video.id}`}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={onDelete}
              title="Delete video"
              aria-label="Delete video"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid={`feed-video-delete-${video.id}`}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {video.title && (
        <p className="px-4 pt-3 text-[15px] font-semibold leading-snug">{video.title}</p>
      )}

      <Link
        to={`/videos/${video.id}`}
        className="group relative mt-3 block aspect-video w-full overflow-hidden bg-black"
        data-testid={`feed-video-thumb-${video.id}`}
      >
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary">
            <Play className="text-muted-foreground" size={40} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 shadow-lg">
            <Play className="ml-0.5 fill-white text-white" size={26} />
          </span>
        </div>
        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
            {duration}
          </span>
        )}
      </Link>

      <footer className="flex items-center gap-5 px-4 py-3 text-sm font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Eye size={18} />
          {formatNumber(video.views)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart size={18} className={video.liked_by_me ? "fill-primary text-primary" : ""} />
          {formatNumber(video.likes)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle size={18} />
          {formatNumber(video.comments_count)}
        </span>
      </footer>

      <EditContentModal
        item={video}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={onUpdated}
      />
    </article>
  );
}

function ReelCard({ reel, canManage, onDelete, onUpdated }) {
  const [editing, setEditing] = useState(false);
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border bg-card"
      data-testid={`feed-reel-${reel.id}`}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        {reel.author ? (
          <Link to={`/user/${reel.author.id}`}>
            <Avatar src={reel.author.avatar_url} size={40} />
          </Link>
        ) : (
          <Avatar size={40} />
        )}
        <div className="min-w-0 flex-1">
          <UsernameLine user={reel.author} className="text-sm" />
          <div className="text-xs text-muted-foreground">
            @{reel.author?.username} · {timeAgo(reel.created_at)}
          </div>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
          Reel
        </span>
        {canManage && (
          <>
            <button
              onClick={() => setEditing(true)}
              title="Edit reel"
              aria-label="Edit reel"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              data-testid={`feed-reel-edit-${reel.id}`}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={onDelete}
              title="Delete reel"
              aria-label="Delete reel"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid={`feed-reel-delete-${reel.id}`}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {reel.caption && (
        <p className="px-4 pt-3 text-[15px] leading-relaxed">{reel.caption}</p>
      )}

      <Link
        to={`/reels/${reel.id}`}
        className="group relative mx-auto mt-3 block aspect-[9/16] w-full max-w-[340px] overflow-hidden bg-black"
        data-testid={`feed-reel-thumb-${reel.id}`}
      >
        {reel.thumbnail_url ? (
          <img
            src={reel.thumbnail_url}
            alt={reel.caption || "Reel"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : reel.video_url ? (
          <video
            src={reel.video_url}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary">
            <Play className="text-muted-foreground" size={40} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 shadow-lg">
            <Play className="ml-0.5 fill-white text-white" size={26} />
          </span>
        </div>
      </Link>

      <footer className="flex items-center gap-5 px-4 py-3 text-sm font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Eye size={18} />
          {formatNumber(reel.views)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart size={18} className={reel.liked_by_me ? "fill-primary text-primary" : ""} />
          {formatNumber(reel.likes)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle size={18} />
          {formatNumber(reel.comments_count)}
        </span>
      </footer>

      <EditContentModal
        item={reel}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={onUpdated}
      />
    </article>
  );
}
