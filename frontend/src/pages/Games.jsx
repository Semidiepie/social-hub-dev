import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad2, Loader2, Star, Trophy, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function GameCard({ g, onPlay }) {
  const hasImg = !!g.cover_image;
  const artStyle = hasImg ? { backgroundImage: `url(${g.cover_image})` } : undefined;
  const badge = g.kind === "farm" ? "Farm sim" : g.kind === "slots" ? "Spin & Raid" : `${g.level_count} levels`;
  return (
    <button onClick={onPlay} className="pmp-gamecard group" data-testid={`game-card-${g.slug}`}>
      <div className={`pmp-gamecard-art ${hasImg ? "" : "pmp-gamecard-art-grad"}`} style={artStyle}>
        {!hasImg && <span className="text-7xl drop-shadow-lg transition-transform duration-200 group-hover:scale-110">{g.cover_emoji || "🎮"}</span>}
        <div className="pmp-gamecard-shade" />
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
          <Trophy size={12} className="text-primary" /> {badge}
        </div>
        {g.visibility === "private" && (
          <div className="absolute left-3 top-3 rounded-full bg-yellow-500/90 px-2.5 py-1 text-[11px] font-bold text-black">Private</div>
        )}
        <h3 className="absolute bottom-3 left-4 right-4 text-2xl font-black text-white drop-shadow-lg">{g.title}</h3>
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-sm text-muted-foreground">{g.description}</p>
        <div className="mt-3 flex items-center justify-between">
          {g.progress ? (
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1 text-yellow-400"><Star size={13} fill="currentColor" /> {g.progress.stars}</span>
              <span className="text-muted-foreground">Level {g.progress.unlocked}</span>
            </div>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} /> Sign in to save progress</span>
          )}
          <span className="rounded-full bg-primary px-5 py-1.5 text-sm font-black text-primary-foreground transition-transform group-hover:scale-105">Play</span>
        </div>
      </div>
    </button>
  );
}

export default function GamesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/games", !!user)
      .then(setGames)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl" data-testid="games-page">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Gamepad2 size={26} className="text-primary" /> Games
        </h1>
        <p className="mt-1 text-muted-foreground">Play, climb the level map and chase three stars — PostMePlex style.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : games.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
          <Gamepad2 size={30} className="mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold">No games yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Check back soon — new games are on the way.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <GameCard key={g.id} g={g} onPlay={() => navigate(`/games/${g.slug}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
