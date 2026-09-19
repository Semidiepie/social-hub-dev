import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send, Upload, X, Video as VideoIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { compressVideoToTarget, TARGET_MAX_BYTES } from "@/lib/videoCompress";

export default function VideoUploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    visibility: "public",
  });
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  const patch = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Video is too large. Max size is 1GB.");
      return;
    }
    setFile(f);
    if (!cloudinaryAvailable) {
      toast.error("Uploads aren't configured. Paste a video URL instead.");
      return;
    }
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
      if (result.thumbnail_url) setThumbnailUrl(result.thumbnail_url);
      toast.success("Video uploaded");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setPhase("");
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) return setTagInput("");
    setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title required");
    if (!videoUrl.trim()) return toast.error("Upload a video or paste its URL first");
    setBusy(true);
    try {
      const created = await api.post("/videos", {
        title: form.title.trim(),
        description: form.description.trim(),
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl || null,
        duration: duration || null,
        size_bytes: file?.size || null,
        visibility: form.visibility,
        tags,
        category: form.category.trim() || null,
      });
      toast.success("Video published to your profile!");
      navigate("/profile");
    } catch (err) {
      toast.error(err.message || "Failed to publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5" data-testid="video-upload-form">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Upload a video</h1>
        <p className="mt-1 text-muted-foreground">Long-form videos up to 5GB.</p>
      </header>

      <div>
        <Label>Video file</Label>
        {videoUrl ? (
          <div className="relative mt-1.5 overflow-hidden rounded-2xl border border-border">
            <video src={videoUrl} controls className="aspect-video w-full bg-black" />
            <button
              type="button"
              onClick={() => {
                setVideoUrl("");
                setFile(null);
                setThumbnailUrl("");
                setDuration(null);
              }}
              className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
              data-testid="video-remove-file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label
            htmlFor="video-upload"
            className="mt-1.5 flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
            data-testid="video-upload-drop"
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                {phase === "compressing" ? "Compressing" : "Uploading"}… {Math.round(progress * 100)}%
              </>
            ) : (
              <>
                <VideoIcon size={30} />
                Click to select a video file
              </>
            )}
            <input
              id="video-upload"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onFile}
              disabled={uploading}
            />
          </label>
        )}
        <div className="mt-2">
          <Input
            placeholder="…or paste a hosted video URL"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            data-testid="video-url-input"
            className="h-9 text-xs"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={form.title}
          onChange={patch("title")}
          maxLength={140}
          required
          data-testid="video-title-input"
          className="mt-1.5 h-11"
          placeholder="Epic 1v5 clutch — Valorant"
        />
      </div>

      <div>
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          value={form.description}
          onChange={patch("description")}
          maxLength={5000}
          data-testid="video-description-input"
          className="mt-1.5 min-h-[120px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Input
            value={form.category}
            onChange={patch("category")}
            placeholder="Gaming, IRL, Music…"
            data-testid="video-category-input"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label>Visibility</Label>
          <Select
            value={form.visibility}
            onValueChange={(v) => setForm((f) => ({ ...f, visibility: v }))}
          >
            <SelectTrigger className="mt-1.5 h-11" data-testid="video-visibility-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="private">Private (only me)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Tags</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              #{t}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                className="hover:text-primary-foreground"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="Add tag + Enter"
            data-testid="video-tag-input"
            className="h-8 w-40 text-xs"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={busy || uploading}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        data-testid="video-publish-btn"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish
      </Button>
    </form>
  );
}
