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
import { SlotsGame } from "@/components/games/SlotsGame";
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
        <Star key={i} size={size} className={i <= n ? "text-yellow-400" : "text-white/25"} fill={i <= n ? "currentColor" : "none"} />
      ))}
    </div>
  );
}

// Full-screen immersive game shell with the game's custom art (or themed gradient) as backdrop.
function GameScreen({ game, title, onExit, exitLabel, children, testId }) {
  const bd = game?.cover_image ? { backgroundImage: `url(${game.cover_image})` } : null;
  return (
    <div className="pmp-game-screen" data-testid={testId}>
      {bd ? <div className="pmp-game-bd" style={bd} /> : null}
      <div className="pmp-game-bd-grad" />
      <div className="pmp-game-topbar">
        <button onClick={onExit} className="pmp-game-exit" data-testid="game-exit" aria-label={exitLabel}>
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1 text-white">{title}</div>
      </div>
      <div className="pmp-game-scroll">
        <div className="pmp-game-center">{children}</div>
      </div>
    </div>
  );
}

function WinConfetti() {
  const colors = ["#FF6B3D", "#ffd43b", "#4ECDC4", "#f06595", "#6BCB77", "#8a5bff"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          className="pmp-win-burst"
          style={{
            left: `${Math.random() * 100}%`,
            background: colors[i % colors.length],
            "--cf": `${360 + Math.random() * 180}px`,
            "--cr": `${Math.random() * 720}deg`,
            "--cd": `${1.1 + Math.random() * 0.9}s`,
            animationDelay: `${Math.random() * 0.3}s`,
          }}
        />
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

  // ===== Farm simulator: not level-based, render the sim directly (Phase 2 full-screen) =====
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

  // ===== Slots / Spin & Raid (Coin Master-style): not level-based (Phase 2 full-screen) =====
  if (game.kind === "slots") {
    return (
      <div className="mx-auto max-w-md" data-testid="slots-page">
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
        <SlotsGame game={game} />
      </div>
    );
  }

  const levels = Array.from({ length: game.level_count }, (_, i) => i + 1);

  // ===== Full-screen Play / intro / result =====
  if (phase !== "map") {
    return (
      <GameScreen
        game={game}
        exitLabel="Back to level map"
        onExit={() => setPhase("map")}
        testId="game-play"
        title={
          <div className="flex items-center gap-2">
            {game.cover_image ? (
              <img src={game.cover_image} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <span className="text-2xl leading-none">{game.cover_emoji}</span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-black leading-tight">{game.title}</div>
              <div className="text-[11px] text-white/70">Level {levelN}</div>
            </div>
          </div>
        }
      >
        {phase === "intro" && levelCfg && (
          <div className="pmp-glass-card mt-6 p-8 text-center" data-testid="level-intro">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/25 text-2xl font-black text-primary">{levelN}</div>
            <h2 className="mt-4 text-2xl font-black">Level {levelN}</h2>
            <p className="mt-1 text-sm text-white/70">{INTRO_TEXT[levelCfg.kind] || INTRO_TEXT.match3}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-6">
              {levelCfg.kind === "match3" && <div><div className="text-2xl font-black">{levelCfg.moves}</div><div className="text-[11px] uppercase text-white/60">Moves</div></div>}
              {levelCfg.kind === "memory" && <div><div className="text-2xl font-black">{levelCfg.pairs}</div><div className="text-[11px] uppercase text-white/60">Pairs</div></div>}
              {(levelCfg.kind === "memory" || levelCfg.kind === "tapper") && <div><div className="text-2xl font-black">{levelCfg.seconds || levelCfg.duration}s</div><div className="text-[11px] uppercase text-white/60">Time</div></div>}
              {levelCfg.kind === "quiz" && <div><div className="text-2xl font-black">{levelCfg.count}</div><div className="text-[11px] uppercase text-white/60">Questions</div></div>}
              <div><div className="text-2xl font-black">{levelCfg.target.toLocaleString()}</div><div className="text-[11px] uppercase text-white/60">Target</div></div>
            </div>
            <Button onClick={() => setPhase("play")} className="mt-6 h-12 w-full bg-primary text-base font-black text-primary-foreground" data-testid="level-start-btn">Start</Button>
          </div>
        )}

        {phase === "play" && levelCfg && (
          <div className="mt-2">
            {levelCfg.kind === "memory" ? <MemoryGame key={levelN} level={levelCfg} onEnd={onEnd} />
            : levelCfg.kind === "quiz" ? <QuizGame key={levelN} level={levelCfg} onEnd={onEnd} />
            : levelCfg.kind === "tapper" ? <TapperGame key={levelN} level={levelCfg} onEnd={onEnd} />
            : <Match3Board key={`${levelN}-${levelCfg.moves}`} level={levelCfg} onEnd={onEnd} />}
          </div>
        )}

        {phase === "result" && (
          <div className="relative pmp-glass-card mt-6 overflow-hidden p-8 text-center" data-testid="level-result">
            {result ? (
              <>
                {result.won && <WinConfetti />}
                <div className={`relative mx-auto flex h-16 w-16 items-center justify-center rounded-full ${result.won ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {result.won ? <Check size={32} /> : <X size={32} />}
                </div>
                <h2 className="relative mt-4 text-2xl font-black">{result.won ? "Level complete!" : "Not quite — try again"}</h2>
                <div className="relative mt-3 flex justify-center"><Stars n={result.stars} size={28} /></div>
                <p className="relative mt-3 text-sm text-white/70">Score <span className="font-black text-white">{(result.score || 0).toLocaleString()}</span></p>
                {typeof result.tokens_earned === "number" && result.tokens_earned > 0 && (
                  <p className="relative mt-1 text-sm font-bold text-primary">+{result.tokens_earned} tokens 🪙</p>
                )}
                <div className="relative mt-6 flex gap-2">
                  <Button variant="outline" className="flex-1 border-white/20 bg-white/5 text-white hover:bg-white/15" onClick={() => openLevel(levelN)} data-testid="result-retry">Replay</Button>
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
      </GameScreen>
    );
  }

  // ===== Full-screen Saga level map =====
  return (
    <GameScreen
      game={game}
      exitLabel="All games"
      onExit={() => navigate("/games")}
      testId="game-map"
      title={
        <div className="flex items-center gap-3">
          {game.cover_image ? (
            <img src={game.cover_image} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <span className="text-3xl leading-none">{game.cover_emoji}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-black leading-tight">{game.title}</div>
            <div className="flex items-center gap-1 text-[11px] text-white/70">
              <Trophy size={12} className="text-primary" /> {progress.unlocked - 1}/{game.level_count} cleared
            </div>
          </div>
        </div>
      }
    >
      <div className="pmp-saga mt-4" data-testid="saga-map">
        <div className="flex flex-col items-center gap-2">
          {levels.map((n, idx) => {
            const info = progress.levels[String(n)];
            const done = info?.completed;
            const unlocked = n <= progress.unlocked;
            const cls = done ? "pmp-level-done" : unlocked ? "pmp-level-open" : "pmp-level-locked";
            const offset = (idx % 4 === 1 ? 70 : idx % 4 === 3 ? -70 : 0);
            return (
              <React.Fragment key={n}>
                {idx > 0 && (
                  <div className="flex items-center gap-1.5 py-0.5" aria-hidden>
                    <span className="pmp-saga-dot" /><span className="pmp-saga-dot" /><span className="pmp-saga-dot" />
                  </div>
                )}
                <div style={{ transform: `translateX(${offset}px)` }} className="flex flex-col items-center">
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
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </GameScreen>
  );
}
