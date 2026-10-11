import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// X-style post media gallery — single image renders flush; multiple images
// become a swipeable, snap-scrolling carousel with arrows, a counter and dots.
export function PostMediaGallery({ images, rounded = true }) {
  const scroller = useRef(null);
  const [idx, setIdx] = useState(0);
  const list = (images || []).filter(Boolean);
  if (list.length === 0) return null;

  const roundCls = rounded ? "rounded-2xl" : "";

  if (list.length === 1) {
    return (
      <div className={`relative overflow-hidden bg-secondary/40 ${roundCls}`}>
        <img src={list[0]} alt="" className="max-h-[600px] w-full object-cover" />
      </div>
    );
  }

  const go = (dir) => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(Math.max(idx + dir, 0), list.length - 1);
    el.scrollTo({ left: el.clientWidth * next, behavior: "smooth" });
    setIdx(next);
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className={`relative overflow-hidden bg-black ${roundCls}`} data-testid="post-gallery">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {list.map((src, i) => (
          <div key={i} className="w-full flex-none snap-center">
            <img src={src} alt="" className="h-full max-h-[600px] w-full object-cover" />
          </div>
        ))}
      </div>

      <span
        className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white"
        data-testid="gallery-counter"
      >
        {idx + 1}/{list.length}
      </span>

      {idx > 0 && (
        <button
          onClick={() => go(-1)}
          aria-label="Previous image"
          data-testid="gallery-prev"
          className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/85"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {idx < list.length - 1 && (
        <button
          onClick={() => go(1)}
          aria-label="Next image"
          data-testid="gallery-next"
          className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/85"
        >
          <ChevronRight size={18} />
        </button>
      )}

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {list.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
          />
        ))}
      </div>
    </div>
  );
}
