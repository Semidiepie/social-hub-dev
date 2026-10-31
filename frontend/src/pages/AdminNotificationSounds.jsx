import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, BellRing, Play, Upload, Check, RotateCcw, Send, MessageCircle, Image as ImageIcon, Radio, Heart, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { Button } from "@/components/ui/button";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Each row maps a friendly alert group → the backend sound key. Admin uploads
// one .mp3 per group; it applies to ALL users in real time (played in-app).
const GROUPS = [
  { key: "post_published", label: "Post published (your own)", desc: "The confirmation sound you hear right after you publish a post", icon: Send },
  { key: "message", label: "Messages (DMs)", desc: "When a new direct message arrives", icon: MessageCircle },
  { key: "posts", label: "New posts & reels", desc: "When someone a user follows posts on PostMePlex", icon: ImageIcon },
  { key: "live", label: "Live", desc: "When someone a user follows starts a live stream", icon: Radio },
  { key: "social", label: "Likes & comments", desc: "Someone likes or comments on a user's content", icon: Heart },
  { key: "follow", label: "New followers", desc: "Someone starts following a user", icon: UserPlus },
  { key: "collab", label: "Collab invites & announcements", desc: "Collab requests and app-wide announcements", icon: Users },
];

const MAX_MP3_BYTES = 3 * 1024 * 1024; // 3MB — keep alert sounds short.

export default function AdminNotificationSoundsPage() {
  const { user, loading: authLoading } = useAuth();
  const [sounds, setSounds] = useState({});
  const [loading, setLoading] = useState(true);
  const [staged, setStaged] = useState({});   // { group: {file, name} }
  const [busy, setBusy] = useState({});        // { group: bool }
  const fileRefs = useRef({});
  const audioRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.get("/notification-sounds")
      .then((r) => { if (alive) setSounds(r?.sounds || {}); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const pick = (group, file) => {
    if (!file) return;
    const isMp3 = file.type === "audio/mpeg" || /\.mp3$/i.test(file.name);
    if (!isMp3) { toast.error("Please choose an .mp3 file"); return; }
    if (file.size > MAX_MP3_BYTES) { toast.error("That file is over 3MB — use a shorter clip"); return; }
    setStaged((s) => ({ ...s, [group]: { file, name: file.name } }));
  };

  const preview = (group) => {
    const url = staged[group]?.file ? URL.createObjectURL(staged[group].file) : sounds[group];
    if (!url) { toast.info("No sound set yet"); return; }
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => toast.error("Tap again to allow audio playback"));
    } catch { /* ignore */ }
  };

  const apply = async (group) => {
    const file = staged[group]?.file;
    if (!file) { toast.info("Choose an .mp3 first"); return; }
    setBusy((b) => ({ ...b, [group]: true }));
    try {
      const up = await uploadToCloudinary(file);
      const url = up.secure_url || up.url;
      const r = await api.post("/admin/notification-sounds", { group, url });
      setSounds(r.sounds || {});
      setStaged((s) => ({ ...s, [group]: null }));
      if (fileRefs.current[group]) fileRefs.current[group].value = "";
      toast.success("Sound applied for everyone");
    } catch (e) {
      toast.error(e.message || "Couldn't apply the sound");
    } finally {
      setBusy((b) => ({ ...b, [group]: false }));
    }
  };

  const reset = async (group) => {
    setBusy((b) => ({ ...b, [group]: true }));
    try {
      const r = await api.post("/admin/notification-sounds", { group, url: null });
      setSounds(r.sounds || {});
      setStaged((s) => ({ ...s, [group]: null }));
      toast.success("Reverted to the default chime");
    } catch (e) {
      toast.error(e.message || "Couldn't reset");
    } finally {
      setBusy((b) => ({ ...b, [group]: false }));
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-notification-sounds">
      <AdminTabs />
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <BellRing size={22} className="text-primary" /> Notification sounds
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Attach an .mp3 to each alert. Users with the app open hear the new sound for that alert in real time, so they instantly know what the notification was for.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {GROUPS.map((g) => {
            const current = sounds[g.key];
            const stagedName = staged[g.key]?.name;
            const isBusy = !!busy[g.key];
            return (
              <div
                key={g.key}
                data-testid={`sound-row-${g.key}`}
                className="rounded-2xl border border-border bg-card/60 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <g.icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{g.label}</span>
                      {current ? (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary" data-testid={`sound-status-${g.key}`}>Custom</span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground" data-testid={`sound-status-${g.key}`}>Default chime</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{g.desc}</p>
                    {stagedName && (
                      <p className="mt-1 truncate text-xs font-semibold text-primary" data-testid={`sound-staged-${g.key}`}>Ready to apply: {stagedName}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        ref={(el) => (fileRefs.current[g.key] = el)}
                        type="file"
                        accept=".mp3,audio/mpeg"
                        className="hidden"
                        data-testid={`sound-input-${g.key}`}
                        onChange={(e) => pick(g.key, e.target.files?.[0])}
                      />
                      <Button
                        type="button" variant="outline" size="sm" className="gap-1.5"
                        onClick={() => fileRefs.current[g.key]?.click()}
                        data-testid={`sound-choose-${g.key}`}
                      >
                        <Upload size={14} /> Choose .mp3
                      </Button>
                      <Button
                        type="button" variant="outline" size="sm" className="gap-1.5"
                        onClick={() => preview(g.key)}
                        disabled={!current && !staged[g.key]?.file}
                        data-testid={`sound-preview-${g.key}`}
                      >
                        <Play size={14} /> Preview
                      </Button>
                      <Button
                        type="button" size="sm"
                        className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => apply(g.key)}
                        disabled={isBusy || !staged[g.key]?.file}
                        data-testid={`sound-apply-${g.key}`}
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Apply
                      </Button>
                      {current && (
                        <Button
                          type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
                          onClick={() => reset(g.key)}
                          disabled={isBusy}
                          data-testid={`sound-reset-${g.key}`}
                        >
                          <RotateCcw size={14} /> Reset
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: keep clips short (under ~3 seconds). When a tab is fully closed, the browser/OS controls the alert sound — custom sounds play while the app is open.
      </p>
    </div>
  );
}
