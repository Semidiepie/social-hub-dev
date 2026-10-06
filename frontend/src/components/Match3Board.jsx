import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Zap, Heart, MessageCircle, Camera, Star, Music, Flame, Gem, Crown, Rocket, Smile,
  Sparkles, Ghost, Leaf, Moon, Sun, Cloud, Bell, Trophy, Apple, Candy, IceCream, Pizza,
  Diamond, HelpCircle, Check, Shuffle, Hammer, Plus,
} from "lucide-react";
import { createBoard, trySwap, resolveClears, areAdjacent, hasMove, reshuffle, clone } from "@/games/match3";
import { sfx } from "@/games/sfx";

const ICONS = { Zap, Heart, MessageCircle, Camera, Star, Music, Flame, Gem, Crown, Rocket, Smile, Sparkles, Ghost, Leaf, Moon, Sun, Cloud, Bell, Trophy, Apple, Candy, IceCream, Pizza, Diamond };
const POP_MS = 180;
const FALL_MS = 250;
const SWAP_MS = 150;
const GAP = 4;

let _comboKey = 1;
let _particleKey = 1;

function CandyTile({ id, cell, tile, size, r, c, selected, popping, armedHammer, onPointerDown, onPointerUp, onClick }) {
  const Icon = ICONS[tile?.icon] || HelpCircle;
  const special = cell.s;
  const inner =
    special === "bomb"
      ? "pmp-candy-bomb"
      : special === "wrap"
      ? "pmp-candy-wrap"
      : "";
  return (
    <div
      className="pmp-candy"
      style={{
        width: size,
        height: size,
        transform: `translate3d(${c * (size + GAP)}px, ${r * (size + GAP)}px, 0)`,
      }}
      data-testid={`tile-${id}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <div
        className={`pmp-candy-inner ${inner} ${selected ? "pmp-candy-sel" : ""} ${popping ? "pmp-candy-pop" : ""} ${armedHammer ? "pmp-candy-armed" : ""}`}
        style={special === "bomb" ? undefined : { "--c": tile?.color }}
      >
        {special === "bomb" ? (
          <Sparkles size={size * 0.46} color="#fff" strokeWidth={2.2} />
        ) : (
          <Icon size={size * 0.42} color="#fff" strokeWidth={2.6} />
        )}
        {special === "row" && <span className="pmp-stripe pmp-stripe-row" />}
        {special === "col" && <span className="pmp-stripe pmp-stripe-col" />}
      </div>
    </div>
  );
}

export function Match3Board({ level, onEnd }) {
  const { rows, cols, colors, moves, target, star2, star3, tiles } = level;
  const control = level.control === "slide" ? "slide" : "tap";
  const tileByIndex = useMemo(() => tiles, [tiles]);

  const [grid, setGrid] = useState(() => createBoard(rows, cols, colors));
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(moves);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(null);
  const [reached, setReached] = useState(false);
  const [popIds, setPopIds] = useState(() => new Set());
  const [particles, setParticles] = useState([]);
  const [combo, setCombo] = useState(null);
  const [boosters, setBoosters] = useState({ shuffle: 3, hammer: 3, moves: 2 });
  const [hammerArmed, setHammerArmed] = useState(false);
  const [muted, setMuted] = useState(false);

  const [boardW, setBoardW] = useState(0);
  const wrapRef = useRef(null);
  const endedRef = useRef(false);
  const scoreRef = useRef(0);
  const dragRef = useRef(null);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const size = boardW > 0 ? (boardW - GAP * (cols - 1)) / cols : 40;
  const boardH = size * rows + GAP * (rows - 1);

  useLayoutEffect(() => {
    const measure = () => {
      if (wrapRef.current) setBoardW(Math.min(wrapRef.current.clientWidth - 20, 460));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      sfx.setMuted(!m);
      return !m;
    });
  };

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const won = scoreRef.current >= target;
    if (won) sfx.win(); else sfx.lose();
    onEnd({ score: scoreRef.current, won });
  }, [onEnd, target]);

  const burst = useCallback((keys, g) => {
    const ids = new Set();
    const parts = [];
    let hadSpecial = false;
    for (const k of keys) {
      const [r, c] = k.split(",").map(Number);
      const cell = g[r][c];
      if (!cell) continue;
      ids.add(cell.id);
      if (cell.s) hadSpecial = true;
      const color = cell.s === "bomb" ? "#fff" : tileByIndex[cell.t]?.color || "#fff";
      const cx = c * (size + GAP) + size / 2;
      const cy = r * (size + GAP) + size / 2;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random();
        const dist = size * (0.6 + Math.random() * 0.5);
        parts.push({
          key: _particleKey++,
          x: cx, y: cy, color,
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist,
        });
      }
    }
    setPopIds(ids);
    setParticles((p) => [...p, ...parts].slice(-120));
    const pk = parts.map((p) => p.key);
    setTimeout(() => setParticles((cur) => cur.filter((p) => !pk.includes(p.key))), 520);
    return hadSpecial;
  }, [size, tileByIndex]);

  const animateSteps = useCallback(async (steps, startGrid) => {
    let g = startGrid;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const special = burst(step.cleared, g);
      if (special) sfx.special(); else sfx.pop(i);
      await sleep(POP_MS);
      g = step.grid;
      setGrid(g);
      setPopIds(new Set());
      scoreRef.current += step.gained;
      setScore(scoreRef.current);
      if (i >= 1) setCombo({ key: _comboKey++, n: i + 1, gained: step.gained });
      await sleep(FALL_MS);
    }
    return g;
  }, [burst]);

  const resolve = useCallback(
    async (a, b) => {
      const res = trySwap(grid, colors, a, b);
      const inter = clone(grid);
      const tmp = inter[a.r][a.c];
      inter[a.r][a.c] = inter[b.r][b.c];
      inter[b.r][b.c] = tmp;

      if (!res) {
        setBusy(true);
        sfx.invalid();
        setGrid(inter);
        setShake({ a, b });
        await sleep(220);
        setGrid(grid);
        setShake(null);
        setBusy(false);
        return;
      }

      setBusy(true);
      sfx.swap();
      setGrid(inter);
      await sleep(SWAP_MS);
      const left = movesLeft - 1;
      setMovesLeft(left);
      let g = await animateSteps(res.steps, inter);
      if (scoreRef.current >= target) setReached(true);
      if (!hasMove(g, colors)) {
        await sleep(160);
        g = reshuffle(g, colors);
        setGrid(g);
        await sleep(FALL_MS);
      }
      setBusy(false);
      if (left <= 0) finish();
    },
    [grid, colors, movesLeft, finish, target, animateSteps]
  );

  const hammerTile = useCallback(
    async (r, c) => {
      setHammerArmed(false);
      const res = resolveClears(grid, colors, [`${r},${c}`]);
      if (!res) return;
      setBoosters((b) => ({ ...b, hammer: b.hammer - 1 }));
      setBusy(true);
      sfx.booster();
      let g = await animateSteps(res.steps, grid);
      if (scoreRef.current >= target) setReached(true);
      if (!hasMove(g, colors)) {
        await sleep(160);
        g = reshuffle(g, colors);
        setGrid(g);
        await sleep(FALL_MS);
      }
      setBusy(false);
    },
    [grid, colors, target, animateSteps]
  );

  const useShuffle = () => {
    if (busy || boosters.shuffle <= 0 || endedRef.current) return;
    setBoosters((b) => ({ ...b, shuffle: b.shuffle - 1 }));
    sfx.booster();
    setGrid((g) => reshuffle(g, colors));
  };
  const useMoves = () => {
    if (boosters.moves <= 0 || endedRef.current) return;
    setBoosters((b) => ({ ...b, moves: b.moves - 1 }));
    sfx.booster();
    setMovesLeft((m) => m + 5);
  };
  const armHammer = () => {
    if (busy || boosters.hammer <= 0 || endedRef.current) return;
    setHammerArmed((v) => !v);
  };

  const onPointerDown = (r, c, e) => {
    if (control !== "slide" || busy || endedRef.current || movesLeft <= 0 || hammerArmed) return;
    dragRef.current = { r, c, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (control !== "slide" || !dragRef.current) return;
    const { r, c, x, y } = dragRef.current;
    dragRef.current = null;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
    let nr = r, nc = c;
    if (Math.abs(dx) > Math.abs(dy)) nc = c + (dx > 0 ? 1 : -1);
    else nr = r + (dy > 0 ? 1 : -1);
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) return;
    resolve({ r, c }, { r: nr, c: nc });
  };

  const onTile = (r, c) => {
    if (busy || endedRef.current || movesLeft <= 0) return;
    if (hammerArmed) {
      hammerTile(r, c);
      return;
    }
    if (control === "slide") return;
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
  const curStars = score >= star3 ? 3 : score >= star2 ? 2 : score >= target ? 1 : 0;

  return (
    <div className="w-full" data-testid="match3-board">
      {/* HUD */}
      <div className="pmp-game-hud">
        <div className="pmp-hud-moves">
          <div className="pmp-hud-moves-num" data-testid="hud-moves">{movesLeft}</div>
          <div className="pmp-hud-moves-label">moves</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((i) => (
                <Star key={i} size={14} className={i <= curStars ? "text-yellow-300" : "text-white/30"} fill={i <= curStars ? "currentColor" : "none"} />
              ))}
            </div>
            <span className="font-black tabular-nums text-white" data-testid="hud-score">{score.toLocaleString()}</span>
          </div>
          <div className="pmp-hud-bar">
            <div className="pmp-hud-bar-fill" style={{ width: `${pct}%` }} />
            {[star2, star3].map((s, i) => (
              <span key={i} className="pmp-hud-bar-tick" style={{ left: `${Math.min(100, (s / target) * 100 / (star3 / target))}%` }} />
            ))}
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-white/70">
            <span>{hammerArmed ? "Tap a candy to smash it" : control === "slide" ? "Swipe to match" : "Tap two candies to swap"}</span>
            <span>Target {target.toLocaleString()}</span>
          </div>
        </div>
        <button onClick={toggleMute} className="pmp-hud-mute" data-testid="btn-mute" aria-label="Toggle sound">
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {reached && !endedRef.current && (
        <button onClick={finish} className="pmp-finish-btn" data-testid="finish-level-btn">
          <Check size={16} /> Target reached — Finish (or keep going for more stars)
        </button>
      )}

      {/* Board */}
      <div ref={wrapRef} className="pmp-board-wrap">
        <div className={`pmp-board ${shake ? "pmp-board-shake" : ""}`} style={{ width: boardW || "100%", height: boardH, touchAction: control === "slide" ? "none" : undefined }}>
          {/* checker backdrop */}
          {grid.map((row, r) =>
            row.map((_, c) => (
              <div
                key={`bg-${r}-${c}`}
                className={`pmp-board-cell ${(r + c) % 2 ? "pmp-board-cell-alt" : ""}`}
                style={{ width: size, height: size, transform: `translate3d(${c * (size + GAP)}px, ${r * (size + GAP)}px, 0)` }}
              />
            ))
          )}
          {/* candies */}
          {grid.map((row, r) =>
            row.map((cell, c) => {
              if (!cell) return null;
              return (
                <CandyTile
                  key={cell.id}
                  id={cell.id}
                  cell={cell}
                  tile={tileByIndex[cell.t]}
                  size={size}
                  r={r}
                  c={c}
                  selected={!!selected && selected.r === r && selected.c === c}
                  popping={popIds.has(cell.id)}
                  armedHammer={hammerArmed}
                  onPointerDown={(e) => onPointerDown(r, c, e)}
                  onPointerUp={onPointerUp}
                  onClick={() => onTile(r, c)}
                />
              );
            })
          )}
          {/* particles */}
          {particles.map((p) => (
            <span
              key={p.key}
              className="pmp-particle"
              style={{ left: p.x, top: p.y, background: p.color, "--dx": `${p.dx}px`, "--dy": `${p.dy}px` }}
            />
          ))}
          {/* combo popup */}
          {combo && (
            <div key={combo.key} className="pmp-combo-pop">
              <div className="pmp-combo-x">Combo x{combo.n}!</div>
              <div className="pmp-combo-gain">+{combo.gained.toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Booster bar */}
      <div className="pmp-booster-bar" data-testid="booster-bar">
        <button className="pmp-booster" onClick={useShuffle} disabled={boosters.shuffle <= 0 || busy} data-testid="booster-shuffle">
          <Shuffle size={20} />
          <span className="pmp-booster-count">{boosters.shuffle}</span>
          <span className="pmp-booster-label">Shuffle</span>
        </button>
        <button className={`pmp-booster ${hammerArmed ? "pmp-booster-on" : ""}`} onClick={armHammer} disabled={boosters.hammer <= 0 || busy} data-testid="booster-hammer">
          <Hammer size={20} />
          <span className="pmp-booster-count">{boosters.hammer}</span>
          <span className="pmp-booster-label">Smash</span>
        </button>
        <button className="pmp-booster" onClick={useMoves} disabled={boosters.moves <= 0} data-testid="booster-moves">
          <Plus size={20} />
          <span className="pmp-booster-count">{boosters.moves}</span>
          <span className="pmp-booster-label">+5 Moves</span>
        </button>
      </div>
    </div>
  );
}
