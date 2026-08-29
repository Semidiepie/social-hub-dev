// Cloudinary unsigned upload helper. Returns the secure URL or throws on error.
import * as FileSystem from "expo-file-system";
import { EncodingType } from "expo-file-system";
import { Platform } from "react-native";

const CLOUD = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export type UploadKind = "image" | "video";

/** Chunked video uploads use 20 MB parts. Cloudinary requires the chunk size
 *  to be a multiple of 5 MB and >=5 MB. 20 MB gives a good balance between
 *  overhead and per-chunk retry cost for slow mobile connections. */
export const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

/** Cloudinary caps single-shot uploads at 100 MB regardless of plan; anything
 *  larger MUST use the chunked API. Even on Free plans this is the ceiling. */
export const SINGLE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export function isCloudinaryConfigured(): boolean {
  return !!(CLOUD && PRESET && CLOUD !== "placeholder" && PRESET !== "placeholder");
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

/**
 * Upload a local URI to Cloudinary using the configured unsigned preset.
 * Falls back to a sensible MIME/ext when the picker doesn't provide one.
 */
export async function uploadToCloudinary(
  uri: string,
  kind: UploadKind = "image",
  mime?: string | null,
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary not configured");
  }
  const ext = guessExtFromMime(mime, kind);
  const fileType =
    mime && mime.includes("/")
      ? mime
      : kind === "video"
        ? `video/${ext}`
        : `image/${ext}`;

  // Blob/data URLs on web need a fetch->blob conversion. Native URIs (file://, ph://, content://)
  // are accepted directly by RN's FormData.
  let filePart: any;
  if (uri.startsWith("blob:") || uri.startsWith("data:")) {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    filePart = blob;
  } else {
    filePart = { uri, name: `upload.${ext}`, type: fileType };
  }
  const data = new FormData();
  data.append("file", filePart as any);
  data.append("upload_preset", PRESET as string);
  // resource_type=auto lets Cloudinary figure things out, but we still call
  // the kind-specific endpoint for predictable URL shape.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${kind}/upload`, {
    method: "POST",
    body: data,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    const raw = json?.error?.message || "Upload failed";
    const friendly = /whitelisted for unsigned/i.test(raw)
      ? `Cloudinary preset "${PRESET}" isn't set to Unsigned. Open Cloudinary → Settings → Upload presets → "${PRESET}" → set Signing Mode = Unsigned, then try again.`
      : raw;
    throw new Error(friendly);
  }
  return json.secure_url as string;
}

/**
 * Given a Cloudinary video URL, derive a jpg poster URL at t=0 by inserting
 * `/video/upload/so_0/` and swapping the extension. Returns null for non-Cloudinary URLs.
 */
