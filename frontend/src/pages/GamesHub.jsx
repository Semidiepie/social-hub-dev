import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Gamepad2, Clock, Bookmark, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

function GameCard({ g }) {
  return (
    <Link
      to={`/games/${g.id}`}
      data-testid={`game-card-${g.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card/40 p-3 transition-colors hover:border-primary/40 hover:bg-card"
    >
      <img src={g.icon_url} alt="" className="h-14 w-14 flex-none rounded-full object-cover ring-2 ring-border group-hover:ring-primary/40" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-bold">{g.name}</div>
        {g.developer ? <div className="truncate text-xs text-muted-foreground">by {g.developer}</div> : null}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {g.category ? <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">{g.category}</span> : null}
          {g.followers > 0 ? <span>{g.followers} following</span> : null}
        </div>
      </div>
    </Link>
  );
}

function Section({ icon: Icon, title, games }) {
  if (!games.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-muted-foreground">
        <Icon size={15} className="text-primary" /> {title}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {games.map((g) => <GameCard key={g.id} g={g} />)}
      </div>
    </section>
  );
}

export default function GamesHubPage() {
  const [games, setGames] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/games"), api.get("/games/recent").catch(() => [])])
      .then(([all, rec]) => {
        setGames(Array.isArray(all) ? all : []);
        setRecent(Array.isArray(rec) ? rec : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const following = games.filter((g) => g.following);
  const saved = games.filter((g) => g.saved);

  return (
    <div className="space-y-6" data-testid="games-hub-page">
      <PageHeader icon={Gamepad2} title="Games" subtitle="Play web games without leaving PostMePlex." />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : games.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground" data-testid="games-empty">
          <Gamepad2 size={40} className="text-primary" />
          <p className="font-semibold text-foreground">No games yet</p>
          <p className="text-sm">Check back soon — new games are on the way.</p>
        </div>
      ) : (
        <div className="space-y-7">
          <Section icon={Clock} title="Continue playing" games={recent.slice(0, 4)} />
          <Section icon={Heart} title="Following" games={following} />
          <Section icon={Bookmark} title="Saved" games={saved} />
          <Section icon={Gamepad2} title="All games" games={games} />
        </div>
      )}
    </div>
  );
}
