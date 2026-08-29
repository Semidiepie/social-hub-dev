import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo, formatNumber } from "@/lib/format";
import { toast } from "sonner";

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
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {items.map((p) => (
            <PostCard key={p.id} post={p} onToggleLike={() => toggleLike(p)} />
          ))}
        </div>
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

function PostCard({ post, onToggleLike }) {
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
        <button className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <MessageCircle size={18} />
          {formatNumber(post.comments_count)}
        </button>
      </footer>
    </article>
  );
}
