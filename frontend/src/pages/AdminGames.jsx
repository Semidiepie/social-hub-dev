import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Gamepad2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

const FIELDS = [
  { key: "cover_emoji", label: "Emoji", type: "text", w: "w-20" },
  { key: "level_count", label: "Levels", type: "number", w: "w-24" },
  { key: "base_moves", label: "Base moves", type: "number", w: "w-28" },
  { key: "base_target", label: "Base target", type: "number", w: "w-32" },
  { key: "difficulty", label: "Difficulty", type: "number", w: "w-28", step: "0.1" },
];

function GameRow({ g, onSaved, onDeleted }) {
  const [draft, setDraft] = useState(g);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        title: draft.title,
        description: draft.description,
        cover_emoji: draft.cover_emoji,
        level_count: Number(draft.level_count),
        base_moves: Number(draft.base_moves),
        base_target: Number(draft.base_target),
        difficulty: Number(draft.difficulty),
        is_active: draft.is_active,
      };
      const updated = await api.put(`/admin/games/${g.id}`, body);
      onSaved(updated);
      toast.success("Saved");
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete "${g.title}" and all its player progress?`)) return;
    try {
      await api.del(`/admin/games/${g.id}`);
      onDeleted(g.id);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e.message || "Delete failed");
    }
  };

  return (
    <div className="rounded-xl border border-border p-3" data-testid={`admin-game-${g.slug}`}>
      <div className="flex items-center gap-2">
        <Input value={draft.title} onChange={(e) => set("title", e.target.value)} className="h-9 flex-1 font-semibold" data-testid={`admin-game-title-${g.slug}`} />
        <label className="flex items-center gap-1.5 text-xs font-semibold">
          <input type="checkbox" checked={!!draft.is_active} onChange={(e) => set("is_active", e.target.checked)} data-testid={`admin-game-active-${g.slug}`} /> Active
        </label>
      </div>
      <Input value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Description" className="mt-2 h-9 text-sm" />
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="text-[10px] uppercase text-muted-foreground">{f.label}</div>
            <Input
              type={f.type}
              step={f.step}
              value={draft[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className={`h-9 ${f.w}`}
            />
          </div>
        ))}
        <div className="ml-auto flex gap-2">
          <Button onClick={save} disabled={saving} size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground" data-testid={`admin-game-save-${g.slug}`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </Button>
          <Button onClick={del} size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" data-testid={`admin-game-delete-${g.slug}`}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">/games/{g.slug}</div>
    </div>
  );
}

export default function AdminGamesPage() {
  const { user, loading: authLoading } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    try {
      setGames(await api.get("/admin/games"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [user, load]);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const g = await api.post("/admin/games", { title: title.trim() });
      setGames((list) => [...list, g]);
      setTitle("");
      toast.success(`Created "${g.title}"`);
    } catch (e) {
      toast.error(e.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-games-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Gamepad2 size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Create and manage match-3 games. New games appear on the public Games page instantly.</p>
      </header>

      <AdminTabs />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-lg font-bold">Add a game</h2>
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Game title (e.g. Creator Crush)" className="h-10" data-testid="admin-game-new-title" />
            <Button onClick={create} disabled={creating || !title.trim()} className="h-10 gap-1.5 bg-primary text-primary-foreground" data-testid="admin-game-create">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Uses the default PostMePlex tile set. Tune levels/difficulty below after creating.</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {games.map((g) => (
            <GameRow
              key={g.id}
              g={g}
              onSaved={(u) => setGames((list) => list.map((x) => (x.id === u.id ? u : x)))}
              onDeleted={(id) => setGames((list) => list.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
