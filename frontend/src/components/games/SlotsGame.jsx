import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Zap, Shield, Trophy, Building2, Gift, X, Swords, PawPrint } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmt = (n) => Number(n || 0).toLocaleString();

// Coin Master-style Spin & Raid: 3-reel lucky slots + village building + daily wheel.
export function SlotsGame({ game }) {
  const slug = game.slug;
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState([null, null, null]);
  const [stoppedReels, setStoppedReels] = useState([true, true, true]);
  const [flash, setFlash] = useState(null); // {type:'attack'|'raid', amount} | 'win'
  const [villageOpen, setVillageOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tickRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const s = await api.get(`/games/${slug}/slots`);
      setState(s);
      setReels(s.symbols.slice(0, 3).map((x) => x.emoji));
    } catch {
      toast.error("Couldn't load the game");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const accent = state?.accent || "#FF6B3D";
  const symByRole = state ? Object.fromEntries(state.symbols.map((s) => [s.role, s])) : {};

  const spin = async () => {
    if (spinning || !state) return;
    setSpinning(true);
    setFlash(null);
    const pool = state.symbols.map((s) => s.emoji);
    const stopped = [false, false, false];
    setStoppedReels([false, false, false]);
    // roll every non-stopped reel fast
    tickRef.current = setInterval(() => {
      setReels((prev) => prev.map((e, i) => (stopped[i] ? e : pool[Math.floor(Math.random() * pool.length)])));
    }, 70);
    try {
      const r = await api.post(`/games/${slug}/slots/spin`);
      const final = r.reels.map((x) => x.emoji);
      const stopReel = (i) => {
        stopped[i] = true;
        setReels((prev) => prev.map((e, idx) => (idx === i ? final[i] : e)));
        setStoppedReels((prev) => prev.map((v, idx) => (idx === i ? true : v)));
      };
      await wait(650); stopReel(0);
      await wait(520); stopReel(1);
      await wait(560); stopReel(2);
      clearInterval(tickRef.current);
      setState(r.state);
      if (r.tokens_earned > 0) {
        toast.success(`🪙 +${r.tokens_earned} PMP token${r.tokens_earned > 1 ? "s" : ""}!${r.token_capped ? " (daily cap reached)" : ""}`);
      } else if (r.token_capped) {
        toast.message("Daily token cap reached — keep spinning for coins!");
      }
      if (r.events?.length) {
        setFlash({ type: r.events[0].type, amount: r.events[0].amount });
        setTimeout(() => setFlash(null), 1800);
      } else if (r.outcome === "jackpot") {
        setFlash({ type: "jackpot", amount: r.rewards.coins });
        setTimeout(() => setFlash(null), 1800);
      } else if (r.outcome === "token" || r.outcome === "token-pair") {
        setFlash({ type: "token", amount: r.tokens_earned });
        setTimeout(() => setFlash(null), 1500);
      } else if (r.rewards.coins > 0 || r.rewards.shields > 0) {
        setFlash({ type: "win", amount: r.rewards.coins });
        setTimeout(() => setFlash(null), 1200);
      }
    } catch (e) {
      clearInterval(tickRef.current);
      toast.error(e.message || "Spin failed");
    } finally {
      setSpinning(false);
    }
  };

  const upgrade = async (bid) => {
    setBusy(true);
    try {
      const r = await api.post(`/games/${slug}/slots/build`, { building: bid });
      setState(r.state);
      if (r.gained_trophy) toast.success("🏆 Village complete! New trophy + 5,000 bonus coins!");
      else toast.success(`Upgraded! −${fmt(r.cost)} coins`);
    } catch (e) {
      toast.error(e.message || "Couldn't upgrade");
    } finally {
      setBusy(false);
    }
  };

  const spinWheel = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/games/${slug}/slots/wheel`);
      setState(r.state);
      const p = r.prize;
      toast.success(`Daily Wheel: +${fmt(p.amount)} ${p.kind}! 🎁`);
    } catch (e) {
      toast.error(e.message || "Wheel isn't ready");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!state) return null;

  const coinEmoji = symByRole.coin?.emoji || "🪙";

  return (
    <div className="mx-auto max-w-md" data-testid="slots-game">
      {/* Stats bar */}
      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2.5 text-sm font-black">
        <span className="flex items-center gap-1" data-testid="slots-coins">{coinEmoji} {fmt(state.coins)}</span>
        <span className="flex items-center gap-1 text-yellow-300" data-testid="slots-energy"><Zap size={16} className="fill-yellow-300" /> {state.energy}</span>
        <span className="flex items-center gap-1 text-green-400" data-testid="slots-shields"><Shield size={16} /> {state.shields}</span>
        <span className="flex items-center gap-1" style={{ color: accent }} data-testid="slots-tokens-today" title="Real PMP tokens earned today (daily cap)">🪙 {state.token_earned_today ?? 0}/{state.token_cap}</span>
        <span className="flex items-center gap-1 text-yellow-400" data-testid="slots-trophies"><Trophy size={16} /> {state.trophies}</span>
      </div>

      {/* Slot machine */}
      <div className="relative rounded-3xl border-2 p-5" style={{ borderColor: accent, boxShadow: `0 0 28px ${accent}33` }} data-testid="slots-machine">
        <h2 className="mb-4 text-center text-xl font-black tracking-widest" style={{ color: accent }}>
          🎰 LUCKY SLOTS 🎰
        </h2>
        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-background/60 p-3">
          {reels.map((e, i) => (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-card/80 text-5xl transition-transform ${spinning && !stoppedReels[i] ? "blur-[1px]" : "scale-100"}`}
              style={{ borderColor: spinning && !stoppedReels[i] ? accent : "var(--border)" }}
              data-testid={`slots-reel-${i}`}
            >
              {e}
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Spin uses <span className="font-bold text-yellow-300">1 ⚡</span> or <span className="font-bold">{state.spin_cost} {coinEmoji}</span>
          {state.energy < state.energy_cap && state.next_energy_in > 0 && (
            <span className="ml-1 text-xs">· next ⚡ in {Math.ceil(state.next_energy_in / 60)}m</span>
          )}
        </p>

        <Button
          onClick={spin}
          disabled={spinning}
          className="mt-3 h-14 w-full rounded-2xl text-lg font-black tracking-widest text-background"
          style={{ background: accent }}
          data-testid="slots-spin-btn"
        >
          {spinning ? <Loader2 className="h-6 w-6 animate-spin" /> : "SPIN"}
        </Button>

        {/* Event flash overlay */}
        {flash && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-background/70 backdrop-blur-sm" data-testid="slots-flash">
            <div className="animate-bounce text-center">
              {flash.type === "attack" && <div className="flex flex-col items-center text-red-400"><Swords size={44} /><span className="mt-1 text-2xl font-black">ATTACK!</span></div>}
              {flash.type === "raid" && <div className="flex flex-col items-center text-fuchsia-400"><PawPrint size={44} /><span className="mt-1 text-2xl font-black">RAID!</span></div>}
              {flash.type === "jackpot" && <div className="text-center text-yellow-400"><div className="text-4xl">💰</div><span className="text-2xl font-black">JACKPOT!</span></div>}
              {flash.type === "token" && <div className="flex flex-col items-center" style={{ color: accent }}><div className="text-4xl">🪙</div><span className="text-2xl font-black">+{fmt(flash.amount)} PMP TOKENS!</span></div>}
              {flash.type === "win" && <div className="text-3xl font-black text-green-400">+{fmt(flash.amount)} {coinEmoji}</div>}
              {(flash.type === "attack" || flash.type === "raid" || flash.type === "jackpot") && (
                <div className="mt-1 text-xl font-black text-green-400">+{fmt(flash.amount)} {coinEmoji}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button onClick={() => setVillageOpen(true)} className="h-14 gap-2 rounded-2xl bg-emerald-500 text-base font-black text-white hover:bg-emerald-600" data-testid="slots-village-btn">
          <Building2 size={20} /> MY VILLAGE
        </Button>
        <Button
          onClick={spinWheel}
          disabled={!state.wheel_ready || busy}
          className="h-14 gap-2 rounded-2xl text-base font-black text-background disabled:opacity-50"
          style={{ background: "linear-gradient(90deg,#FFD166,#FF8A00)" }}
          data-testid="slots-wheel-btn"
        >
          <Gift size={20} /> {state.wheel_ready ? "DAILY WHEEL" : "WHEEL SOON"}
        </Button>
      </div>

      {/* Slot rewards legend */}
      <div className="mt-4 rounded-2xl border border-border bg-card/60 p-4" data-testid="slots-legend">
        <h3 className="mb-2 text-center text-sm font-black uppercase tracking-wider" style={{ color: accent }}>Slot Rewards</h3>
        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
          {state.symbols.map((s) => (
            <div key={s.role} className="flex items-center gap-1.5">
              <span className="text-base">{s.emoji}{s.emoji}{s.emoji}</span>
              <span className="text-muted-foreground">
                = {s.role === "coin" || s.role === "jackpot" ? `${fmt(s.value)} ${s.label}` : s.role === "token" ? `+${s.value} ${s.label} (real!)` : s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Village modal */}
      {villageOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setVillageOpen(false)} data-testid="slots-village-modal">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-black"><Building2 size={20} className="text-emerald-400" /> My Village</h3>
              <button onClick={() => setVillageOpen(false)} data-testid="slots-village-close"><X size={20} /></button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Upgrade every building to Lv 5 to complete your village, win a 🏆 trophy and a 5,000-coin bonus.</p>
            <div className="space-y-2">
              {state.village.map((b) => {
                const cost = 1000 * (b.level + 1) * (state.trophies + 1);
                const maxed = b.level >= 5;
                const afford = state.coins >= cost;
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border p-3" data-testid={`slots-building-${b.id}`}>
                    <span className="text-3xl">{b.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{b.name}</div>
                      <div className="mt-1 flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <span key={i} className={`h-1.5 w-5 rounded-full ${i <= b.level ? "bg-emerald-400" : "bg-secondary"}`} />
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => upgrade(b.id)}
                      disabled={maxed || !afford || busy}
                      size="sm"
                      className="shrink-0 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40"
                      data-testid={`slots-upgrade-${b.id}`}
                    >
                      {maxed ? "MAX" : `${fmt(cost)} ${coinEmoji}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
