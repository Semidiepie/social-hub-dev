import React, { useRef, useState } from "react";
import { ImagePlus, Film, Loader2, X, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { compressVideoToTarget, TARGET_MAX_BYTES } from "@/lib/videoCompress";
import { toast } from "sonner";

// Homepage composer: create a text post with an optional photo OR video.
export function PostComposer({ onPosted }) {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [gameTag, setGameTag] = useState("");
  const [media, setMedia] = useState(null); // { kind: 'image'|'video', url, thumbnail_url }
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [posting, setPosting] = useState(false);
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  if (!user) return null;

  const pickMedia = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    if (file.size > MAX_UPLOAD_BYTES) {
      return toast.error("File is too large. Max size is 1GB.");
    }
    setUploading(true);
    setProgress(0);
    try {
      let toUpload = file;
      // Auto-compress oversized videos to fit the upload cap, regardless of size.
      if (kind === "video" && file.size > TARGET_MAX_BYTES) {
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
        resourceType: kind === "video" ? "video" : "image",
        onProgress: (f) => setProgress(Math.round(f * 100)),
      });
      setMedia({
        kind,
        url: res.secure_url,
        thumbnail_url:
          kind === "video"
            ? res.secure_url.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg")
            : null,
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
    if (!caption.trim() && !media) return;
    setPosting(true);
    try {
      const body = {
        caption: caption.trim(),
        game_tag: gameTag.trim() || null,
        image_url: media?.kind === "image" ? media.url : null,
        video_url: media?.kind === "video" ? media.url : null,
        thumbnail_url: media?.thumbnail_url || null,
        duration: media?.duration || null,
      };
      const created = await api.post("/posts", body);
      setCaption("");
      setGameTag("");
      setMedia(null);
      toast.success("Posted!");
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

          {media && (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-border bg-black">
              {media.kind === "image" ? (
                <img src={media.url} alt="" className="max-h-[420px] w-full object-contain" data-testid="composer-preview-image" />
              ) : (
                <video src={media.url} controls className="max-h-[420px] w-full" data-testid="composer-preview-video" />
              )}
              <button
                onClick={() => setMedia(null)}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                data-testid="composer-remove-media"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickMedia(e, "image")} />
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => pickMedia(e, "video")} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || posting}
              onClick={() => photoRef.current?.click()}
              className="gap-1.5"
              data-testid="composer-add-photo"
            >
              <ImagePlus size={15} /> Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || posting}
              onClick={() => videoRef.current?.click()}
              className="gap-1.5"
              data-testid="composer-add-video"
            >
              <Film size={15} /> Video
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
              disabled={posting || uploading || (!caption.trim() && !media)}
              className="ml-auto gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="composer-submit"
            >
              {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
