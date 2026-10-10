import React, { useCallback, useEffect, useState } from "react";
import { Coins, Gift, Send, ArrowDownLeft, ArrowUpRight, Gamepad2, ShoppingBag, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const KIND_META = {
  daily: { label: "Daily reward", icon: Gift },
  game: { label: "Game reward", icon: Gamepad2 },
  admin_grant: { label: "Admin grant", icon: Sparkles },
  purchase: { label: "Store purchase", icon: ShoppingBag },
  gift_sent: { label: "Gift sent", icon: ArrowUpRight },
  gift_received: { label: "Gift received", icon: ArrowDownLeft },
  transfer_sent: { label: "Transfer sent", icon: ArrowUpRight },
  transfer_received: { label: "Transfer received", icon: ArrowDownLeft },
};

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function WalletPage() {
  const { patchUser } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [toUser, setToUser] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await api.get("/wallet");
      setWallet(w);
      patchUser({ tokens: w.balance });
    } catch (e) {
      toast.error(e.message || "Couldn't load your wallet");
    } finally {
      setLoading(false);
    }
  }, [patchUser]);

  useEffect(() => {
    load();
  }, [load]);

  const claimDaily = async () => {
    setClaiming(true);
    try {
      const res = await api.post("/wallet/daily");
      toast.success(`+${res.claimed} tokens claimed! 🎉`);
      await load();
    } catch (e) {
      toast.error(e.message || "Come back later for your daily reward");
    } finally {
      setClaiming(false);
    }
  };

  const transfer = async (e) => {
    e.preventDefault();
    const amt = parseInt(amount, 10);
    if (!toUser.trim()) return toast.error("Enter a username to send to");
    if (!amt || amt < 1) return toast.error("Enter a valid amount");
    setSending(true);
    try {
      const res = await api.post("/wallet/transfer", { username: toUser.trim(), amount: amt, note });
      toast.success(`Sent ${res.sent} tokens to @${res.to}! 💸`);
      setToUser("");
      setAmount("");
      setNote("");
      await load();
    } catch (e) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl pb-12" data-testid="wallet-page">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Coins size={24} />
        </span>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Wallet</h1>
          <p className="text-sm text-muted-foreground">Collect tokens, send gifts, shop the Market and e-transfer to friends.</p>
        </div>
      </header>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : (
        <>
          {/* Balance card */}
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6" data-testid="wallet-balance-card">
            <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Your balance</div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-5xl font-black tabular-nums text-foreground" data-testid="wallet-balance">{wallet.balance}</span>
              <span className="mb-1.5 text-lg font-black text-primary">tokens</span>
            </div>
            <Button
              data-testid="wallet-claim-daily"
              onClick={claimDaily}
              disabled={claiming || !wallet.can_claim_daily}
              className="mt-4 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Gift size={16} />
              {!wallet.can_claim_daily ? "Daily reward claimed" : claiming ? "Claiming…" : `Claim daily +${wallet.daily_reward}`}
            </Button>
            <Coins size={120} className="pointer-events-none absolute -right-4 -bottom-6 text-primary/10" />
          </div>

          {/* How to earn */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            {[
              { icon: Gift, t: "Daily", d: `+${wallet.daily_reward}/day` },
              { icon: ArrowDownLeft, t: "Gifts", d: "Receive live" },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl border border-border bg-card/60 p-3">
                <x.icon size={20} className="mx-auto text-primary" />
                <div className="mt-1 text-xs font-bold">{x.t}</div>
                <div className="text-[11px] text-muted-foreground">{x.d}</div>
              </div>
            ))}
          </div>

          {/* E-transfer */}
          <section className="mt-6 rounded-2xl border border-border bg-card/60 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-black"><Send size={16} className="text-primary" /> E-transfer tokens</h2>
            <form onSubmit={transfer} className="space-y-3">
              <input
                data-testid="transfer-username"
                value={toUser}
                onChange={(e) => setToUser(e.target.value)}
                placeholder="Recipient username (e.g. semidiepie)"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <input
                  data-testid="transfer-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="Amount"
                  className="w-32 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
                <input
                  data-testid="transfer-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  maxLength={120}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <Button data-testid="transfer-submit" type="submit" disabled={sending} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Send size={16} /> {sending ? "Sending…" : "Send tokens"}
              </Button>
            </form>
          </section>

          {/* History */}
          <section className="mt-6">
            <h2 className="mb-3 text-base font-black">Recent activity</h2>
            {wallet.transactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="wallet-empty">
                No transactions yet. Claim your daily reward or win a game to start earning!
              </div>
            ) : (
              <div className="space-y-2" data-testid="wallet-history">
                {wallet.transactions.map((t) => {
                  const meta = KIND_META[t.kind] || { label: t.kind, icon: Coins };
                  const pos = t.amount >= 0;
                  return (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${pos ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        <meta.icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{meta.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{t.note || timeAgo(t.created_at)}</div>
                      </div>
                      <div className={`text-sm font-black tabular-nums ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                        {pos ? "+" : ""}{t.amount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
