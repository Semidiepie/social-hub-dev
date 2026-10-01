import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Sparkles, Loader2, UploadCloud, ImagePlus, Film, CheckCircle2, ExternalLink, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { CuratedAccountManager } from "@/components/CuratedAccountManager";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { toast } from "sonner";

// Admin → Curated accounts: spin up verified accounts pre-populated from a
// library of royalty-free clips, and bulk-upload original MP4s into that library.
export default function AdminCuratePage() {
  const { user, loading: authLoading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState("");
  const [count, setCount] = useState(8);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [sageBusy, setSageBusy] = useState(false);
  const [sageClip, setSageClip] = useState(null);
  const avatarRef = useRef(null);

  const [clips, setClips] = useState([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const bulkRef = useRef(null);

  const loadClips = useCallback(async () => {
    setClipsLoading(true);
    try {
      setClips(await api.get("/admin/curated-clips"));
    } catch {
      /* ignore */
    } finally {
      setClipsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) loadClips();
  }, [user, loadClips]);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    setAvatarUploading(true);
    try {
      const res = await uploadToCloudinary(file, { resourceType: "image" });
      setAvatarUrl(res.secure_url);
    } catch (err) {
      toast.error(err.message || "Avatar upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const pullSageClip = async () => {
    setSageBusy(true);
    try {
      const clip = await api.post("/admin/sage-clip", {
        query: category.trim() || displayName.trim() || "trending",
      });
      setSageClip(clip);
      loadClips();
      toast.success(
        clip.source === "pixabay"
          ? `Sage pulled a royalty-free clip: ${clip.caption}`
          : "Sage added a clip from your library",
      );
    } catch (e) {
      toast.error(e.message || "Sage couldn't pull a clip");
    } finally {
      setSageBusy(false);
    }
  };

  const submit = async () => {
    if (!displayName.trim()) return toast.error("Enter a profile name");
    setCreating(true);
    setCreated(null);
    try {
      const res = await api.post("/admin/curated-accounts", {
        display_name: displayName.trim(),
        username: username.trim() || null,
        avatar_url: avatarUrl,
        category: category.trim(),
        populate_count: Number(count) || 0,
      });
      setCreated(res);
      toast.success(`Created @${res.user.username} with ${res.reels_created} reels`);
      setDisplayName("");
      setUsername("");
      setCategory("");
      setAvatarUrl("");
    } catch (e) {
      toast.error(e.message || "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  const bulkUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    setBulkBusy(true);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setBulkProgress(`Uploading ${i + 1}/${files.length}…`);
      if (f.size > MAX_UPLOAD_BYTES) {
        toast.error(`${f.name} is too large (max 1GB)`);
        continue;
      }
      try {
        const res = await uploadToCloudinary(f, { resourceType: "video" });
        const thumb = res.secure_url.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg");
        await api.post("/admin/curated-clips", {
          video_url: res.secure_url,
          thumbnail_url: thumb,
          caption: "",
        });
        ok++;
      } catch (err) {
        toast.error(`${f.name}: ${err.message || "upload failed"}`);
      }
    }
    setBulkBusy(false);
    setBulkProgress("");
    if (ok) toast.success(`Added ${ok} clip${ok > 1 ? "s" : ""} to the library`);
    loadClips();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-curate-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Sparkles size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">
          Spin up verified, pre-populated accounts from your royalty-free clip library.
        </p>
      </header>

      <AdminTabs />

      {/* Create account */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-lg font-bold">New curated account</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => avatarRef.current?.click()}
              className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/40"
              data-testid="curate-avatar-pick"
            >
              {avatarUploading ? (
                <Loader2 size={18} className="animate-spin text-primary" />
              ) : avatarUrl ? (
                <Avatar src={avatarUrl} size={64} />
              ) : (
                <ImagePlus size={20} className="text-muted-foreground" />
              )}
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
            <div className="flex-1 text-sm text-muted-foreground">Profile picture (optional)</div>
          </div>

          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Profile name (e.g. Nature Daily)"
            className="h-11"
            data-testid="curate-display-name"
          />
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Handle (optional — auto-generated if blank)"
            className="h-11"
            data-testid="curate-username"
          />
          <div className="flex gap-3">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category (e.g. Nature)"
              className="h-11 flex-1"
              data-testid="curate-category"
            />
            <Input
              type="number"
              min={0}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="h-11 w-24"
              data-testid="curate-count"
              title="Number of reels to auto-assign"
            />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            {sageClip?.thumbnail_url ? (
              <img src={sageClip.thumbnail_url} alt="" className="h-14 w-10 flex-none rounded-md object-cover" data-testid="curate-sage-preview" />
            ) : (
              <div className="flex h-14 w-10 flex-none items-center justify-center rounded-md bg-secondary/40">
                <Film size={16} className="text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Sage AI clip finder</div>
              <div className="truncate text-xs text-muted-foreground">
                {sageClip ? sageClip.caption : "Pull a royalty-free clip based on the category."}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={pullSageClip}
              disabled={sageBusy}
              className="flex-none gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              data-testid="curate-sage-pull"
            >
              {sageBusy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              Sage AI
            </Button>
          </div>

          <Button
            onClick={submit}
            disabled={creating}
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="curate-submit"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Sync &amp; Create Account
          </Button>

          {created && (
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-3" data-testid="curate-result">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={18} className="text-primary" />
                <span>
                  <strong>@{created.user.username}</strong> created · {created.reels_created} reels
                </span>
              </div>
              <Link
                to={`/@${created.user.username}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                data-testid="curate-view-profile"
              >
                View <ExternalLink size={14} />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clip library */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Clip library</h2>
            <span className="text-sm text-muted-foreground" data-testid="curate-clip-count">
              {clipsLoading ? "…" : `${clips.length} clip${clips.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload original/royalty-free MP4s to your private library. New accounts auto-pull from here.
          </p>
          <input ref={bulkRef} type="file" accept="video/*" multiple className="hidden" onChange={bulkUpload} />
          <Button
            variant="outline"
            onClick={() => bulkRef.current?.click()}
            disabled={bulkBusy}
            className="w-full gap-2"
            data-testid="curate-bulk-upload"
          >
            {bulkBusy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {bulkBusy ? bulkProgress : "Bulk upload MP4s"}
          </Button>

          <div className="grid grid-cols-3 gap-2">
            {clips.map((c) => (
              <div key={c.id} className="relative aspect-[9/16] overflow-hidden rounded-lg bg-secondary/40" data-testid={`curate-clip-${c.id}`}>
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Film size={20} className="text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <CuratedAccountManager reloadKey={created?.user?.id} />
    </div>
  );
}
