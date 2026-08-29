import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Heart, Clock, Eye, ArrowLeft, Loader2, BadgeCheck, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo, formatNumber } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function BlogReadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const b = await api.get(`/blogs/${id}`);
      setBlog(b);
    } catch (e) {
      toast.error(e.message || "Blog not found");
      navigate("/blogs");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async () => {
    if (!user) return navigate("/login");
    const prev = { liked_by_me: blog.liked_by_me, likes: blog.likes };
    setBlog((b) => ({ ...b, liked_by_me: !b.liked_by_me, likes: b.likes + (b.liked_by_me ? -1 : 1) }));
    try {
      const resp = await api.post(`/blogs/${id}/like`);
      setBlog((b) => ({ ...b, liked_by_me: resp.liked, likes: resp.likes }));
    } catch (e) {
      setBlog((b) => ({ ...b, ...prev }));
      toast.error(e.message || "Failed");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!blog) return null;

  const isAuthor = user && blog.author && user.id === blog.author.id;

  return (
    <article className="mx-auto max-w-3xl" data-testid={`blog-read-${blog.id}`}>
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back
        </button>
        {isAuthor && (
          <Link to={`/blogs/${blog.id}/edit`}>
            <Button variant="outline" size="sm" className="gap-2" data-testid="blog-edit-btn">
              <Pencil size={14} /> Edit
            </Button>
          </Link>
        )}
      </div>

      <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
        {blog.title}
      </h1>
      {blog.subtitle && (
        <p className="mt-3 text-xl text-muted-foreground">{blog.subtitle}</p>
      )}

      {blog.author && (
        <div className="mt-6 flex items-center gap-3 border-y border-border py-4">
          <Link to={`/user/${blog.author.id}`}>
            <Avatar src={blog.author.avatar_url} size={44} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link to={`/user/${blog.author.id}`} className="font-semibold hover:text-primary">
                {blog.author.display_name}
              </Link>
              {blog.author.is_verified && <BadgeCheck size={16} className="fill-primary text-background" />}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              @{blog.author.username} · {timeAgo(blog.published_at || blog.created_at)}
              <span className="mx-2">·</span>
              <span className="inline-flex items-center gap-1"><Clock size={11} /> {blog.reading_time || 1} min read</span>
              <span className="mx-2">·</span>
              <span className="inline-flex items-center gap-1"><Eye size={11} /> {formatNumber(blog.views)}</span>
            </div>
          </div>
        </div>
      )}

      {blog.cover_url && (
        <img
          src={blog.cover_url}
          alt=""
          className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover"
        />
      )}

      <div className="prose-postme mt-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{blog.body_md || ""}</ReactMarkdown>
      </div>

      {blog.tags?.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-2">
          {blog.tags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-10 flex items-center gap-3 border-t border-border pt-6">
        <Button
          onClick={toggleLike}
          data-testid="blog-like-btn"
          className={`gap-2 ${
            blog.liked_by_me
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-secondary text-foreground hover:bg-secondary/70"
          }`}
        >
          <Heart size={18} className={blog.liked_by_me ? "fill-current" : ""} />
          {formatNumber(blog.likes)} {blog.liked_by_me ? "liked" : "like"}
        </Button>
      </div>
    </article>
  );
}
