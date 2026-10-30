import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send, X, Film, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import CollaboratorPicker from "@/components/CollaboratorPicker";
import { toast } from "sonner";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { compressVideoToTarget, TARGET_MAX_BYTES } from "@/lib/videoCompress";

// Dedicated web page to publish a vertical reel (shows in the Reels feed).
export default function ReelUploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [gameTag, setGameTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [collaborator, setCollaborator] = useState(null);
  const [showCollabPicker, setShowCollabPicker] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Video is too large. Max size is 1GB.");
      return;
    }
    if (!cloudinaryAvailable) {
      toast.error("Uploads aren't configured.");
      return;
    }
    setFile(f);
    setUploading(true);
    setProgress(0);
    try {
      let toUpload = f;
      if (f.size > TARGET_MAX_BYTES) {
        setPhase("compressing");
        const { file: compressed, wasCompressed } = await compressVideoToTarget(f, {
          onProgress: setProgress,
        });
        toUpload = compressed;
        if (wasCompressed) toast.success("Video compressed to fit — uploading…");
      }
      setPhase("uploading");
      setProgress(0);
      const result = await uploadToCloudinary(toUpload, {
        resourceType: "video",
        onProgress: setProgress,
      });
      setVideoUrl(result.secure_url);
      if (result.duration) setDuration(result.duration);
      setThumbnailUrl(
        result.thumbnail_url || result.secure_url.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg"),
      );
      toast.success("Video uploaded");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setPhase("");
    }
  };

  const clearVideo = () => {
    setVideoUrl("");
    setFile(null);
    setThumbnailUrl("");
    setDuration(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return toast.error("Upload a video first");
    setBusy(true);
    try {
      await api.post("/reels", {
        caption: caption.trim(),
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl || null,
        game_tag: gameTag.trim() || null,
        duration: duration || null,
        collaborator_id: collaborator?.id || null,
      });
      if (collaborator) {
        toast.success(`Collab invite sent to @${collaborator.username} — your reel goes live when they accept`);
        navigate("/");
      } else {
        toast.success("Reel published!");
        navigate("/reels");
      }
    } catch (err) {
      toast.error(err.message || "Failed to publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5" data-testid="reel-upload-form">
      <header>
        <div className="flex items-center gap-2">
          <Film className="text-primary" size={24} />
          <h1 className="text-3xl font-black tracking-tight">Post a reel</h1>
        </div>
        <p className="mt-1 text-muted-foreground">Vertical 9:16 videos work best — up to 60s.</p>
      </header>

      <div>
        <Label>Video</Label>
        {videoUrl ? (
          <div className="relative mt-1.5 mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-border bg-black">
            <video src={videoUrl} controls className="aspect-[9/16] w-full bg-black object-contain" data-testid="reel-preview-video" />
            <button
              type="button"
              onClick={clearVideo}
              className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
              data-testid="reel-remove-file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label
            htmlFor="reel-upload"
            className="mt-1.5 mx-auto flex aspect-[9/16] w-full max-w-[320px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
            data-testid="reel-upload-drop"
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                {phase === "compressing" ? "Compressing" : "Uploading"}… {Math.round(progress * 100)}%
              </>
            ) : (
              <>
                <Film size={30} />
                Click to select a vertical video
              </>
            )}
            <input
              id="reel-upload"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onFile}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      <div>
        <Label htmlFor="reel-caption">Caption</Label>
        <Textarea
          id="reel-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={2000}
          placeholder="What's the play? Tag your squad…"
          data-testid="reel-caption-input"
          className="mt-1.5 min-h-[90px]"
        />
      </div>

      <div>
        <Label htmlFor="reel-tag">Game tag</Label>
        <Input
          id="reel-tag"
          value={gameTag}
          onChange={(e) => setGameTag(e.target.value.replace(/\s/g, ""))}
          maxLength={30}
          placeholder="#valorant"
          data-testid="reel-tag-input"
          className="mt-1.5 h-11"
        />
      </div>

      <div>
        <Label>Collaborator</Label>
        <p className="mb-1.5 mt-0.5 text-xs text-muted-foreground">Co-author this reel with another creator. It stays private until they accept.</p>
        {collaborator ? (
          <div className="flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 py-1 pl-1 pr-2.5" data-testid="reel-collaborator-chip">
            <Avatar src={collaborator.avatar_url} size={26} />
            <span className="text-sm font-semibold">{collaborator.display_name}</span>
            <span className="text-xs text-muted-foreground">@{collaborator.username}</span>
            <button
              type="button"
              onClick={() => setCollaborator(null)}
              className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground hover:text-foreground"
              data-testid="reel-remove-collaborator"
              aria-label="Remove collaborator"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCollabPicker((v) => !v)}
              className="gap-1.5"
              data-testid="reel-add-collaborator"
            >
              <UserPlus size={15} /> Add collaborator
            </Button>
            {showCollabPicker && (
              <CollaboratorPicker
                excludeId={user?.id}
                onClose={() => setShowCollabPicker(false)}
                onSelect={(u) => { setCollaborator(u); setShowCollabPicker(false); }}
              />
            )}
          </>
        )}
      </div>

      <Button
        type="submit"
        disabled={busy || uploading || !videoUrl}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        data-testid="reel-publish-btn"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {collaborator ? "Send collab reel" : "Publish reel"}
      </Button>
    </form>
  );
}
