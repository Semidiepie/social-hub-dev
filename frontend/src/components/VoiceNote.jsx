import React, { useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send, Loader2, Play, Pause } from "lucide-react";
import { toast } from "sonner";

const MAX_SECONDS = 120;

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  if (typeof MediaRecorder === "undefined") return "";
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function fmt(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// iOS Safari can't play webm/opus. Recorded notes are hosted on Cloudinary as a
// "video" resource — asking Cloudinary to deliver the same asset as .mp3 makes
// playback work on every browser/device. Local blob previews are left untouched.
function playableUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    if (/\.mp3(\?.*)?$/i.test(url)) return url;
    if (/\.(webm|m4a|mp4|aac|ogg|wav|mpga|opus)(\?.*)?$/i.test(url)) {
      return url.replace(/\.(webm|m4a|mp4|aac|ogg|wav|mpga|opus)(\?.*)?$/i, ".mp3$2");
    }
    return `${url}.mp3`;
  }
  return url;
}

// Mic button that records audio and hands back a Blob + duration via onSend.
export function VoiceRecorder({ onSend, disabled, busy, onRecordingChange }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => { onRecordingChange?.(recording); }, [recording, onRecordingChange]);

  const cleanup = () => {
    clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
  };

  useEffect(() => () => cleanup(), []);

  const start = async () => {
    if (disabled || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const dur = (Date.now() - startedRef.current) / 1000;
        const stream2 = streamRef.current;
        if (stream2) stream2.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setRecording(false);
        setElapsed(0);
        if (!cancelledRef.current && blob.size > 0 && dur >= 0.6) onSend(blob, dur);
        else if (!cancelledRef.current) toast.error("Hold a little longer to record");
      };
      startedRef.current = Date.now();
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const e = (Date.now() - startedRef.current) / 1000;
        setElapsed(e);
        if (e >= MAX_SECONDS) stop();
      }, 200);
    } catch {
      toast.error("Microphone access is needed to record a voice message");
      cleanup();
    }
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    stop();
    cleanup();
  };

  if (!recording) {
    return (
      <button type="button" onClick={start} disabled={disabled || busy} title="Record a voice message"
        aria-label="Record a voice message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50"
        data-testid="voice-record-btn">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5" data-testid="voice-recording-bar">
      <button type="button" onClick={cancel} title="Cancel" aria-label="Cancel recording"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive" data-testid="voice-cancel-btn">
        <Trash2 size={16} />
      </button>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
      <span className="flex-1 text-sm font-medium tabular-nums text-foreground" data-testid="voice-elapsed">{fmt(elapsed)}</span>
      <button type="button" onClick={stop} title="Send voice message" aria-label="Send voice message"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="voice-send-btn">
        <Send size={16} />
      </button>
    </div>
  );
}

// Inline voice-note player used inside a message bubble.
export function AudioBubble({ url, duration, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(duration || 0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play().catch(() => {}); }
  };

  const total = dur || duration || 0;
  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  const accent = mine ? "text-primary-foreground" : "text-primary";
  const track = mine ? "bg-primary-foreground/30" : "bg-primary/20";
  const fill = mine ? "bg-primary-foreground" : "bg-primary";

  return (
    <div className="flex min-w-[180px] items-center gap-2 py-0.5" data-testid="voice-note">
      <audio
        ref={audioRef}
        src={playableUrl(url)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.target.currentTime)}
        onLoadedMetadata={(e) => { if (isFinite(e.target.duration)) setDur(e.target.duration); }}
      />
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${track} ${accent}`} data-testid="voice-play-btn">
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div className={`h-1.5 w-full overflow-hidden rounded-full ${track}`}>
          <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className={`shrink-0 text-[11px] tabular-nums ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {fmt(playing || pos ? pos : total)}
      </span>
    </div>
  );
}
