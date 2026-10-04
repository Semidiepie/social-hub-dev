import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Star, Lock, Check, X, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Match3Board } from "@/components/Match3Board";
import { MemoryGame } from "@/components/games/MemoryGame";
import { QuizGame } from "@/components/games/QuizGame";
import { TapperGame } from "@/components/games/TapperGame";
import { FarmGame } from "@/components/games/FarmGame";
import { toast } from "sonner";

const INTRO_TEXT = {
  match3: "Reach the target score before you run out of moves.",
  memory: "Flip the cards and find every matching pair before time runs out.",
  quiz: "Answer the questions correctly — beat the clock on each one!",
  tapper: "Tap the targets as fast as you can before time runs out.",
};

function Stars({ n, size = 16 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star key={i} size={size} className={i <= n ? "text-yellow-400" : "text-muted-foreground/40"} fill={i <= n ? "currentColor" : "none"} />
      ))}
    </div>
  );
}

export default function GameMapPage() {
  const { slug } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ unlocked: 1, levels: {} });

  // active play session
  const [levelN, setLevelN] = useState(null);
  const [levelCfg, setLevelCfg] = useState(null);
  const [phase, setPhase] = useState("map"); // map | intro | play | result
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/games/${slug}`, !!user)
      .then((g) => {
        setGame(g);
        setProgress(g.progress || { unlocked: 1, levels: {} });
      })
      .catch(() => toast.error("Couldn't load this game"))
      .finally(() => setLoading(false));
  }, [slug, user]);

  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  const openLevel = async (n) => {
    if (!user) {
      toast.error("Sign in to play");
      navigate("/login");
      return;
    }
    try {
      const cfg = await api.get(`/games/${slug}/levels/${n}`);
      setLevelN(n);
      setLevelCfg(cfg);
      setResult(null);
      setPhase("intro");
    } catch {
      toast.error("Couldn't start this level");
    }
  };

  const onEnd = async ({ score, won }) => {
    setPhase("result");
    try {
      const r = await api.post(`/games/${slug}/levels/${levelN}/complete`, { score });
      setResult(r);
      setProgress((p) => {
        const levels = { ...p.levels, [String(levelN)]: { stars: Math.max(p.levels[String(levelN)]?.stars || 0, r.stars), best: r.best, completed: (p.levels[String(levelN)]?.completed || r.won) } };
        return { unlocked: Math.max(p.unlocked, r.unlocked), levels };
      });
    } catch {
      setResult({ score, won, stars: 0 });
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!game) return null;

  // ===== Farm simulator: not level-based, render the sim directly =====
  if (game.kind === "farm") {
    return (
      <div className="mx-auto max-w-2xl" data-testid="farm-page">
        <button onClick={() => navigate("/games")} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="map-back">
          <ArrowLeft size={16} /> All games
        </button>
        <header className="mb-4 flex items-center gap-3">
          <span className="text-4xl">{game.cover_emoji}</span>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{game.title}</h1>
            <p className="text-sm text-muted-foreground">{game.description}</p>
          </div>
        </header>
        <FarmGame game={game} />
      </div>
    );
  }

  const levels = Array.from({ length: game.level_count }, (_, i) => i + 1);

  // ===== Play / intro / result overlay =====
  if (phase !== "map") {
    return (
      <div className="mx-auto max-w-xl" data-testid="game-play">
        <button onClick={() => setPhase("map")} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="play-back">
          <ArrowLeft size={16} /> Level map
        </button>

        {phase === "intro" && levelCfg && (
          <div className="rounded-3xl border border-border bg-card/70 p-8 text-center" data-testid="level-intro">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-2xl font-black text-primary">{levelN}</div>
            <h2 className="mt-4 text-2xl font-black">Level {levelN}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{INTRO_TEXT[levelCfg.kind] || INTRO_TEXT.match3}</p>
            <div className="mt-5 flex justify-center gap-6">
              {levelCfg.kind === "match3" && <div><div className="text-2xl font-black">{levelCfg.moves}</div><div className="text-[11px] uppercase text-muted-foreground">Moves</div></div>}
              {levelCfg.kind === "memory" && <div><div className="text-2xl font-black">{levelCfg.pairs}</div><div className="text-[11px] uppercase text-muted-foreground">Pairs</div></div>}
              {(levelCfg.kind === "memory" || levelCfg.kind === "tapper") && <div><div className="text-2xl font-black">{levelCfg.seconds || levelCfg.duration}s</div><div className="text-[11px] uppercase text-muted-foreground">Time</div></div>}
              {levelCfg.kind === "quiz" && <div><div className="text-2xl font-black">{levelCfg.count}</div><div className="text-[11px] uppercase text-muted-foreground">Questions</div></div>}
              <div><div className="text-2xl font-black">{levelCfg.target.toLocaleString()}</div><div className="text-[11px] uppercase text-muted-foreground">Target</div></div>
            </div>
            <Button onClick={() => setPhase("play")} className="mt-6 w-full bg-primary text-primary-foreground" data-testid="level-start-btn">Start</Button>
          </div>
        )}

        {phase === "play" && levelCfg && (
          levelCfg.kind === "memory" ? <MemoryGame key={levelN} level={levelCfg} onEnd={onEnd} />
          : levelCfg.kind === "quiz" ? <QuizGame key={levelN} level={levelCfg} onEnd={onEnd} />
          : levelCfg.kind === "tapper" ? <TapperGame key={levelN} level={levelCfg} onEnd={onEnd} />
          : <Match3Board key={`${levelN}-${levelCfg.moves}`} level={levelCfg} onEnd={onEnd} />
        )}

        {phase === "result" && (
          <div className="rounded-3xl border border-border bg-card/70 p-8 text-center" data-testid="level-result">
            {result ? (
              <>
                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${result.won ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {result.won ? <Check size={32} /> : <X size={32} />}
                </div>
                <h2 className="mt-4 text-2xl font-black">{result.won ? "Level complete!" : "Not quite — try again"}</h2>
                <div className="mt-3 flex justify-center"><Stars n={result.stars} size={28} /></div>
                <p className="mt-3 text-sm text-muted-foreground">Score <span className="font-black text-foreground">{(result.score || 0).toLocaleString()}</span></p>
                <div className="mt-6 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openLevel(levelN)} data-testid="result-retry">Replay</Button>
                  {result.won && levelN < game.level_count ? (
                    <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => openLevel(levelN + 1)} data-testid="result-next">Next level</Button>
                  ) : (
                    <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => setPhase("map")} data-testid="result-map">Level map</Button>
                  )}
                </div>
              </>
            ) : (
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            )}
          </div>
        )}
      </div>
    );
  }

  // ===== Saga level map =====
  return (
    <div className="mx-auto max-w-2xl" data-testid="game-map">
      <button onClick={() => navigate("/games")} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="map-back">
        <ArrowLeft size={16} /> All games
      </button>
      <header className="mb-6 flex items-center gap-3">
        <span className="text-4xl">{game.cover_emoji}</span>
        <div>
          <h1 className="text-2xl font-black tracking-tight">{game.title}</h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Trophy size={13} className="text-primary" /> {progress.unlocked - 1}/{game.level_count} cleared
          </p>
        </div>
      </header>

      <div className="relative rounded-3xl border border-border bg-gradient-to-b from-primary/5 to-transparent p-6">
        <div className="flex flex-col items-center gap-5">
          {levels.map((n, idx) => {
            const info = progress.levels[String(n)];
            const done = info?.completed;
            const unlocked = n <= progress.unlocked;
            const cls = done ? "pmp-level-done" : unlocked ? "pmp-level-open" : "pmp-level-locked";
            // zig-zag saga layout
            const offset = (idx % 4 === 1 ? 70 : idx % 4 === 3 ? -70 : 0);
            return (
              <div key={n} style={{ transform: `translateX(${offset}px)` }} className="flex flex-col items-center">
                <button
                  className={`pmp-level-node ${cls}`}
                  onClick={() => unlocked && openLevel(n)}
                  disabled={!unlocked}
                  data-testid={`level-node-${n}`}
                >
                  {unlocked ? n : <Lock size={18} />}
                </button>
                {done && <div className="mt-1"><Stars n={info.stars} size={12} /></div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
