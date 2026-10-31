// Lightweight in-browser sound effects (no assets, Web Audio API).
// Used for a satisfying confirmation when a user posts / shares a story.

import { playGroupSound } from "@/lib/sounds";

let _ctx = null;
function ctx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) _ctx = new AC();
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

function tone(ac, freq, start, dur, gainPeak = 0.18, type = "sine") {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// Bright, cheerful two-note chime (C6 -> G6) played on a successful post.
// Uses the admin-configured "post_published" sound when one is set.
function _postChimeSynth() {
  try {
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;
    tone(ac, 1046.5, t, 0.16, 0.16, "triangle");
    tone(ac, 1567.98, t + 0.11, 0.28, 0.14, "sine");
  } catch {
    /* audio is best-effort; never block posting */
  }
}

export function playPostChime() {
  playGroupSound("post_published", _postChimeSynth);
}

/* ---------- Pet care-room sound effects (mute-respecting) ---------- */
let _petMuted = false;
try {
  _petMuted = typeof localStorage !== "undefined" && localStorage.getItem("pet.sfx.muted") === "1";
} catch { /* ignore */ }

export function isPetMuted() { return _petMuted; }
export function setPetMuted(v) {
  _petMuted = !!v;
  try { localStorage.setItem("pet.sfx.muted", v ? "1" : "0"); } catch { /* ignore */ }
}

function noise(ac, start, dur, gainPeak = 0.12, cutoff = 1800) {
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(cutoff, start);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(lp); lp.connect(g); g.connect(ac.destination);
  src.start(start); src.stop(start + dur + 0.02);
}

// Soft "nom" when the pet eats a bite.
export function playNom() {
  if (_petMuted) return;
  try {
    const ac = ctx(); if (!ac) return;
    const t = ac.currentTime;
    tone(ac, 220, t, 0.1, 0.16, "sine");
    tone(ac, 160, t + 0.08, 0.12, 0.14, "sine");
  } catch { /* ignore */ }
}

// Watery splash when scrubbing away dirt.
export function playSplash() {
  if (_petMuted) return;
  try {
    const ac = ctx(); if (!ac) return;
    const t = ac.currentTime;
    noise(ac, t, 0.18, 0.1, 2400);
    tone(ac, 520, t, 0.14, 0.08, "sine");
  } catch { /* ignore */ }
}

// Quick "pop" when the ball is thrown / fetched.
export function playFetch() {
  if (_petMuted) return;
  try {
    const ac = ctx(); if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.18);
  } catch { /* ignore */ }
}

// Celebratory arpeggio (C-E-G-C) when an activity is completed.
export function playHappyChime() {
  if (_petMuted) return;
  try {
    const ac = ctx(); if (!ac) return;
    const t = ac.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, f, t + i * 0.09, 0.3, 0.15, "triangle"));
  } catch { /* ignore */ }
}
