import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX, Check } from "lucide-react";
import { playNom, playSplash, playFetch, playHappyChime, isPetMuted, setPetMuted } from "@/lib/sound";

// ---------- Cozy room themes (warm pastel; orange kept as a small accent) ----------
export const ROOM_THEMES = {
  cream: {
    label: "Cozy Cream", swatch: "#FFD8A8",
    bg: "linear-gradient(180deg,#FFF4E2 0%,#FFE6C9 55%,#F6D3A7 100%)",
    floor: "#E9C79B", wall: "#FFEFD6", accent: "#FF8A4C", text: "#7A5636", track: "rgba(122,86,54,.14)",
  },
  peach: {
    label: "Peach Blush", swatch: "#FFB4A2",
    bg: "linear-gradient(180deg,#FFEDE7 0%,#FFD6C9 55%,#FFBBA7 100%)",
    floor: "#F3B9A6", wall: "#FFE2D8", accent: "#FF6F59", text: "#8A4A3B", track: "rgba(138,74,59,.14)",
  },
  mint: {
    label: "Mint Breeze", swatch: "#9BE6C1",
    bg: "linear-gradient(180deg,#E8FAF0 0%,#C7F0DB 55%,#A6E7C6 100%)",
    floor: "#A9E0C3", wall: "#DBF7E8", accent: "#2BB673", text: "#2F6B4F", track: "rgba(47,107,79,.14)",
  },
  lavender: {
    label: "Lavender Dream", swatch: "#C5B3FF",
    bg: "linear-gradient(180deg,#F2EDFF 0%,#E0D4FF 55%,#CBB8FF 100%)",
    floor: "#CDBEF5", wall: "#ECE4FF", accent: "#8B6DFF", text: "#53417F", track: "rgba(83,65,127,.14)",
  },
};
const DEFAULT_THEME = ROOM_THEMES.cream;

const FOODS = ["🍎", "🍖", "🍓", "🥕", "🍪", "🧀"];
const FEED_PORTIONS = 4;
const BATH_SMUDGES = 6;
const PLAY_FETCHES = 4;

