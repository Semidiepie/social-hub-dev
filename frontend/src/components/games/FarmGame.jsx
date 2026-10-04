import React, { useCallback, useEffect, useRef, useState } from "react";
import { Coins, Loader2, Plus, ShoppingCart, Sprout, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Hay-Day-style farm simulator: plant seeds, wait (real time), harvest, sell, level up.
export function FarmGame({ game }) {
  const slug = game.slug;
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null); // plot index being planted
  const [shopOpen, setShopOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Math.floor(Date.now() / 1000));
  const skewRef = useRef(0); // server-now minus client-now

  const apply = (s) => {
    skewRef.current = s.now - Math.floor(Date.now() / 1000);
    setState(s);
  };

  const load = useCallback(async () => {
    try {
      apply(await api.get(`/games/${slug}/farm`));
    } catch {
      toast.error("Couldn't load your farm");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // local clock tick for countdowns
  useEffect(() => {
    const t = setInterval(() => setClock(Math.floor(Date.now() / 1000) + skewRef.current), 1000);
    return () => clearInterval(t);
  }, []);

  const act = async (fn) => {
    setBusy(true);
    try {
      apply(await fn());
    } catch (e) {
      toast.error(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!state) return null;

  const cropById = Object.fromEntries(state.crops.map((c) => [c.id, c]));
  const level = state.level;
  const xpInto = state.xp % 100;
  const invEntries = Object.entries(state.inventory).filter(([, q]) => q > 0);
  const plotCost = 50 * state.plots.length;

  const plant = (plotIdx, cropId) => act(async () => {
    const r = await api.post(`/games/${slug}/farm/plant`, { plot: plotIdx, crop: cropId });
    setPicker(null);
    return r;
  });
  const harvest = (plotIdx) => act(() => api.post(`/games/${slug}/farm/harvest`, { plot: plotIdx }));
  const sell = (cropId, qty) => act(() => api.post(`/games/${slug}/farm/sell`, { crop: cropId, qty }));
  const buyPlot = () => act(() => api.post(`/games/${slug}/farm/buy-plot`, {}));

  return (
    <div className="mx-auto max-w-2xl" data-testid="farm-game">
      {/* HUD */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-3">
        <div className="flex items-center gap-2 text-lg font-black" data-testid="farm-coins">
          <Coins size={20} className="text-yellow-400" /> {state.coins.toLocaleString()}
        </div>
        <div className="flex-1 px-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground"><span>Level {level}</span><span>{xpInto}/100 XP</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${xpInto}%` }} /></div>
        </div>
        <Button onClick={() => setShopOpen(true)} size="sm" className="gap-1.5 bg-primary text-primary-foreground" data-testid="farm-shop-btn">
          <ShoppingCart size={16} /> Sell
        </Button>
      </div>

      {/* Plots */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" data-testid="farm-plots">
        {state.plots.map((p, i) => {
          const crop = p.crop ? cropById[p.crop] : null;
          const ready = p.crop && clock >= (p.ready_at || 0);
          const remaining = p.crop ? Math.max(0, (p.ready_at || 0) - clock) : 0;
          return (
            <button
              key={i}
              disabled={busy}
              onClick={() => { if (!p.crop) setPicker(i); else if (ready) harvest(i); }}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-4xl transition-all ${
                ready ? "border-green-400 bg-green-500/15 animate-pulse" : p.crop ? "border-border bg-card/60" : "border-dashed border-border bg-[#3a2a16]/40 hover:border-primary/60"
              }`}
              data-testid={`farm-plot-${i}`}
            >
              {!p.crop && <Sprout size={26} className="text-muted-foreground" />}
              {crop && <span>{crop.emoji}</span>}
              {p.crop && !ready && (
                <span className="absolute bottom-1 rounded-full bg-background/80 px-2 text-[11px] font-bold tabular-nums">
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                </span>
              )}
              {ready && <span className="absolute bottom-1 rounded-full bg-green-500 px-2 text-[10px] font-black text-white">HARVEST</span>}
            </button>
          );
        })}
        {state.plots.length < 16 && (
          <button onClick={buyPlot} disabled={busy} className="flex aspect-square flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/10" data-testid="farm-buy-plot">
            <Plus size={24} />
            <span className="mt-1 text-[11px] font-bold">{plotCost} 🪙</span>
          </button>
        )}
      </div>

      {/* Seed picker */}
      {picker !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setPicker(null)} data-testid="farm-seed-picker">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black">Plant a seed</h3>
              <button onClick={() => setPicker(null)}><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {state.crops.map((c) => {
                const afford = state.coins >= c.seed_cost;
                return (
                  <button
                    key={c.id}
                    disabled={!afford || busy}
                    onClick={() => plant(picker, c.id)}
                    className={`flex items-center gap-2 rounded-2xl border border-border p-3 text-left transition-all ${afford ? "hover:border-primary/60" : "opacity-40"}`}
                    data-testid={`farm-seed-${c.id}`}
                  >
                    <span className="text-3xl">{c.emoji}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">🪙 {c.seed_cost} · {c.grow_seconds}s · sells {c.sell_price}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sell shop */}
      {shopOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShopOpen(false)} data-testid="farm-shop">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black">Sell your harvest</h3>
              <button onClick={() => setShopOpen(false)}><X size={20} /></button>
            </div>
            {invEntries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing harvested yet. Plant and harvest crops first!</p>
            ) : (
              <div className="space-y-2">
                {invEntries.map(([cid, qty]) => {
                  const c = cropById[cid];
                  if (!c) return null;
                  return (
                    <div key={cid} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                      <span className="text-3xl">{c.emoji}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold">{c.name} × {qty}</div>
                        <div className="text-[11px] text-muted-foreground">🪙 {c.sell_price} each</div>
                      </div>
                      <Button onClick={() => sell(cid, 1)} disabled={busy} size="sm" variant="outline" data-testid={`farm-sell-one-${cid}`}>Sell 1</Button>
                      <Button onClick={() => sell(cid, qty)} disabled={busy} size="sm" className="bg-primary text-primary-foreground" data-testid={`farm-sell-all-${cid}`}>Sell all</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
