// Tiny Web Audio helpers for app sounds (no asset files needed). The incoming-call
// RING lives in IncomingCallListener; this is the short NOTIFICATION chime — a bright
// two-note "ding-dong" that is deliberately distinct from the call ring.
import { api } from "@/lib/api";

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

// ---------------------------------------------------------------------------
// Admin-configurable per-type notification sounds (global). The admin uploads
// one .mp3 per alert GROUP; each notification `type` maps to a group below.
// When a custom sound exists we play it, otherwise we fall back to the chime.
// ---------------------------------------------------------------------------
const TYPE_TO_GROUP = {
  message: "message",
  post: "posts", reel: "posts", video: "posts", live: "posts",
  like: "social", comment: "social", heart: "social",
  follow: "follow",
  collab_invite: "collab", collab_accept: "collab", collab_decline: "collab", update: "collab",
};

let _soundMap = {};
const _audioEls = {};

// Fetch the current global sound map (admin-controlled). Call on login.
export async function loadNotificationSounds() {
  try {
    const r = await api.get("/notification-sounds");
    _soundMap = r?.sounds || {};
  } catch {
    /* keep whatever we had */
  }
  return _soundMap;
}

function playUrl(url) {
  try {
    let el = _audioEls[url];
    if (!el) { el = new Audio(url); el.preload = "auto"; _audioEls[url] = el; }
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// Play the right sound for a notification type: custom mp3 if set, else chime.
export function playNotificationForType(type) {
  const group = TYPE_TO_GROUP[type];
  const url = group && _soundMap[group];
  if (url && playUrl(url)) return;
  playNotificationChime();
}
