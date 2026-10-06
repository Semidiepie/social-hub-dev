import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Loader2, Phone, PhoneOff, Mic, Volume2, VolumeX, Trash2, Brain } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function unlockAudio() {
  try {
    if (!window.__aiAudioEl) window.__aiAudioEl = new Audio();
    const el = window.__aiAudioEl;
    el.muted = true;
    const p = el.play();
    if (p && p.then) p.then(() => { el.pause(); el.currentTime = 0; el.muted = false; }).catch(() => { el.muted = false; });
    else { el.pause(); el.muted = false; }
  } catch { /* noop */ }
}

export function AiCharacterChat({ characterId, onBack }) {
  const [character, setCharacter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inCall, setInCall] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/ai-characters/${characterId}/thread`);
      setCharacter(r.character);
      setMessages(r.messages);
    } catch (e) {
      toast.error(e.message || "Couldn't load character");
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, sending]);

  const playReply = (url) => {
    if (!url) return;
    try {
      if (!window.__aiAudioEl) window.__aiAudioEl = new Audio();
      const a = window.__aiAudioEl;
      a.src = url;
      a.muted = false;
      a.play().catch(() => {});
    } catch { /* noop */ }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const draft = text.trim();
    setText("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", text: draft, created_at: new Date().toISOString() }]);
    setSending(true);
    try {
      const r = await api.post(`/ai-characters/${characterId}/send`, { text: draft });
      setMessages((m) => [...m, r.message]);
      playReply(r.audio_url);
    } catch (err) {
      toast.error(err.message || "Character couldn't respond");
    } finally {
      setSending(false);
    }
  };

  const clearThread = async () => {
    if (!window.confirm("Clear this conversation?")) return;
    try { await api.del(`/ai-characters/${characterId}/thread`); setMessages([]); toast.success("Cleared"); }
    catch (err) { toast.error(err.message || "Failed"); }
  };

  const teach = async () => {
    const fact = window.prompt(`Teach ${character?.name} something to always remember:`);
    if (!fact || !fact.trim()) return;
    try { await api.post(`/ai-characters/${characterId}/memory`, { text: fact.trim() }); toast.success(`${character.name} will remember that 🧠`); }
    catch (err) { toast.error(err.message || "Couldn't save memory"); }
  };

  if (loading) return <section className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-6 w-6 animate-spin text-primary" /></section>;
  if (!character) return null;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <button onClick={onBack} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary md:hidden"><ArrowLeft size={18} /></button>
        <Avatar src={character.avatar_url} size={38} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{character.name}</div>
          <div className="text-[11px] text-muted-foreground">@{character.username}</div>
        </div>
        {character.voice_enabled && (
          <button onClick={() => { unlockAudio(); setInCall(true); }} title="Talk" aria-label="Voice call"
            className="flex h-9 w-9 items-center justify-center rounded-full text-green-500 hover:bg-green-500/10" data-testid="aichar-call-btn">
            <Phone size={18} />
          </button>
        )}
        <button onClick={teach} title="Teach a memory" className="flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-primary/10" data-testid="aichar-teach-btn">
          <Brain size={17} />
        </button>
        <button onClick={clearThread} title="Clear chat" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary" data-testid="aichar-clear-btn">
          <Trash2 size={16} />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="mx-auto mt-8 max-w-md text-center">
            <Avatar src={character.avatar_url} size={72} className="mx-auto" />
            <h3 className="mt-3 text-lg font-black">{character.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Say hi, or tap the phone to have a real voice conversation.</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <Avatar src={character.avatar_url} size={28} className="mb-4" />}
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`} data-testid={`aichar-msg-${m.role}`}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex items-end gap-2">
            <Avatar src={character.avatar_url} size={28} />
            <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground">{character.name} is typing…</div>
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${character.name}…`}
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/60" data-testid="aichar-input" />
        <Button type="submit" disabled={sending || !text.trim()} className="h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90" data-testid="aichar-send">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>

      {inCall && <CharacterCall character={character} onEnd={() => { setInCall(false); load(); }} />}
    </section>
  );
}

// Hands-free voice call: greeting → auto-listen with silence detection (VAD) →
// transcribe → character replies with voice → auto-listen again.
function CharacterCall({ character, onEnd }) {
  const [status, setStatus] = useState("connecting"); // connecting | listening | thinking | speaking
  const [caption, setCaption] = useState("");
  const [speaker, setSpeaker] = useState(true);

  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const endedRef = useRef(false);
  const speakerRef = useRef(true);
  speakerRef.current = speaker;
  const acRef = useRef(null);
  const vadRef = useRef(null);

  const cleanupMic = () => {
    try { if (vadRef.current) cancelAnimationFrame(vadRef.current); } catch { /* noop */ }
    vadRef.current = null;
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { acRef.current?.close(); } catch { /* noop */ }
    acRef.current = null;
  };

  const playAudio = useCallback((url) => new Promise((resolve) => {
    if (!url) return resolve();
    if (!window.__aiAudioEl) window.__aiAudioEl = new Audio();
    const audio = window.__aiAudioEl;
    let done = false; let watchdog;
    const finish = () => { if (done) return; done = true; clearTimeout(watchdog); audio.onended = null; audio.onerror = null; resolve(); };
    audio.muted = !speakerRef.current;
    audio.src = url;
    audioRef.current = audio;
    setStatus("speaking");
    audio.onended = finish; audio.onerror = finish;
    watchdog = setTimeout(finish, 20000);
    const p = audio.play();
    if (p && p.catch) p.catch(finish);
  }), []);

  // Record with voice-activity detection: auto-stop ~1.1s after the user stops speaking.
  const listen = useCallback(async () => {
    if (endedRef.current) return;
    try {
      const stream = streamRef.current || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      let mime = "";
      for (const m of ["audio/webm", "audio/mp4", "audio/ogg"]) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.start();
      setStatus("listening");

      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      acRef.current = ac;
      if (ac.state === "suspended") { try { await ac.resume(); } catch { /* noop */ } }
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const started = Date.now();
      let hasSpoken = false, silenceStart = 0, frames = 0, noiseFloor = 0.01;
      const SILENCE_MS = 1000, MAX_MS = 15000;

      const tick = () => {
        if (endedRef.current || recorderRef.current !== rec) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        frames++;
        if (frames <= 10) { noiseFloor = Math.max(noiseFloor, rms); vadRef.current = requestAnimationFrame(tick); return; }
        const thresh = Math.min(0.06, noiseFloor * 2.2 + 0.012);
        if (rms > thresh) { hasSpoken = true; silenceStart = 0; }
        else if (hasSpoken && !silenceStart) { silenceStart = now; }
        const doneSpeaking = hasSpoken && silenceStart && now - silenceStart > SILENCE_MS;
        if (doneSpeaking || now - started > MAX_MS) { stopAndSend(); return; }
        vadRef.current = requestAnimationFrame(tick);
      };
      vadRef.current = requestAnimationFrame(tick);
    } catch {
      if (!endedRef.current) { toast.error("Mic blocked — allow microphone access. If you're in the embedded preview, open the preview in its own browser tab."); onEnd(); }
    }
  }, [onEnd]);

  const stopAndSend = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    if (vadRef.current) { cancelAnimationFrame(vadRef.current); vadRef.current = null; }
    try { acRef.current?.close(); } catch { /* noop */ }
    acRef.current = null;
    setStatus("thinking");
    const done = new Promise((res) => { rec.onstop = res; });
    try { rec.stop(); } catch { /* noop */ }
    await done;
    const type = rec.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    try {
      const fd = new FormData();
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, `speech.${ext}`);
      const sttRes = await fetch(`${BACKEND_URL}/api/ai-characters/stt`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      if (!sttRes.ok) throw new Error("stt");
      const { text } = await sttRes.json();
      if (endedRef.current) return;
      if (!text) { listen(); return; } // heard nothing — keep listening
      setCaption(text);
      const r = await api.post(`/ai-characters/${character.id}/voice-turn`, { text });
      if (endedRef.current) return;
      setCaption(r.reply);
      await playAudio(r.audio_url);
      if (!endedRef.current) listen(); // loop
    } catch {
      if (!endedRef.current) { toast.error("Trouble hearing you — let's try again"); listen(); }
    }
  }, [character.id, listen, playAudio]);

  useEffect(() => {
    endedRef.current = false;
    (async () => {
      try {
        const r = await api.post(`/ai-characters/${character.id}/voice-turn`, { greeting: true });
        if (endedRef.current) return;
        setCaption(r.reply);
        await playAudio(r.audio_url);
        if (!endedRef.current) listen();
      } catch {
        if (!endedRef.current) { toast.error("Couldn't start the voice call"); onEnd(); }
      }
    })();
    return () => { endedRef.current = true; try { audioRef.current?.pause(); } catch { /* noop */ } cleanupMic(); };
  }, []);

  const hangUp = () => { endedRef.current = true; try { audioRef.current?.pause(); } catch { /* noop */ } cleanupMic(); onEnd(); };
  const toggleSpeaker = () => { const next = !speaker; setSpeaker(next); if (audioRef.current) audioRef.current.muted = !next; };

  const statusText = { connecting: "Connecting…", listening: "Listening… just talk", thinking: `${character.name} is thinking…`, speaking: `${character.name} is speaking…` }[status];

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-neutral-950 px-6 text-center" style={{ height: "100dvh" }} data-testid="aichar-call-screen">
      <div className={`relative flex h-44 w-44 items-center justify-center rounded-full ${status === "speaking" || status === "listening" ? "animate-pulse" : ""}`}>
        <div className={`absolute inset-0 rounded-full blur-xl transition-colors ${status === "speaking" ? "bg-green-400/30" : status === "listening" ? "bg-primary/40" : "bg-white/10"}`} />
        <Avatar src={character.avatar_url} size={150} />
      </div>
      <div className="mt-6 flex items-center justify-center gap-1 text-2xl font-black text-white">{character.name}</div>
      <div className="mt-1 text-sm text-white/60" data-testid="aichar-call-status">{statusText}</div>
      {caption && <p className="mt-6 max-w-md text-sm leading-relaxed text-white/80" data-testid="aichar-caption">“{caption}”</p>}

      <div className="mt-10 flex items-center gap-6">
        <button
          onClick={() => { if (status === "listening") stopAndSend(); }}
          disabled={status !== "listening"}
          className={`flex h-20 w-20 items-center justify-center rounded-full ${status === "listening" ? "bg-primary text-white" : "bg-white/10 text-white/70"}`}
          title="Tap when you're done talking"
          data-testid="aichar-send-turn"
        >
          <Mic size={30} />
        </button>
        <button onClick={toggleSpeaker} className={`flex h-14 w-14 items-center justify-center rounded-full ${speaker ? "bg-green-500 text-white" : "bg-white/15 text-white"}`} title={speaker ? "Speaker on" : "Speaker off"} data-testid="aichar-speaker-toggle">
          {speaker ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
      </div>

      <button onClick={hangUp} className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white" data-testid="aichar-hangup">
        <PhoneOff size={24} />
      </button>
      <p className="mt-6 max-w-xs text-[11px] text-white/40">Just talk — it replies when you pause. If it does not catch you, tap the mic when finished.</p>
    </div>
  );
}
