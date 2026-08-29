// Video compression helper — dual pipeline:
//   • Native (iOS / Android):  react-native-compressor → H.264/AAC MP4 via
//                              AVAssetExportSession / MediaCodec.
//   • Web (browser):           MediaRecorder + <video>.captureStream() at a
//                              capped bitrate → WebM (VP9/Opus).
//
// Both paths return a URI ready to upload. If neither pipeline is available
// (very old browser, no MediaRecorder support), we return the original URI
// so the user can still attempt the upload — Cloudinary may still reject
// a truly huge file, but that's the correct fallback error surface.
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { Video } from "react-native-compressor";
import { SINGLE_UPLOAD_MAX_BYTES } from "@/src/lib/cloudinary";

/** Videos larger than this get auto-compressed. Uses a slight buffer under the
 *  Cloudinary single-shot cap so the compressed file has room to spare. */
export const COMPRESSION_THRESHOLD_BYTES = Math.floor(SINGLE_UPLOAD_MAX_BYTES * 0.9);

export interface CompressionResult {
  uri: string;
  bytes: number;
  wasCompressed: boolean;
  savedBytes: number;
}

export interface CompressOptions {
  /** Called with 0..1 as the compressor makes progress. */
  onProgress?: (fraction: number) => void;
  /** Force compression even if the file is already small. */
  force?: boolean;
  /** Bail out mid-compress. */
  signal?: AbortSignal;
}

async function getSize(uri: string): Promise<number> {
  if (Platform.OS === "web") {
    if (uri.startsWith("blob:") || uri.startsWith("data:")) {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      return blob.size;
    }
    return 0;
  }
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  return info.exists ? info.size ?? 0 : 0;
}

/**
 * Compress a local video if it's over the threshold.
 *
 * Runs the native compressor on iOS / Android and a MediaRecorder-based
 * re-encode on the web. Returns the original URI when the file is small
 * enough to skip.
 */
export async function compressVideoIfNeeded(
  uri: string,
  opts: CompressOptions = {},
): Promise<CompressionResult> {
  const originalBytes = await getSize(uri);

  const needsCompression = opts.force || originalBytes > COMPRESSION_THRESHOLD_BYTES || originalBytes === 0;
  if (!needsCompression) {
    return { uri, bytes: originalBytes, wasCompressed: false, savedBytes: 0 };
  }

  if (Platform.OS === "web") {
    try {
      const result = await compressVideoWeb(uri, opts);
      return {
        uri: result.uri,
        bytes: result.bytes,
        wasCompressed: true,
        savedBytes: Math.max(0, originalBytes - result.bytes),
      };
    } catch (e) {
      console.warn("[compress] web compression failed, sending original:", e);
      return { uri, bytes: originalBytes, wasCompressed: false, savedBytes: 0 };
    }
  }

  // Native — react-native-compressor.
  const compressedUri = await Video.compress(
    uri,
    { compressionMethod: "auto" },
    (progress) => {
      if (opts.signal?.aborted) throw new Error("Compression cancelled");
      opts.onProgress?.(progress);
    },
  );
  const newBytes = await getSize(compressedUri);
  return {
    uri: compressedUri,
    bytes: newBytes,
    wasCompressed: true,
    savedBytes: Math.max(0, originalBytes - newBytes),
  };
}

// -------------------------------------------------------------------------
// Web pipeline — captureStream + MediaRecorder
// -------------------------------------------------------------------------

interface WebCompressResult {
  uri: string;
  bytes: number;
}

/** Re-encodes the source video to a lower-bitrate WebM in-browser. */
async function compressVideoWeb(
  uri: string,
  opts: CompressOptions,
): Promise<WebCompressResult> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder not supported in this browser");
  }

  // Load the source video into a hidden <video> element.
  const srcVideo = document.createElement("video");
  srcVideo.crossOrigin = "anonymous";
  srcVideo.muted = false;
  srcVideo.playsInline = true;
  srcVideo.preload = "auto";
  srcVideo.src = uri;

  await new Promise<void>((resolve, reject) => {
    srcVideo.onloadedmetadata = () => resolve();
    srcVideo.onerror = () => reject(new Error("Could not load the video source"));
  });

  const totalDuration = Number.isFinite(srcVideo.duration) ? srcVideo.duration : 0;
  const srcW = srcVideo.videoWidth || 720;
  const srcH = srcVideo.videoHeight || 1280;

  // Downscale to a 720p-ish long edge so the bitrate cap is realistic.
  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge > 720 ? 720 / longEdge : 1;
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Merge canvas video + source audio (if any) into one stream.
  const canvasStream = (canvas as HTMLCanvasElement).captureStream(30);
  const srcAny = srcVideo as unknown as {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  const srcCapture: MediaStream | null = srcAny.captureStream
    ? srcAny.captureStream()
    : srcAny.mozCaptureStream
      ? srcAny.mozCaptureStream()
      : null;
  if (srcCapture) {
    srcCapture.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
  }

  // Pick the best mime the browser supports. VP9 first, then VP8.
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mimeType =
    candidates.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) ||
    undefined;

  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: 1_500_000, // ~1.5 Mbps → decent 720p quality
    audioBitsPerSecond: 128_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(200);

  let rafId = 0;
  const draw = () => {
    if (srcVideo.paused || srcVideo.ended) return;
    ctx.drawImage(srcVideo, 0, 0, dstW, dstH);
    if (totalDuration > 0) {
      opts.onProgress?.(Math.min(0.99, srcVideo.currentTime / totalDuration));
    }
    rafId = requestAnimationFrame(draw);
  };

  await srcVideo.play();
  draw();

  await new Promise<void>((resolve, reject) => {
    srcVideo.onended = () => resolve();
    srcVideo.onerror = () => reject(new Error("Playback error during compression"));
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        cancelAnimationFrame(rafId);
        try {
          recorder.stop();
        } catch {}
        reject(new Error("Compression cancelled"));
      });
    }
  });
  cancelAnimationFrame(rafId);
  recorder.stop();
  await stopped;
  opts.onProgress?.(1);

  const blob = new Blob(chunks, { type: mimeType || "video/webm" });
  return { uri: URL.createObjectURL(blob), bytes: blob.size };
}
