import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, BadgeCheck, Trash2, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { EditContentModal } from "@/components/EditContentModal";
import CommentThread from "@/components/CommentThread";
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

      <article className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 px-4 pt-4">
          {post.author && (
            <button onClick={() => navigate(userPath(post.author))}>
              <Avatar src={post.author.avatar_url} size={40} frame={frameOf(post.author)} />
            </button>
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

        {post.caption && <p className="px-4 pt-3 text-[15px] leading-relaxed">{post.caption}</p>}

        {post.image_url && (
          <img src={post.image_url} alt="" className="mt-3 max-h-[600px] w-full object-cover" />
        )}
        {post.video_url && !post.image_url && (
          <video src={post.video_url} controls poster={post.thumbnail_url || undefined} className="mt-3 max-h-[720px] w-full bg-black" />
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
