import React, { useEffect, useState } from "react";

// X-style app-load splash: full orange brand background with the black lightning
// bolt (from the PostMePlex icon). The bolt pops in, holds, then zoom-reveals the
// app underneath as the whole overlay fades.
export default function SplashScreen() {
  const [zoom, setZoom] = useState(false); // begins the zoom-through reveal
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setZoom(true), 1150); // pop-in + hold, then reveal
    const t2 = setTimeout(() => setGone(true), 1800); // unmount after reveal
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      data-testid="app-splash"
      className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #FF7A4C 0%, #F06131 100%)",
        opacity: zoom ? 0 : 1,
        transition: "opacity 560ms cubic-bezier(.7,0,.84,0)",
        pointerEvents: zoom ? "none" : "auto",
      }}
    >
      <svg
        className={zoom ? "splash-bolt splash-bolt-zoom" : "splash-bolt"}
        width="150"
        height="150"
        viewBox="0 0 24 24"
        fill="none"
        aria-label="PostMePlex"
      >
        <path
          d="M13.5 1.5 L4 13.4 h6.1 L9 22.5 L20 9.8 h-6.4 L13.5 1.5 Z"
          fill="#12141c"
          stroke="#12141c"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
