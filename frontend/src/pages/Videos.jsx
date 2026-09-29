import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Video as VideoIcon, Search, Upload, Play, Loader2, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { formatNumber, timeAgo, userPath, videoPath, badgeCls, badgeStyle, formatDuration } from "@/lib/format";

function Duration({ value }) {
  if (value === null || value === undefined || value === "") return null;
  const label = typeof value === "number" ? formatDuration(value) : String(value);
  return (
    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-bold text-white">
      {label}
    </span>
  );
}

function ChannelBadge({ author }) {
  if (!author?.is_verified) return null;
  return <BadgeCheck size={15} className={badgeCls(author, "shrink-0")} style={badgeStyle(author)} />;
}

function VideoCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video w-full rounded-xl bg-muted" />
      <div className="mt-3 flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-full rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function VideoCard({ v }) {
  return (
    <Link to={videoPath(v)} className="group block" data-testid={`video-card-${v.id}`}>
      <div className="relative overflow-hidden rounded-xl bg-black">
        {v.thumbnail_url ? (
          <img
            src={v.thumbnail_url}
            alt={v.title}
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-muted to-background">
            <VideoIcon className="text-muted-foreground" size={40} />
          </div>
        )}
        <Duration value={v.duration} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground">
            <Play size={26} className="ml-0.5 fill-current" />
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-3">
        <Avatar src={v.author?.avatar_url} size={38} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{v.title || "Untitled"}</h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{v.author?.display_name || v.author?.username}</span>
            <ChannelBadge author={v.author} />
          </div>
          <div className="text-xs text-muted-foreground">
            {formatNumber(v.views)} views · {timeAgo(v.created_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function FeaturedVideo({ v }) {
  return (
    <Link to={videoPath(v)} className="group block overflow-hidden rounded-2xl border border-border bg-card" data-testid={`video-featured-${v.id}`}>
      <div className="relative bg-black">
        {v.thumbnail_url ? (
          <img src={v.thumbnail_url} alt={v.title} className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/20 to-background">
            <VideoIcon className="text-primary" size={56} />
          </div>
        )}
        <Duration value={v.duration} />
        <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-black uppercase tracking-wide text-primary-foreground">
          <Play size={12} className="fill-current" /> Featured
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 text-primary-foreground opacity-90 transition-transform group-hover:scale-110">
            <Play size={30} className="ml-1 fill-current" />
          </span>
        </div>
      </div>
      <div className="flex gap-3 p-4">
        <Avatar src={v.author?.avatar_url} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-lg font-black leading-tight text-foreground">{v.title || "Untitled"}</h2>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <span className="truncate">{v.author?.display_name || v.author?.username}</span>
            <ChannelBadge author={v.author} />
          </div>
          <div className="text-sm text-muted-foreground">
            {formatNumber(v.views)} views · {timeAgo(v.created_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function VideosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [videos, setVideos] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");

  useEffect(() => {
    let alive = true;
    api.get("/videos?limit=60")
      .then((rows) => { if (alive) setVideos(rows); })
      .catch(() => { if (alive) setVideos([]); });
    return () => { alive = false; };
  }, []);

  const categories = useMemo(() => {
    if (!videos) return ["All"];
    const set = new Set();
    videos.forEach((v) => v.category && set.add(v.category));
    return ["All", ...Array.from(set)];
  }, [videos]);

  const filtered = useMemo(() => {
    if (!videos) return [];
    const q = search.trim().toLowerCase();
    return videos.filter((v) => {
      if (activeCat !== "All" && v.category !== activeCat) return false;
      if (q && !(`${v.title} ${v.description || ""} ${(v.tags || []).join(" ")}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [videos, search, activeCat]);

  const showFeatured = activeCat === "All" && !search.trim() && filtered.length > 0;
  const featured = showFeatured ? filtered[0] : null;
  const grid = showFeatured ? filtered.slice(1) : filtered;

  return (
    <div className="mx-auto max-w-6xl pb-10" data-testid="videos-page">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <VideoIcon size={22} />
          </span>
          <h1 className="text-3xl font-black tracking-tight">Videos</h1>
        </div>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos"
            data-testid="videos-search"
            className="h-11 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm outline-none focus:border-primary"
          />
        </div>
        {user && (
          <Button onClick={() => navigate("/videos/new")} className="h-11 gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90" data-testid="videos-upload-btn">
            <Upload size={16} /> Upload
          </Button>
        )}
      </div>

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              data-testid={`videos-cat-${c}`}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                activeCat === c ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {videos === null ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <VideoIcon size={48} className="text-muted-foreground" />
          <p className="text-lg font-bold">{search || activeCat !== "All" ? "No videos match" : "No videos yet"}</p>
          <p className="text-sm text-muted-foreground">
            {search || activeCat !== "All" ? "Try a different search or category." : "Be the first to upload a video."}
          </p>
          {user && !search && activeCat === "All" && (
            <Button onClick={() => navigate("/videos/new")} className="mt-2 gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90">
              <Upload size={16} /> Upload a video
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {featured && <FeaturedVideo v={featured} />}
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {grid.map((v) => <VideoCard key={v.id} v={v} />)}
          </div>
        </div>
      )}
    </div>
  );
}
