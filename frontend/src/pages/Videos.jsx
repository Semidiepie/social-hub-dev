import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload, Play, Eye, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, formatDuration, timeAgo } from "@/lib/format";
import { toast } from "sonner";

export default function VideosPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = q ? `/videos?q=${encodeURIComponent(q)}` : "/videos";
      const rows = await api.get(url);
      setItems(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const featured = useMemo(() => items[0], [items]);
  const rest = useMemo(() => items.slice(1), [items]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Videos</h1>
          <p className="mt-1 text-muted-foreground">Long-form uploads from creators.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, tags…"
            className="h-10 w-56"
            data-testid="videos-search-input"
          />
          <Link to="/videos/new">
            <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="videos-upload-btn">
              <Upload size={16} /> Upload
            </Button>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
          <h3 className="text-xl font-bold">No videos yet</h3>
          <p className="mt-1 text-muted-foreground">Be the first to publish long-form content.</p>
        </div>
      ) : (
        <>
          {featured && <FeaturedCard video={featured} />}
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeaturedCard({ video }) {
  return (
    <Link
      to={`/videos/${video.id}`}
      className="group grid gap-4 overflow-hidden rounded-3xl border border-border bg-card sm:grid-cols-[1.4fr_1fr]"
      data-testid={`video-featured-${video.id}`}
    >
      <div className="relative aspect-video bg-secondary sm:aspect-auto">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Play size={40} />
          </div>
        )}
        {video.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-mono text-white">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="flex flex-col justify-center p-6">
        <span className="mb-3 inline-block w-fit rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
          Featured
        </span>
        <h2 className="text-2xl font-black leading-snug tracking-tight group-hover:text-primary">
          {video.title}
        </h2>
        {video.description && (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{video.description}</p>
        )}
        {video.author && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Avatar src={video.author.avatar_url} size={28} />
            <span className="font-semibold">{video.author.display_name}</span>
            <span className="text-muted-foreground">· {timeAgo(video.created_at)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function VideoCard({ video }) {
  return (
    <Link
      to={`/videos/${video.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
      data-testid={`video-card-${video.id}`}
    >
      <div className="relative aspect-video bg-secondary">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Play size={30} />
          </div>
        )}
        {video.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-mono text-white">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-primary">
          {video.title}
        </h3>
        {video.author && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar src={video.author.avatar_url} size={18} />
            {video.author.display_name}
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Eye size={11} /> {formatNumber(video.views)}</span>
          <span className="inline-flex items-center gap-1"><Heart size={11} /> {formatNumber(video.likes)}</span>
          <span className="ml-auto">{timeAgo(video.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
