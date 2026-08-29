// Cloudinary unsigned upload helper.
// Reads cloud name + preset from CRA env at build time. When not configured,
// callers should treat missing preset as an unavailable upload — the UI shows
// a friendly disabled state instead of crashing.

const CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || "";
const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || "";

export const cloudinaryAvailable = !!(CLOUD_NAME && UPLOAD_PRESET);

export async function uploadToCloudinary(file, { resourceType = "auto", onProgress } = {}) {
  if (!cloudinaryAvailable) {
    throw new Error("Uploads aren't configured yet.");
  }
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  // Use XHR so we can wire real progress events.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) resolve(data);
        else reject(new Error(data?.error?.message || `Upload failed (${xhr.status})`));
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(form);
  });
}
