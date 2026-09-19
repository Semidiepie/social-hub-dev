// Cloudinary unsigned upload helper.
// Reads cloud name + preset from CRA env at build time. When not configured,
// callers should treat missing preset as an unavailable upload — the UI shows
// a friendly disabled state instead of crashing.

const CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || "";
const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || "";

export const cloudinaryAvailable = !!(CLOUD_NAME && UPLOAD_PRESET);

// Cloudinary's single-shot unsigned upload caps around 100MB; anything larger
// must be sent in chunks via Content-Range. We chunk anything over ~90MB (and
// always chunk videos over the chunk size) so large clips upload reliably.
const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
const CHUNK_THRESHOLD = 90 * 1024 * 1024; // 90MB

function postForm(url, form, { headers = {}, onProgress, offset = 0, total = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      if (total) onProgress((offset + e.loaded) / total);
      else onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (err) {
        return reject(err);
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(form);
  });
}

async function uploadChunked(file, url, onProgress) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let start = 0;
  let last = null;
  while (start < file.size) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const form = new FormData();
    form.append("file", file.slice(start, end));
    form.append("upload_preset", UPLOAD_PRESET);
    last = await postForm(url, form, {
      headers: {
        "X-Unique-Upload-Id": uniqueId,
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
      },
      onProgress,
      offset: start,
      total: file.size,
    });
    start = end;
  }
  return last;
}

export async function uploadToCloudinary(file, { resourceType = "auto", onProgress } = {}) {
  if (!cloudinaryAvailable) {
    throw new Error("Uploads aren't configured yet.");
  }
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  // Large files (esp. videos) must be chunked or the single request fails.
  if (file.size > CHUNK_THRESHOLD) {
    return uploadChunked(file, url, onProgress);
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  const data = await postForm(url, form, { onProgress });
  if (!data.secure_url) throw new Error(data?.error?.message || "Upload failed");
  return data;
}
