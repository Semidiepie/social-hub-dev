import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Gamepad2, Plus, Trash2, Pencil, Upload, X, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AdminTabs } from "@/components/AdminTabs";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";
import { toast } from "sonner";

const EMPTY = { name: "", play_url: "", icon_url: "", banner_url: "", description: "", developer: "", category: "", is_verified: true };

function GameFields({ data, setData }) {
  const [iconUp, setIconUp] = useState(false);
  const [bannerUp, setBannerUp] = useState(false);

  const upload = async (file, which, setBusy) => {
    if (!file) return;
    if (!cloudinaryAvailable) return toast.error("Image uploads aren't configured.");
    setBusy(true);
    try {
      const r = await uploadToCloudinary(file, { resourceType: "image" });
      setData((d) => ({ ...d, [which]: r.secure_url }));
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div>
          <Label>Icon *</Label>
          <label htmlFor="game-icon" className="mt-1.5 flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-secondary hover:border-primary/50" data-testid="game-icon-upload">
            {iconUp ? <Loader2 size={18} className="animate-spin" /> : data.icon_url ? <img src={data.icon_url} alt="" className="h-full w-full object-cover" /> : <Upload size={18} className="text-muted-foreground" />}
            <input id="game-icon" type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "icon_url", setIconUp)} />
          </label>
        </div>
        <div className="flex-1">
          <Label>Banner (optional)</Label>
          <label htmlFor="game-banner" className="mt-1.5 flex h-20 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-secondary hover:border-primary/50" data-testid="game-banner-upload">
            {bannerUp ? <Loader2 size={18} className="animate-spin" /> : data.banner_url ? <img src={data.banner_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">Upload banner</span>}
            <input id="game-banner" type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "banner_url", setBannerUp)} />
          </label>
        </div>
      </div>
      <div>
        <Label>Name *</Label>
        <Input value={data.name} onChange={set("name")} maxLength={120} className="mt-1.5 h-11" placeholder="Candy Crush" data-testid="game-name-input" />
      </div>
      <div>
        <Label>Play / website URL *</Label>
        <Input value={data.play_url} onChange={set("play_url")} className="mt-1.5 h-11" placeholder="https://example.com/game" data-testid="game-url-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Developer</Label>
          <Input value={data.developer} onChange={set("developer")} maxLength={120} className="mt-1.5 h-11" placeholder="King" data-testid="game-developer-input" />
        </div>
        <div>
          <Label>Category</Label>
          <Input value={data.category} onChange={set("category")} maxLength={60} className="mt-1.5 h-11" placeholder="Puzzle" data-testid="game-category-input" />
        </div>
      </div>
      <div>
        <Label>Short description</Label>
        <Textarea value={data.description} onChange={set("description")} maxLength={2000} className="mt-1.5 min-h-[80px]" data-testid="game-description-input" />
      </div>
      <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
        <span className="text-sm font-semibold">Verified game ✓</span>
        <Switch checked={data.is_verified !== false} onCheckedChange={(v) => setData((d) => ({ ...d, is_verified: v }))} data-testid="game-verified-switch" />
      </label>
    </div>
  );
}

