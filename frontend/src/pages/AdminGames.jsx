import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Gamepad2, Loader2, Plus, Save, Trash2, Sparkles, Eye, EyeOff, Wand2 } from "lucide-react";
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
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => { setDraft(g); }, [g]);

  const save = async (patch) => {
    setSaving(true);
    try {
      const body = {
        title: draft.title,
        description: draft.description,
        cover_emoji: draft.cover_emoji,
        level_count: Number(draft.level_count),
        is_active: draft.is_active,
        ...(g.kind === "match3" ? {
          base_moves: Number(draft.base_moves),
          base_target: Number(draft.base_target),
          difficulty: Number(draft.difficulty),
        } : {}),
        ...patch,
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

  const toggleVisibility = async () => {
    const next = draft.visibility === "private" ? "public" : "private";
    await save({ visibility: next });
  };

  const askSage = async () => {
    if (!prompt.trim()) return;
    setThinking(true);
    try {
      const r = await api.post(`/admin/games/${g.id}/ai-edit`, { prompt: prompt.trim() });
      onSaved(r.game);
      setPrompt("");
      toast.success(`Sage updated: ${r.changed.join(", ")}`);
    } catch (e) {
      toast.error(e.message || "Sage couldn't edit that");
    } finally {
      setThinking(false);
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

  const isPrivate = draft.visibility === "private";

  return (
    <div className="rounded-xl border border-border p-3" data-testid={`admin-game-${g.slug}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{draft.cover_emoji}</span>
        <Input value={draft.title} onChange={(e) => set("title", e.target.value)} className="h-9 flex-1 font-semibold" data-testid={`admin-game-title-${g.slug}`} />
        <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground" data-testid={`admin-game-kind-${g.slug}`}>{g.kind}</span>
        <button
          onClick={toggleVisibility}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase transition-colors ${isPrivate ? "bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/25" : "bg-green-500/15 text-green-400 hover:bg-green-500/25"}`}
          data-testid={`admin-game-visibility-${g.slug}`}
          title={isPrivate ? "Private — tap to publish" : "Public — tap to make private"}
        >
          {isPrivate ? <EyeOff size={13} /> : <Eye size={13} />} {isPrivate ? "Private" : "Public"}
        </button>
        <label className="flex items-center gap-1.5 text-xs font-semibold">
          <input type="checkbox" checked={!!draft.is_active} onChange={(e) => set("is_active", e.target.checked)} data-testid={`admin-game-active-${g.slug}`} /> Active
        </label>
      </div>
      <Input value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Description" className="mt-2 h-9 text-sm" />
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {FIELDS.filter((f) => g.kind === "match3" || f.key === "cover_emoji" || f.key === "level_count").map((f) => (
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
          <Button onClick={() => save()} disabled={saving} size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground" data-testid={`admin-game-save-${g.slug}`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </Button>
          <Button onClick={del} size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" data-testid={`admin-game-delete-${g.slug}`}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Sage AI editor */}
      <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-primary">
          <Sparkles size={13} /> Ask Sage to edit this game
        </div>
        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askSage()}
            placeholder='e.g. "make it harder, 20 moves, neon space theme"'
            className="h-9 flex-1 text-sm"
            data-testid={`admin-game-sage-input-${g.slug}`}
          />
          <Button onClick={askSage} disabled={thinking || !prompt.trim()} size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground" data-testid={`admin-game-sage-send-${g.slug}`}>
            {thinking ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Apply
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Sage rewrites the game's settings/theme. Changes apply live for all players. Uses AI credits.</p>
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
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiKind, setAiKind] = useState("auto");
  const [aiDifficulty, setAiDifficulty] = useState("normal");
  const [aiBusy, setAiBusy] = useState(false);

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

  const aiCreate = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const g = await api.post("/admin/games/ai-create", {
        prompt: aiPrompt.trim(),
        kind: aiKind === "auto" ? undefined : aiKind,
        difficulty: aiDifficulty,
      });
      setGames((list) => [...list, g]);
      setAiPrompt("");
      toast.success(`Sage created "${g.title}" (${g.kind}, private) — review it, then publish.`);
    } catch (e) {
      toast.error(e.message || "Sage couldn't create that");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-games-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Gamepad2 size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Describe any game and Sage builds it — match-3, memory, trivia or tap-reflex. Saved private first, then publish.</p>
      </header>

      <AdminTabs />

      <Card className="border-primary/40">
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <h2 className="text-lg font-bold">AI Game Studio</h2>
          </div>
          <p className="text-sm text-muted-foreground">Describe the game you want in your own words. Sage picks the best game type and builds the full thing — theme, content, difficulty and levels. Saved <b>private</b> so you can play-test, then flip it public.</p>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={'e.g. "a trivia game about 90s hip-hop" · "a memory game with cute sea creatures" · "a fast tap game popping balloons" · "a chill ocean gem match-3"'}
            className="min-h-[88px] w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            data-testid="admin-game-ai-input"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">Game type</div>
              <select value={aiKind} onChange={(e) => setAiKind(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" data-testid="admin-game-ai-kind">
                <option value="auto">Auto (let Sage choose)</option>
                <option value="match3">Match-3</option>
                <option value="memory">Memory match</option>
                <option value="quiz">Trivia quiz</option>
                <option value="tapper">Tap reflex</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">Difficulty</div>
              <select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" data-testid="admin-game-ai-difficulty">
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <Button onClick={aiCreate} disabled={aiBusy || !aiPrompt.trim()} className="ml-auto h-10 gap-1.5 bg-primary text-primary-foreground" data-testid="admin-game-ai-create">
              {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Generate game
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Uses your Emergent LLM credits each time you generate.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-lg font-bold">Add a game manually</h2>
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
