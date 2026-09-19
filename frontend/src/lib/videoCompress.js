// Web video compression to a target byte budget.
//
// The browser has no ffmpeg, so we re-encode via <video> playback →
// canvas.captureStream() → MediaRecorder at a bitrate DERIVED FROM the clip's
// duration. Because output_size ≈ bitrate × duration, choosing
// bitrate = targetBytes / duration guarantees the result lands under the cap
// no matter how large the source file is. We also downscale to a 720p long
// edge so quality stays reasonable at low bitrates.
//
// Caveat: MediaRecorder re-encodes in REAL TIME (a 10-min clip takes ~10 min),
// and only WebM/MP4 output is available. This is the best fully client-side
// option; there is no way to compress faster in-browser without a native app.

// Keep output safely under Cloudinary's Free-plan single-shot cap (100MB).
export const TARGET_MAX_BYTES = 95 * 1024 * 1024;

const AUDIO_BPS = 96_000;
const MIN_VIDEO_BPS = 250_000;

function pickMime() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}

export function canCompressVideo() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || typeof document === "undefined") {
    return false;
  }
  // Probe that canvas.captureStream + MediaRecorder actually work here.
  // iOS Safari exposes captureStream but throws NotAllowedError on use.
  try {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    if (!c.captureStream) return false;
    const stream = c.captureStream(1);
    const rec = new MediaRecorder(stream);
    rec.stop();
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Compress `file` to at most `targetBytes`. Returns the original file untouched
 * when it's already small enough or when the browser can't re-encode.
 * @returns {Promise<{file: File, wasCompressed: boolean}>}
 */
export async function compressVideoToTarget(file, { targetBytes = TARGET_MAX_BYTES, onProgress, signal } = {}) {
  if (file.size <= targetBytes || !canCompressVideo()) {
    return { file, wasCompressed: false };
  }

  const url = URL.createObjectURL(file);
  const srcVideo = document.createElement("video");
  srcVideo.muted = false;
  srcVideo.playsInline = true;
  srcVideo.preload = "auto";
  srcVideo.src = url;

  try {
    await new Promise((resolve, reject) => {
      srcVideo.onloadedmetadata = () => resolve();
      srcVideo.onerror = () => reject(new Error("Could not read the video"));
    });

    const duration = Number.isFinite(srcVideo.duration) && srcVideo.duration > 0 ? srcVideo.duration : 0;
    if (!duration) {
      // Without a duration we can't budget a bitrate — send original.
      return { file, wasCompressed: false };
    }

    // Budget ~85% of the target for video+audio to leave container overhead room.
    const totalBudgetBits = targetBytes * 8 * 0.85;
    const videoBps = Math.max(MIN_VIDEO_BPS, Math.floor(totalBudgetBits / duration) - AUDIO_BPS);

    const srcW = srcVideo.videoWidth || 720;
    const srcH = srcVideo.videoHeight || 1280;
    const longEdge = Math.max(srcW, srcH);
    const scale = longEdge > 720 ? 720 / longEdge : 1;
    const dstW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const dstH = Math.max(2, Math.round((srcH * scale) / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return { file, wasCompressed: false };

    const canvasStream = canvas.captureStream(30);
    const srcCapture = srcVideo.captureStream?.() || srcVideo.mozCaptureStream?.() || null;
    if (srcCapture) srcCapture.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

    const mimeType = pickMime();
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: videoBps,
      audioBitsPerSecond: AUDIO_BPS,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data?.size > 0 && chunks.push(e.data);
    let recorderError = null;
    recorder.onerror = () => {
      recorderError = new Error("Encoder error");
    };
    const stopped = new Promise((resolve) => (recorder.onstop = () => resolve()));
    recorder.start(250);

    let rafId = 0;
    const draw = () => {
      if (srcVideo.paused || srcVideo.ended) return;
      ctx.drawImage(srcVideo, 0, 0, dstW, dstH);
      if (duration) onProgress?.(Math.min(0.99, srcVideo.currentTime / duration));
      rafId = requestAnimationFrame(draw);
    };

    await srcVideo.play();
    draw();

    await new Promise((resolve, reject) => {
      srcVideo.onended = () => resolve();
      srcVideo.onerror = () => reject(new Error("Playback error during compression"));
      signal?.addEventListener("abort", () => {
        cancelAnimationFrame(rafId);
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
        reject(new Error("Compression cancelled"));
      });
    });

    cancelAnimationFrame(rafId);
    recorder.stop();
    await stopped;
    onProgress?.(1);

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    const ext = (mimeType || "video/webm").includes("mp4") ? "mp4" : "webm";
    const name = file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
    const out = new File([blob], name, { type: blob.type });
    // Fall back to the original on encoder error, empty output, or no gain.
    if (recorderError || out.size === 0 || out.size >= file.size) {
      return { file, wasCompressed: false };
    }
    return { file: out, wasCompressed: true };
  } catch {
    // iOS Safari blocks canvas.captureStream()/MediaRecorder with a
    // NotAllowedError. Never surface that — just upload the original file.
    return { file, wasCompressed: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}
