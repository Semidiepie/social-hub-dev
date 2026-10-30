import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, BadgeCheck, Trash2, Pencil, Users, UserMinus, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { EditContentModal } from "@/components/EditContentModal";
import CommentThread from "@/components/CommentThread";
import CollaboratorPicker from "@/components/CollaboratorPicker";
import { PostMediaGallery } from "@/components/PostMediaGallery";
import { timeAgo, formatNumber, userPath, badgeCls, frameOf } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [reinviting, setReinviting] = useState(false);

  const isCollab = post?.is_collab && post?.collaborator;
  const isPending = post?.collab_status === "pending";
  const amOwner = user?.id === (post?.owner_id || post?.author?.id);
  const amCollaborator = user?.id === post?.collaborator?.id;

  const collabAction = async (fn, okMsg) => {
    try { const fresh = await fn(); if (okMsg) toast.success(okMsg); setPost((p) => ({ ...p, ...fresh })); }
    catch (e) { toast.error(e.message || "Something went wrong"); }
  };
  const detach = () => collabAction(() => api.post(`/posts/${id}/collab/detach`, {}),
    amOwner ? "Collaborator removed" : "You were removed from this post");
  const publishSolo = () => collabAction(() => api.post(`/collab/posts/${id}/publish-solo`, {}), "Published as a solo post");
  const cancelInvite = () => collabAction(() => api.post(`/collab/posts/${id}/cancel`, {}), "Invite cancelled");
  const reinvite = (u) => { setReinviting(false); collabAction(() => api.post(`/collab/posts/${id}/reinvite`, { collaborator_id: u.id }), `Invite sent to @${u.username}`); };

  const load = useCallback(async () => {
    try {
      const p = await api.get(`/posts/${id}`);
      setPost(p);
    } catch (e) {
      toast.error(e.message || "Post not found");
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async () => {
    if (!user) return navigate("/login");
    const liked = post.liked_by_me;
    setPost((p) => ({ ...p, liked_by_me: !liked, likes: p.likes + (liked ? -1 : 1) }));
    try {
      const resp = liked ? await api.del(`/posts/${id}/like`) : await api.post(`/posts/${id}/like`);
      setPost((p) => ({ ...p, likes: resp.likes ?? p.likes }));
    } catch (e) {
      setPost((p) => ({ ...p, liked_by_me: liked, likes: p.likes + (liked ? 1 : -1) }));
      toast.error(e.message || "Failed");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    try {
      await api.del(`/posts/${id}`);
      toast.success("Post deleted");
      navigate(-1);
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!post) return null;

  return (
    <div className="mx-auto max-w-2xl" data-testid={`post-detail-${post.id}`}>
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/70"
        data-testid="post-detail-back"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <article className="border-b border-border pb-2" data-testid="post-detail-article">
        <div className="flex items-center gap-3 px-4 pt-4">
          {isCollab ? (
            <div className="flex items-center" data-testid={`post-detail-collab-avatars`}>
              <button onClick={() => navigate(userPath(post.author))} className="relative z-10">
                <Avatar src={post.author?.avatar_url} size={40} frame={frameOf(post.author)} />
              </button>
              <button onClick={() => navigate(userPath(post.collaborator))} className="-ml-3">
                <Avatar src={post.collaborator?.avatar_url} size={40} frame={frameOf(post.collaborator)} />
              </button>
            </div>
          ) : post.author && (
            <button onClick={() => navigate(userPath(post.author))}>
              <Avatar src={post.author.avatar_url} size={40} frame={frameOf(post.author)} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <UsernameLine user={post.author} className="text-sm" />
              {isCollab && (
                <>
                  <span className="text-sm text-muted-foreground">and</span>
                  <UsernameLine user={post.collaborator} className="text-sm" />
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary" data-testid="post-detail-collab-pill">
                    <Users size={10} /> Collab
                  </span>
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              @{post.author?.username}{isCollab ? ` · @${post.collaborator?.username}` : ""} · {timeAgo(post.created_at)}
            </div>
          </div>
          {post.game_tag && (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              #{post.game_tag}
            </span>
          )}
          {isCollab && !isPending && (amOwner || amCollaborator) && (
            <button
              onClick={detach}
              title={amOwner ? "Remove collaborator" : "Remove myself from this post"}
              aria-label="Remove collaboration"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid="post-detail-collab-detach"
            >
              <UserMinus size={18} />
            </button>
          )}
          {user?.id && post.author?.id === user.id && (
            <>
              <button
                onClick={() => setEditing(true)}
                title="Edit post"
                aria-label="Edit post"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                data-testid="post-detail-edit"
              >
                <Pencil size={18} />
              </button>
              <button
                onClick={handleDelete}
                title="Delete post"
                aria-label="Delete post"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                data-testid="post-detail-delete"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>

        {isPending && amOwner && (
          <div className="mx-4 mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="post-detail-pending">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Clock size={15} />
              {post.collaborator
                ? `Waiting for @${post.collaborator.username} to accept your collab invite`
                : post.collab_declined
                  ? "Your collaborator declined — publish solo, invite someone else, or delete"
                  : "Invite cancelled — publish solo, invite someone else, or delete"}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button onClick={publishSolo} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" data-testid="post-detail-publish-solo">Publish solo</button>
              {post.collaborator
                ? <button onClick={cancelInvite} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold" data-testid="post-detail-cancel-invite">Cancel invite</button>
                : <button onClick={() => setReinviting((v) => !v)} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold" data-testid="post-detail-reinvite">Invite someone</button>}
              <button onClick={handleDelete} className="rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive" data-testid="post-detail-pending-delete">Delete</button>
            </div>
            {reinviting && (
              <CollaboratorPicker excludeId={user?.id} onClose={() => setReinviting(false)} onSelect={reinvite} />
            )}
          </div>
        )}

        {post.caption && <p className="px-4 pt-3 text-[15px] leading-relaxed">{post.caption}</p>}

        {(post.image_urls?.length || post.image_url) && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-border">
            <PostMediaGallery images={post.image_urls?.length ? post.image_urls : [post.image_url]} rounded={false} />
          </div>
        )}
        {post.video_url && !post.image_url && (
          <video src={post.video_url} controls poster={post.thumbnail_url || undefined} className="mt-3 max-h-[720px] w-full rounded-2xl border border-border bg-black" />
        )}

        <footer className="flex items-center gap-5 px-4 py-3">
          <button
            onClick={toggleLike}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors ${
              post.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="post-detail-like"
          >
            <Heart size={18} className={post.liked_by_me ? "fill-primary" : ""} />
            {formatNumber(post.likes)}
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <MessageCircle size={18} />
            {formatNumber(post.comments_count)}
          </span>
        </footer>
      </article>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-black">Comments · {formatNumber(post.comments_count)}</h2>
        <CommentThread
          type="post"
          id={id}
          onCountChange={(d) => setPost((p) => (p ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) + d) } : p))}
        />
      </section>

      <EditContentModal
        item={post}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(updated) => setPost((p) => ({ ...p, ...updated }))}
      />
    </div>
  );
}
