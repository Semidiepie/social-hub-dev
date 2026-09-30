// Lightweight in-browser sound effects (no assets, Web Audio API).
// Used for a satisfying confirmation when a user posts / shares a story.

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
export function playPostChime() {
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
