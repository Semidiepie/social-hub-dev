import React, { useEffect, useState } from "react";

// Full-screen TikTok-style splash shown once on web app load: PostMePlex logo + wordmark
// on the dark brand background, then fades out.
export default function SplashScreen() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHide(true), 1500);
    const t2 = setTimeout(() => setGone(true), 2050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      data-testid="app-splash"
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center"
      style={{
        backgroundColor: "#12141c",
        opacity: hide ? 0 : 1,
        transition: "opacity 520ms ease",
        pointerEvents: hide ? "none" : "auto",
      }}
    >
      <img
        src="/logo.png"
        alt="PostMePlex"
        className="splash-logo"
        style={{ width: 104, height: 104, borderRadius: 26 }}
      />
      <div
        className="splash-text mt-6 text-3xl font-black text-white"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        PostMePlex
      </div>
    </div>
  );
}
