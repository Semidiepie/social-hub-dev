import React, { useEffect, useRef, useState } from "react";
import { X, Timer, Trophy } from "lucide-react";

const TREATS = ["🍎", "🍖", "🦴", "🍬", "⭐", "🍓", "🧀"];
const AREA_H = 360;

// 15-second "catch the treats" tap game. Calls onDone(score) when time runs out.
export function CatchGame({ petImage, onDone, onCancel }) {
  const [treats, setTreats] = useState([]);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(15);
  const idRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const spawn = setInterval(() => {
      const id = ++idRef.current;
      const emoji = TREATS[Math.floor(Math.random() * TREATS.length)];
      const left = 6 + Math.random() * 82;
      const dur = 2000 + Math.random() * 1400;
      setTreats((t) => [...t, { id, left, emoji, dur }]);
      setTimeout(() => setTreats((t) => t.filter((x) => x.id !== id)), dur);
    }, 560);
    const timer = setInterval(() => setTime((s) => Math.max(0, s - 1)), 1000);
    return () => { clearInterval(spawn); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (time <= 0 && !doneRef.current) {
      doneRef.current = true;
      setTimeout(() => onDone(score), 600);
    }
  }, [time, score, onDone]);

  const catchTreat = (id) => {
    setTreats((t) => t.filter((x) => x.id !== id));
    setScore((s) => s + 1);
  };

  return (
    <div className="w-full" data-testid="pet-catch-game">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/70 px-3 py-1.5 text-sm font-black text-amber-300">
          <Trophy size={15} /> {score}
        </span>
        <span className="text-sm font-bold text-emerald-100">Tap the treats! 🎯</span>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/70 px-3 py-1.5 text-sm font-black text-emerald-100">
          <Timer size={15} /> {time}s
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-emerald-800/50 bg-gradient-to-b from-sky-900/40 to-emerald-950/70" style={{ height: AREA_H }}>
        {treats.map((tr) => (
          <button
            key={tr.id}
            onClick={() => catchTreat(tr.id)}
            className="absolute top-0 text-3xl active:scale-125"
            style={{ left: `${tr.left}%`, animation: `treat-fall ${tr.dur}ms linear forwards`, "--fall": `${AREA_H - 40}px` }}
          >
            {tr.emoji}
          </button>
        ))}
        <img src={petImage} alt="pet" className="absolute bottom-1 left-1/2 h-24 w-24 -translate-x-1/2 object-contain drop-shadow-xl animate-pet-idle" />
      </div>
      <button onClick={onCancel} className="mt-3 w-full rounded-xl border border-emerald-700/50 py-2 text-sm font-semibold text-emerald-200/80 hover:bg-emerald-900/40">
        Stop game
      </button>
    </div>
  );
}

// Tap every bubble to scrub the pet clean, then onDone().
export function BubbleBath({ petImage, onDone, onCancel }) {
  const [bubbles, setBubbles] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      top: 15 + Math.random() * 60,
      left: 12 + Math.random() * 66,
      size: 34 + Math.random() * 26,
    })),
  );
  const doneRef = useRef(false);

  const pop = (id) => setBubbles((b) => b.filter((x) => x.id !== id));

  useEffect(() => {
    if (bubbles.length === 0 && !doneRef.current) {
      doneRef.current = true;
      setTimeout(onDone, 400);
    }
  }, [bubbles, onDone]);

  return (
    <div className="w-full" data-testid="pet-bubble-bath">
      <p className="mb-3 text-center text-sm font-bold text-sky-100">Scrub-a-dub! Pop all the bubbles 🫧</p>
      <div className="relative mx-auto overflow-hidden rounded-2xl border border-sky-700/40 bg-gradient-to-b from-sky-700/40 to-sky-950/70" style={{ height: 320 }}>
        <img src={petImage} alt="pet" className="absolute bottom-2 left-1/2 h-52 w-52 -translate-x-1/2 object-contain drop-shadow-xl animate-pet-idle" />
        {bubbles.map((b) => (
          <button
            key={b.id}
            onClick={() => pop(b.id)}
            className="absolute rounded-full border border-white/60 bg-white/25 backdrop-blur-sm transition-transform active:scale-150"
            style={{ top: `${b.top}%`, left: `${b.left}%`, width: b.size, height: b.size }}
            data-testid={`bath-bubble-${b.id}`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-sky-200/70">{bubbles.length} bubbles left</p>
      <button onClick={onCancel} className="mt-2 w-full rounded-xl border border-sky-700/40 py-2 text-sm font-semibold text-sky-200/80 hover:bg-sky-900/40">
        Cancel
      </button>
    </div>
  );
}

// Tap each treat to toss it to the pet, then onDone().
export function FeedToss({ petImage, onDone, onCancel }) {
  const [foods, setFoods] = useState(() =>
    Array.from({ length: 3 }, (_, i) => ({ id: i, emoji: TREATS[Math.floor(Math.random() * TREATS.length)] })),
  );
  const doneRef = useRef(false);

  const toss = (id) => setFoods((f) => f.filter((x) => x.id !== id));

  useEffect(() => {
    if (foods.length === 0 && !doneRef.current) {
      doneRef.current = true;
      setTimeout(onDone, 400);
    }
  }, [foods, onDone]);

  return (
    <div className="w-full" data-testid="pet-feed-toss">
      <p className="mb-3 text-center text-sm font-bold text-amber-100">Tap the food to feed your pet 🍽️</p>
      <div className="relative mx-auto overflow-hidden rounded-2xl border border-amber-700/40 bg-gradient-to-b from-amber-800/30 to-emerald-950/70" style={{ height: 300 }}>
        <img src={petImage} alt="pet" className="absolute bottom-2 left-1/2 h-48 w-48 -translate-x-1/2 object-contain drop-shadow-xl animate-pet-idle" />
        <div className="absolute inset-x-0 top-4 flex justify-center gap-5">
          {foods.map((f) => (
            <button
              key={f.id}
              onClick={() => toss(f.id)}
              className="text-4xl transition-transform hover:scale-110 active:scale-90"
              data-testid={`feed-food-${f.id}`}
            >
              {f.emoji}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-amber-200/70">{foods.length} left</p>
      <button onClick={onCancel} className="mt-2 w-full rounded-xl border border-amber-700/40 py-2 text-sm font-semibold text-amber-200/80 hover:bg-amber-900/40">
        Cancel
      </button>
    </div>
  );
}

// Full-screen overlay wrapper for a care interaction.
export function InteractionModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="pet-interaction-modal">
      <div className="w-full max-w-md rounded-3xl border border-emerald-800/50 bg-gradient-to-b from-emerald-900/90 to-emerald-950/95 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-900 text-emerald-200 hover:bg-emerald-800" data-testid="pet-interaction-close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
