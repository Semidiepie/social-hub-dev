import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Gamepad2, Loader2, Plus, Save, Trash2, Sparkles, Eye, EyeOff, Wand2, ImagePlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";
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
  const [tileBusy, setTileBusy] = useState(null);
  const [coverBusy, setCoverBusy] = useState(false);
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

  const tiles = draft.tiles || g.tiles || [];
  const uploadTileImage = async (idx, file) => {
    if (!file) return;
    if (!cloudinaryAvailable) { toast.error("Image uploads aren't configured."); return; }
    setTileBusy(idx);
    try {
      const res = await uploadToCloudinary(file, { resourceType: "image" });
      const next = tiles.map((t, i) => (i === idx ? { ...t, image: res.secure_url } : t));
      await save({ tiles: next });
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setTileBusy(null);
    }
  };
  const clearTileImage = async (idx) => {
    const next = tiles.map((t, i) => (i === idx ? { id: t.id, icon: t.icon, color: t.color } : t));
    await save({ tiles: next });
  };

  const uploadCover = async (file) => {
    if (!file) return;
    if (!cloudinaryAvailable) { toast.error("Image uploads aren't configured."); return; }
    setCoverBusy(true);
    try {
      const res = await uploadToCloudinary(file, { resourceType: "image" });
      await save({ cover_image: res.secure_url });
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setCoverBusy(false);
    }
  };
  const clearCover = async () => { await save({ cover_image: "" }); };

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

      {/* Custom cover image (card + in-play backdrop) */}
      <div className="mt-2 flex items-center gap-3 rounded-lg border border-border p-2.5" data-testid={`cover-editor-${g.slug}`}>
        <div className="relative h-14 w-24 flex-none overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/25 to-transparent">
          {draft.cover_image ? (
            <img src={draft.cover_image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl">{draft.cover_emoji || "🎮"}</span>
          )}
          {coverBusy && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 size={16} className="animate-spin text-white" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><ImagePlus size={13} /> Cover image (optional)</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Fully covers the game card AND becomes the in-play backdrop. No image = emoji + gradient.</p>
          <div className="mt-1.5 flex items-center gap-3">
            <label className="cursor-pointer text-[11px] font-semibold text-primary hover:underline" data-testid={`cover-upload-${g.slug}`}>
              {draft.cover_image ? "Change image" : "Upload image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} />
            </label>
            {draft.cover_image && (
              <button onClick={clearCover} className="text-[11px] font-semibold text-muted-foreground hover:text-destructive" data-testid={`cover-clear-${g.slug}`}>Remove</button>
            )}
          </div>
        </div>
      </div>

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

      {/* Custom tile images (match3 only) */}
      {g.kind === "match3" && (
        <div className="mt-3 rounded-lg border border-border p-2.5" data-testid={`tile-editor-${g.slug}`}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <ImagePlus size={13} /> Custom tile images (optional)
          </div>
          <div className="flex flex-wrap gap-3">
            {tiles.map((t, i) => (
              <div key={t.id || i} className="flex flex-col items-center gap-1">
                <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-border" style={{ background: t.color }}>
                  {t.image ? (
                    <img src={t.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[8px] font-bold leading-tight text-white/90">{t.icon}</span>
                  )}
                  {tileBusy === i && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 size={14} className="animate-spin text-white" /></div>}
                </div>
                <label className="cursor-pointer text-[10px] font-semibold text-primary hover:underline" data-testid={`tile-upload-${g.slug}-${i}`}>
                  {t.image ? "Change" : "Upload"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadTileImage(i, e.target.files?.[0])} />
                </label>
                {t.image && (
                  <button onClick={() => clearTileImage(i)} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive" data-testid={`tile-clear-${g.slug}-${i}`}>Remove</button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Upload a square image per tile — it replaces the icon live for all players. Remove to fall back to the icon.</p>
        </div>
      )}

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
  // Conversational AI Game Studio
  const [msgs, setMsgs] = useState([]);
  const [session, setSession] = useState(null);
  const [studioInput, setStudioInput] = useState("");
  const [studioBusy, setStudioBusy] = useState(false);
  const [specReady, setSpecReady] = useState(null);
  const [building, setBuilding] = useState(false);
  const [studioCover, setStudioCover] = useState("");
  const [studioCoverBusy, setStudioCoverBusy] = useState(false);

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

  const sendStudio = async () => {
    const text = studioInput.trim();
    if (!text || studioBusy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setStudioInput("");
    setStudioBusy(true);
    try {
      const r = await api.post("/admin/games/studio/chat", { session_id: session, message: text });
      setSession(r.session_id);
      const reply = r.mode === "ready" ? (r.summary || "I've got a great design ready to build!") : (r.message || r.summary);
      setMsgs((m) => [...m, { role: "sage", text: reply }]);
      setSpecReady(r.spec_ready ? r.spec_preview : null);
    } catch (e) {
      toast.error(e.message || "Sage had trouble — try again");
      setMsgs((m) => [...m, { role: "sage", text: "Sorry, I had trouble with that. Could you rephrase?" }]);
    } finally {
      setStudioBusy(false);
    }
  };

  const buildStudio = async () => {
    if (!session) return;
    setBuilding(true);
    try {
      const g = await api.post("/admin/games/studio/build", { session_id: session, cover_image: studioCover || undefined });
      setGames((list) => [...list, g]);
      setMsgs([]);
      setSession(null);
      setSpecReady(null);
      setStudioCover("");
      toast.success(`Built "${g.title}" (${g.kind}, private) — review it below, then publish.`);
    } catch (e) {
      toast.error(e.message || "Couldn't build the game");
    } finally {
      setBuilding(false);
    }
  };

  const uploadStudioCover = async (file) => {
    if (!file) return;
    if (!cloudinaryAvailable) { toast.error("Image uploads aren't configured."); return; }
    setStudioCoverBusy(true);
    try {
      const res = await uploadToCloudinary(file, { resourceType: "image" });
      setStudioCover(res.secure_url);
      toast.success("Cover image added");
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setStudioCoverBusy(false);
    }
  };

  const resetStudio = () => {
    setMsgs([]);
    setSession(null);
    setSpecReady(null);
    setStudioInput("");
    setStudioCover("");
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <h2 className="text-lg font-bold">AI Game Studio</h2>
            </div>
            {msgs.length > 0 && (
              <button onClick={resetStudio} className="text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="studio-reset">
                Start over
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Chat with Sage to craft the perfect game. Describe your idea — Sage asks a few questions, then builds it (saved <b>private</b> to play-test, then publish). Builds within the app's engines: match-3, memory, trivia, tap-reflex & farm/sim.
          </p>

          {/* transcript */}
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/60 p-3" data-testid="studio-transcript">
            {msgs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Sparkles size={22} className="mx-auto mb-2 text-primary/60" />
                Say hi to Sage and describe the game you dream of. <br />e.g. <i>"a chill ocean gem match-3"</i> or <i>"90s hip-hop trivia"</i>
              </div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`studio-msg-${m.role}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                    {m.role === "sage" && <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-primary">Sage</span>}
                    {m.text}
                  </div>
                </div>
              ))
            )}
            {studioBusy && (
              <div className="flex justify-start" data-testid="studio-thinking">
                <div className="rounded-2xl bg-secondary px-3.5 py-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="inline animate-spin" /> Sage is thinking…
                </div>
              </div>
            )}
          </div>

          {specReady && (
            <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-3" data-testid="studio-ready">
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className="text-xl">{specReady.cover_emoji}</span>
                <span>{specReady.title}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{specReady.kind}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{specReady.description}</p>

              {/* Optional custom cover image */}
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-background/60 p-2">
                <div className="relative h-12 w-20 flex-none overflow-hidden rounded-md border border-border bg-gradient-to-br from-primary/25 to-transparent">
                  {studioCover ? (
                    <img src={studioCover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xl">{specReady.cover_emoji}</span>
                  )}
                  {studioCoverBusy && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 size={14} className="animate-spin text-white" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><ImagePlus size={12} /> Cover image (optional)</div>
                  <div className="mt-1 flex items-center gap-3">
                    <label className="cursor-pointer text-[11px] font-semibold text-primary hover:underline" data-testid="studio-cover-upload">
                      {studioCover ? "Change" : "Upload image"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadStudioCover(e.target.files?.[0])} />
                    </label>
                    {studioCover && (
                      <button onClick={() => setStudioCover("")} className="text-[11px] font-semibold text-muted-foreground hover:text-destructive" data-testid="studio-cover-clear">Remove</button>
                    )}
                  </div>
                </div>
              </div>

              <Button onClick={buildStudio} disabled={building || studioCoverBusy} className="mt-2 h-9 w-full gap-1.5 bg-green-600 text-white hover:bg-green-700" data-testid="studio-build">
                {building ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Build &amp; save (private)
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={studioInput}
              onChange={(e) => setStudioInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendStudio()}
              placeholder={msgs.length === 0 ? "Describe the game you want…" : "Reply to Sage…"}
              className="h-10 flex-1"
              disabled={studioBusy}
              data-testid="studio-input"
            />
            <Button onClick={sendStudio} disabled={studioBusy || !studioInput.trim()} className="h-10 gap-1.5 bg-primary text-primary-foreground" data-testid="studio-send">
              {studioBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Send
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Each message uses a little Emergent LLM credit.</p>
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