export function derivePosterFromVideoUrl(videoUrl: string): string | null {
  if (!videoUrl) return null;
  try {
    const m = videoUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/);
    if (!m) return null;
    const prefix = m[1];
    const rest = m[2];
    // Strip extension and add jpg.
    const dot = rest.lastIndexOf(".");
    const noExt = dot > -1 ? rest.slice(0, dot) : rest;
    return `${prefix}so_0/${noExt}.jpg`;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------
// Chunked video upload (for files > 100 MB)
// -------------------------------------------------------------------------

function makeUploadUuid(): string {
  // Simple RFC4122-ish UUID good enough as an X-Unique-Upload-Id
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function base64ToUint8(b64: string): Uint8Array {
  // Same as atob → bytes but works both in RN (atob polyfill via base-64) and web.
  const binary =
    typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
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
 * Upload a large video to Cloudinary using its chunked upload API.
 *
 * Reads the source file in 20 MB slices via expo-file-system (which supports
 * byte-range reads without loading the whole file into RAM). Each slice is
 * POSTed to the same Cloudinary endpoint with matching `X-Unique-Upload-Id`
 * and `Content-Range` headers; Cloudinary re-assembles the parts server-side.
 *
 * Falls back to single-shot upload for smaller files or on web (where
 * expo-file-system range reads aren't available — the browser's Blob.slice
 * on the source blob handles chunking naturally for us via the whole-file
 * fetch below).
 */
export async function uploadVideoChunked(
  uri: string,
  opts: ChunkedUploadOptions = {},
): Promise<ChunkedUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary not configured");
  }
  const url = `https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`;

  // ---- Web / blob URIs -------------------------------------------------
  // expo-file-system position reads aren't supported for blob:/data: URIs.
  // Fall back to whole-file slicing which the browser handles efficiently.
  if (Platform.OS === "web" || uri.startsWith("blob:") || uri.startsWith("data:")) {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const totalBytes = blob.size;
    if (totalBytes <= SINGLE_UPLOAD_MAX_BYTES) {
      // Small enough → single-shot; we get one HTTP round trip.
      const url2 = await uploadToCloudinary(uri, "video", opts.mime ?? blob.type);
      return {
        secureUrl: url2,
        duration: null,
        bytes: totalBytes,
        thumbnailUrl: derivePosterFromVideoUrl(url2),
      };
    }
    return await postSlicedBlob(blob, url, opts);
  }

  // ---- Native file:// URIs --------------------------------------------
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (!info.exists) throw new Error("Source file not found");
  const totalBytes = info.size ?? 0;

  if (totalBytes <= SINGLE_UPLOAD_MAX_BYTES) {
    const url2 = await uploadToCloudinary(uri, "video", opts.mime);
    return {
      secureUrl: url2,
      duration: null,
      bytes: totalBytes,
      thumbnailUrl: derivePosterFromVideoUrl(url2),
    };
  }

  const uploadId = makeUploadUuid();
  const mime = opts.mime || "video/mp4";
  let uploaded = 0;
  let finalJson: any = null;

  while (uploaded < totalBytes) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    const end = Math.min(uploaded + CHUNK_SIZE_BYTES, totalBytes);
    const length = end - uploaded;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
      position: uploaded,
      length,
    });
    const bytes = base64ToUint8(b64);
    // Wrap chunk in a blob so RN's FormData sends real binary bytes.
    const chunkBlob = new Blob([bytes], { type: mime });
    const fd = new FormData();
    fd.append("file", chunkBlob as any, "chunk.mp4");
    fd.append("upload_preset", PRESET as string);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range": `bytes ${uploaded}-${end - 1}/${totalBytes}`,
      },
      body: fd,
    });
    const json = await resp.json();
    if (!resp.ok) {
      const raw = json?.error?.message || `Upload failed (chunk ${uploaded}-${end - 1})`;
      throw new Error(raw);
    }
    if (end === totalBytes) finalJson = json;
    uploaded = end;
    opts.onProgress?.(uploaded / totalBytes, uploaded, totalBytes);
  }

  if (!finalJson?.secure_url) {
    throw new Error("Upload finished but Cloudinary returned no URL");
  }
  return {
    secureUrl: finalJson.secure_url as string,
    duration: typeof finalJson.duration === "number" ? finalJson.duration : null,
    bytes: typeof finalJson.bytes === "number" ? finalJson.bytes : totalBytes,
    thumbnailUrl: derivePosterFromVideoUrl(finalJson.secure_url),
  };
}

async function postSlicedBlob(
  blob: Blob,
  url: string,
  opts: ChunkedUploadOptions,
): Promise<ChunkedUploadResult> {
  const uploadId = makeUploadUuid();
  const totalBytes = blob.size;
  let uploaded = 0;
  let finalJson: any = null;
  while (uploaded < totalBytes) {
    if (opts.signal?.aborted) throw new Error("Upload cancelled");
    const end = Math.min(uploaded + CHUNK_SIZE_BYTES, totalBytes);
    const slice = blob.slice(uploaded, end, opts.mime || blob.type || "video/mp4");
    const fd = new FormData();
    fd.append("file", slice, "chunk.mp4");
    fd.append("upload_preset", PRESET as string);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range": `bytes ${uploaded}-${end - 1}/${totalBytes}`,
      },
      body: fd,
    });
    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(json?.error?.message || `Upload failed (chunk ${uploaded}-${end - 1})`);
    }
    if (end === totalBytes) finalJson = json;
    uploaded = end;
    opts.onProgress?.(uploaded / totalBytes, uploaded, totalBytes);
  }
  return {
    secureUrl: finalJson?.secure_url as string,
    duration: typeof finalJson?.duration === "number" ? finalJson.duration : null,
    bytes: typeof finalJson?.bytes === "number" ? finalJson.bytes : totalBytes,
    thumbnailUrl: derivePosterFromVideoUrl(finalJson?.secure_url ?? ""),
  };
}
