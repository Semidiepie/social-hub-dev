import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Trash2, Wand2, ImagePlus, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";
import { toast } from "sonner";

// Admin tool to edit existing curated accounts: profile fields, their reels
// (edit caption / delete), and a Sage AI button to add more category clips.
export function CuratedAccountManager({ reloadKey }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await api.get("/admin/curated-accounts"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Manage curated accounts</h2>
          <span className="text-sm text-muted-foreground">
            {loading ? "…" : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {!loading && accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No curated accounts yet. Create one above.</p>
        )}

        <div className="space-y-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setEditing(a)}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3 text-left transition-colors hover:bg-secondary"
              data-testid={`curated-account-${a.id}`}
            >
              <Avatar src={a.avatar_url} size={40} ring />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{a.display_name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  @{a.username}{a.category ? ` · ${a.category}` : ""} · {a.posts_count || 0} reels
                </div>
              </div>
              <Pencil size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        {editing && (
          <EditAccountDialog
            account={editing}
            onClose={() => setEditing(null)}
            onChanged={load}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EditAccountDialog({ account, onClose, onChanged }) {
  const [displayName, setDisplayName] = useState(account.display_name || "");
  const [category, setCategory] = useState(account.category || "");
  const [avatarUrl, setAvatarUrl] = useState(account.avatar_url || "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reels, setReels] = useState([]);
  const [reelsLoading, setReelsLoading] = useState(true);
  const [sageCount, setSageCount] = useState(5);
  const [sageBusy, setSageBusy] = useState(false);
  const avatarRef = useRef(null);

  const loadReels = useCallback(async () => {
    setReelsLoading(true);
    try {
      setReels(await api.get(`/users/${account.id}/reels`));
    } catch {
      setReels([]);
    } finally {
      setReelsLoading(false);
    }
  }, [account.id]);

  useEffect(() => {
    loadReels();
  }, [loadReels]);

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    setAvatarBusy(true);
    try {
      const res = await uploadToCloudinary(file, { resourceType: "image" });
      setAvatarUrl(res.secure_url);
    } catch (err) {
      toast.error(err.message || "Avatar upload failed");
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/curated-accounts/${account.id}`, {
        display_name: displayName.trim(),
        category: category.trim(),
        avatar_url: avatarUrl,
      });
      toast.success("Account updated");
      onChanged?.();
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sageAdd = async () => {
    setSageBusy(true);
    try {
      const res = await api.post(`/admin/accounts/${account.id}/sage-reels`, {
        count: Number(sageCount) || 5,
      });
      toast.success(`Added ${res.created} clip${res.created === 1 ? "" : "s"} (${res.source})`);
      loadReels();
      onChanged?.();
    } catch (e) {
      toast.error(e.message || "Sage couldn't add clips");
    } finally {
      setSageBusy(false);
    }
  };

  const saveCaption = async (reel, caption) => {
    if (caption === (reel.caption || "")) return;
    try {
      await api.patch(`/admin/reels/${reel.id}`, { caption });
      setReels((rows) => rows.map((r) => (r.id === reel.id ? { ...r, caption } : r)));
    } catch (e) {
      toast.error(e.message || "Failed to update caption");
    }
  };

  const deleteReel = async (reel) => {
    if (!window.confirm("Delete this reel?")) return;
    try {
      await api.del(`/admin/reels/${reel.id}`);
      setReels((rows) => rows.filter((r) => r.id !== reel.id));
      onChanged?.();
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="curated-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit @{account.username}</DialogTitle>
          <DialogDescription>Update the profile, manage reels, or let Sage add more clips.</DialogDescription>
        </DialogHeader>

        {/* Profile */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => avatarRef.current?.click()}
            className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/40"
            data-testid="curated-edit-avatar"
          >
            {avatarBusy ? (
              <Loader2 size={18} className="animate-spin text-primary" />
            ) : avatarUrl ? (
              <Avatar src={avatarUrl} size={64} />
            ) : (
              <ImagePlus size={20} className="text-muted-foreground" />
            )}
          </button>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          <div className="flex-1 space-y-2">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="h-10" data-testid="curated-edit-name" />
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="h-10" data-testid="curated-edit-category" />
          </div>
        </div>
        <Button onClick={saveProfile} disabled={saving} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="curated-edit-save">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save changes
        </Button>

        {/* Sage add */}
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <Wand2 size={16} className="text-primary" />
          <span className="flex-1 text-sm">Add more <strong>{category || "category"}</strong> clips</span>
          <Input type="number" min={1} max={20} value={sageCount} onChange={(e) => setSageCount(e.target.value)} className="h-9 w-16" data-testid="curated-sage-count" />
          <Button onClick={sageAdd} disabled={sageBusy} variant="outline" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10" data-testid="curated-sage-add">
            {sageBusy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Sage AI
          </Button>
        </div>

        {/* Reels */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Reels ({reels.length})</div>
          {reelsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2">
              {reels.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-2" data-testid={`curated-reel-${r.id}`}>
                  <div className="h-16 w-11 flex-none overflow-hidden rounded bg-secondary/40">
                    {r.thumbnail_url ? <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <Input
                    defaultValue={r.caption || ""}
                    placeholder="Caption"
                    className="h-9 flex-1"
                    data-testid={`curated-reel-caption-${r.id}`}
                    onBlur={(e) => saveCaption(r, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  <button onClick={() => deleteReel(r)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`curated-reel-delete-${r.id}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {reels.length === 0 && <p className="py-2 text-sm text-muted-foreground">No reels yet — use Sage AI above to add some.</p>}
            </div>
          )}
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full gap-2" data-testid="curated-edit-close">
          <X size={15} /> Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