function Confetti({ accent }) {
  const colors = [accent, "#FF8A4C", "#FFD93D", "#4ECDC4", "#FF6F91", "#6BCB77"];
  const pieces = Array.from({ length: 22 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {pieces.map((i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 block h-2.5 w-2.5 rounded-[2px]"
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

// ---------- Shared full-screen cozy-room shell ----------
function CozyShell({ theme, title, hint, emoji, progress, label, petName, onCancel, children, celebrating, doneMsg, onDone }) {
  const t = theme || DEFAULT_THEME;
  const [muted, setMuted] = useState(isPetMuted());
  const toggleMute = () => { const v = !muted; setMuted(v); setPetMuted(v); };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" data-testid="pet-cozy-room" style={{ background: t.bg }}>
      {/* Header banner */}
      <div className="animate-cozy-in flex items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={onCancel}
          data-testid="pet-room-close"
          aria-label="Close"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70 shadow-sm active:scale-90"
          style={{ color: t.text }}
        >
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-xl font-black leading-tight" style={{ color: t.text }}>{emoji} {title}</div>
          <div className="truncate text-xs font-semibold opacity-70" style={{ color: t.text }}>{hint}</div>
        </div>
        <button
          onClick={toggleMute}
          data-testid="pet-room-mute"
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70 shadow-sm active:scale-90"
          style={{ color: t.text }}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      {/* Progress meter */}
      <div className="px-5">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: t.track }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%`, background: t.accent }}
              data-testid="pet-room-progress"
            />
          </div>
          <span className="text-xs font-black tabular-nums" style={{ color: t.text }} data-testid="pet-room-label">{label}</span>
        </div>
      </div>

      {/* Scene */}
      <div className="relative mx-auto mt-2 w-full max-w-md flex-1 overflow-hidden">
        {children}
        {celebrating && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/35 backdrop-blur-[2px]" data-testid="pet-room-celebrate">
            <Confetti accent={t.accent} />
            <div className="animate-cozy-in text-center">
              <div className="text-5xl">🎉</div>
              <div className="mt-2 text-2xl font-black" style={{ color: t.text }}>{doneMsg}</div>
              <div className="mt-1 text-sm font-semibold opacity-70" style={{ color: t.text }}>{petName} loved that!</div>
              <button
                onClick={onDone}
                data-testid="pet-room-done"
                className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-base font-black text-white shadow-lg active:scale-95"
                style={{ background: t.accent }}
              >
                <Check size={20} /> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// A soft rounded "floor" strip for depth at the bottom of a scene.
function Floor({ color }) {
  return <div className="absolute inset-x-0 bottom-0 h-1/3 rounded-t-[40%]" style={{ background: color, opacity: 0.55 }} />;
}

// Hook: completion guard + celebration -> onDone.
function useComplete(onDone) {
  const [celebrating, setCelebrating] = useState(false);
  const firedRef = useRef(false);
  const timerRef = useRef(null);
  const celebrate = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    setCelebrating(true);
    playHappyChime();
    timerRef.current = setTimeout(() => onDone(), 1500);
  }, [onDone]);
  const finishNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onDone();
  }, [onDone]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { celebrating, celebrate, finishNow };
}

// ---------- FEED ----------
function FoodPiece({ emoji, home, petRef, onEat, testId, accent }) {
  const [drag, setDrag] = useState(null);
  const startRef = useRef(null);
  const movedRef = useRef(false);
  const ref = useRef(null);

  const down = (e) => {
    e.preventDefault();
    ref.current?.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    setDrag({ x: e.clientX, y: e.clientY });
  };
  const move = (e) => {
    if (!startRef.current) return;
    if (Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > 6) movedRef.current = true;
    setDrag({ x: e.clientX, y: e.clientY });
  };
  const up = (e) => {
    if (!startRef.current) return;
    const r = petRef.current?.getBoundingClientRect();
    const over = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    startRef.current = null;
    setDrag(null);
    if (over || !movedRef.current) onEat(); // drop on pet OR tap fallback
  };

  const style = drag
    ? { position: "fixed", left: drag.x, top: drag.y, transform: "translate(-50%,-50%) scale(1.35)", zIndex: 80, touchAction: "none" }
    : { position: "absolute", left: home.left, top: home.top, transform: "translate(-50%,-50%)", touchAction: "none" };

  return (
    <button
      ref={ref}
      data-testid={testId}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="cursor-grab select-none text-4xl drop-shadow-md active:cursor-grabbing sm:text-5xl"
      style={style}
      aria-label="Food"
    >
      <span className="inline-block rounded-full bg-white/70 p-1 ring-2" style={{ "--tw-ring-color": accent }}>{emoji}</span>
    </button>
  );
}

function FeedRoom({ theme, petImage, petName, onDone, onCancel }) {
  const t = theme || DEFAULT_THEME;
  const petRef = useRef(null);
  const [foods, setFoods] = useState(() =>
    Array.from({ length: FEED_PORTIONS }, (_, i) => ({
      id: i,
      emoji: FOODS[Math.floor(Math.random() * FOODS.length)],
      home: { left: `${20 + i * 20}%`, top: "82%" },
    })),
  );
  const [react, setReact] = useState(false);
  const { celebrating, celebrate, finishNow } = useComplete(onDone);
  const eaten = FEED_PORTIONS - foods.length;

  const eat = (id) => {
    setFoods((f) => {
      if (!f.some((x) => x.id === id)) return f;
      const next = f.filter((x) => x.id !== id);
      playNom();
      if (next.length === 0) setTimeout(celebrate, 350);
      return next;
    });
    setReact(true);
    setTimeout(() => setReact(false), 420);
  };

  return (
    <CozyShell
      theme={t} emoji="🍽️" title="Bon appétit!" hint={`Drag the food to ${petName}'s mouth`}
      progress={eaten / FEED_PORTIONS} label={`${foods.length} left`} petName={petName}
      onCancel={onCancel} celebrating={celebrating} doneMsg="Full and happy!" onDone={finishNow}
    >
      <Floor color={t.floor} />
      {/* table */}
      <div className="absolute inset-x-6 bottom-[8%] h-6 rounded-full" style={{ background: t.floor, opacity: 0.8 }} />
      {/* plate */}
      <div className="absolute bottom-[10%] left-1/2 h-10 w-56 -translate-x-1/2 rounded-full bg-white/80 shadow-inner ring-1 ring-black/5" />
      {/* pet + mouth target */}
      <div ref={petRef} className="absolute left-1/2 top-[34%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <img
          src={petImage}
          alt={petName}
          draggable={false}
          className={`h-44 w-44 object-contain drop-shadow-xl sm:h-52 sm:w-52 ${react ? "animate-pet-chomp" : "animate-pet-idle"}`}
        />
      </div>
      {foods.map((f) => (
        <FoodPiece key={f.id} emoji={f.emoji} home={f.home} petRef={petRef} onEat={() => eat(f.id)} testId={`pet-food-${f.id}`} accent={t.accent} />
      ))}
    </CozyShell>
  );
}

// ---------- BATH ----------
function BathRoom({ theme, petImage, petName, onDone, onCancel }) {
  const t = theme || DEFAULT_THEME;
  const [smudges, setSmudges] = useState(() =>
    Array.from({ length: BATH_SMUDGES }, (_, i) => ({
      id: i,
      top: `${28 + Math.random() * 44}%`,
      left: `${26 + Math.random() * 48}%`,
      size: 26 + Math.random() * 16,
    })),
  );
  const smudgeRefs = useRef({});
  const smudgesRef = useRef(smudges);
  smudgesRef.current = smudges;
  const [bubbles, setBubbles] = useState([]);
  const bubbleId = useRef(0);
  const [sponge, setSponge] = useState({ left: "50%", top: "50%" });
  const draggingRef = useRef(false);
  const [react, setReact] = useState(false);
  const spongeRef = useRef(null);
  const { celebrating, celebrate, finishNow } = useComplete(onDone);
  const cleaned = BATH_SMUDGES - smudges.length;

  const popBubble = (x, y) => {
    const id = ++bubbleId.current;
    setBubbles((b) => [...b, { id, x, y }]);
    setTimeout(() => setBubbles((b) => b.filter((z) => z.id !== id)), 1100);
  };

  const removeSmudge = (id, clientX, clientY) => {
    setSmudges((prev) => {
      if (!prev.some((s) => s.id === id)) return prev;
      const next = prev.filter((s) => s.id !== id);
      playSplash();
      if (next.length === 0) setTimeout(celebrate, 350);
      return next;
    });
    setReact(true);
    setTimeout(() => setReact(false), 500);
    if (clientX != null) popBubble(clientX, clientY);
  };

  const scrubAt = (cx, cy) => {
    for (const s of smudgesRef.current) {
      const el = smudgeRefs.current[s.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (cx >= r.left - 12 && cx <= r.right + 12 && cy >= r.top - 12 && cy <= r.bottom + 12) {
        removeSmudge(s.id, cx, cy);
        break;
      }
    }
  };

  const setSpongePos = (e) => {
    const parent = spongeRef.current?.offsetParent?.getBoundingClientRect();
    if (parent) setSponge({ left: `${((e.clientX - parent.left) / parent.width) * 100}%`, top: `${((e.clientY - parent.top) / parent.height) * 100}%` });
  };
  const down = (e) => {
    e.preventDefault();
    spongeRef.current?.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setSpongePos(e);
    scrubAt(e.clientX, e.clientY);
  };
  const move = (e) => {
    if (!draggingRef.current) return;
    setSpongePos(e);
    scrubAt(e.clientX, e.clientY);
  };
  const up = () => { draggingRef.current = false; };

  return (
    <CozyShell
      theme={t} emoji="🫧" title="Scrub-a-dub!" hint="Drag the sponge to scrub the dirt away"
      progress={cleaned / BATH_SMUDGES} label={`${Math.round((cleaned / BATH_SMUDGES) * 100)}% clean`} petName={petName}
      onCancel={onCancel} celebrating={celebrating} doneMsg="Squeaky clean!" onDone={finishNow}
    >
      {/* tub */}
      <div className="absolute inset-x-5 bottom-[6%] top-[22%] rounded-[2.5rem] bg-white/55 shadow-inner ring-1 ring-black/5" />
      <div className="absolute inset-x-7 bottom-[8%] top-[46%] overflow-hidden rounded-[2rem]" style={{ background: t.accent, opacity: 0.22 }}>
        <div className="absolute inset-x-0 top-0 h-3 bg-white/60" />
      </div>
      {/* pet in tub */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <img
            src={petImage}
            alt={petName}
            draggable={false}
            className={`h-44 w-44 object-contain drop-shadow-xl sm:h-48 sm:w-48 ${react ? "animate-pet-shake" : "animate-pet-idle"}`}
          />
          {smudges.map((s) => (
            <span
              key={s.id}
              ref={(el) => { smudgeRefs.current[s.id] = el; }}
              onClick={(e) => removeSmudge(s.id, e.clientX, e.clientY)}
              data-testid={`pet-smudge-${s.id}`}
              className="absolute cursor-pointer rounded-full"
              style={{ top: s.top, left: s.left, width: s.size, height: s.size, background: "radial-gradient(circle,#8a6a4a,#5c4428)", opacity: 0.85 }}
            />
          ))}
        </div>
      </div>
      {/* bubbles */}
      {bubbles.map((b) => (
        <span key={b.id} className="animate-cozy-bubble pointer-events-none fixed h-6 w-6 rounded-full border border-white/70 bg-white/40" style={{ left: b.x, top: b.y, transform: "translate(-50%,-50%)" }} />
      ))}
      {/* sponge */}
      <button
        ref={spongeRef}
        data-testid="pet-sponge"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="absolute z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-2xl text-3xl shadow-lg active:cursor-grabbing"
        style={{ left: sponge.left, top: sponge.top, background: "linear-gradient(180deg,#fff6a8,#f6d84a)" }}
        aria-label="Sponge"
      >
        🧽
      </button>
    </CozyShell>
  );
}

// ---------- PLAY ----------
function PlayRoom({ theme, petImage, petName, onDone, onCancel }) {
  const t = theme || DEFAULT_THEME;
  const [fetched, setFetched] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | out | back
  const [side, setSide] = useState(1);
  const fetchedRef = useRef(0);
  const startRef = useRef(null);
  const movedRef = useRef(false);
  const ballRef = useRef(null);
  const { celebrating, celebrate, finishNow } = useComplete(onDone);

  const throwBall = () => {
    if (phase !== "idle" || fetchedRef.current >= PLAY_FETCHES) return;
    const dir = Math.random() > 0.5 ? 1 : -1;
    setSide(dir);
    setPhase("out");
    playFetch();
    setTimeout(() => setPhase("back"), 400);
    setTimeout(() => {
      setPhase("idle");
      const n = fetchedRef.current + 1;
      fetchedRef.current = n;
      setFetched(n);
      if (n >= PLAY_FETCHES) setTimeout(celebrate, 300);
    }, 820);
  };

  const down = (e) => {
    e.preventDefault();
    ballRef.current?.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  };
  const move = (e) => {
    if (!startRef.current) return;
    if (Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > 6) movedRef.current = true;
  };
  const up = () => {
    if (!startRef.current) return;
    startRef.current = null;
    throwBall(); // fling OR tap both throw (forgiving)
  };

  const ballTransform =
    phase === "out" ? `translate(${side * 90}px,-150px) scale(.75)` :
    phase === "back" ? "translate(0,-8px) scale(1)" :
    "translate(0,0) scale(1)";
  const petTransform = phase === "out" ? `translateX(${side * 36}px)` : "translateX(0)";

  return (
    <CozyShell
      theme={t} emoji="🎾" title="Fetch!" hint={`Fling the ball — ${petName} will chase it!`}
      progress={fetched / PLAY_FETCHES} label={`${fetched}/${PLAY_FETCHES}`} petName={petName}
      onCancel={onCancel} celebrating={celebrating} doneMsg="So happy!" onDone={finishNow}
    >
      <Floor color={t.floor} />
      <span className="absolute right-5 top-4 text-5xl drop-shadow-sm">☀️</span>
      <span className="absolute left-4 bottom-[26%] text-4xl">🪴</span>
      <span className="absolute right-6 bottom-[24%] text-4xl">🌷</span>
      {/* pet */}
      <div
        className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 transition-transform duration-300"
        style={{ transform: `translate(-50%,-50%) ${petTransform}` }}
      >
        <img
          src={petImage}
          alt={petName}
          draggable={false}
          className={`h-44 w-44 object-contain drop-shadow-xl sm:h-52 sm:w-52 ${phase !== "idle" ? "animate-pet-bounce" : "animate-pet-idle"}`}
        />
      </div>
      {/* ball */}
      <button
        ref={ballRef}
        data-testid="pet-ball"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        disabled={phase !== "idle"}
        className="absolute bottom-[12%] left-1/2 z-20 -translate-x-1/2 touch-none text-5xl drop-shadow-lg transition-transform duration-[380ms] ease-out active:scale-90"
        style={{ transform: `translateX(-50%) ${ballTransform}` }}
        aria-label="Ball"
      >
        🎾
      </button>
      <p className="absolute inset-x-0 bottom-2 text-center text-xs font-bold opacity-60" style={{ color: t.text }}>
        Tap or fling the ball
      </p>
    </CozyShell>
  );
}

// ---------- Public entry ----------
export function CareRoom({ activity, petImage, petName, theme, onDone, onCancel }) {
  const common = { theme, petImage, petName: petName || "your pet", onDone, onCancel };
  if (activity === "feed") return <FeedRoom {...common} />;
  if (activity === "bath") return <BathRoom {...common} />;
  if (activity === "play") return <PlayRoom {...common} />;
  return null;
}
