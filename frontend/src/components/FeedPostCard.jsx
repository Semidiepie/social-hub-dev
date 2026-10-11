import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Trash2, Send, Pencil, Bookmark, Gamepad2 } from "lucide-react";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { EditContentModal } from "@/components/EditContentModal";
import CommentThread from "@/components/CommentThread";
import { PostMediaGallery } from "@/components/PostMediaGallery";
import { FeaturedBadge, FeatureToggle } from "@/components/FeaturedControls";
import { timeAgo, formatNumber, userPath, frameOf } from "@/lib/format";
import { api } from "@/lib/api";
import { shareUrl, origin } from "@/lib/share";
import { toast } from "sonner";

// Shared X-style timeline post card — used by the Home feed and the Profile Posts tab.
export function FeedPostCard({ post, onToggleLike, canManage, onDelete, onUpdated }) {
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [editing, setEditing] = useState(false);
  const [featured, setFeatured] = useState(!!post.featured);
  const [saved, setSaved] = useState(!!post.saved_by_me);
  const isReel = post.type === "reel";

  const onShare = () =>
    shareUrl(
      `${origin()}/api/share/${isReel ? "reel" : "post"}/${post.id}`,
      post.caption || "Check this out on PostMePlex",
      "Link copied!"
    );

  const onBookmark = async () => {
    const next = !saved;
    setSaved(next);
    try {
      const r = await api.post("/bookmarks/toggle", { kind: post.type || "post", item_id: post.id });
      setSaved(r.saved);
      toast.success(r.saved ? "Saved" : "Removed from saved");
    } catch {
      setSaved(!next);
      toast.error("Couldn't update saved");
    }
  };
  return (
    <article className="bg-transparent pb-2" data-testid={`post-${post.id}`}>
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

      {(post.image_urls?.length || post.image_url) && (
        <div className="relative mx-2 mt-2">
          <PostMediaGallery images={post.image_urls?.length ? post.image_urls : [post.image_url]} />
          <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 flex gap-1.5">
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
        <button onClick={onShare} className="pmp-iconchip" title="Share" aria-label="Share" data-testid={`post-share-${post.id}`}>
          <Send size={16} />
        </button>
        <div className="flex-1" />
        <button
          onClick={onBookmark}
          className={`pmp-iconchip ${saved ? "text-primary" : ""}`}
          title="Save"
          aria-label="Save"
          data-testid={`post-bookmark-${post.id}`}
        >
          <Bookmark size={16} className={saved ? "fill-primary" : ""} />
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

      <EditContentModal item={post} open={editing} onClose={() => setEditing(false)} onSaved={onUpdated} />
    </article>
  );
}
