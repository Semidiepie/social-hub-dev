import React, { useRef, useState } from "react";
import { ImagePlus, Film, Loader2, X, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { playPostChime } from "@/lib/sound";
import { toast } from "sonner";

// Facebook-style story creator (web): pick a photo/video + optional caption → POST /api/stories.
export function StoryComposer({ open, onClose, onPosted }) {
  const [media, setMedia] = useState(null); // { kind, url, thumbnail_url, duration }
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [posting, setPosting] = useState(false);
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  const reset = () => {
    setMedia(null);
    setCaption("");
    setProgress(0);
  };

  const pick = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("File is too large. Max size is 1GB.");
    setUploading(true);
    setProgress(0);
    try {
      const res = await uploadToCloudinary(file, {
        resourceType: kind === "video" ? "video" : "image",
        onProgress: (f) => setProgress(Math.round(f * 100)),
      });
      setMedia({
        kind,
        url: res.secure_url,
        thumbnail_url: kind === "video" ? res.secure_url.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg") : null,
        duration: res.duration || null,
      });
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!media) return toast.error("Add a photo or video first");
    setPosting(true);
    try {
      await api.post("/stories", {
        media_url: media.url,
        media_type: media.kind,
        caption: caption.trim() || null,
        duration: media.duration || null,
      });
      playPostChime();
      toast.success("Story shared!");
      reset();
      onPosted?.();
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to share story");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !posting && (reset(), onClose())}>
      <DialogContent className="max-w-md" data-testid="story-composer">
        <DialogHeader>
          <DialogTitle>Add to your story</DialogTitle>
        </DialogHeader>

        {media ? (
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            {media.kind === "image" ? (
              <img src={media.url} alt="" className="max-h-[420px] w-full object-contain" data-testid="story-preview-image" />
            ) : (
              <video src={media.url} controls className="max-h-[420px] w-full" data-testid="story-preview-video" />
            )}
            <button
              onClick={() => setMedia(null)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
              data-testid="story-remove-media"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e, "image")} />
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => pick(e, "video")} />
            <button
              onClick={() => photoRef.current?.click()}
              disabled={uploading}
              className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-secondary/40 py-8 transition-colors hover:bg-secondary"
              data-testid="story-add-photo"
            >
              <ImagePlus className="text-primary" size={26} />
              <span className="text-sm font-semibold">Photo</span>
            </button>
            <button
              onClick={() => videoRef.current?.click()}
              disabled={uploading}
              className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-secondary/40 py-8 transition-colors hover:bg-secondary"
              data-testid="story-add-video"
            >
              <Film className="text-primary" size={26} />
              <span className="text-sm font-semibold">Video</span>
            </button>
          </div>
        )}

        {uploading && (
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-primary">
            <Loader2 size={16} className="animate-spin" /> Uploading {progress}%
          </div>
        )}

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          maxLength={200}
          data-testid="story-caption"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
        />

        <Button
          onClick={submit}
          disabled={posting || uploading || !media}
          className="w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="story-submit"
        >
          {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Share to story
        </Button>
      </DialogContent>
    </Dialog>
  );
}
