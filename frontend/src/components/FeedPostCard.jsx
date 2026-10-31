import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Trash2, Send, Pencil, Bookmark, Gamepad2, Users, UserMinus, Clock } from "lucide-react";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { EditContentModal } from "@/components/EditContentModal";
import CommentThread from "@/components/CommentThread";
import CollaboratorPicker from "@/components/CollaboratorPicker";
import { PostMediaGallery } from "@/components/PostMediaGallery";
import { FeaturedBadge, FeatureToggle } from "@/components/FeaturedControls";
import { timeAgo, formatNumber, userPath, frameOf } from "@/lib/format";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { shareUrl, origin } from "@/lib/share";
import { toast } from "sonner";

// Shared X-style timeline post card — used by the Home feed and the Profile Posts tab.
export function FeedPostCard({ post, onToggleLike, canManage, onDelete, onUpdated }) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [editing, setEditing] = useState(false);
  const [featured, setFeatured] = useState(!!post.featured);
  const [saved, setSaved] = useState(!!post.saved_by_me);
  const [reinviting, setReinviting] = useState(false);
  const isReel = post.type === "reel";
  const isCollab = post.is_collab && post.collaborator;
  const isPending = post.collab_status === "pending";
  const amOwner = user?.id === (post.owner_id || post.author?.id);
  const amCollaborator = user?.id === post.collaborator?.id;

  const collabAction = async (fn, okMsg) => {
    try { const fresh = await fn(); if (okMsg) toast.success(okMsg); onUpdated?.(fresh); }
    catch (e) { toast.error(e.message || "Something went wrong"); }
  };
  const detach = () => collabAction(() => api.post(`/posts/${post.id}/collab/detach`, {}),
    amOwner ? "Collaborator removed" : "You were removed from this post");
  const publishSolo = () => collabAction(() => api.post(`/collab/posts/${post.id}/publish-solo`, {}), "Published as a solo post");
  const cancelInvite = () => collabAction(() => api.post(`/collab/posts/${post.id}/cancel`, {}), "Invite cancelled");
  const reinvite = (u) => { setReinviting(false); collabAction(() => api.post(`/collab/posts/${post.id}/reinvite`, { collaborator_id: u.id }), `Invite sent to @${u.username}`); };

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
      <div className="flex items-start gap-3 px-4 pt-4">
        {isCollab ? (
          <div className="flex flex-shrink-0 items-center" data-testid={`post-collab-avatars-${post.id}`}>
            <Link to={userPath(post.author)} className="relative z-10">
              <Avatar src={post.author?.avatar_url} size={40} ring frame={frameOf(post.author)} live={post.author?.is_live} />
            </Link>
            <Link to={userPath(post.collaborator)} className="-ml-3">
              <Avatar src={post.collaborator?.avatar_url} size={40} ring frame={frameOf(post.collaborator)} live={post.collaborator?.is_live} />
            </Link>
          </div>
        ) : post.author ? (
          <Link to={userPath(post.author)} className="flex-shrink-0">
            <Avatar src={post.author.avatar_url} size={40} ring frame={frameOf(post.author)} live={post.author?.is_live} />
          </Link>
        ) : (
          <Avatar size={40} ring />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-1.5 overflow-hidden">
            <Link to={userPath(post.author)} className="min-w-0 truncate hover:underline"><UsernameLine user={post.author} className="text-sm" /></Link>
            {isCollab ? (
              <>
                <span className="flex-shrink-0 text-sm text-muted-foreground">&amp;</span>
                <Link to={userPath(post.collaborator)} className="min-w-0 truncate hover:underline"><UsernameLine user={post.collaborator} className="text-sm" /></Link>
              </>
            ) : post.author?.is_streamer ? (
              <span className="pmp-streamer flex-shrink-0" data-testid={`post-streamer-${post.id}`}>
                <Gamepad2 size={9} /> Streamer
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {isCollab && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary" data-testid={`post-collab-pill-${post.id}`}>
                <Users size={10} /> Collab
              </span>
            )}
            <span className="truncate">@{post.author?.username}{isCollab ? ` · @${post.collaborator?.username}` : ""} · {timeAgo(post.created_at)}</span>
            {post.game_tag && (
              <Link
                to={`/discover?q=${encodeURIComponent("#" + post.game_tag)}`}
                className="flex-shrink-0 font-semibold text-primary/90 transition-colors hover:text-primary"
                onClick={(e) => e.stopPropagation()}
                data-testid={`post-tag-${post.id}`}
              >
                #{post.game_tag}
              </Link>
            )}
            <FeaturedBadge show={featured} />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <FeatureToggle type={post.type === "reel" ? "reel" : "post"} id={post.id} featured={featured} onChange={setFeatured} />
          {isCollab && !isPending && (amOwner || amCollaborator) && (
            <button
              onClick={detach}
              title={amOwner ? "Remove collaborator" : "Remove myself from this post"}
              aria-label="Remove collaboration"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid={`post-collab-detach-${post.id}`}
            >
              <UserMinus size={16} />
            </button>
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
      </div>

      {isPending && amOwner && (
        <div className="mx-4 mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid={`post-pending-${post.id}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Clock size={15} />
            {post.collaborator
              ? `Waiting for @${post.collaborator.username} to accept your collab invite`
              : post.collab_declined
                ? "Your collaborator declined — publish solo, invite someone else, or delete"
                : "Invite cancelled — publish solo, invite someone else, or delete"}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button onClick={publishSolo} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" data-testid={`post-publish-solo-${post.id}`}>Publish solo</button>
            {post.collaborator
              ? <button onClick={cancelInvite} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold" data-testid={`post-cancel-invite-${post.id}`}>Cancel invite</button>
              : <button onClick={() => setReinviting((v) => !v)} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold" data-testid={`post-reinvite-${post.id}`}>Invite someone</button>}
            <button onClick={onDelete} className="rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive" data-testid={`post-pending-delete-${post.id}`}>Delete</button>
          </div>
          {reinviting && (
            <CollaboratorPicker excludeId={user?.id} onClose={() => setReinviting(false)} onSelect={reinvite} />
          )}
        </div>
      )}
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
          playsInline
          preload="metadata"
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
