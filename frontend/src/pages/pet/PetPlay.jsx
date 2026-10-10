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

const FEED_PORTIONS = 4;
const BATH_SMUDGES = 12;
const PLAY_FETCHES = 5;
const TOYS = ["🎾", "🥏", "🧸"];

// ---------- Species-appropriate foods (inferred for FREE from the pet's description) ----------
const FOOD_RULES = [
  { kw: ["bunny", "rabbit", "hare"], foods: ["🥕", "🥬", "🫐", "🍓"] },
  { kw: ["kitten", "cat", "feline"], foods: ["🐟", "🥛", "🍗", "🐠"] },
  { kw: ["puppy", "dog", "pup", "canine", "wolf"], foods: ["🦴", "🍖", "🥩", "🍗"] },
  { kw: ["dragon", "dino", "dinosaur", "lizard", "reptile", "raptor"], foods: ["🍖", "🌶️", "🥩", "🍗"] },
  { kw: ["parrot", "bird", "chick", "owl", "duck", "penguin"], foods: ["🌻", "🍒", "🫐", "🌽"] },
  { kw: ["shark", "whale", "fish", "aquatic", "octopus", "crab"], foods: ["🦐", "🐟", "🦀", "🐠"] },
  { kw: ["panda", "bear"], foods: ["🎋", "🍯", "🫐", "🐟"] },
  { kw: ["monkey", "ape", "gorilla"], foods: ["🍌", "🍉", "🥭", "🍇"] },
  { kw: ["cow", "sheep", "goat", "horse", "pony", "deer"], foods: ["🌾", "🍎", "🥕", "🌱"] },
  { kw: ["frog", "toad"], foods: ["🦗", "🐛", "🍃", "🪰"] },
  { kw: ["snake", "serpent"], foods: ["🥚", "🐁", "🍖", "🐸"] },
  { kw: ["fox"], foods: ["🍇", "🐁", "🍖", "🫐"] },
  { kw: ["unicorn", "horse", "pony"], foods: ["🍏", "🍓", "🧁", "🥕"] },
  { kw: ["hamster", "mouse", "squirrel", "rodent"], foods: ["🌰", "🌻", "🥜", "🍎"] },
  { kw: ["elephant"], foods: ["🥜", "🍉", "🌿", "🍌"] },
];
const DEFAULT_FOODS = ["🍎", "🍓", "🫐", "🍇"];
function inferFoods(desc) {
  const d = (desc || "").toLowerCase();
  for (const r of FOOD_RULES) if (r.kw.some((k) => d.includes(k))) return r.foods;
  return DEFAULT_FOODS;
}

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
      <div className="animate-cozy-in flex items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onCancel} data-testid="pet-room-close" aria-label="Close"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70 shadow-sm active:scale-90" style={{ color: t.text }}>
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-xl font-black leading-tight" style={{ color: t.text }}>{emoji} {title}</div>
          <div className="truncate text-xs font-semibold opacity-70" style={{ color: t.text }}>{hint}</div>
        </div>
        <button onClick={toggleMute} data-testid="pet-room-mute" aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70 shadow-sm active:scale-90" style={{ color: t.text }}>
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      <div className="px-5">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: t.track }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%`, background: t.accent }} data-testid="pet-room-progress" />
          </div>
          <span className="text-xs font-black tabular-nums" style={{ color: t.text }} data-testid="pet-room-label">{label}</span>
        </div>
      </div>

      <div className="relative mx-auto mt-2 w-full max-w-md flex-1 overflow-hidden">
        {children}
        {celebrating && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/35 backdrop-blur-[2px]" data-testid="pet-room-celebrate">
            <Confetti accent={t.accent} />
            <div className="animate-cozy-in text-center">
              <div className="text-5xl">🎉</div>
              <div className="mt-2 text-2xl font-black" style={{ color: t.text }}>{doneMsg}</div>
              <div className="mt-1 text-sm font-semibold opacity-70" style={{ color: t.text }}>{petName} loved that!</div>
              <button onClick={onDone} data-testid="pet-room-done"
                className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-base font-black text-white shadow-lg active:scale-95" style={{ background: t.accent }}>
                <Check size={20} /> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Floor({ color }) {
  return <div className="absolute inset-x-0 bottom-0 h-1/3 rounded-t-[40%]" style={{ background: color, opacity: 0.55 }} />;
}

// Hook: completion guard + celebration -> onDone.
function useComplete(onDone) {
  const [celebrating, setCelebrating] = useState(false);
  const firedRef = useRef(false);
  const timerRef = useRef(null);
  const celebrate = useCallback((delay = 1500) => {
    if (firedRef.current) return;
    firedRef.current = true;
    setCelebrating(true);
    playHappyChime();
    timerRef.current = setTimeout(() => onDone(), delay);
  }, [onDone]);
  const finishNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onDone();
  }, [onDone]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { celebrating, celebrate, finishNow };
}

// ---------- FEED ----------
function FoodPiece({ emoji, home, petRef, onEat, testId }) {
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
    if (over || !movedRef.current) onEat();
  };

  const style = drag
    ? { position: "fixed", left: drag.x, top: drag.y, transform: "translate(-50%,-50%) scale(1.4)", zIndex: 80, touchAction: "none" }
    : { position: "absolute", left: home.left, top: home.top, transform: "translate(-50%,-50%)", touchAction: "none" };

  return (
    <button
      ref={ref}
      data-testid={testId}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="cursor-grab select-none text-5xl active:cursor-grabbing sm:text-6xl"
      style={{ ...style, filter: "drop-shadow(0 4px 3px rgba(0,0,0,.28))" }}
      aria-label="Food"
    >
      {emoji}
    </button>
  );
}

function FeedRoom({ theme, petImage, petName, petDescription, onDone, onCancel }) {
  const t = theme || DEFAULT_THEME;
  const petRef = useRef(null);
  const [foods, setFoods] = useState(() => {
    const menu = inferFoods(petDescription);
    return Array.from({ length: FEED_PORTIONS }, (_, i) => ({
      id: i,
      emoji: menu[i % menu.length],
      home: { left: `${20 + i * 20}%`, top: "82%" },
    }));
  });
  const [react, setReact] = useState(false);
  const [yum, setYum] = useState(false);
  const { celebrating, celebrate, finishNow } = useComplete(onDone);
  const eaten = FEED_PORTIONS - foods.length;

  const eat = (id) => {
    setFoods((f) => {
      if (!f.some((x) => x.id === id)) return f;
      const next = f.filter((x) => x.id !== id);
      playNom();
      if (next.length === 0) setTimeout(() => celebrate(), 350);
      return next;
    });
    setReact(true);
    setYum(true);
    setTimeout(() => setReact(false), 420);
    setTimeout(() => setYum(false), 650);
  };

  return (
    <CozyShell
      theme={t} emoji="🍽️" title="Bon appétit!" hint={`Drag ${petName}'s favourite foods to its mouth`}
      progress={eaten / FEED_PORTIONS} label={`${foods.length} left`} petName={petName}
      onCancel={onCancel} celebrating={celebrating} doneMsg="Full and happy!" onDone={finishNow}
    >
      <Floor color={t.floor} />
      <div className="absolute inset-x-6 bottom-[8%] h-6 rounded-full" style={{ background: t.floor, opacity: 0.8 }} />
      <div className="absolute bottom-[10%] left-1/2 h-10 w-56 -translate-x-1/2 rounded-full bg-white/80 shadow-inner ring-1 ring-black/5" />
      <div ref={petRef} className="absolute left-1/2 top-[34%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <img src={petImage} alt={petName} draggable={false}
          className={`h-44 w-44 object-contain drop-shadow-xl sm:h-52 sm:w-52 ${react ? "animate-pet-chomp" : "animate-pet-idle"}`} />
        {yum && <span className="animate-cozy-in absolute -top-4 text-2xl font-black" style={{ color: t.accent }}>yum! 😋</span>}
      </div>
      {foods.map((f) => (
        <FoodPiece key={f.id} emoji={f.emoji} home={f.home} petRef={petRef} onEat={() => eat(f.id)} testId={`pet-food-${f.id}`} />
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
      top: `${24 + Math.random() * 52}%`,
      left: `${20 + Math.random() * 60}%`,
      size: 22 + Math.random() * 18,
    })),
  );
  const smudgeRefs = useRef({});
  const smudgesRef = useRef(smudges);
  smudgesRef.current = smudges;
  const [bubbles, setBubbles] = useState([]);
  const bubbleId = useRef(0);
  const lastSpawn = useRef(0);
  const [sponge, setSponge] = useState({ left: "50%", top: "50%" });
  const draggingRef = useRef(false);
  const [react, setReact] = useState(false);
  const [rinsing, setRinsing] = useState(false);
  const spongeRef = useRef(null);
  const { celebrating, celebrate, finishNow } = useComplete(onDone);
  const cleaned = BATH_SMUDGES - smudges.length;
  const progress = cleaned / BATH_SMUDGES;

  // spawn a cluster of drifting bubbles at a screen point (fixed coords)
  const spawnBubbles = (x, y, n = 2) => {
    const now = performance.now();
    if (now - lastSpawn.current < 36) return;
    lastSpawn.current = now;
    const made = Array.from({ length: n }, () => {
      const id = ++bubbleId.current;
      return {
        id,
        x: x + (Math.random() - 0.5) * 46,
        y: y + (Math.random() - 0.5) * 46,
        size: 8 + Math.random() * 16,
        bx: (Math.random() - 0.5) * 70,
        by: -(50 + Math.random() * 80),
        bd: 0.9 + Math.random() * 0.8,
      };
    });
    setBubbles((b) => {
      const next = [...b, ...made];
      return next.length > 48 ? next.slice(next.length - 48) : next;
    });
    made.forEach((m) => setTimeout(() => setBubbles((b) => b.filter((z) => z.id !== m.id)), m.bd * 1000 + 60));
  };

  const removeSmudge = (id) => {
    let becameClean = false;
    setSmudges((prev) => {
      if (!prev.some((s) => s.id === id)) return prev;
      const next = prev.filter((s) => s.id !== id);
      playSplash();
      if (next.length === 0) becameClean = true;
      return next;
    });
    setReact(true);
    setTimeout(() => setReact(false), 450);
    if (becameClean) {
      setTimeout(() => { setRinsing(true); setTimeout(() => celebrate(), 1050); }, 200);
    }
  };

  const scrubAt = (cx, cy) => {
    spawnBubbles(cx, cy, 2 + Math.floor(Math.random() * 2));
    for (const s of smudgesRef.current) {
      const el = smudgeRefs.current[s.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (cx >= r.left - 14 && cx <= r.right + 14 && cy >= r.top - 14 && cy <= r.bottom + 14) {
        removeSmudge(s.id);
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
      theme={t} emoji="🫧" title="Scrub-a-dub!" hint="Scrub with the sponge — raise lots of bubbles!"
      progress={progress} label={`${Math.round(progress * 100)}% clean`} petName={petName}
      onCancel={onCancel} celebrating={celebrating} doneMsg="Squeaky clean! ✨" onDone={finishNow}
    >
      {/* tub */}
      <div className="absolute inset-x-5 bottom-[6%] top-[20%] rounded-[2.5rem] bg-white/55 shadow-inner ring-1 ring-black/5" />
      <div className="absolute inset-x-7 bottom-[8%] top-[46%] overflow-hidden rounded-[2rem]" style={{ background: t.accent, opacity: 0.22 }}>
        <div className="absolute inset-x-0 top-0 h-3 bg-white/60" />
      </div>

      {/* building foam layer (grows with progress) */}
      <div className="pointer-events-none absolute inset-x-7 bottom-[8%] overflow-visible rounded-b-[2rem] transition-all duration-500"
        style={{ height: `${18 + progress * 46}%`, background: "linear-gradient(0deg, rgba(255,255,255,.85), rgba(255,255,255,.45))" }} data-testid="pet-foam-layer">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="absolute rounded-full bg-white/90"
            style={{ bottom: `calc(100% - ${8 + (i % 2) * 6}px)`, left: `${i * 9}%`, width: 20 + (i % 3) * 8, height: 20 + (i % 3) * 8 }} />
        ))}
      </div>

      {/* pet in tub */}
      <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <img src={petImage} alt={petName} draggable={false}
            className={`h-44 w-44 object-contain drop-shadow-xl sm:h-48 sm:w-48 ${(react || rinsing) ? "animate-pet-shake" : "animate-pet-idle"}`} />
          {smudges.map((s) => (
            <span key={s.id} ref={(el) => { smudgeRefs.current[s.id] = el; }}
              onClick={() => removeSmudge(s.id)} data-testid={`pet-smudge-${s.id}`}
              className="absolute cursor-pointer rounded-full"
              style={{ top: s.top, left: s.left, width: s.size, height: s.size, background: "radial-gradient(circle,#8a6a4a,#5c4428)", opacity: 0.85 }} />
          ))}
          {rinsing && Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="animate-pet-sparkle pointer-events-none absolute text-2xl"
              style={{ left: `${15 + Math.random() * 70}%`, top: `${10 + Math.random() * 70}%`, animationDelay: `${i * 0.08}s` }}>✨</span>
          ))}
        </div>
      </div>

      {/* drifting popping bubbles along the sponge trail */}
      {bubbles.map((b) => (
        <span key={b.id} className="animate-bath-bubble pointer-events-none fixed rounded-full border border-white/70 bg-white/45"
          style={{ left: b.x, top: b.y, width: b.size, height: b.size, "--bx": `${b.bx}px`, "--by": `${b.by}px`, "--bd": `${b.bd}s` }} />
      ))}

      {/* sponge */}
      <button ref={spongeRef} data-testid="pet-sponge"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="absolute z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-2xl text-3xl shadow-lg active:cursor-grabbing"
        style={{ left: sponge.left, top: sponge.top, background: "linear-gradient(180deg,#fff6a8,#f6d84a)" }} aria-label="Sponge">
        🧽
      </button>
    </CozyShell>
  );
}

