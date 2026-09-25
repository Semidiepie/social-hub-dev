import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, PenSquare, Clock, Heart, Eye, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo, formatNumber, badgeCls } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function BlogsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [perm, setPerm] = useState(null); // { granted, pending }

  const load = useCallback(async () => {
    try {
      const [rows, permission] = await Promise.all([
        api.get("/blogs"),
        user ? api.get("/blogs/me/permission").catch(() => null) : Promise.resolve(null),
      ]);
      setItems(rows);
      setPerm(permission);
    } catch (e) {
      toast.error(e.message || "Failed to load blogs");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Blogs</h1>
          <p className="mt-1 text-muted-foreground">
            Long-form writing from PostMePlex creators.
          </p>
        </div>
        {user && perm?.granted ? (
          <Link to="/blogs/new">
            <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="blogs-write-btn">
              <PenSquare size={16} /> Write a blog
            </Button>
          </Link>
        ) : user ? (
          <Link to="/blogs/request">
            <Button variant="outline" className="gap-2" data-testid="blogs-request-btn">
              <PenSquare size={16} />
              {perm?.pending ? "Request pending" : "Request to publish"}
            </Button>
          </Link>
        ) : null}
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
          <h3 className="text-xl font-bold">No blogs yet</h3>
          <p className="mt-1 text-muted-foreground">
            Be the first published voice on PostMePlex.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {items.map((b) => (
            <BlogCard key={b.id} blog={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlogCard({ blog }) {
  return (
    <Link
      to={`/blogs/${blog.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
      data-testid={`blog-card-${blog.id}`}
    >
      {blog.cover_url && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-secondary">
          <img
            src={blog.cover_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-xl font-black leading-snug tracking-tight group-hover:text-primary">
          {blog.title}
        </h2>
        {blog.subtitle && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {blog.subtitle}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-5 text-xs text-muted-foreground">
          {blog.author && (
            <>
              <Avatar src={blog.author.avatar_url} size={24} />
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                {blog.author.display_name}
                {blog.author.is_verified && (
                  <BadgeCheck size={12} className={badgeCls(blog.author)} />
                )}
              </span>
              <span>·</span>
            </>
          )}
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {blog.reading_time || 1} min</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1"><Heart size={12} /> {formatNumber(blog.likes)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1"><Eye size={12} /> {formatNumber(blog.views)}</span>
          <span className="ml-auto">{timeAgo(blog.published_at || blog.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
