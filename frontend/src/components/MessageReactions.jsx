import React, { useEffect, useRef, useState } from "react";
import { SmilePlus, Plus } from "lucide-react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const EMOJI_SET = [
  "👍", "❤️", "😂", "😮", "😢", "🔥", "😍", "🥰", "😎", "🤩", "😭", "😅",
  "😊", "🙌", "👏", "🙏", "💯", "✨", "🎉", "💪", "👀", "🤔", "😏", "😤",
  "😱", "🥳", "😇", "😴", "🤤", "🤯", "🫶", "💔", "💀", "🤡", "👻", "🫡",
  "🥲", "😳", "🤗", "😬", "🙄", "😌", "🔫", "⚡", "🌟", "💥", "🏆", "🫠",
];

// Rich reaction trigger: a quick bar of 6 emojis plus a "+" that opens the full
// picker. Mirrors the comments reaction picker so DMs feel consistent.
export function ReactionPicker({ onPick, side = "left" }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowAll(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const pick = (e) => { onPick(e); setOpen(false); setShowAll(false); };
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen((o) => !o); setShowAll(false); }} title="React" aria-label="Add reaction"
        className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100"
        data-testid="reaction-trigger">
        <SmilePlus size={14} />
      </button>
      {open && (
        <div
          className={`pmp-pickin absolute bottom-full z-30 mb-1 rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur-xl ${side === "right" ? "right-0" : "left-0"}`}
          data-testid="reaction-picker"
        >
          <div className="flex items-center gap-1">
            {QUICK_REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => pick(e)}
                className="rounded-full p-1 text-xl leading-none transition-transform hover:scale-125" data-testid={`reaction-opt-${e}`}>
                {e}
              </button>
            ))}
            <button type="button" onClick={() => setShowAll((v) => !v)}
              className={`ml-0.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${showAll ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              data-testid="reaction-more" aria-label="More emojis">
              <Plus size={16} />
            </button>
          </div>
          {showAll && (
            <div className="mt-2 grid max-h-44 w-60 grid-cols-8 gap-0.5 overflow-y-auto border-t border-border pt-2">
              {EMOJI_SET.map((e) => (
                <button key={e} type="button" onClick={() => pick(e)}
                  className="rounded-lg p-1 text-lg transition-transform hover:scale-125">
                  {e}
                </button>
              ))}
            </div>
          )}
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
          className={`pmp-reaction-pop flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors ${g.mine ? "border-primary bg-primary/15 text-foreground" : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"}`}
          data-testid={`reaction-chip-${emoji}`}>
          <span>{emoji}</span><span>{g.count}</span>
        </button>
      ))}
    </div>
  );
}
