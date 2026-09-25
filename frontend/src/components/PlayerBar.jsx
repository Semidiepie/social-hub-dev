import React from "react";
import { Play, Pause, SkipBack, SkipForward, Music2 } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

function fmt(s) {
  if (!s || Number.isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Persistent bottom player bar — visible on every page once a song is playing.
export function PlayerBar() {
  const { current, playing, progress, duration, toggle, next, prev, seek } = usePlayer();
  if (!current) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur"
      data-testid="player-bar"
    >
      <input
        type="range"
        min={0}
        max={duration || 0}
        value={progress}
        step="0.1"
        onChange={(e) => seek(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-primary"
        data-testid="player-seek"
        aria-label="Seek"
      />
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {current.cover_url ? (
            <img src={current.cover_url} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Music2 size={18} className="text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold" data-testid="player-title">{current.title}</div>
            <div className="truncate text-xs text-muted-foreground">{current.artist}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={prev} className="rounded-full p-2 text-muted-foreground hover:text-foreground" data-testid="player-prev" aria-label="Previous">
            <SkipBack size={18} />
          </button>
          <button
            onClick={toggle}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="player-toggle"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button onClick={next} className="rounded-full p-2 text-muted-foreground hover:text-foreground" data-testid="player-next" aria-label="Next">
            <SkipForward size={18} />
          </button>
        </div>

        <div className="hidden w-24 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
          {fmt(progress)} / {fmt(duration)}
        </div>
      </div>
    </div>
  );
}