export default function AdminGamesPage() {
  const { user, loading: authLoading } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState(null); // game being edited (with form data)
  const [savingEdit, setSavingEdit] = useState(false);
  const [updatesFor, setUpdatesFor] = useState(null); // game for updates dialog

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGames(await api.get("/admin/games"));
    } catch (e) {
      toast.error(e.message || "Failed to load games");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [load, user]);

  const create = async () => {
    if (!form.name.trim() || !form.play_url.trim() || !form.icon_url) {
      return toast.error("Name, Play URL and Icon are required");
    }
    setCreating(true);
    try {
      const g = await api.post("/admin/games", form);
      setGames((prev) => [{ ...g, updates_count: 0 }, ...prev]);
      setForm(EMPTY);
      toast.success("Game added");
    } catch (e) {
      toast.error(e.message || "Failed to add game");
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async () => {
    if (!edit.name.trim() || !edit.play_url.trim() || !edit.icon_url) {
      return toast.error("Name, Play URL and Icon are required");
    }
    setSavingEdit(true);
    try {
      const g = await api.patch(`/admin/games/${edit.id}`, edit);
      setGames((prev) => prev.map((x) => (x.id === g.id ? { ...x, ...g } : x)));
      setEdit(null);
      toast.success("Game updated");
    } catch (e) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (g) => {
    if (!window.confirm(`Delete "${g.name}"? This removes it for everyone.`)) return;
    try {
      await api.del(`/admin/games/${g.id}`);
      setGames((prev) => prev.filter((x) => x.id !== g.id));
      toast.success("Game deleted");
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-games-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Gamepad2 size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Add and manage games in the PostMePlex Games hub.</p>
      </header>

      <AdminTabs />

      <Card data-testid="admin-game-create">
        <CardContent className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-black"><Plus size={18} className="text-primary" /> Add a game</h2>
          <GameFields data={form} setData={setForm} />
          <Button onClick={create} disabled={creating} className="mt-4 gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="game-create-btn">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />} Add game
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 font-black">All games {!loading && `· ${games.length}`}</h2>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : games.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No games yet. Add your first above.</p>
        ) : (
          <div className="space-y-2" data-testid="admin-games-list">
            {games.map((g) => (
              <Card key={g.id} data-testid={`admin-game-${g.id}`}>
                <CardContent className="flex items-center gap-3 p-3">
                  <img src={g.icon_url} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate font-semibold">{g.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {g.developer ? `by ${g.developer} · ` : ""}{g.category || "Uncategorized"} · {g.followers} followers · {g.updates_count} updates
                    </div>
                  </div>
                  <button onClick={() => setUpdatesFor(g)} className="pmp-iconchip" title="Game updates" data-testid={`game-updates-btn-${g.id}`}><Megaphone size={16} /></button>
                  <button onClick={() => setEdit({ ...EMPTY, ...g })} className="pmp-iconchip" title="Edit" data-testid={`game-edit-btn-${g.id}`}><Pencil size={16} /></button>
                  <button onClick={() => remove(g)} className="pmp-iconchip text-destructive" title="Delete" data-testid={`game-delete-btn-${g.id}`}><Trash2 size={16} /></button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="game-edit-dialog">
          <DialogHeader><DialogTitle>Edit game</DialogTitle></DialogHeader>
          {edit && <GameFields data={edit} setData={setEdit} />}
          <Button onClick={saveEdit} disabled={savingEdit} className="mt-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="game-edit-save">
            {savingEdit ? <Loader2 size={14} className="animate-spin" /> : null} Save changes
          </Button>
        </DialogContent>
      </Dialog>

      {/* Updates dialog */}
      <GameUpdatesDialog game={updatesFor} onClose={() => setUpdatesFor(null)} onCount={(id, c) => setGames((prev) => prev.map((x) => (x.id === id ? { ...x, updates_count: c } : x)))} />
    </div>
  );
}

function GameUpdatesDialog({ game, onClose, onCount }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!game) return;
    setLoading(true);
    api.get(`/games/${game.id}/updates`).then(setUpdates).catch(() => setUpdates([])).finally(() => setLoading(false));
  }, [game]);

  const post = async () => {
    if (!title.trim() || !message.trim()) return toast.error("Title and message required");
    setPosting(true);
    try {
      const u = await api.post(`/admin/games/${game.id}/updates`, { title, message });
      const next = [u, ...updates];
      setUpdates(next);
      onCount(game.id, next.length);
      setTitle("");
      setMessage("");
      toast.success("Update posted");
    } catch (e) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const del = async (u) => {
    try {
      await api.del(`/admin/games/${game.id}/updates/${u.id}`);
      const next = updates.filter((x) => x.id !== u.id);
      setUpdates(next);
      onCount(game.id, next.length);
    } catch (e) {
      toast.error(e.message || "Failed");
    }
  };

  return (
    <Dialog open={!!game} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="game-updates-dialog">
        <DialogHeader><DialogTitle>Game updates — {game?.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Update title" className="h-11" data-testid="game-update-title" />
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's new?" className="min-h-[80px]" data-testid="game-update-message" />
          <Button onClick={post} disabled={posting} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="game-update-post">
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />} Post update
          </Button>
        </div>
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" /></div>
          ) : updates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No updates yet.</p>
          ) : (
            updates.map((u) => (
              <div key={u.id} className="flex items-start gap-2 rounded-xl border border-border p-3" data-testid={`game-update-${u.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{u.title}</div>
                  <div className="text-sm text-muted-foreground">{u.message}</div>
                </div>
                <button onClick={() => del(u)} className="pmp-iconchip text-destructive" title="Delete"><X size={15} /></button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
