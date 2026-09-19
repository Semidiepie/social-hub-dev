import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, BadgeCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo, formatNumber } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get(`/posts/${id}`),
        api.get(`/posts/${id}/comments`).catch(() => []),
      ]);
      setPost(p);
      setComments(c);
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

  const postComment = async (e) => {
    e.preventDefault();
    if (!user) return navigate("/login");
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      await api.post(`/posts/${id}/comments`, { text: commentText.trim() });
      setCommentText("");
      const c = await api.get(`/posts/${id}/comments`);
      setComments(c);
      setPost((p) => ({ ...p, comments_count: p.comments_count + 1 }));
    } catch (err) {
      toast.error(err.message || "Failed");
    } finally {
      setPosting(false);
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
            <button onClick={() => navigate(`/user/${post.author.id}`)}>
              <Avatar src={post.author.avatar_url} size={40} />
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
            <button
              onClick={handleDelete}
              title="Delete post"
              aria-label="Delete post"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid="post-detail-delete"
            >
              <Trash2 size={18} />
            </button>
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
        <h2 className="text-lg font-black">Comments · {comments.length}</h2>
        <form onSubmit={postComment} className="mt-3 flex items-center gap-2">
          {user && <Avatar src={user.avatar_url} size={36} />}
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={user ? "Add a comment…" : "Sign in to comment"}
            disabled={!user}
            data-testid="post-detail-comment-input"
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary/60"
          />
          <button
            type="submit"
            disabled={posting || !commentText.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            data-testid="post-detail-comment-submit"
          >
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>

        <div className="mt-6 space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3" data-testid={`post-detail-comment-${c.id}`}>
              <Avatar src={c.author?.avatar_url || c.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-semibold">{c.author?.display_name || c.display_name || c.author?.username}</span>
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
      </section>
    </div>
  );
}
