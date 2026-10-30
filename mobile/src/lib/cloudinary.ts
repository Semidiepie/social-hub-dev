// Upload helper — PostMePlex object storage (served via the backend /api/files).
// Keeps the historical `uploadToCloudinary` / `uploadVideoChunked` names and
// signatures so existing screens don't change; media now lives on PostMePlex.
import { getToken } from "@/src/api/client";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

export type UploadKind = "image" | "video";

// Retained for callers that still reference these; the backend accepts any size.
export const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;
export const SINGLE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;

// Uploads are always available now (no external account required).
export function isCloudinaryConfigured(): boolean {
  return true;
}

function guessExtFromMime(mime: string | null | undefined, kind: UploadKind): string {
  if (mime) {
    const slash = mime.lastIndexOf("/");
    if (slash > -1) {
      const ext = mime.slice(slash + 1).toLowerCase();
      if (ext && /^[a-z0-9]+$/.test(ext) && ext !== "octet-stream") return ext;
    }
  }
  return kind === "video" ? "mp4" : "jpg";
}

async function postUpload(filePart: any): Promise<any> {
  const data = new FormData();
  data.append("file", filePart as any);
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: data,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) {
    throw new Error(json?.detail || "Upload failed");
  }
  return json;
}

/** Upload a local URI to PostMePlex storage. Returns the public URL. */
export async function uploadToCloudinary(
  uri: string,
  kind: UploadKind = "image",
  mime?: string | null,
): Promise<string> {
  const ext = guessExtFromMime(mime, kind);
  const fileType =
    mime && mime.includes("/") ? mime : kind === "video" ? `video/${ext}` : `image/${ext}`;

  let filePart: any;
  if (uri.startsWith("blob:") || uri.startsWith("data:")) {
    const resp = await fetch(uri);
    filePart = await resp.blob();
  } else {
    filePart = { uri, name: `upload.${ext}`, type: fileType };
  }
  const json = await postUpload(filePart);
  return json.url as string;
}

/** PostMePlex storage doesn't auto-generate video posters. */
export function derivePosterFromVideoUrl(_videoUrl: string): string | null {
  return null;
}

export interface ChunkedUploadOptions {
  mime?: string | null;
  onProgress?: (fractionDone: number, bytesDone: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface ChunkedUploadResult {
  secureUrl: string;
  duration: number | null;
  bytes: number | null;
  thumbnailUrl: string | null;
}

/**
 * Upload a video. The backend handles the full file, so no client-side
 * chunking is needed anymore; kept as a thin wrapper for existing callers.
 */
export async function uploadVideoChunked(
  uri: string,
  opts: ChunkedUploadOptions = {},
): Promise<ChunkedUploadResult> {
  let filePart: any;
  if (opts.signal?.aborted) throw new Error("Upload cancelled");
  if (uri.startsWith("blob:") || uri.startsWith("data:")) {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    filePart = blob;
  } else {
    const mime = opts.mime || "video/mp4";
    filePart = { uri, name: "upload.mp4", type: mime };
  }
  opts.onProgress?.(0.1, 0, 0);
  const json = await postUpload(filePart);
  opts.onProgress?.(1, json.bytes ?? 0, json.bytes ?? 0);
  return {
    secureUrl: json.url as string,
    duration: null,
    bytes: typeof json.bytes === "number" ? json.bytes : null,
    thumbnailUrl: null,
  };
}
