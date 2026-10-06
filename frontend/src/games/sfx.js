// Asset-free sound effects for PostMePlex Match via the Web Audio API.
// Short synthesized blips/chimes — no files to ship, instant playback.

let ctx = null;
let muted = false;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(v) {
  muted = v;
}
export function isMuted() {
  return muted;
}

function blip(freq, dur, type = "sine", vol = 0.18, startFreq) {
  const c = ac();
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const t0 = c.currentTime;
  if (startFreq) {
    o.frequency.setValueAtTime(startFreq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq), t0 + dur);
  } else {
    o.frequency.setValueAtTime(freq, t0);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  setMuted(v) {
    muted = v;
  },
  // rising pop whose pitch climbs with the cascade/combo index
  pop(combo = 0) {
    const base = 420 + Math.min(combo, 8) * 70;
    blip(base, 0.14, "triangle", 0.2);
  },
  swap() {
    blip(300, 0.08, "sine", 0.12);
  },
  invalid() {
    blip(140, 0.16, "sawtooth", 0.14, 190);
  },
  special() {
    blip(900, 0.22, "square", 0.14, 500);
  },
  booster() {
    blip(660, 0.18, "triangle", 0.16, 440);
  },
  win() {
    const c = ac();
    if (!c || muted) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, "triangle", 0.2), i * 110));
  },
  lose() {
    const c = ac();
    if (!c || muted) return;
    [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.24, "sine", 0.16), i * 130));
  },
};
