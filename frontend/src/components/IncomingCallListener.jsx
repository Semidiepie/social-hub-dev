import React, { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { CharacterCall } from "@/components/AiCharacterChat";

// Classic "ring ring" tone synthesized with Web Audio (no asset needed).
function makeRinger() {
  let ac = null; let timer = null; let stopped = false;
  const start = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      if (ac.state === "suspended") ac.resume().catch(() => {});
      const ring = () => {
        if (stopped || !ac) return;
        [0, 0.4].forEach((off) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "sine";
          o.frequency.value = off === 0 ? 440 : 480;
          o.connect(g); g.connect(ac.destination);
          const t = ac.currentTime + off;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.25, t + 0.02);
          g.gain.setValueAtTime(0.25, t + 0.3);
          g.gain.linearRampToValueAtTime(0, t + 0.33);
          o.start(t); o.stop(t + 0.34);
        });
      };
      ring();
      timer = setInterval(ring, 2000);
    } catch { /* noop */ }
  };
  const stop = () => {
    stopped = true;
    if (timer) clearInterval(timer);
    try { ac && ac.close(); } catch { /* noop */ }
    ac = null;
  };
  return { start, stop };
}

// Mounted once in AppShell. Polls for a character wanting to call the admin, rings,
// and on answer opens a hands-free voice call.
export function IncomingCallListener() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState(null); // { id, character }
  const [active, setActive] = useState(null);      // character in a live call
  const ringerRef = useRef(null);
  const seenRef = useRef(null);
  const isAdmin = !!user?.is_super_admin;

  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    const poll = async () => {
      if (!alive || active) return;
      try {
        const r = await api.get("/ai-characters/incoming-call");
        if (!alive) return;
        if (r.call && r.call.id !== seenRef.current) {
          seenRef.current = r.call.id;
          setIncoming(r.call);
        }
      } catch { /* noop */ }
    };
    poll();
    const iv = setInterval(poll, 20000);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [isAdmin, active]);

  // ring while an incoming call is pending (auto-dismiss after 45s unanswered)
  useEffect(() => {
    if (incoming && !active) {
      ringerRef.current = makeRinger();
      ringerRef.current.start();
      const timeout = setTimeout(() => setIncoming(null), 45000);
      return () => { ringerRef.current?.stop(); ringerRef.current = null; clearTimeout(timeout); };
    }
    return undefined;
  }, [incoming, active]);

  const answer = async () => {
    const call = incoming;
    ringerRef.current?.stop();
    try { await api.post(`/ai-characters/calls/${call.id}/answer`); } catch { /* noop */ }
    setIncoming(null);
    setActive(call.character);
  };
  const decline = async () => {
    const call = incoming;
    ringerRef.current?.stop();
    try { await api.post(`/ai-characters/calls/${call.id}/decline`); } catch { /* noop */ }
    setIncoming(null);
  };

  if (active) return <CharacterCall character={active} autoListen onEnd={() => setActive(null)} />;
  if (!incoming) return null;

  const c = incoming.character;
  return (
    <div className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-neutral-950 px-6 text-center" style={{ height: "100dvh" }} data-testid="aichar-incoming-call">
      <div className="relative flex h-44 w-44 items-center justify-center rounded-full">
        <div className="absolute inset-0 animate-ping rounded-full bg-green-400/20" />
        <Avatar src={c.avatar_url} size={150} />
      </div>
      <div className="mt-6 text-2xl font-black text-white">{c.name}</div>
      <div className="mt-1 text-sm text-white/60">is calling you…</div>
      <div className="mt-12 flex items-center gap-16">
        <button onClick={decline} className="flex flex-col items-center gap-2" data-testid="aichar-incoming-decline">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white"><PhoneOff size={26} /></span>
          <span className="text-xs text-white/60">Decline</span>
        </button>
        <button onClick={answer} className="flex flex-col items-center gap-2" data-testid="aichar-incoming-answer">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white animate-bounce"><Phone size={26} /></span>
          <span className="text-xs text-white/60">Answer</span>
        </button>
      </div>
    </div>
  );
}
