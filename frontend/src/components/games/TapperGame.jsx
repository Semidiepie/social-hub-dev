import React, { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

// Tap-reflex / whack-a-mole: tap targets that pop up before they vanish.
export function TapperGame({ level, onEnd }) {
  const { emoji, bg, duration, spawn_ms, target } = level;
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [target_, setTarget] = useState(null); // {x,y,id}
  const scoreRef = useRef(0);
  const endedRef = useRef(false);
  const areaRef = useRef(null);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnd({ score: scoreRef.current, won: scoreRef.current >= target });
  }, [onEnd, target]);

  // countdown
  useEffect(() => {
    if (endedRef.current) return;
    if (timeLeft <= 0) { setTarget(null); finish(); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, finish]);

  // spawn loop
  useEffect(() => {
    if (endedRef.current || timeLeft <= 0) return;
    const spawn = () => {
      setTarget({ x: 8 + Math.random() * 78, y: 8 + Math.random() * 78, id: Math.random() });
    };
    spawn();
    const iv = setInterval(spawn, spawn_ms);
    return () => clearInterval(iv);
  }, [spawn_ms, timeLeft]);

  const hit = (e) => {
    e.stopPropagation();
    if (endedRef.current) return;
    scoreRef.current += 100;
    setScore(scoreRef.current);
    setTarget(null);
  };

  const pct = Math.min(100, Math.round((score / target) * 100));

  return (
    <div className="w-full" data-testid="tapper-game">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card/70 px-4 py-2 text-lg font-black">
          <Clock size={16} className="text-primary" /> <span data-testid="hud-time">{timeLeft}s</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs"><span className="font-bold text-muted-foreground">Score</span><span className="font-black" data-testid="hud-score">{score.toLocaleString()}</span></div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">Target {target.toLocaleString()}</div>
        </div>
      </div>
      <div
        ref={areaRef}
        className="relative mx-auto overflow-hidden rounded-3xl border border-border"
        style={{ background: bg, maxWidth: 520, aspectRatio: "1 / 1", touchAction: "none" }}
        data-testid="tapper-area"
      >
        {target_ && (
          <button
            key={target_.id}
            onClick={hit}
            className="absolute flex items-center justify-center rounded-full"
            style={{ left: `${target_.x}%`, top: `${target_.y}%`, width: "16%", height: "16%", fontSize: "min(9vw,46px)", animation: "pmp-tile-in .15s ease both" }}
            data-testid="tapper-target"
          >
            {emoji}
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Tap the {emoji} as fast as you can!</p>
    </div>
  );
}
