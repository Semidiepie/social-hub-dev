// Upload helper — PostMePlex object storage (served via the backend /api/files).
// Keeps the historical `uploadToCloudinary` name/signature so existing callers
// don't need to change; media now lives on PostMePlex, not a third party.
import { getToken } from "./api";

const BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

// Uploads are always available now (no external account required).
export const cloudinaryAvailable = true;

// Client-side ceiling. The backend accepts large files; images are capped far
// lower at the call sites (e.g. 250MB images, 1GB video).
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1GB

function postForm(url, form, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (err) {
        return reject(err);
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.detail || data?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(form);
  });
}

// resourceType is accepted for backwards-compat but no longer needed — the
// backend infers the content type from the uploaded file.
export async function uploadToCloudinary(file, { onProgress } = {}) {
  const form = new FormData();
  form.append("file", file);
  const data = await postForm(`${BASE_URL}/api/upload`, form, { onProgress });
  if (!data.secure_url) throw new Error(data?.detail || "Upload failed");
  return data;
}
