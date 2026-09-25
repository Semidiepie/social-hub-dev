import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Pause, Music2, Plus, Trash2, X, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { uploadToCloudinary, cloudinaryAvailable, MAX_UPLOAD_BYTES } from "@/lib/cloudinary";
import { toast } from "sonner";

function fmt(s) {
  if (!s || Number.isNaN(s)) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function MusicPage() {
  const { user } = useAuth();
  const { play, current, playing, toggle } = usePlayer();
  const [songs, setSongs] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const isAdmin = !!user?.is_super_admin;

  const load = useCallback(async () => {
    try {
      setSongs(await api.get("/songs"));
    } catch (e) {
      toast.error(e.message || "Failed to load music");
      setSongs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRow = (i) => {
    if (current && songs[i].id === current.id) toggle();
    else play(songs, i);
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete “${s.title}”?`)) return;
    const prev = songs;
    setSongs((rows) => rows.filter((x) => x.id !== s.id));
    try {
      await api.del(`/songs/${s.id}`);
      toast.success("Song deleted");
    } catch (e) {
      setSongs(prev);
      toast.error(e.message || "Failed to delete");
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
            <Music2 className="text-primary" size={26} /> Music
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Original tracks by semidiepie. Plays in the background.</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowUpload(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="music-add-btn"
          >
            <Plus size={16} /> Add song
          </Button>
        )}
      </header>

      {songs === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : songs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-12 text-center">
          <Music2 size={34} className="mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold">No songs yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "Tap “Add song” to upload your first track." : "Check back soon for new music."}
          </p>
        </div>
      ) : (
        <ul className="space-y-1" data-testid="music-list">
          {songs.map((s, i) => {
            const active = current && current.id === s.id;
            return (
              <li
                key={s.id}
                className={`group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-secondary/60 ${active ? "bg-secondary/70" : ""}`}
                data-testid={`music-row-${s.id}`}
              >
                <button
                  onClick={() => onRow(i)}
                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary"
                  data-testid={`music-play-${s.id}`}
                  aria-label={active && playing ? "Pause" : "Play"}
                >
                  {s.cover_url ? (
                    <img src={s.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Music2 size={18} className="text-primary" />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    {active && playing ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" />}
                  </span>
                </button>
                <button onClick={() => onRow(i)} className="min-w-0 flex-1 text-left">
                  <div className={`truncate font-semibold ${active ? "text-primary" : ""}`}>{s.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.artist}</div>
                </button>
                {s.duration ? <span className="text-xs tabular-nums text-muted-foreground">{fmt(s.duration)}</span> : null}
                {isAdmin && (
                  <button
                    onClick={() => remove(s)}
                    className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    data-testid={`music-delete-${s.id}`}
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showUpload && (
        <UploadSongModal
          onClose={() => setShowUpload(false)}
          onDone={(song) => {
            setSongs((rows) => [song, ...(rows || [])]);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

function UploadSongModal({ onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [duration, setDuration] = useState(null);
  const [upA, setUpA] = useState(false);
  const [upC, setUpC] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickAudio = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) return toast.error("File too large (max 1GB).");
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    // Read duration locally.
    try {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.src = URL.createObjectURL(f);
      a.onloadedmetadata = () => setDuration(a.duration || null);
    } catch {
      /* noop */
    }
    setUpA(true);
    try {
      const res = await uploadToCloudinary(f, { resourceType: "video" });
      setAudioUrl(res.secure_url);
      if (res.duration) setDuration(res.duration);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      toast.success("Audio uploaded");
    } catch (err) {
      toast.error(err.message || "Audio upload failed");
    } finally {
      setUpA(false);
    }
  };

  const pickCover = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUpC(true);
    try {
      const res = await uploadToCloudinary(f, { resourceType: "image" });
      setCoverUrl(res.secure_url);
      toast.success("Cover uploaded");
    } catch (err) {
      toast.error(err.message || "Cover upload failed");
    } finally {
      setUpC(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Add a title");
    if (!audioUrl) return toast.error("Upload an audio file");
    setSaving(true);
    try {
      const song = await api.post("/songs", {
        title: title.trim(),
        audio_url: audioUrl,
        cover_url: coverUrl || null,
        duration: duration || null,
      });
      toast.success("Song added");
      onDone(song);
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="music-upload-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload size={18} /> Add a song</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="song-title">Title</Label>
            <Input
              id="song-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Track name"
              className="mt-1.5 h-11"
              data-testid="song-title-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground hover:border-primary/50" data-testid="song-audio-drop">
              {upA ? <Loader2 size={20} className="animate-spin text-primary" /> : <Music2 size={20} className={audioUrl ? "text-primary" : ""} />}
              {audioUrl ? "Audio ready" : "Audio file"}
              <input type="file" accept="audio/*" className="hidden" onChange={pickAudio} disabled={upA} />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground hover:border-primary/50" data-testid="song-cover-drop">
              {upC ? <Loader2 size={20} className="animate-spin text-primary" /> : coverUrl ? <img src={coverUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <Upload size={20} />}
              {coverUrl ? "Cover ready" : "Cover (optional)"}
              <input type="file" accept="image/*" className="hidden" onChange={pickCover} disabled={upC} />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="gap-2 border-border">
              <X size={14} /> Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving || upA || upC || !audioUrl || !title.trim()}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="song-save-btn"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add song
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
