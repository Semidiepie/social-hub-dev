import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Zap, Heart, MessageCircle, Camera, Star, Music, Flame, Gem, Crown, Rocket, Smile, Sparkles, Ghost, Leaf, Moon, Sun, Cloud, Bell, Trophy, Apple, Candy, IceCream, Pizza, Diamond, HelpCircle, Check } from "lucide-react";
import { createBoard, trySwap, areAdjacent, hasMove, reshuffle, clone } from "@/games/match3";

const ICONS = { Zap, Heart, MessageCircle, Camera, Star, Music, Flame, Gem, Crown, Rocket, Smile, Sparkles, Ghost, Leaf, Moon, Sun, Cloud, Bell, Trophy, Apple, Candy, IceCream, Pizza, Diamond };
const STEP_MS = 230;

// A single tile. Keyed by its engine id so React animates added tiles in.
function Tile({ cell, tile, selected, onClick }) {
  if (!cell) return <div className="pmp-tile-empty" />;
  const Icon = ICONS[tile?.icon] || HelpCircle;
  const special = cell.s;
  return (
    <button
      onClick={onClick}
      className={`pmp-tile ${selected ? "pmp-tile-sel" : ""} ${special ? "pmp-tile-special" : ""}`}
      style={{ background: special === "bomb" ? undefined : tile?.color }}
      data-testid={`tile-${cell.id}`}
      aria-label={tile?.id}
    >
      {special === "bomb" ? (
        <span className="pmp-tile-bomb"><Star size={20} className="text-white" fill="white" /></span>
      ) : (
        <>
          <Icon size={22} color="#fff" strokeWidth={2.4} />
          {special === "row" && <span className="pmp-stripe pmp-stripe-row" />}
          {special === "col" && <span className="pmp-stripe pmp-stripe-col" />}
        </>
      )}
    </button>
  );
}

export function Match3Board({ level, onEnd }) {
  const { rows, cols, colors, moves, target, tiles } = level;
  const control = level.control === "slide" ? "slide" : "tap";
  const tileByIndex = useMemo(() => tiles, [tiles]);

  const [grid, setGrid] = useState(() => createBoard(rows, cols, colors));
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(moves);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(null);
  const [reached, setReached] = useState(false);
  const endedRef = useRef(false);
  const scoreRef = useRef(0);
  const dragRef = useRef(null);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnd({ score: scoreRef.current, won: scoreRef.current >= target });
  }, [onEnd, target]);

  const resolve = useCallback(
    async (a, b) => {
      const res = trySwap(grid, colors, a, b);
      // Visual swap first.
      const inter = clone(grid);
      const tmp = inter[a.r][a.c];
      inter[a.r][a.c] = inter[b.r][b.c];
      inter[b.r][b.c] = tmp;

      if (!res) {
        setBusy(true);
        setGrid(inter);
        setShake({ a, b });
        await sleep(200);
        setGrid(grid);
        setShake(null);
        setBusy(false);
        return;
      }

      setBusy(true);
      setGrid(inter);
      await sleep(140);
      const left = movesLeft - 1;
      setMovesLeft(left);
      let g = grid;
      for (const step of res.steps) {
        g = step.grid;
        setGrid(step.grid);
        scoreRef.current += step.gained;
        setScore(scoreRef.current);
        await sleep(STEP_MS);
      }
      if (scoreRef.current >= target) setReached(true);
      // keep the board alive
      if (!hasMove(g, colors)) {
        const shuffled = reshuffle(g, colors);
        setGrid(shuffled);
        await sleep(STEP_MS);
      }
      setBusy(false);
      if (left <= 0) finish();
    },
    [grid, colors, movesLeft, finish, target]
  );

  // Slide / drag gesture (used when control === "slide").
  const onPointerDown = (r, c, e) => {
    if (control !== "slide" || busy || endedRef.current || movesLeft <= 0) return;
    dragRef.current = { r, c, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (control !== "slide" || !dragRef.current) return;
    const { r, c, x, y } = dragRef.current;
    dragRef.current = null;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return; // not a real swipe
    let nr = r, nc = c;
    if (Math.abs(dx) > Math.abs(dy)) nc = c + (dx > 0 ? 1 : -1);
    else nr = r + (dy > 0 ? 1 : -1);
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) return;
    resolve({ r, c }, { r: nr, c: nc });
  };

  const onTile = (r, c) => {
    if (control === "slide" || busy || endedRef.current || movesLeft <= 0) return;
    if (!selected) {
      setSelected({ r, c });
      return;
    }
    if (selected.r === r && selected.c === c) {
      setSelected(null);
      return;
    }
    if (areAdjacent(selected, { r, c })) {
      const a = selected;
      setSelected(null);
      resolve(a, { r, c });
    } else {
      setSelected({ r, c });
    }
  };

  useEffect(() => {
    if (movesLeft <= 0 && !busy) finish();
  }, [movesLeft, busy, finish]);

  const pct = Math.min(100, Math.round((score / target) * 100));

  return (
    <div className="w-full" data-testid="match3-board">
      {/* HUD */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-2 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Moves</div>
          <div className="text-2xl font-black tabular-nums" data-testid="hud-moves">{movesLeft}</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-muted-foreground">Score</span>
            <span className="font-black tabular-nums" data-testid="hud-score">{score.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{control === "slide" ? "Swipe tiles to match" : "Tap two tiles to swap"}</span>
            <span>Target {target.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {reached && !endedRef.current && (
        <button
          onClick={finish}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-black text-white shadow-lg transition-transform hover:scale-[1.01]"
          data-testid="finish-level-btn"
        >
          <Check size={16} /> Target reached — Finish level (or keep playing for more stars)
        </button>
      )}

      {/* Board */}
      <div
        className="mx-auto grid rounded-3xl border border-border bg-card/40 p-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 6,
          maxWidth: 520,
          aspectRatio: `${cols} / ${rows}`,
          touchAction: control === "slide" ? "none" : undefined,
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const sh = shake && ((shake.a.r === r && shake.a.c === c) || (shake.b.r === r && shake.b.c === c));
            return (
              <div
                key={cell ? cell.id : `${r}-${c}`}
                className={`pmp-tile-wrap ${sh ? "pmp-shake" : ""}`}
                onPointerDown={(e) => onPointerDown(r, c, e)}
                onPointerUp={onPointerUp}
              >
                <Tile
                  cell={cell}
                  tile={cell ? tileByIndex[cell.t] : null}
                  selected={!!selected && selected.r === r && selected.c === c}
                  onClick={() => onTile(r, c)}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
