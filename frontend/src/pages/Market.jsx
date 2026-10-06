import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Check, Sparkles, Palette, Coins, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
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
