import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Radio, Eye, Video, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { BadgeCheck } from "lucide-react";
import { badgeCls, badgeStyle } from "@/lib/format";

function LiveCard({ s }) {
  return (
    <Link
      to={`/live/${s.id}`}
      data-testid={`live-card-${s.id}`}
      className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-zinc-800 to-zinc-950"
    >
      <div className="flex h-full w-full items-center justify-center">
        <Avatar src={s.owner?.avatar_url} size={72} ring />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
      </span>
      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
        <Eye size={11} /> {s.viewer_count}
      </span>
      <div className="absolute inset-x-2 bottom-2">
        <div className="flex items-center gap-1 text-xs font-bold text-white">
          <span className="truncate">{s.owner?.display_name || s.owner?.username}</span>
          {s.owner?.is_verified && <BadgeCheck size={13} className={badgeCls(s.owner)} style={badgeStyle(s.owner)} />}
        </div>
        <div className="flex items-center justify-between">
          <div className="truncate text-[11px] text-white/70">{s.title}</div>
          <span className="flex flex-shrink-0 items-center gap-0.5 text-[10px] text-white/70"><Heart size={10} className="fill-rose-500 text-rose-500" /> {s.hearts}</span>
        </div>
      </div>
    </Link>
  );
}

export default function LiveFeedPage() {
  const navigate = useNavigate();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get("/live");
      setStreams(rows);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
            <Radio className="text-rose-500" /> Live
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Real-time streams from creators right now.</p>
        </div>
        <Button
          onClick={() => navigate("/live/new")}
          data-testid="golive-nav-btn"
          className="gap-2 bg-rose-600 font-bold text-white hover:bg-rose-500"
        >
          <Video size={18} /> Go Live
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : streams.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-12 text-center">
          <Radio size={40} className="text-muted-foreground" />
          <div>
            <div className="font-bold">No one is live right now</div>
            <div className="text-sm text-muted-foreground">Be the first to go live for your community.</div>
          </div>
          <Button onClick={() => navigate("/live/new")} className="gap-2 bg-rose-600 text-white hover:bg-rose-500" data-testid="golive-empty-btn">
            <Video size={18} /> Go Live
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {streams.map((s) => <LiveCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}
