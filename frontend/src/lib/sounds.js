// Tiny Web Audio helpers for app sounds (no asset files needed). The incoming-call
// RING lives in IncomingCallListener; this is the short NOTIFICATION chime — a bright
// two-note "ding-dong" that is deliberately distinct from the call ring.

let _ac = null;
function ctx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ac || _ac.state === "closed") _ac = new AC();
  if (_ac.state === "suspended") _ac.resume().catch(() => {});
  return _ac;
}

// Bright, friendly notification chime (rising two tones with a soft bell decay).
export function playNotificationChime() {
  try {
    const ac = ctx();
    if (!ac) return;
    const t0 = ac.currentTime + 0.01;
    const notes = [
      { f: 987.77, at: 0 },     // B5
      { f: 1318.51, at: 0.12 }, // E6
    ];
    notes.forEach(({ f, at }) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ac.destination);
      const t = t0 + at;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
      o.start(t);
      o.stop(t + 0.5);
    });
  } catch {
    /* noop */
  }
}
