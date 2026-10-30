import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Heart, Clock, Eye, ArrowLeft, Loader2, BadgeCheck, Pencil, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { shareUrl, origin } from "@/lib/share";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo, formatNumber, userPath, badgeCls, badgeStyle } from "@/lib/format";
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

  // SEO: per-article head tags + NewsArticle structured data (official authors).
  // Managed imperatively (not via Helmet) so it's deterministic in dev + prod.
  useEffect(() => {
    if (!blog) return undefined;
    const origin = window.location.origin;
    const canonical = `${origin}/blogs/${blog.id}`;
    const plain = (blog.body_md || "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_`~\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const desc = (blog.subtitle || plain || blog.title || "PostMePlex blog").slice(0, 200);
    const image = blog.cover_url || `${origin}/logo-512.png`;
    const published = blog.published_at || blog.created_at;

    const changes = [];
    const upsertMeta = (attr, key, content) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      changes.push({ el, prev: created ? null : el.getAttribute("content"), created });
      el.setAttribute("content", content);
    };

    const prevTitle = document.title;
    document.title = `${blog.title} — PostMePlex`;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:type", "article");
    upsertMeta("property", "og:title", blog.title);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:image", image);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", blog.title);
    upsertMeta("name", "twitter:description", desc);
    upsertMeta("name", "twitter:image", image);

    let canon = document.head.querySelector('link[rel="canonical"]');
    const canonCreated = !canon;
    const canonPrev = canon ? canon.getAttribute("href") : null;
    if (!canon) {
      canon = document.createElement("link");
      canon.setAttribute("rel", "canonical");
      document.head.appendChild(canon);
    }
    canon.setAttribute("href", canonical);

    let ld = null;
    if (blog.author?.is_official) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "blog-newsarticle-ld";
      ld.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: blog.title,
        description: desc,
        image: [image],
        datePublished: published,
        dateModified: blog.updated_at || published,
        author: {
          "@type": "Person",
          name: blog.author?.display_name || "PostMePlex",
          url: `${origin}${userPath(blog.author)}`,
        },
        publisher: {
          "@type": "Organization",
          name: "PostMePlex",
          logo: { "@type": "ImageObject", url: `${origin}/logo-512.png` },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      });
      document.head.appendChild(ld);
    }

    return () => {
      document.title = prevTitle;
      changes.forEach(({ el, prev, created }) => {
        if (created) el.remove();
        else if (prev !== null) el.setAttribute("content", prev);
      });
      if (canonCreated) canon.remove();
      else if (canonPrev !== null) canon.setAttribute("href", canonPrev);
      if (ld) ld.remove();
    };
  }, [blog]);

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
          <Link to={userPath(blog.author)}>
            <Avatar src={blog.author.avatar_url} size={44} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link to={userPath(blog.author)} className="font-semibold hover:text-primary">
                {blog.author.display_name}
              </Link>
              {blog.author.is_verified && <BadgeCheck size={16} className={badgeCls(blog.author)} style={badgeStyle(blog.author)} />}
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
        <Button
          variant="outline"
          onClick={() => shareUrl(`${origin()}/api/share/blog/${blog.id}`, blog.title, "Blog link copied!")}
          className="gap-2"
          data-testid="blog-share-btn"
        >
          <Share2 size={18} /> Share
        </Button>
      </div>
    </article>
  );
}
