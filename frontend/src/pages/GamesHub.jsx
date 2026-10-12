import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Gamepad2, Clock, Bookmark, Heart, Search, X, BadgeCheck, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

function GameCard({ g }) {
  return (
    <Link
      to={`/games/${g.id}`}
      data-testid={`game-card-${g.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card/40 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-lg"
    >
      <img src={g.icon_url} alt="" className="h-16 w-16 flex-none rounded-2xl object-cover ring-1 ring-border" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1">
          <span className="truncate font-bold">{g.name}</span>
          {g.is_verified && <BadgeCheck size={14} className="flex-none text-sky-500" />}
        </div>
        {g.developer ? <div className="truncate text-xs text-muted-foreground">by {g.developer}</div> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {g.category ? <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">{g.category}</span> : null}
          {g.followers > 0 ? <span className="flex items-center gap-0.5"><Heart size={10} /> {g.followers}</span> : null}
        </div>
      </div>
      <ChevronRight size={18} className="flex-none text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function Section({ icon: Icon, title, games }) {
  if (!games.length) return null;
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-muted-foreground">
        <Icon size={15} className="text-primary" /> {title}
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {games.map((g) => <GameCard key={g.id} g={g} />)}
      </div>
    </section>
  );
}

export default function GamesHubPage() {
  const [games, setGames] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    Promise.all([api.get("/games"), api.get("/games/recent").catch(() => [])])
      .then(([all, rec]) => {
        setGames(Array.isArray(all) ? all : []);
        setRecent(Array.isArray(rec) ? rec : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(games.map((g) => g.category).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [games]);

  const q = query.trim().toLowerCase();
  const filtering = q.length > 0 || category !== "All";

  const filtered = useMemo(
    () =>
      games.filter((g) => {
        const matchesCat = category === "All" || g.category === category;
        const matchesQ =
          !q ||
          g.name?.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.category?.toLowerCase().includes(q);
        return matchesCat && matchesQ;
      }),
    [games, category, q],
  );

  const following = games.filter((g) => g.following);
  const saved = games.filter((g) => g.saved);

  return (
    <div className="space-y-5" data-testid="games-hub-page">
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
        <>
          {/* Search */}
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games, developers…"
              data-testid="games-search-input"
              className="w-full rounded-full border border-border bg-card/40 py-2.5 pl-11 pr-11 text-sm outline-none transition-colors focus:border-primary/50 focus:bg-card"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                data-testid="games-search-clear"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category chips */}
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" data-testid="games-categories">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  data-testid={`games-cat-${c}`}
                  className={`flex-none rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    category === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {filtering ? (
            filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground" data-testid="games-no-results">
                <Search size={32} className="text-primary" />
                <p className="font-semibold text-foreground">No games found</p>
                <p className="text-sm">Try a different search or category.</p>
              </div>
            ) : (
              <section className="space-y-2.5" data-testid="games-results">
                <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? "result" : "results"}
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {filtered.map((g) => <GameCard key={g.id} g={g} />)}
                </div>
              </section>
            )
          ) : (
            <div className="space-y-7 pt-1">
              <Section icon={Clock} title="Continue playing" games={recent.slice(0, 4)} />
              <Section icon={Heart} title="Following" games={following} />
              <Section icon={Bookmark} title="Saved" games={saved} />
              <Section icon={Gamepad2} title="All games" games={games} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
