# Faster Video Uploads & Smooth Playback (Videos page)

Rebuild the Videos upload and watch experience so creators can upload large videos fast, import a video from a Google Drive or direct link that gets re-hosted on PostMePlex, and watch everything with smooth, adaptive playback.

## Who it's for
Creators on PostMePlex who post long-form videos — people who record gameplay/IRL content, often in large files, and want a YouTube-like upload-and-watch experience instead of slow uploads and choppy playback.

## Core features and experience
- **Accurate size guidance.** The current mismatch (the page says "up to 5GB" but blocks anything over 1GB) is fixed. The upload page states the real limits for each method.
- **Two upload methods, as tabs:**
  - **Upload file** — pick a video from the device. Uploads are fast and resumable (they survive a flaky connection and pick up where they left off). Capped at **1GB** on this tab, with a clear label: *"Files over 1GB? Use the Import from link tab."*
  - **Import from link** — paste a **Google Drive share link** ("Anyone with the link") or a **direct video file URL** (e.g. a `.mp4` link). PostMePlex's server hands the link to the video engine, which downloads and re-hosts the video on PostMePlex — up to **30GB**. YouTube/other platform links are **not** in this first version (see phases).
- **Smooth, adaptive playback.** New videos play through adaptive streaming: the quality auto-adjusts to the viewer's connection so playback starts quickly and doesn't stall. If the source was recorded at 60fps, 60fps is preserved.
- **Processing status.** After an upload or import finishes, the video is prepared for streaming. The page shows a clear "Processing…" state and tells the creator when it's ready to publish/play. Upload is fast; this one-time preparation step takes a short while depending on length.
- **Existing videos keep working.** Videos already on PostMePlex continue to play unchanged; only new uploads/imports use the new engine.

## User flow
1. Creator opens **Upload a video**.
2. They choose a tab:
   - *Upload file* → select a file (≤1GB) → it uploads quickly with a live progress bar.
   - *Import from link* → paste a Google Drive or direct video URL (≤30GB) → the server fetches and re-hosts it.
3. The page shows upload/import progress, then **Processing…** until the video is ready.
4. Creator adds title, description, category, tags, thumbnail, and visibility (as today), then publishes.
5. Viewers watch on the video page with adaptive, smooth playback (60fps where the source supports it).

## UI/UX feel
Keeps the current PostMePlex look (dark theme, orange accent, rounded cards). The upload area becomes two clean tabs with short helper text under each. Clear, friendly states throughout: progress bars for upload/import, a labeled "Processing…" state, and plain-language errors (e.g. if a Drive link is private/expired and can't be fetched). A short notice reminds creators that imported videos must be content they own or are licensed to use.

## Implementation phases

**Phase 1 — MVP (built now)**
- Fix the size-limit label mismatch and show accurate per-method limits.
- Two-tab upload: *Upload file* (≤1GB, fast + resumable) and *Import from link* (Google Drive "anyone with link" + direct video URLs, up to 30GB).
- Server-side re-hosting of pasted links onto the new video engine.
- Processing status with a "ready to publish/play" signal.
- Adaptive, smooth playback on the watch page for new videos (60fps preserved from 60fps sources); existing videos still play.
- The "over 1GB → use Import from link" guidance label.

**Phase 2 — Links, polish & privacy**
- YouTube and other platform links — only if pursued, with an explicit **rights/ownership attestation** the creator must confirm (this carries Terms-of-Service and copyright risk; deferred by choice).
- Custom thumbnail picker (choose a frame), captions/subtitles, and basic trim/clip before publishing.
- Enforced private/unlisted playback via secured links (today visibility is a label; this makes it actually restrict access).

**Phase 3 — Scale & insights**
- Per-video analytics: views, watch time, and retention.
- Background re-host queue with progress for very large imports, scheduled publishing, and "download original."

## Assumptions
- **Video engine: Cloudflare Stream** (you confirmed). It's a paid Cloudflare add-on billed on **your** Cloudflare account (~$5 per 1,000 min stored + $1 per 1,000 min delivered). You'll enable the Stream subscription and grant the API token Stream permission. If Stream isn't enabled/authorized, uploads and imports won't work.
- **Direct "Upload file" tab = 1GB cap; "Import from link" tab = up to 30GB** (the engine's max), per your choice.
- **Phase 1 links = Google Drive + direct video URLs only. No YouTube** in Phase 1.
- **Imported links must be publicly fetchable.** Google Drive links must be set to "Anyone with the link"; direct URLs must point straight at a video file. Private, login-required, or expiring links can't be fetched and will show a clear error. Some very large Drive files behind Google's download warning may fail to import directly; those cases surface an error rather than silently hanging.
- **Content ownership.** Imported videos are assumed to be owned or licensed by the creator; Phase 1 shows a reminder notice, Phase 2 adds a required attestation.
- **"Smooth, no delays" refers to playback**, achieved via adaptive streaming once a video is processed. There is a one-time processing step after upload/import before a video is playable (with a visible status). The upload/import itself is fast.
- **60fps** is preserved only when the original video is 60fps; it isn't manufactured for 30fps sources.
- **Scope is the long-form Videos upload and watch pages.** Short reels and other media keep the current pipeline unless you ask to move them too.
- **A default maximum video length** (about 2 hours) is applied to bound processing/cost; this can be adjusted.
- **Existing Cloudinary videos are not migrated** — they keep playing as-is; only new uploads/imports use Cloudflare Stream.
