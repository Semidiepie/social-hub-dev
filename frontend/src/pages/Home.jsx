import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Loader2, Play, Eye, Trash2, Send, BadgeCheck, Pencil, Bookmark, Gamepad2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { PostComposer } from "@/components/PostComposer";
// StoryBar import removed while stories are hidden
import { EditContentModal } from "@/components/EditContentModal";
import CommentThread from "@/components/CommentThread";
import { FeaturedBadge, FeatureToggle } from "@/components/FeaturedControls";
import { timeAgo, formatNumber, userPath, videoPath, badgeCls, badgeStyle, frameOf } from "@/lib/format";
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
  const [tab, setTab] = useState("for-you");

  const load = useCallback(async (which) => {
    setLoading(true);
    try {
      const rows = await api.get(which === "following" ? "/feed?following=1" : "/feed");
      setItems(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [load, tab]);

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
    <div className="mx-auto max-w-[620px]">
      <div className="relative z-20 -mt-4 mb-4 border-b border-border bg-background/80 backdrop-blur md:sticky md:top-0 md:-mt-6">
        <div className="flex">
          {[["for-you", "For you"], ["following", "Following"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`feed-tab-${key}`}
              className="relative flex-1 py-4 text-sm font-bold transition-colors hover:bg-secondary/40"
            >
              <span className={tab === key ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              {tab === key && (
                <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Stories temporarily hidden — re-enable by restoring <StoryBar /> */}
          <PostComposer onPosted={(created) => setItems((rows) => [created, ...rows])} />
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-border border-t border-border">
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
  const [featured, setFeatured] = useState(!!post.featured);
  return (
    <article
      className="bg-transparent pb-2"
      data-testid={`post-${post.id}`}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        {post.author ? (
          <Link to={userPath(post.author)}>
            <Avatar src={post.author.avatar_url} size={40} ring frame={frameOf(post.author)} live={post.author?.is_live} />
          </Link>
        ) : (
          <Avatar size={40} ring />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <UsernameLine user={post.author} className="text-sm" />
            {post.author?.is_streamer && (
              <span className="pmp-streamer" data-testid={`post-streamer-${post.id}`}>
                <Gamepad2 size={9} /> Streamer
              </span>
            )}
            <FeaturedBadge show={featured} />
          </div>
          <div className="text-xs text-muted-foreground">
            @{post.author?.username} · {timeAgo(post.created_at)}
          </div>
        </div>
        <FeatureToggle type={post.type === "reel" ? "reel" : "post"} id={post.id} featured={featured} onChange={setFeatured} />
        {post.game_tag && (
          <span className="pmp-kind" style={{ textTransform: "none" }}>
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

      {post.image_url && (
        <div className="relative mx-2 mt-2 overflow-hidden rounded-2xl bg-secondary/40">
          <img src={post.image_url} alt="" className="max-h-[600px] w-full object-cover" />
          <div className="pointer-events-none absolute right-2.5 top-2.5 flex gap-1.5">
            <span className="pmp-statchip"><Heart size={11} className="fill-primary text-primary" /> {formatNumber(post.likes)}</span>
            {commentsCount > 0 && (
              <span className="pmp-statchip"><MessageCircle size={11} /> {formatNumber(commentsCount)}</span>
            )}
          </div>
        </div>
      )}
      {post.video_url && !post.image_url && (
        <video
          src={post.video_url}
          controls
          poster={post.thumbnail_url || undefined}
          className="mx-2 mt-2 max-h-[720px] w-[calc(100%-1rem)] rounded-2xl bg-black"
        />
      )}

      <footer className="flex items-center gap-2 px-4 pb-1 pt-3">
        <button
          onClick={onToggleLike}
          className={`pmp-chip ${post.liked_by_me ? "pmp-chip-active" : ""}`}
          data-testid={`post-like-${post.id}`}
        >
          <Heart size={16} className={post.liked_by_me ? "fill-white" : ""} />
          {formatNumber(post.likes)}
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className={`pmp-chip ${showComments ? "pmp-chip-active" : ""}`}
          data-testid={`post-comment-toggle-${post.id}`}
        >
          <MessageCircle size={16} />
          {formatNumber(commentsCount)}
        </button>
        <button className="pmp-iconchip" title="Share" aria-label="Share" data-testid={`post-share-${post.id}`}>
          <Send size={16} />
        </button>
        <div className="flex-1" />
        <button className="pmp-iconchip" title="Save" aria-label="Save" data-testid={`post-bookmark-${post.id}`}>
          <Bookmark size={16} />
        </button>
      </footer>

      {post.caption && (
        <div className="pmp-cap px-4 pb-3 pt-2">
          <span className="pmp-cap-bar" />
          <p className="text-[15px] leading-snug">{post.caption}</p>
        </div>
      )}

      {showComments && (
        <div className="border-t border-border px-4 py-3" data-testid={`post-comments-${post.id}`}>
          <CommentThread
            type="post"
            id={post.id}
            autoFocus
            onCountChange={(delta) => setCommentsCount((c) => Math.max(0, c + delta))}
          />
        </div>
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

function VideoCard({ video, canManage, onDelete, onUpdated }) {
  const duration = formatDuration(video.duration);
  const [editing, setEditing] = useState(false);
  const [featured, setFeatured] = useState(!!video.featured);
  return (
    <article
      className="bg-transparent pb-2"
      data-testid={`feed-video-${video.id}`}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        {video.author ? (
          <Link to={userPath(video.author)}>
            <Avatar src={video.author.avatar_url} size={40} frame={frameOf(video.author)} live={video.author?.is_live} />
          </Link>
        ) : (
          <Avatar size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <UsernameLine user={video.author} className="text-sm" />
            <FeaturedBadge show={featured} />
          </div>
          <div className="text-xs text-muted-foreground">
            @{video.author?.username} · {timeAgo(video.created_at)}
          </div>
        </div>
        <FeatureToggle type="video" id={video.id} featured={featured} onChange={setFeatured} />
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
        to={videoPath(video)}
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
  const [featured, setFeatured] = useState(!!reel.featured);
  return (
    <article
      className="bg-transparent pb-2"
      data-testid={`feed-reel-${reel.id}`}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        {reel.author ? (
          <Link to={userPath(reel.author)}>
            <Avatar src={reel.author.avatar_url} size={40} frame={frameOf(reel.author)} live={reel.author?.is_live} />
          </Link>
        ) : (
          <Avatar size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <UsernameLine user={reel.author} className="text-sm" />
            <FeaturedBadge show={featured} />
          </div>
          <div className="text-xs text-muted-foreground">
            @{reel.author?.username} · {timeAgo(reel.created_at)}
          </div>
        </div>
        <FeatureToggle type="reel" id={reel.id} featured={featured} onChange={setFeatured} />
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
