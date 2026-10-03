import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";

// Memory / concentration: flip two cards, find matching emoji pairs before time runs out.
export function MemoryGame({ level, onEnd }) {
  const { pairs, seconds, emojis, target } = level;

  const deck = useMemo(() => {
    const base = emojis.slice(0, pairs);
    const cards = [...base, ...base].map((e, i) => ({ id: i, emoji: e }));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }, [emojis, pairs]);

  const [flipped, setFlipped] = useState([]); // indices currently face-up (unmatched)
  const [matched, setMatched] = useState([]); // matched card ids
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  const endedRef = useRef(false);
  const cols = pairs <= 6 ? 4 : pairs <= 9 ? 5 : 6;

  const finish = (won) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const score = won ? pairs * 100 + Math.max(0, timeLeft) * 5 : matched.length / 2 * 100;
    onEnd({ score: Math.round(score), won });
  };

  useEffect(() => {
    if (endedRef.current) return;
    if (timeLeft <= 0) { finish(false); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  useEffect(() => {
    if (matched.length === pairs * 2 && pairs > 0) finish(true);
  }, [matched, pairs]);

  const onCard = (idx) => {
    if (busy || endedRef.current) return;
    const card = deck[idx];
    if (matched.includes(card.id) || flipped.includes(idx)) return;
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length === 2) {
      setBusy(true);
      const [a, b] = next;
      if (deck[a].emoji === deck[b].emoji) {
        setTimeout(() => { setMatched((m) => [...m, deck[a].id, deck[b].id]); setFlipped([]); setBusy(false); }, 420);
      } else {
        setTimeout(() => { setFlipped([]); setBusy(false); }, 700);
      }
    }
  };

  const foundPairs = matched.length / 2;
  const pct = Math.min(100, Math.round((foundPairs / pairs) * 100));

  return (
    <div className="w-full" data-testid="memory-board">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card/70 px-4 py-2 text-lg font-black">
          <Clock size={16} className="text-primary" /> <span data-testid="hud-time">{timeLeft}s</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs"><span className="font-bold text-muted-foreground">Pairs</span><span className="font-black" data-testid="hud-pairs">{foundPairs}/{pairs}</span></div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">Find all pairs · {target.toLocaleString()} pts to win</div>
        </div>
      </div>
      <div className="mx-auto grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, maxWidth: 440 }}>
        {deck.map((card, idx) => {
          const faceUp = flipped.includes(idx) || matched.includes(card.id);
          return (
            <button
              key={card.id}
              onClick={() => onCard(idx)}
              className="flex items-center justify-center rounded-2xl border border-border text-3xl transition-all"
              style={{ aspectRatio: "1", background: faceUp ? "hsl(var(--card))" : "hsl(var(--primary) / .18)", transform: faceUp ? "rotateY(0deg)" : "none", opacity: matched.includes(card.id) ? 0.55 : 1 }}
              data-testid={`memory-card-${idx}`}
            >
              {faceUp ? card.emoji : "❓"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
