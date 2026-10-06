import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Check, Sparkles, Palette, Coins, Lock, Loader2, Wand2, ImagePlus, Frame } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FREE_FRAMES, THEMES } from "@/lib/cosmetics";
import { toast } from "sonner";

export default function MarketPage() {
  const { user, patchUser } = useAuth();
  const [busy, setBusy] = useState("");
  const [store, setStore] = useState(null);

  const loadStore = useCallback(async () => {
    try {
      setStore(await api.get("/store/items"));
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  const save = async (payload, successMsg) => {
    setBusy(JSON.stringify(payload));
    try {
      const updated = await api.post("/market/cosmetics", payload);
      patchUser(updated);
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy("");
    }
  };

  const equipFrame = (id) =>
    save({ equipped_frame: user?.equipped_frame === id ? "" : id }, user?.equipped_frame === id ? "Frame removed" : "Frame equipped! ✨");
  const applyTheme = (id) =>
    save({ active_theme: user?.active_theme === id ? "" : id }, user?.active_theme === id ? "Theme removed" : "Theme applied! 🎨");

  const buyItem = async (item) => {
    setBusy(`buy-${item.id}`);
    try {
      const updated = await api.post("/store/buy", { item_id: item.id });
      patchUser(updated);
      toast.success(`${item.name} purchased! 🎉`);
      await loadStore();
    } catch (e) {
      toast.error(e.message || "Purchase failed");
    } finally {
      setBusy("");
    }
  };

  const balance = store?.balance ?? user?.tokens ?? 0;

  // ---- Sage Cosmetic Studio ----
  const [sKind, setSKind] = useState("frame");
  const [sMsgs, setSMsgs] = useState([]);
  const [sSession, setSSession] = useState(null);
  const [sInput, setSInput] = useState("");
  const [sImg, setSImg] = useState(null);
  const [sBusy, setSBusy] = useState(false);
  const [sSpec, setSSpec] = useState(null);
  const [sCreating, setSCreating] = useState(false);

  const resetStudio = () => {
    setSMsgs([]); setSSession(null); setSInput(""); setSImg(null); setSSpec(null);
  };
  const switchKind = (k) => { setSKind(k); resetStudio(); };

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSImg(String(reader.result).split(",")[1] || null);
    reader.readAsDataURL(file);
  };

  const sendCosmetic = async () => {
    const text = sInput.trim();
    if (!text || sBusy) return;
    setSMsgs((m) => [...m, { role: "user", text }]);
    setSInput("");
    setSBusy(true);
    try {
      const r = await api.post("/market/cosmetic-studio/chat", { session_id: sSession, kind: sKind, message: text, image_b64: sImg });
      setSSession(r.session_id);
      setSImg(null);
      setSMsgs((m) => [...m, { role: "sage", text: r.mode === "ready" ? (r.summary || "Your design is ready!") : (r.message || r.summary) }]);
      setSSpec(r.spec_ready ? r.spec : null);
    } catch (e) {
      toast.error(e.message || "Sage had trouble — try again");
      setSMsgs((m) => [...m, { role: "sage", text: "Sorry, I had a hiccup. Could you say that again?" }]);
    } finally {
      setSBusy(false);
    }
  };

  const createCosmetic = async () => {
    if (!sSession) return;
    setSCreating(true);
    try {
      const updated = await api.post("/market/cosmetic-studio/create", { session_id: sSession });
      patchUser(updated);
      await loadStore();
      toast.success(`"${sSpec?.name}" created & equipped! −50 tokens 🎉`);
      resetStudio();
    } catch (e) {
      toast.error(e.message || "Couldn't create — check your token balance");
    } finally {
      setSCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl pb-12" data-testid="market-page">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingBag size={24} />
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Market</h1>
            <p className="text-sm text-muted-foreground">Spend your tokens on premium frames, or equip free cosmetics.</p>
          </div>
        </div>
        <Link
          to="/wallet"
          data-testid="market-balance-pill"
          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-2 text-sm font-black text-primary"
        >
          <Coins size={16} /> {balance}
        </Link>
      </header>

      {/* Sage Cosmetic Studio */}
      <section className="mb-10 rounded-2xl border border-primary/40 bg-card/60 p-4" data-testid="cosmetic-studio">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-black"><Sparkles size={18} className="text-primary" /> Sage Cosmetic Studio</h2>
          <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
            <button onClick={() => switchKind("frame")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${sKind === "frame" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid="studio-kind-frame">
              <Frame size={13} /> Frame
            </button>
            <button onClick={() => switchKind("theme")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${sKind === "theme" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid="studio-kind-theme">
              <Palette size={13} /> Theme
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat with Sage to design your own {sKind === "frame" ? "animated profile frame" : "color theme with a falling animation"}. Upload a reference image or just describe it. <b>Costs 50 tokens</b> to create.
        </p>

        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/60 p-3" data-testid="studio-transcript">
          {sMsgs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Sparkles size={20} className="mx-auto mb-1.5 text-primary/60" />
              Describe your dream {sKind}. e.g. <i>{sKind === "frame" ? '"a glowing neon cyberpunk ring"' : '"a dreamy lavender theme with falling stars"'}</i>
            </div>
          ) : (
            sMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`studio-msg-${m.role}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  {m.role === "sage" && <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-primary">Sage</span>}
                  {m.text}
                </div>
              </div>
            ))
          )}
          {sBusy && <div className="flex justify-start"><div className="rounded-2xl bg-secondary px-3.5 py-2 text-sm text-muted-foreground"><Loader2 size={14} className="inline animate-spin" /> Sage is designing…</div></div>}
        </div>

        {sSpec && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 p-3" data-testid="studio-preview">
            {sSpec.type === "frame" ? (
              <Avatar src={user?.avatar_url} size={56} frame="custom" frameStyle={sSpec} />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl text-3xl" style={{ background: `hsl(${sSpec.primary} / 0.2)` }}>{sSpec.emoji}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{sSpec.name}</div>
              <div className="text-xs text-muted-foreground">{sSpec.type === "theme" ? sSpec.blurb : "Animated profile frame"}</div>
            </div>
            <Button onClick={createCosmetic} disabled={sCreating} className="h-9 gap-1.5 bg-green-600 text-white hover:bg-green-700" data-testid="studio-create">
              {sCreating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Create (50)
            </Button>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <label className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-xl border border-border hover:bg-secondary" data-testid="studio-upload" title="Upload reference image">
            <ImagePlus size={18} className={sImg ? "text-primary" : "text-muted-foreground"} />
            <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
          </label>
          <Input
            value={sInput}
            onChange={(e) => setSInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCosmetic()}
            placeholder={sMsgs.length === 0 ? `Describe your ${sKind}…` : "Reply to Sage…"}
            className="h-10 flex-1"
            disabled={sBusy}
            data-testid="studio-input"
          />
          <Button onClick={sendCosmetic} disabled={sBusy || !sInput.trim()} className="h-10 gap-1.5 bg-primary text-primary-foreground" data-testid="studio-send">
            {sBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </Button>
        </div>
        {sImg && <p className="mt-1 text-[11px] text-primary">📎 Reference image attached — send your message to use it.</p>}
      </section>

      {/* Premium Store */}
      <section className="mb-10">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-black"><Sparkles size={18} className="text-primary" /> Token Store — Premium Frames</h2>
        <p className="mb-4 text-sm text-muted-foreground">Buy once with tokens, then equip anytime. Earn tokens from daily rewards, games and live gifts.</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {(store?.items || []).map((f) => {
            const owned = f.owned;
            const active = user?.equipped_frame === f.id;
            const affordable = balance >= f.price;
            return (
              <div key={f.id} className={`flex flex-col items-center gap-3 rounded-2xl border p-4 text-center transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-card/60"}`} data-testid={`store-frame-${f.id}`}>
                <Avatar src={user?.avatar_url} size={72} frame={f.id} />
                <div>
                  <div className="text-sm font-bold">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.blurb}</div>
                </div>
                {owned ? (
                  <Button
                    onClick={() => equipFrame(f.id)}
                    disabled={!!busy}
                    className={`h-9 w-full text-sm font-bold ${active ? "bg-secondary text-foreground hover:bg-secondary/70" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                    data-testid={`store-frame-equip-${f.id}`}
                  >
                    {active ? <><Check size={15} /> Equipped</> : "Equip"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => buyItem(f)}
                    disabled={!!busy || !affordable}
                    className="h-9 w-full gap-1.5 text-sm font-bold disabled:opacity-50"
                    data-testid={`store-frame-buy-${f.id}`}
                  >
                    {affordable ? <Coins size={14} /> : <Lock size={14} />} {busy === `buy-${f.id}` ? "Buying…" : `${f.price}`}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Free Frames */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Sparkles size={18} className="text-emerald-400" /> Free Frames</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {user?.custom_frame && (
            <div className={`flex flex-col items-center gap-3 rounded-2xl border p-4 text-center ${user?.equipped_frame === "custom" ? "border-primary bg-primary/10" : "border-border bg-card/60"}`} data-testid="market-frame-custom">
              <Avatar src={user?.avatar_url} size={72} frame="custom" frameStyle={user.custom_frame} />
              <div>
                <div className="text-sm font-bold">{user.custom_frame.name}</div>
                <div className="text-xs text-muted-foreground">Your Sage creation</div>
              </div>
              <Button
                onClick={() => equipFrame("custom")}
                disabled={!!busy}
                className={`h-9 w-full text-sm font-bold ${user?.equipped_frame === "custom" ? "bg-secondary text-foreground hover:bg-secondary/70" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                data-testid="market-frame-equip-custom"
              >
                {user?.equipped_frame === "custom" ? <><Check size={15} /> Equipped</> : "Equip"}
              </Button>
            </div>
          )}
          {FREE_FRAMES.map((f) => {
            const active = user?.equipped_frame === f.id;
            return (
              <div key={f.id} className={`flex flex-col items-center gap-3 rounded-2xl border p-4 text-center transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-card/60"}`} data-testid={`market-frame-${f.id}`}>
                <Avatar src={user?.avatar_url} size={72} frame={f.id} />
                <div>
                  <div className="text-sm font-bold">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.blurb}</div>
                </div>
                <Button
                  onClick={() => equipFrame(f.id)}
                  disabled={!!busy}
                  className={`h-9 w-full text-sm font-bold ${active ? "bg-secondary text-foreground hover:bg-secondary/70" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                  data-testid={`market-frame-equip-${f.id}`}
                >
                  {active ? <><Check size={15} /> Equipped</> : "Equip"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Themes */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Palette size={18} className="text-primary" /> Seasonal &amp; Holiday Themes <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">Free</span></h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {user?.custom_theme && (
            <div className={`overflow-hidden rounded-2xl border ${user?.active_theme === "custom" ? "border-primary" : "border-border"}`} data-testid="market-theme-custom">
              <div className="relative flex h-24 items-center justify-center overflow-hidden" style={{ background: `hsl(${user.custom_theme.primary} / 0.18)` }}>
                <span className="text-5xl">{user.custom_theme.emoji}</span>
                <span className="absolute right-2 top-2 h-6 w-6 rounded-full" style={{ background: `hsl(${user.custom_theme.primary})` }} />
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div>
                  <div className="text-sm font-bold">{user.custom_theme.name}</div>
                  <div className="text-xs text-muted-foreground">Your Sage creation</div>
                </div>
                <Button
                  onClick={() => applyTheme("custom")}
                  disabled={!!busy}
                  className={`h-9 text-sm font-bold ${user?.active_theme === "custom" ? "bg-secondary text-foreground hover:bg-secondary/70" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                  data-testid="market-theme-apply-custom"
                >
                  {user?.active_theme === "custom" ? <><Check size={15} /> Active</> : "Apply"}
                </Button>
              </div>
            </div>
          )}
          {THEMES.map((t) => {
            const active = user?.active_theme === t.id;
            return (
              <div key={t.id} className={`overflow-hidden rounded-2xl border transition-colors ${active ? "border-primary" : "border-border"}`} data-testid={`market-theme-${t.id}`}>
                <div className="relative flex h-24 items-center justify-center overflow-hidden" style={{ background: `hsl(${t.primary} / 0.18)` }}>
                  <span className="text-5xl">{t.emoji}</span>
                  <span className="absolute right-2 top-2 h-6 w-6 rounded-full" style={{ background: `hsl(${t.primary})` }} />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div>
                    <div className="text-sm font-bold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.blurb}</div>
                  </div>
                  <Button
                    onClick={() => applyTheme(t.id)}
                    disabled={!!busy}
                    className={`h-9 text-sm font-bold ${active ? "bg-secondary text-foreground hover:bg-secondary/70" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                    data-testid={`market-theme-apply-${t.id}`}
                  >
                    {active ? <><Check size={15} /> Active</> : "Apply"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
