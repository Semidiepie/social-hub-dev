import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Loader2, Phone, PhoneOff, Mic, Square, Volume2, VolumeX, Trash2, Brain, ImagePlus } from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Gathers "real world" context so the character's replies are accurate: the exact
// time shown on the user's device + (if they allow it) their location for live weather.
let __geoCache = null; // { lat, lon } once granted, reused for the session
function gatherContext() {
  const now = new Date();
  const ctx = {
    local_time: now.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  };
  if (__geoCache) { ctx.lat = __geoCache.lat; ctx.lon = __geoCache.lon; }
  return ctx;
}
function primeGeo() {
  if (__geoCache || !navigator.geolocation) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => { __geoCache = { lat: pos.coords.latitude, lon: pos.coords.longitude }; },
      () => {}, { timeout: 5000, maximumAge: 600000 }
    );
  } catch { /* noop */ }
}

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
  const [phase, setPhase] = useState("idle"); // idle | typing (brief flourish when a reply lands)
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = sending;
  const [inCall, setInCall] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const seenIds = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/ai-characters/${characterId}/thread`);
      setCharacter(r.character);
      setMessages(r.messages);
      (r.messages || []).forEach((m) => seenIds.current.add(m.id));
    } catch (e) {
      toast.error(e.message || "Couldn't load character");
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  // Replies arrive asynchronously — human-paced, and deferred while the character is
  // busy on their schedule. Poll the thread so new messages appear with a brief typing
  // flourish (and the backend web-pushes you the moment the reply is actually sent).
  const poll = useCallback(async () => {
    try {
      const r = await api.get(`/ai-characters/${characterId}/thread`);
      const server = r.messages || [];
      const newest = server[server.length - 1];
      const hasNewAi = newest && newest.role === "ai" && !seenIds.current.has(newest.id);
      if (hasNewAi) {
        setPhase("typing");
        await new Promise((res) => setTimeout(res, 900));
        setPhase("idle");
      }
      server.forEach((m) => seenIds.current.add(m.id));
      setMessages((prev) => {
        const temps = prev.filter((m) => String(m.id).startsWith("tmp-") && !server.some((s) => s.role === "user" && s.text === m.text));
        return [...server, ...temps];
      });
    } catch { /* noop */ }
  }, [characterId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(poll, 8000);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [poll]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, phase]);

  const send = async (e) => {
    e.preventDefault();
    const draft = text.trim();
    if (!draft || sending) return;
    setText("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", text: draft, created_at: new Date().toISOString() }]);
    setSending(true);
    try {
      await api.post(`/ai-characters/${characterId}/send`, { text: draft, ...gatherContext() });
    } catch (err) {
      toast.error(err.message || `Couldn't send — try again`);
    } finally {
      setSending(false);
    }
    // reply comes asynchronously — nudge a couple quick polls so a fast reply shows promptly
    setTimeout(poll, 2500);
    setTimeout(poll, 6000);
  };

  const sendMedia = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video");
    const maxMb = isVideo ? 1024 : 250;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`${isVideo ? "Video" : "Photo"} too large (max ${isVideo ? "1 GB" : "250 MB"}).`);
      return;
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    const tmpId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tmpId, role: "user", text: "", media_url: localPreview, media_type: isVideo ? "video" : "image", created_at: new Date().toISOString() }]);
    try {
      const up = await uploadToCloudinary(file, { resourceType: isVideo ? "video" : "image" });
      await api.post(`/ai-characters/${characterId}/send`, { text: "", media_url: up.secure_url, media_type: isVideo ? "video" : "image", ...gatherContext() });
      setTimeout(poll, 2500);
      setTimeout(poll, 6000);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== tmpId));
      toast.error(err.message || "Couldn't send that — try again");
    } finally {
      setUploading(false);
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
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
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
                  {m.media_url && m.media_type === "image" && (
                    <img src={m.media_url} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" data-testid="aichar-msg-image" />
                  )}
                  {m.media_url && m.media_type === "video" && (
                    <video src={m.media_url} controls playsInline className="mb-1 max-h-72 w-full rounded-xl" data-testid="aichar-msg-video" />
                  )}
                  {m.text ? <div className="whitespace-pre-wrap">{m.text}</div> : null}
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
        {phase === "typing" && (
          <div className="flex items-end gap-2" data-testid="aichar-typing">
            <Avatar src={character.avatar_url} size={28} />
            <div className="flex items-center gap-1 rounded-2xl bg-secondary px-3.5 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={sendMedia} data-testid="aichar-file-input" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Send a photo or video"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50" data-testid="aichar-attach">
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={19} />}
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${character.name}…`}
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/60" data-testid="aichar-input" />
        <Button type="submit" disabled={busy || !text.trim()} className="h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90" data-testid="aichar-send">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>

      {inCall && <CharacterCall character={character} autoListen onEnd={() => { setInCall(false); load(); }} />}
    </section>
  );
}

// Push-to-talk voice call (same UX as Sage): greeting → tap mic to talk → tap to
// send → character replies with voice. When `autoListen` is on (answered incoming
// calls) it greets first, then listens hands-free and replies after you stop talking.
export function CharacterCall({ character, onEnd, autoListen = false }) {
  const [status, setStatus] = useState("connecting"); // connecting | idle | recording | thinking | speaking
  const [caption, setCaption] = useState("");
  const [speaker, setSpeaker] = useState(true);
  const [volume, setVolume] = useState(() => {
    const v = parseFloat(localStorage.getItem("aichar.volume"));
    return isNaN(v) ? 0.7 : Math.min(1, Math.max(0, v));
  });
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const gainRef = useRef(null);
  const srcNodeRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const endedRef = useRef(false);
  const speakerRef = useRef(true);
  speakerRef.current = speaker;
  const acRef = useRef(null);
  const vadTimerRef = useRef(null);
  const micSrcRef = useRef(null);
  const stopSendRef = useRef(null);

  const ensureAC = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!acRef.current || acRef.current.state === "closed") acRef.current = new AC();
    return acRef.current;
  };
  const stopTracks = () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
  };

  // Play the reply through a GainNode so the volume slider actually controls
  // loudness on iOS Safari (which ignores <audio>.volume).
  const playAudio = useCallback((url) => new Promise((resolve) => {
    if (!url) return resolve();
    let done = false; let watchdog;
    const finish = () => { if (done) return; done = true; clearTimeout(watchdog); resolve(); };
    (async () => {
      try {
        const ac = ensureAC();
        if (ac.state === "suspended") { try { await ac.resume(); } catch { /* noop */ } }
        const buf = await (await fetch(url)).arrayBuffer();
        const decoded = await ac.decodeAudioData(buf);
        const src = ac.createBufferSource();
        src.buffer = decoded;
        const gain = ac.createGain();
        gain.gain.value = speakerRef.current ? volumeRef.current : 0;
        src.connect(gain); gain.connect(ac.destination);
        gainRef.current = gain;
        srcNodeRef.current = src;
        setStatus("speaking");
        src.onended = finish;
        watchdog = setTimeout(finish, 20000);
        src.start();
      } catch { finish(); }
    })();
  }), []);

  const stopVad = () => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    try { micSrcRef.current?.disconnect(); } catch { /* noop */ }
    micSrcRef.current = null;
  };

  const startRecording = async () => {
    if (endedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
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
      setStatus("recording");
      // Hands-free: listen for your voice, then auto-send after you stop talking.
      if (autoListen) {
        try {
          const ac = ensureAC();
          if (ac.state === "suspended") { try { await ac.resume(); } catch { /* noop */ } }
          const src = ac.createMediaStreamSource(stream);
          const analyser = ac.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          micSrcRef.current = src;
          const data = new Uint8Array(analyser.frequencyBinCount);
          // Wait for a real, settled pause before deciding you're done — so breathing
          // or a mid-thought beat won't cut you off. Only end the turn after ~2.2s of
          // continuous quiet following actual speech.
          const SILENCE_MS = 2200;      // continuous quiet that counts as "done talking"
          const MAX_TURN_MS = 60000;    // hard safety cap on a single turn
          let spoke = false; let silenceStart = 0; const started = Date.now();
          vadTimerRef.current = setInterval(() => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
            const rms = Math.sqrt(sum / data.length);
            const t = Date.now();
            if (rms > 0.055) { spoke = true; silenceStart = 0; }
            else if (spoke) {
              if (!silenceStart) silenceStart = t;
              else if (t - silenceStart > SILENCE_MS) { stopVad(); stopSendRef.current && stopSendRef.current(); }
            }
            if (t - started > MAX_TURN_MS) { stopVad(); stopSendRef.current && stopSendRef.current(); } // safety cap
          }, 120);
        } catch { /* noop — manual mic still works */ }
      }
    } catch {
      toast.error("Mic blocked — allow microphone access. If you're in the embedded preview, open the preview in its own browser tab.");
    }
  };

  const stopRecordingAndSend = async () => {
    stopVad();
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setStatus("thinking");
    const done = new Promise((res) => { rec.onstop = res; });
    try { rec.stop(); } catch { /* noop */ }
    await done;
    const type = rec.mimeType || "audio/webm";
    stopTracks();
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
      if (!text) {
        // nothing heard — in hands-free mode just keep listening, else prompt a tap
        if (autoListen && !endedRef.current) { setStatus("idle"); startRecording(); }
        else { toast("I didn't catch that — tap the mic and try again"); setStatus("idle"); }
        return;
      }
      setCaption(text);
      const r = await api.post(`/ai-characters/${character.id}/voice-turn`, { text, ...gatherContext() });
      if (endedRef.current) return;
      setCaption(r.reply);
      await playAudio(r.audio_url);
      if (!endedRef.current) { setStatus("idle"); if (autoListen) startRecording(); } // keep the call flowing
    } catch {
      if (!endedRef.current) { toast.error("Trouble hearing you — let's try again"); setStatus("idle"); }
    }
  };
  stopSendRef.current = stopRecordingAndSend;

  useEffect(() => {
    endedRef.current = false;
    primeGeo();
    (async () => {
      try {
        const r = await api.post(`/ai-characters/${character.id}/voice-turn`, { greeting: true });
        if (endedRef.current) return;
        setCaption(r.reply);
        await playAudio(r.audio_url);
        if (!endedRef.current) { setStatus("idle"); if (autoListen) startRecording(); } // they called you → listen for your reply
      } catch {
        if (!endedRef.current) { toast.error("Couldn't start the voice call"); onEnd(); }
      }
    })();
    return () => {
      endedRef.current = true;
      stopVad();
      try { srcNodeRef.current?.stop(); } catch { /* noop */ }
      try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
      stopTracks();
      try { acRef.current?.close(); } catch { /* noop */ }
    };
  }, []);

  const hangUp = () => {
    endedRef.current = true;
    stopVad();
    try { srcNodeRef.current?.stop(); } catch { /* noop */ }
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
    stopTracks();
    try { acRef.current?.close(); } catch { /* noop */ }
    onEnd();
  };
  const toggleSpeaker = () => { const next = !speaker; setSpeaker(next); if (gainRef.current) gainRef.current.gain.value = next ? volumeRef.current : 0; };
  const changeVolume = (v) => {
    setVolume(v);
    localStorage.setItem("aichar.volume", String(v));
    if (gainRef.current) gainRef.current.gain.value = speakerRef.current ? v : 0;
  };

  const recording = status === "recording";
  const busy = status === "connecting" || status === "thinking" || status === "speaking";
  const statusText = {
    connecting: "Connecting…", idle: autoListen ? "Just speak…" : "Tap the mic and talk",
    recording: autoListen ? "Listening…" : "Listening… tap to send", thinking: `${character.name} is thinking…`, speaking: `${character.name} is speaking…`,
  }[status];

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-neutral-950 px-6 text-center" style={{ height: "100dvh" }} data-testid="aichar-call-screen">
      <div className={`relative flex h-44 w-44 items-center justify-center rounded-full ${status === "speaking" ? "animate-pulse" : ""}`}>
        <div className={`absolute inset-0 rounded-full blur-xl transition-colors ${status === "speaking" ? "bg-green-400/30" : recording ? "bg-primary/40" : "bg-white/10"}`} />
        <Avatar src={character.avatar_url} size={150} />
      </div>
      <div className="mt-6 flex items-center justify-center gap-1 text-2xl font-black text-white">{character.name}</div>
      <div className="mt-1 text-sm text-white/60" data-testid="aichar-call-status">{statusText}</div>
      {caption && <p className="mt-6 max-w-md text-sm leading-relaxed text-white/80" data-testid="aichar-caption">“{caption}”</p>}

      <div className="mt-10 flex items-center gap-6">
        <button
          onClick={recording ? stopRecordingAndSend : startRecording}
          disabled={busy}
          className={`flex h-20 w-20 items-center justify-center rounded-full transition-colors ${recording ? "bg-white text-black" : "bg-primary text-white"} disabled:opacity-40`}
          data-testid="aichar-mic-btn"
        >
          {recording ? <Square size={26} /> : <Mic size={30} />}
        </button>
        <button onClick={toggleSpeaker} className={`flex h-14 w-14 items-center justify-center rounded-full ${speaker ? "bg-green-500 text-white" : "bg-white/15 text-white"}`} title={speaker ? "Speaker on" : "Speaker off"} data-testid="aichar-speaker-toggle">
          {speaker ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
      </div>

      <div className="mt-6 flex w-full max-w-xs items-center gap-3" data-testid="aichar-volume">
        <VolumeX size={16} className="text-white/50" />
        <input
          type="range" min="0" max="1" step="0.05" value={volume}
          onChange={(e) => changeVolume(parseFloat(e.target.value))}
          aria-label="Call volume"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
          data-testid="aichar-volume-slider"
        />
        <Volume2 size={16} className="text-white/50" />
      </div>

      <button onClick={hangUp} className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white" data-testid="aichar-hangup">
        <PhoneOff size={24} />
      </button>
      <p className="mt-6 max-w-xs text-[11px] text-white/40">{autoListen ? "Just talk — they reply when you pause. Tap the mic to send manually." : "Tap the mic to talk, tap again to send."}</p>
    </div>
  );
}
