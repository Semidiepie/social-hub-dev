// Capture a JPEG poster frame from a local video File, entirely client-side.
// Object storage doesn't auto-generate video thumbnails (the old Cloudinary
// ".jpg" trick no longer works), so we grab a representative frame and upload it
// as the reel/video poster — this removes the black screen in feeds and makes
// the share card photo-forward instead of a plain text card.
export async function captureVideoThumbnail(file, { quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = url;

    let done = false;
    const cleanup = () => { try { URL.revokeObjectURL(url); } catch { /* no-op */ } };
    const fail = (e) => { if (done) return; done = true; cleanup(); reject(e instanceof Error ? e : new Error("thumbnail failed")); };

    const grab = () => {
      if (done) return;
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return fail(new Error("no video dimensions"));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(video, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return fail(new Error("canvas export failed"));
          done = true;
          cleanup();
          resolve({
            file: new File([blob], "thumbnail.jpg", { type: "image/jpeg" }),
            duration: Number.isFinite(video.duration) ? video.duration : null,
            width: w,
            height: h,
          });
        }, "image/jpeg", quality);
      } catch (e) {
        fail(e);
      }
    };

    video.onloadedmetadata = () => {
      // Seek a touch into the clip — frame 0 is often black/blank.
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      const target = d > 0 ? Math.min(1, d * 0.1) : 0.1;
      video.onseeked = grab;
      try { video.currentTime = target; } catch { grab(); }
    };
    video.onerror = () => fail(new Error("could not read video"));
    // Safety net if neither event fires.
    setTimeout(() => { if (!done) grab(); }, 6000);
  });
}
