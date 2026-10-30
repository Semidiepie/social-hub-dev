import React, { useRef, useState } from "react";
import { ImagePlus, Film, Loader2, X, Send, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import CollaboratorPicker from "@/components/CollaboratorPicker";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { compressVideoToTarget, TARGET_MAX_BYTES } from "@/lib/videoCompress";
import { playPostChime } from "@/lib/sound";
import { toast } from "sonner";

// Homepage composer: create a text post with an optional photo OR video.
export function PostComposer({ onPosted }) {
  const { user } = useAuth();
  const MAX_IMAGES = 4;
  const [caption, setCaption] = useState("");
  const [gameTag, setGameTag] = useState("");
  const [images, setImages] = useState([]); // array of image URLs (max 4)
  const [video, setVideo] = useState(null); // { url, thumbnail_url, duration }
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [posting, setPosting] = useState(false);
  const [collaborator, setCollaborator] = useState(null);
  const [showCollabPicker, setShowCollabPicker] = useState(false);
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  if (!user) return null;

  const pickPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return toast.error(`You can add up to ${MAX_IMAGES} photos.`);
    const batch = files.slice(0, room);
    if (batch.some((f) => f.size > MAX_UPLOAD_BYTES)) {
      return toast.error("A file is too large. Max size is 1GB.");
    }
    setVideo(null);
    setUploading(true);
    setPhase("Uploading");
    setProgress(0);
    try {
      for (let i = 0; i < batch.length; i++) {
        const res = await uploadToCloudinary(batch[i], {
          resourceType: "image",
          onProgress: (f) => setProgress(Math.round(((i + f) / batch.length) * 100)),
        });
        setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, res.secure_url] : prev));
      }
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setPhase("");
    }
  };

  const pickVideo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    if (file.size > MAX_UPLOAD_BYTES) {
      return toast.error("File is too large. Max size is 1GB.");
    }
    setImages([]);
    setUploading(true);
    setProgress(0);
    try {
      let toUpload = file;
      // Auto-compress oversized videos to fit the upload cap, regardless of size.
      if (file.size > TARGET_MAX_BYTES) {
        setPhase("Compressing");
        const { file: compressed, wasCompressed } = await compressVideoToTarget(file, {
          onProgress: (f) => setProgress(Math.round(f * 100)),
        });
        toUpload = compressed;
        if (wasCompressed) toast.success("Video compressed to fit — uploading…");
      }
      setPhase("Uploading");
      setProgress(0);
      const res = await uploadToCloudinary(toUpload, {
        resourceType: "video",
        onProgress: (f) => setProgress(Math.round(f * 100)),
      });
      setVideo({
        url: res.secure_url,
        thumbnail_url: res.secure_url.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg"),
        duration: res.duration || null,
      });
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setPhase("");
    }
  };

  const submit = async () => {
    const hasMedia = images.length > 0 || !!video;
    if (!caption.trim() && !hasMedia) return;
    setPosting(true);
    try {
      const body = {
        caption: caption.trim(),
        game_tag: gameTag.trim() || null,
        image_url: images[0] || null,
        image_urls: images.length ? images : null,
        video_url: video?.url || null,
        thumbnail_url: video?.thumbnail_url || null,
        duration: video?.duration || null,
        collaborator_id: collaborator?.id || null,
      };
      const created = await api.post("/posts", body);
      setCaption("");
      setGameTag("");
      setImages([]);
      setVideo(null);
      playPostChime();
      if (collaborator) {
        toast.success(`Collab invite sent to @${collaborator.username} — it goes live when they accept`);
      } else {
        toast.success("Posted!");
      }
      setCollaborator(null);
      setShowCollabPicker(false);
      onPosted?.(created);
    } catch (e) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4" data-testid="post-composer">
      <div className="flex gap-3">
        <Avatar src={user.avatar_url} size={40} />
        <div className="flex-1">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={`What's on your mind, ${user.display_name?.split(" ")[0] || "creator"}?`}
            rows={2}
            maxLength={2000}
            data-testid="composer-caption"
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/60"
          />

          {images.length > 0 && (
            <div
              className={`mt-3 grid gap-1.5 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
              data-testid="composer-preview-images"
            >
              {images.map((url, i) => (
                <div key={i} className="relative overflow-hidden rounded-xl border border-border bg-black">
                  <img
                    src={url}
                    alt=""
                    className={`w-full object-cover ${images.length === 1 ? "max-h-[420px]" : "h-40"}`}
                  />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                    data-testid={`composer-remove-image-${i}`}
                    aria-label="Remove image"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {video && (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-border bg-black">
              <video src={video.url} controls className="max-h-[420px] w-full" data-testid="composer-preview-video" />
              <button
                onClick={() => setVideo(null)}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                data-testid="composer-remove-media"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={pickPhotos} />
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={pickVideo} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || posting || !!video || images.length >= MAX_IMAGES}
              onClick={() => photoRef.current?.click()}
              className="gap-1.5"
              data-testid="composer-add-photo"
            >
              <ImagePlus size={15} /> Photo{images.length > 0 ? ` (${images.length}/${MAX_IMAGES})` : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || posting || images.length > 0}
              onClick={() => videoRef.current?.click()}
              className="gap-1.5"
              data-testid="composer-add-video"
            >
              <Film size={15} /> Video
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={posting}
              onClick={() => setShowCollabPicker((v) => !v)}
              className={`gap-1.5 ${collaborator ? "border-primary text-primary" : ""}`}
              data-testid="composer-add-collaborator"
            >
              <UserPlus size={15} /> {collaborator ? "Collaborator added" : "Add collaborator"}
            </Button>
            <input
              value={gameTag}
              onChange={(e) => setGameTag(e.target.value.replace(/\s/g, ""))}
              placeholder="#game-tag"
              maxLength={30}
              data-testid="composer-game-tag"
              className="h-9 w-32 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
            />
            {uploading && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="composer-progress">
                <Loader2 size={16} className="animate-spin" /> {phase} {progress}%
              </span>
            )}
            <Button
              onClick={submit}
              disabled={posting || uploading || (!caption.trim() && images.length === 0 && !video)}
              className="ml-auto gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="composer-submit"
            >
              {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Post
            </Button>
          </div>

          {collaborator && (
            <div className="mt-3 flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 py-1 pl-1 pr-2.5" data-testid="composer-collaborator-chip">
              <Avatar src={collaborator.avatar_url} size={26} />
              <span className="text-sm font-semibold">{collaborator.display_name}</span>
              <span className="text-xs text-muted-foreground">@{collaborator.username}</span>
              <button
                onClick={() => setCollaborator(null)}
                className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground hover:text-foreground"
                data-testid="composer-remove-collaborator"
                aria-label="Remove collaborator"
              >
                <X size={13} />
              </button>
            </div>
          )}
          {showCollabPicker && !collaborator && (
            <CollaboratorPicker
              excludeId={user.id}
              onClose={() => setShowCollabPicker(false)}
              onSelect={(u) => { setCollaborator(u); setShowCollabPicker(false); }}
            />
          )}
          {collaborator && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              This becomes a collab post — it stays private until @{collaborator.username} accepts your invite.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
