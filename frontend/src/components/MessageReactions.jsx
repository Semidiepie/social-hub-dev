import React, { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";

const EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

// A small trigger that opens a row of emojis to react with.
export function ReactionPicker({ onPick, side = "left" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} title="React" aria-label="Add reaction"
        className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100"
        data-testid="reaction-trigger">
        <SmilePlus size={14} />
      </button>
      {open && (
        <div className={`absolute bottom-full z-30 mb-1 flex gap-0.5 rounded-full border border-border bg-popover p-1 shadow-lg ${side === "right" ? "right-0" : "left-0"}`} data-testid="reaction-picker">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => { onPick(e); setOpen(false); }}
              className="rounded-full px-1 py-0.5 text-lg leading-none transition-transform hover:scale-125" data-testid={`reaction-opt-${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Renders grouped reaction chips under a message; clicking a chip toggles your reaction.
export function ReactionChips({ reactions, myId, onToggle, mine }) {
  if (!reactions || reactions.length === 0) return null;
  const groups = {};
  for (const r of reactions) {
    if (!groups[r.emoji]) groups[r.emoji] = { count: 0, mine: false };
    groups[r.emoji].count += 1;
    if (myId == null || r.user_id === myId) groups[r.emoji].mine = true;
  }
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`} data-testid="reaction-chips">
      {Object.entries(groups).map(([emoji, g]) => (
        <button key={emoji} type="button" onClick={() => onToggle(emoji, g.mine)}
          className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors ${g.mine ? "border-primary bg-primary/15 text-foreground" : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"}`}
          data-testid={`reaction-chip-${emoji}`}>
          <span>{emoji}</span><span>{g.count}</span>
        </button>
      ))}
    </div>
  );
}