// ---------- PLAY ----------
function PlayRoom({ theme, petImage, petName, onDone, onCancel }) {
  const t = theme || DEFAULT_THEME;
  const sceneRef = useRef(null);
  const toyRef = useRef(null);
  const [fetched, setFetched] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showStreak, setShowStreak] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | fly | grab | return
  const [toyIdx, setToyIdx] = useState(0);
  const [land, setLand] = useState({ tx: 0, ty: 0, apex: -150 }); // toy flight offsets from home
  const [petPos, setPetPos] = useState({ dx: 0, dy: 0 });
  const fetchedRef = useRef(0);
  const busyRef = useRef(false);
  const startRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const after = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };

  const doThrow = (vx, vy) => {
    if (busyRef.current || fetchedRef.current >= PLAY_FETCHES) return;
    const sc = sceneRef.current?.getBoundingClientRect();
    const w = sc?.width || 360;
    const h = sc?.height || 420;
    const homeX = w / 2;
    const homeY = h * 0.74;
    const petHomeY = h * 0.40;
    const up = Math.min(Math.max(-vy, 40), 300); // drag up => bigger arc
    const landX = Math.min(Math.max(homeX + vx * 1.3, 48), w - 48);
    const landY = Math.min(Math.max(homeY - up * 1.15, h * 0.18), h * 0.62);
    busyRef.current = true;
    setLand({ tx: landX - homeX, ty: landY - homeY, apex: -(up * 0.9 + 90) });
    setPhase("fly");
    playFetch();
    // pet runs toward the landing spot so it arrives as the toy lands
    setPetPos({ dx: landX - homeX, dy: landY - petHomeY + 10 });
    after(640, () => setPhase("grab"));
    after(980, () => { setPhase("return"); setPetPos({ dx: 0, dy: 0 }); });
    after(1520, () => {
      setPhase("idle");
      busyRef.current = false;
      const n = fetchedRef.current + 1;
      fetchedRef.current = n;
      setFetched(n);
      setStreak((s) => {
        const ns = s + 1;
        if (ns >= 2) { setShowStreak(true); setTimeout(() => setShowStreak(false), 900); }
        return ns;
      });
      setToyIdx((i) => (i + 1) % TOYS.length);
      if (n >= PLAY_FETCHES) after(260, () => celebrate());
    });
  };

  const { celebrating, celebrate, finishNow } = useComplete(onDone);

  const down = (e) => {
    e.preventDefault();
    toyRef.current?.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
  };
  const up = (e) => {
    if (!startRef.current) return;
    const vx = e.clientX - startRef.current.x;
    const vy = e.clientY - startRef.current.y;
    startRef.current = null;
    if (Math.hypot(vx, vy) < 8) doThrow((Math.random() - 0.5) * 200, -(140 + Math.random() * 120)); // tap = default lob
    else doThrow(vx, vy);
  };

  const toy = TOYS[toyIdx];
  const toyStyle =
    phase === "fly"
      ? { "--tx": `${land.tx}px`, "--ty": `${land.ty}px`, "--apex": `${land.apex}px` }
      : phase === "grab"
      ? { transform: `translate(-50%,-50%) translate(${land.tx}px, ${land.ty}px)` }
      : { transform: "translate(-50%,-50%)" };

  return (
    <CozyShell
      theme={t} emoji="🎾" title="Fetch!" hint={`Aim & fling the toy — ${petName} will chase it!`}
      progress={fetched / PLAY_FETCHES} label={`${fetched}/${PLAY_FETCHES}`} petName={petName}
      onCancel={onCancel} celebrating={celebrating} doneMsg="So much fun! 🐾" onDone={finishNow}
    >
      <div ref={sceneRef} className="absolute inset-0">
        <Floor color={t.floor} />
        <span className="absolute right-5 top-4 text-5xl drop-shadow-sm">☀️</span>
        <span className="absolute left-4 bottom-[26%] text-4xl">🪴</span>
        <span className="absolute right-6 bottom-[24%] text-4xl">🌷</span>

        {/* pet (runs to the toy & back) */}
        <div className="absolute left-1/2 top-[40%] z-10 -translate-x-1/2 -translate-y-1/2 transition-transform duration-[600ms] ease-out"
          style={{ transform: `translate(-50%,-50%) translate(${petPos.dx}px, ${petPos.dy}px)` }}>
          <img src={petImage} alt={petName} draggable={false}
            className={`h-40 w-40 object-contain drop-shadow-xl sm:h-48 sm:w-48 ${phase !== "idle" ? "animate-pet-bounce" : "animate-pet-idle"}`} />
          {showStreak && <span className="animate-cozy-in absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xl font-black" style={{ color: t.accent }}>combo x{streak}! 🔥</span>}
        </div>

        {/* toy */}
        <button
          ref={toyRef}
          data-testid="pet-ball"
          onPointerDown={down}
          onPointerUp={up}
          onPointerCancel={up}
          disabled={phase !== "idle"}
          className={`absolute left-1/2 top-[74%] z-20 touch-none text-4xl drop-shadow-lg active:scale-90 sm:text-5xl ${phase === "fly" ? "animate-toy-throw" : ""} ${phase === "return" ? "opacity-0 transition-opacity duration-200" : "transition-opacity"}`}
          style={toyStyle}
          aria-label="Toy"
        >
          {toy}
        </button>

        <p className="absolute inset-x-0 bottom-2 text-center text-xs font-bold opacity-60" style={{ color: t.text }}>
          Drag to aim & fling — or tap to throw
        </p>
      </div>
    </CozyShell>
  );
}

// ---------- Public entry ----------
export function CareRoom({ activity, petImage, petName, petDescription, theme, onDone, onCancel }) {
  const common = { theme, petImage, petName: petName || "your pet", onDone, onCancel };
  if (activity === "feed") return <FeedRoom {...common} petDescription={petDescription} />;
  if (activity === "bath") return <BathRoom {...common} />;
  if (activity === "play") return <PlayRoom {...common} />;
  return null;
}
