import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Send, Loader2, Phone, PhoneOff, BadgeCheck, Mic, MicOff, Volume2, VolumeX, ShieldAlert, Trash2,
} from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const SAGE = {
  id: "sage-ai",
  username: "sage",
  display_name: "Sage AI",
  avatar_url:
    "https://static.prod-images.emergentagent.com/jobs/b5df4b25-c0c9-4030-b339-bee284051703/images/ba4cc2b9f675a2341e865b0c9b6433a07d2c2db012be5eaa27ab98af2e7aaabb.jpeg",
};

function CrisisBanner() {
  return (
    <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200" data-testid="sage-crisis-banner">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-red-400" />
      <div>
        <b>If you're in crisis, you deserve real support right now.</b> In the US, call or text <b>988</b> (Suicide &amp; Crisis Lifeline),
        or contact your local emergency services. You are not alone.
      </div>
    </div>
  );
}

export function SageChat({ onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [offerCall, setOfferCall] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [inCall, setInCall] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/sage/thread");
      setMessages(r.messages);
      setVoiceEnabled(r.voice_enabled);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, sending, offerCall]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const draft = text.trim();
    setText("");
    setOfferCall(false);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", text: draft, created_at: new Date().toISOString() }]);
    setSending(true);
    try {
      const r = await api.post("/sage/send", { text: draft });
      setMessages((m) => [...m, r.message]);
      if (r.crisis) setCrisis(true);
      if (r.offer_call && voiceEnabled) setOfferCall(true);
    } catch (err) {
      toast.error(err.message || "Sage couldn't respond");
    } finally {
      setSending(false);
    }
  };

  const clearThread = async () => {
    if (!window.confirm("Clear your conversation with Sage?")) return;
    try { await api.del("/sage/thread"); setMessages([]); setCrisis(false); setOfferCall(false); toast.success("Conversation cleared"); }
    catch (err) { toast.error(err.message || "Failed"); }
  };

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <button onClick={onBack} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary md:hidden"><ArrowLeft size={18} /></button>
        <Avatar src={SAGE.avatar_url} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-bold">
            {SAGE.display_name}
            <BadgeCheck size={15} className="fill-green-500 text-background" data-testid="sage-badge" />
          </div>
          <div className="text-[11px] text-muted-foreground">Your AI companion · always here to listen</div>
        </div>
        {voiceEnabled && (
          <button onClick={() => setInCall(true)} title="Talk to Sage" aria-label="Voice call Sage"
            className="flex h-9 w-9 items-center justify-center rounded-full text-green-500 hover:bg-green-500/10" data-testid="sage-call-btn">
            <Phone size={18} />
          </button>
        )}
        <button onClick={clearThread} title="Clear chat" aria-label="Clear chat"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary" data-testid="sage-clear-btn">
          <Trash2 size={16} />
        </button>
      </header>

      {crisis && <CrisisBanner />}
      <div className="border-b border-border bg-secondary/40 px-4 py-2 text-[11px] text-muted-foreground">
        Sage is an AI companion here to listen — not a substitute for professional help.
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ minHeight: 320 }}>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="mx-auto mt-8 max-w-md text-center">
            <Avatar src={SAGE.avatar_url} size={72} className="mx-auto" />
            <h3 className="mt-3 text-lg font-black">Hi, I'm Sage 🌿</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              I'm here whenever you want to talk — about anything, big or small. Nothing you say is too much.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <Avatar src={SAGE.avatar_url} size={28} className="mb-4" />}
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`} data-testid={`sage-msg-${m.role}`}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex items-end gap-2">
            <Avatar src={SAGE.avatar_url} size={28} />
            <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground">Sage is typing…</div>
          </div>
        )}

        {offerCall && (
          <div className="mx-auto max-w-sm rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-center" data-testid="sage-offer-call">
            <p className="text-sm font-semibold">Would it help to talk it out loud?</p>
            <p className="mt-1 text-xs text-muted-foreground">Sage can call you right now and just listen.</p>
            <div className="mt-3 flex justify-center gap-3">
              <button onClick={() => { setOfferCall(false); setInCall(true); }}
                className="flex items-center gap-1.5 rounded-full bg-green-500 px-4 py-1.5 text-sm font-bold text-white" data-testid="sage-accept-call">
                <Phone size={15} /> Talk to Sage
              </button>
              <button onClick={() => setOfferCall(false)} className="rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold" data-testid="sage-decline-call">
                Not now
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell Sage what's on your mind…"
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/60" data-testid="sage-input" />
        <Button type="submit" disabled={sending || !text.trim()} className="h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90" data-testid="sage-send">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>

      {inCall && <SageCall onEnd={() => { setInCall(false); load(); }} onCrisis={() => setCrisis(true)} />}
    </section>
  );
}

function SageCall({ onEnd, onCrisis }) {
  // status: connecting | listening | recording | thinking | speaking
  const [status, setStatus] = useState("connecting");
  const [caption, setCaption] = useState("");
  const [speaker, setSpeaker] = useState(true);
  const [micMuted, setMicMuted] = useState(false);

  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const acRef = useRef(null);
  const analyserRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(null);
  const endedRef = useRef(false);
  const speakerRef = useRef(true);
  const micMutedRef = useRef(false);
  // VAD bookkeeping
  const speakingSinceRef = useRef(0);
  const lastVoiceRef = useRef(0);
  const heardSpeechRef = useRef(false);
  const busyRef = useRef(true); // true while connecting/thinking/speaking (don't record)

  speakerRef.current = speaker;
  micMutedRef.current = micMuted;

  const setBusy = (b) => { busyRef.current = b; };

  const playAudio = useCallback((url) => new Promise((resolve) => {
    const audio = new Audio(url);
    audio.muted = !speakerRef.current;
    audioRef.current = audio;
    setStatus("speaking");
    setBusy(true);
    const finish = () => { audioRef.current = null; resolve(); };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }), []);

  const sendUtterance = useCallback(async (blob, mime) => {
    setStatus("thinking");
    setBusy(true);
    try {
      const fd = new FormData();
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, `speech.${ext}`);
      const sttRes = await fetch(`${BACKEND_URL}/api/sage/stt`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      if (!sttRes.ok) throw new Error("stt");
      const { text } = await sttRes.json();
      if (!text || endedRef.current) { if (!endedRef.current) resumeListening(); return; }
      const r = await api.post("/sage/voice-turn", { text });
      if (endedRef.current) return;
      if (r.crisis) onCrisis();
      setCaption(r.reply);
      await playAudio(r.audio_url);
      if (!endedRef.current) resumeListening();
    } catch {
      if (!endedRef.current) { setStatus("listening"); resumeListening(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCrisis, playAudio]);

  const startUtterance = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    let mime = "";
    for (const m of ["audio/webm", "audio/mp4", "audio/ogg"]) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
    }
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      recorderRef.current = null;
      if (heardSpeechRef.current && blob.size > 1200) sendUtterance(blob, type);
      else if (!endedRef.current) resumeListening();
    };
    rec.start();
    setStatus("recording");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendUtterance]);

  // Voice-activity detection loop
  const tick = useCallback(() => {
    if (endedRef.current) return;
    const analyser = analyserRef.current;
    if (analyser && !busyRef.current && !micMutedRef.current) {
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      const SPEECH = 0.025;   // rms threshold for voice
      const SILENCE_MS = 1100; // how long of silence ends a turn
      const recording = !!recorderRef.current;

      if (rms > SPEECH) {
        lastVoiceRef.current = now;
        if (!recording) {
          if (!speakingSinceRef.current) speakingSinceRef.current = now;
          if (now - speakingSinceRef.current > 120) { heardSpeechRef.current = true; startUtterance(); }
        } else {
          heardSpeechRef.current = true;
        }
      } else {
        speakingSinceRef.current = 0;
        if (recording && heardSpeechRef.current && now - lastVoiceRef.current > SILENCE_MS) {
          try { recorderRef.current.stop(); } catch { /* noop */ }
          heardSpeechRef.current = false;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [startUtterance]);

  const resumeListening = useCallback(() => {
    heardSpeechRef.current = false;
    speakingSinceRef.current = 0;
    lastVoiceRef.current = 0;
    setBusy(false);
    setStatus("listening");
  }, []);

  // Setup: mic + analyser + greeting, then start VAD loop
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (endedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        acRef.current = ac;
        const source = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
        rafRef.current = requestAnimationFrame(tick);
        // greeting
        const r = await api.post("/sage/voice-turn", { greeting: true });
        if (endedRef.current) return;
        setCaption(r.reply);
        await playAudio(r.audio_url);
        if (!endedRef.current) resumeListening();
      } catch {
        if (!endedRef.current) { toast.error("Allow microphone access to talk with Sage"); onEnd(); }
      }
    })();
    return () => {
      endedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      try { audioRef.current?.pause(); } catch { /* noop */ }
      try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
      try { acRef.current?.close(); } catch { /* noop */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hangUp = () => {
    endedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    try { audioRef.current?.pause(); } catch { /* noop */ }
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
    try { acRef.current?.close(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onEnd();
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    if (audioRef.current) audioRef.current.muted = !next;
  };

  const statusText = {
    connecting: "Connecting…",
    listening: micMuted ? "Mic muted" : "Listening… just talk",
    recording: "Listening…",
    thinking: "Sage is thinking…",
    speaking: "Sage is speaking…",
  }[status];

  const active = status === "recording" || status === "speaking";

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-neutral-950 px-6 text-center"
      style={{ height: "100dvh" }} data-testid="sage-call-screen">
      <div className={`relative flex h-44 w-44 items-center justify-center rounded-full ${active ? "animate-pulse" : ""}`}>
        <div className={`absolute inset-0 rounded-full blur-xl transition-colors ${status === "speaking" ? "bg-green-400/30" : status === "recording" ? "bg-primary/30" : "bg-green-500/15"}`} />
        <Avatar src={SAGE.avatar_url} size={150} />
      </div>
      <div className="mt-6 flex items-center justify-center gap-1 text-2xl font-black text-white">
        Sage AI <BadgeCheck size={20} className="fill-green-500 text-background" />
      </div>
      <div className="mt-1 text-sm text-white/60" data-testid="sage-call-status">{statusText}</div>
      {caption && <p className="mt-6 max-w-md text-sm leading-relaxed text-white/80" data-testid="sage-caption">“{caption}”</p>}

      <div className="mt-10 flex items-center gap-6">
        <button onClick={() => setMicMuted((m) => !m)}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${micMuted ? "bg-white text-black" : "bg-white/15 text-white"}`}
          title={micMuted ? "Unmute mic" : "Mute mic"} data-testid="sage-mic-toggle">
          {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button onClick={hangUp} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white" data-testid="sage-hangup">
          <PhoneOff size={26} />
        </button>
        <button onClick={toggleSpeaker}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${speaker ? "bg-green-500 text-white" : "bg-white/15 text-white"}`}
          title={speaker ? "Speaker on" : "Speaker off"} data-testid="sage-speaker-toggle">
          {speaker ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
      </div>

      <p className="mt-8 max-w-xs text-[11px] text-white/40">
        Just speak naturally — Sage listens and replies on its own. Sage is an AI companion, not a substitute for professional help. In a crisis, call or text 988 (US) or local emergency services.
      </p>
    </div>
  );
}
