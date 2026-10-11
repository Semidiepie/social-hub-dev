import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send, Upload, X, Video as VideoIcon, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import * as tus from "tus-js-client";
import { api, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const FILE_MAX = 1024 ** 3; // 1GB on the Upload file tab

export default function VideoUploadPage() {
  const navigate = useNavigate();

  // Shared Cloudflare Stream flow state.
  const [streamState, setStreamState] = useState("idle"); // idle|uploading|processing|ready|error
  const [uploadPct, setUploadPct] = useState(0);
  const [procPct, setProcPct] = useState(0);
  const [streamErr, setStreamErr] = useState("");
  const [stream, setStream] = useState(null); // { uid, hls, thumbnail, duration, size }
  const uidRef = useRef(null);
  const cancelRef = useRef(false);
  const uploadRef = useRef(null);

  const [file, setFile] = useState(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);

  const [form, setForm] = useState({ title: "", description: "", category: "", visibility: "public" });
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  const patch = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const resetStream = () => {
    cancelRef.current = true;
    try {
      uploadRef.current?.abort();
    } catch {
      /* no-op */
    }
    uploadRef.current = null;
    uidRef.current = null;
    setStream(null);
    setFile(null);
    setStreamState("idle");
    setUploadPct(0);
    setProcPct(0);
    setStreamErr("");
  };

  const pollStatus = async (uid) => {
    cancelRef.current = false;
    let delay = 2500;
    for (let i = 0; i < 300; i++) {
      if (cancelRef.current) return;
      try {
        const s = await api.get(`/videos/stream/${uid}/status`);
        if (s.state === "error") {
          setStreamState("error");
          setStreamErr(s.error || "The engine couldn't process this video.");
          return;
        }
        if (s.pct != null) setProcPct(Math.round(s.pct));
        if (s.ready && s.hls) {
          setStream({ uid, hls: s.hls, thumbnail: s.thumbnail || "", duration: s.duration || null, size: file?.size || null });
          setStreamState("ready");
          toast.success("Video ready to publish");
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay + 1000, 8000);
    }
    setStreamState("error");
    setStreamErr("Still processing — give it a moment and try publishing again.");
  };

  const startFileUpload = (f) => {
    if (f.size > FILE_MAX) {
      toast.error("That file is over 1GB. Use the Import from link tab instead.");
      return;
    }
    setFile(f);
    setStreamErr("");
    setUploadPct(0);
    setStreamState("uploading");
    uidRef.current = null;
    cancelRef.current = false;
    const upload = new tus.Upload(f, {
      endpoint: `${BACKEND}/api/videos/stream/tus-upload`,
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      // Only authenticate the creation call to our backend. The subsequent
      // PATCH/HEAD go cross-origin to Cloudflare and must NOT carry our JWT
      // (a custom header there triggers a failing CORS preflight).
      onBeforeRequest: (req) => {
        if (req.getURL().startsWith(BACKEND)) {
          req.setHeader("Authorization", `Bearer ${getToken()}`);
        }
      },
      metadata: { name: f.name, filetype: f.type || "video/mp4" },
      onError: (err) => {
        setStreamState("error");
        setStreamErr(String(err?.message || err).slice(0, 180) || "Upload failed. Please retry.");
      },
      onProgress: (sent, total) => setUploadPct(total ? sent / total : 0),
      onAfterResponse: (_req, res) => {
        const mid = res.getHeader("stream-media-id");
        if (mid) uidRef.current = mid;
      },
      onSuccess: () => {
        const uid = uidRef.current;
        if (!uid) {
          setStreamState("error");
          setStreamErr("Upload finished but the engine didn't return an ID. Please retry.");
          return;
        }
        setProcPct(0);
        setStreamState("processing");
        pollStatus(uid);
      },
    });
    uploadRef.current = upload;
    upload.start();
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) startFileUpload(f);
  };

  const importFromLink = async () => {
    const url = linkUrl.trim();
    if (!url) return toast.error("Paste a video link first");
    setImporting(true);
    setStreamErr("");
    try {
      const r = await api.post("/videos/stream/from-url", { url });
      if (!r.uid) throw new Error("Import didn't start");
      uidRef.current = r.uid;
      setFile(null);
      setProcPct(0);
      setStreamState("processing");
      pollStatus(r.uid);
    } catch (err) {
      setStreamState("error");
      setStreamErr(err.message || "Couldn't import that link.");
    } finally {
      setImporting(false);
    }
  };

  const onThumb = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!cloudinaryAvailable) return toast.error("Image uploads aren't configured.");
    setThumbUploading(true);
    try {
      const result = await uploadToCloudinary(f, { resourceType: "image" });
      setThumbnailUrl(result.secure_url);
      toast.success("Thumbnail set");
    } catch (err) {
      toast.error(err.message || "Thumbnail upload failed");
    } finally {
      setThumbUploading(false);
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
    if (streamState !== "ready" || !stream?.uid) {
      return toast.error("Add a video and wait for processing to finish first");
    }
    setBusy(true);
    try {
      await api.post("/videos", {
        title: form.title.trim(),
        description: form.description.trim(),
        stream_uid: stream.uid,
        hls_url: stream.hls,
        thumbnail_url: thumbnailUrl || stream.thumbnail || null,
        duration: stream.duration || null,
        size_bytes: stream.size || null,
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

  const previewThumb = thumbnailUrl || stream?.thumbnail || "";

  const StatusCard = () => {
    if (streamState === "idle") return null;
    if (streamState === "error") {
      return (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="video-stream-error">
          <AlertTriangle size={18} className="mt-0.5 flex-none text-destructive" />
          <div className="flex-1">
            <p className="font-semibold text-destructive">Couldn't process this video</p>
            <p className="text-muted-foreground">{streamErr}</p>
            <button type="button" onClick={resetStream} className="mt-1 text-xs font-semibold text-primary hover:underline" data-testid="video-stream-retry">
              Start over
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card/40 p-3" data-testid="video-stream-status">
        {streamState === "ready" ? (
          <div className="flex items-center gap-3">
            {previewThumb ? (
              <img src={previewThumb} alt="" className="h-16 w-28 flex-none rounded-lg object-cover" />
            ) : null}
            <div className="flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <CheckCircle2 size={16} /> Ready to publish
              </p>
              <p className="text-xs text-muted-foreground">Adaptive streaming is prepared. Fill in the details and publish.</p>
            </div>
            <button type="button" onClick={resetStream} className="flex-none rounded-full bg-black/40 p-1.5 text-muted-foreground hover:text-foreground" data-testid="video-stream-clear" aria-label="Remove video">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 size={16} className="animate-spin text-primary" />
              {streamState === "uploading"
                ? `Uploading… ${Math.round(uploadPct * 100)}%`
                : `Processing… ${procPct ? `${procPct}%` : ""}`}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${streamState === "uploading" ? Math.round(uploadPct * 100) : procPct || 8}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {streamState === "uploading" ? "Upload is fast and resumable." : "One-time preparation for smooth, adaptive playback."}
            </p>
          </div>
        )}
      </div>
    );
  };

  const flowActive = streamState !== "idle";

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5" data-testid="video-upload-form">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Upload a video</h1>
        <p className="mt-1 text-muted-foreground">Upload a file up to 1GB, or import a link up to 30GB.</p>
      </header>

      <div>
        <Label>Video</Label>
        <Tabs defaultValue="file" className="mt-1.5">
          <TabsList>
            <TabsTrigger value="file" data-testid="video-tab-file">Upload file</TabsTrigger>
            <TabsTrigger value="link" data-testid="video-tab-link">Import from link</TabsTrigger>
          </TabsList>

          <TabsContent value="file">
            {!flowActive && (
              <label
                htmlFor="video-upload"
                className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
                data-testid="video-upload-drop"
              >
                <VideoIcon size={30} />
                Click to select a video file
                <input id="video-upload" type="file" accept="video/*" className="hidden" onChange={onFile} />
              </label>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Up to 1GB, fast and resumable. Files over 1GB? Use the <span className="font-semibold text-foreground">Import from link</span> tab.
            </p>
            <StatusCard />
          </TabsContent>

          <TabsContent value="link">
            {!flowActive && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Google Drive or direct .mp4 URL"
                    className="h-11 pl-9"
                    data-testid="video-link-input"
                  />
                </div>
                <Button type="button" onClick={importFromLink} disabled={importing} className="h-11 gap-2" data-testid="video-link-import-btn">
                  {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Import
                </Button>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Paste a Google Drive link set to <span className="font-semibold text-foreground">"Anyone with the link"</span> or a direct video file URL — up to 30GB. Private, login-required or expiring links can't be fetched.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Only import videos you own or are licensed to use.</p>
            <StatusCard />
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <Label>Thumbnail</Label>
        <p className="text-xs text-muted-foreground">A frame is auto-generated. Upload your own to override it.</p>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="h-24 w-40 overflow-hidden rounded-xl border border-border bg-secondary">
            {previewThumb ? (
              <img src={previewThumb} alt="" className="h-full w-full object-cover" data-testid="video-thumb-preview" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No thumbnail</div>
            )}
          </div>
          <label
            htmlFor="thumb-upload"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-primary/50 hover:text-primary"
            data-testid="video-thumb-upload-btn"
          >
            {thumbUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {thumbnailUrl ? "Replace thumbnail" : "Upload thumbnail"}
            <input id="thumb-upload" type="file" accept="image/*" className="hidden" onChange={onThumb} disabled={thumbUploading} />
          </label>
        </div>
      </div>

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={form.title} onChange={patch("title")} maxLength={140} required data-testid="video-title-input" className="mt-1.5 h-11" placeholder="Epic 1v5 clutch — Valorant" />
      </div>

      <div>
        <Label htmlFor="desc">Description</Label>
        <Textarea id="desc" value={form.description} onChange={patch("description")} maxLength={5000} data-testid="video-description-input" className="mt-1.5 min-h-[120px]" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Input value={form.category} onChange={patch("category")} placeholder="Gaming, IRL, Music…" data-testid="video-category-input" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label>Visibility</Label>
          <Select value={form.visibility} onValueChange={(v) => setForm((f) => ({ ...f, visibility: v }))}>
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
              <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="hover:text-primary-foreground">
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
        disabled={busy || streamState !== "ready"}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        data-testid="video-publish-btn"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish
      </Button>
    </form>
  );
}
