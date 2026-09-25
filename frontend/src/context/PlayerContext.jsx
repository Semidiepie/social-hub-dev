import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const PlayerContext = createContext(null);

// Global music player. A single <audio> element lives in the provider (mounted
// once, above the router) so playback survives route changes and keeps playing
// when the tab is backgrounded or the screen is off. The Media Session API adds
// OS lock-screen / media-key controls. (A web page cannot keep playing after the
// tab is fully closed — that's a browser limitation.)
export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [tracks, setTracks] = useState([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const current = index >= 0 && index < tracks.length ? tracks[index] : null;

  const play = useCallback((list, i = 0) => {
    setTracks(list);
    setIndex(i);
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [current]);

  const next = useCallback(() => {
    setIndex((i) => (i >= 0 && i < tracks.length - 1 ? i + 1 : i));
  }, [tracks.length]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const seek = useCallback((t) => {
    const a = audioRef.current;
    if (a) a.currentTime = t;
  }, []);

  // Load + autoplay whenever the selected track changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.audio_url;
    a.play().catch(() => {});
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session (lock screen / media keys / OS controls).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    // eslint-disable-next-line no-undef
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title || "Untitled",
      artist: current.artist || "semidiepie",
      album: "PostMePlex Music",
      artwork: current.cover_url
        ? [{ src: current.cover_url, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audioRef.current?.play().catch(() => {}));
    ms.setActionHandler("pause", () => audioRef.current?.pause());
    ms.setActionHandler("nexttrack", next);
    ms.setActionHandler("previoustrack", prev);
    return () => {
      try {
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("previoustrack", null);
      } catch {
        /* noop */
      }
    };
  }, [current?.id, next, prev]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PlayerContext.Provider
      value={{ tracks, index, current, playing, progress, duration, play, toggle, next, prev, seek }}
    >
      {children}
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={next}
        hidden
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
