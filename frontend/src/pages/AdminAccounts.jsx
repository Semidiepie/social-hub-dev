import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, Loader2, Trash2, Search, BadgeCheck, Ban, ShieldCheck, Coins, Plus, Minus, Equal, Zap, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Admin → Accounts: search users, control their token balance, ban/unban, and remove junk accounts.
function AccountRow({ u, onChange, onDeleted }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");
  const protectedAcct = u.is_official || u.is_super_admin || u.is_admin;

  const tokenOp = async (op) => {
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt < 0) return toast.error("Enter an amount");
    setBusy(op);
    try {
      const updated = await api.post(`/admin/users/${u.id}/tokens`, { amount: amt, op });
      onChange({ ...u, tokens: updated.tokens });
      setAmount("");
      toast.success(`${op === "add" ? "Added" : op === "remove" ? "Removed" : "Set"} — @${u.username} now has ${updated.tokens} tokens`);
    } catch (e) {
      toast.error(e.message || "Token update failed");
    } finally {
      setBusy("");
    }
  };

  const toggleBan = async () => {
    const banning = !u.banned;
    if (banning && !window.confirm(`Ban @${u.username}? They'll be locked out of PostMePlex immediately.`)) return;
    setBusy("ban");
    try {
      await api.post(`/admin/users/${u.id}/${banning ? "ban" : "unban"}`, banning ? { reason: "" } : {});
      onChange({ ...u, banned: banning });
      toast.success(banning ? `Banned @${u.username}` : `Unbanned @${u.username}`);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy("");
    }
  };

  const resetSpins = async () => {
    setBusy("spins");
    try {
      const r = await api.post(`/admin/users/${u.id}/reset-spins`, {});
      toast.success(r.games > 0 ? `Refilled spins on ${r.games} game(s) for @${u.username}` : `@${u.username} hasn't played a slot game yet`);
    } catch (e) {
      toast.error(e.message || "Couldn't reset spins");
    } finally {
      setBusy("");
    }
  };

  const refreshPet = async () => {
    setBusy("pet");
    try {
      const r = await api.post(`/admin/users/${u.id}/refresh-pet`, {});
      toast.success(`Revived & refreshed ${r.pet?.name || "pet"} for @${u.username} — Lv ${r.pet?.level}, ready to feed/bath/play`);
    } catch (e) {
      toast.error(e.message === "This user has no pet" ? `@${u.username} doesn't have a pet` : (e.message || "Couldn't refresh pet"));
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete @${u.username}? This removes the account, posts and follows. Cannot be undone.`)) return;
    setBusy("del");
    try {
      await api.del(`/admin/users/${u.id}`);
      onDeleted(u.id);
      toast.success(`Deleted @${u.username}`);
    } catch (e) {
      toast.error(e.message || "Failed to delete");
      setBusy("");
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${u.banned ? "border-destructive/50 bg-destructive/5" : "border-border"}`} data-testid={`account-row-${u.id}`}>
      <div className="flex items-center gap-3">
        <Avatar src={u.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{u.display_name}</span>
            {u.is_verified && <BadgeCheck size={14} className="flex-none text-primary" />}
            {u.banned && <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-destructive">Banned</span>}
            {protectedAcct && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-black uppercase text-muted-foreground">Protected</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">@{u.username} · {u.posts_count || 0} posts</div>
        </div>
        <div className="flex flex-none items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary" data-testid={`account-tokens-${u.id}`}>
          <Coins size={13} /> {u.tokens ?? 0}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {/* token controls */}
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Tokens"
          className="h-8 w-24 text-sm"
          data-testid={`account-token-amount-${u.id}`}
        />
        <button onClick={() => tokenOp("add")} disabled={!!busy} className="flex items-center gap-1 rounded-lg bg-green-500/15 px-2.5 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/25 disabled:opacity-40" data-testid={`account-token-add-${u.id}`}>
          {busy === "add" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
        <button onClick={() => tokenOp("remove")} disabled={!!busy} className="flex items-center gap-1 rounded-lg bg-yellow-500/15 px-2.5 py-1.5 text-xs font-bold text-yellow-500 hover:bg-yellow-500/25 disabled:opacity-40" data-testid={`account-token-remove-${u.id}`}>
          {busy === "remove" ? <Loader2 size={13} className="animate-spin" /> : <Minus size={13} />} Remove
        </button>
        <button onClick={() => tokenOp("set")} disabled={!!busy} className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-secondary/70 disabled:opacity-40" data-testid={`account-token-set-${u.id}`}>
          {busy === "set" ? <Loader2 size={13} className="animate-spin" /> : <Equal size={13} />} Set
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={resetSpins}
            disabled={!!busy}
            className="flex items-center gap-1 rounded-lg bg-blue-500/15 px-2.5 py-1.5 text-xs font-bold text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"
            data-testid={`account-reset-spins-${u.id}`}
            title="Refill this user's slot spins (energy)"
          >
            {busy === "spins" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Spins
          </button>
          <button
            onClick={refreshPet}
            disabled={!!busy}
            className="flex items-center gap-1 rounded-lg bg-pink-500/15 px-2.5 py-1.5 text-xs font-bold text-pink-400 hover:bg-pink-500/25 disabled:opacity-40"
            data-testid={`account-refresh-pet-${u.id}`}
            title="Revive & refresh this user's pet (alive, full stats, instant feed/bath/play)"
          >
            {busy === "pet" ? <Loader2 size={13} className="animate-spin" /> : <Heart size={13} />} Pet
          </button>
          <button
            onClick={toggleBan}
            disabled={protectedAcct || !!busy}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-30 ${u.banned ? "bg-green-500/15 text-green-400 hover:bg-green-500/25" : "bg-destructive/15 text-destructive hover:bg-destructive/25"}`}
            data-testid={`account-ban-${u.id}`}
            title={protectedAcct ? "Protected account" : u.banned ? "Unban" : "Ban"}
          >
            {busy === "ban" ? <Loader2 size={13} className="animate-spin" /> : u.banned ? <ShieldCheck size={13} /> : <Ban size={13} />}
            {u.banned ? "Unban" : "Ban"}
          </button>
          <button
            onClick={remove}
            disabled={protectedAcct || !!busy}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
            data-testid={`account-delete-${u.id}`}
            title={protectedAcct ? "Protected account" : "Delete account"}
          >
            {busy === "del" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAccountsPage() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      setRows(await api.get(`/admin/users?q=${encodeURIComponent(query || "")}`));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_super_admin) return;
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load, user]);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-accounts-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Users size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Search accounts, control token balances, ban/unban, and remove junk profiles.</p>
      </header>

      <AdminTabs />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, @handle or email…"
              className="h-11 pl-9"
              data-testid="accounts-search"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No accounts found.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((u) => (
                <AccountRow
                  key={u.id}
                  u={u}
                  onChange={(nu) => setRows((list) => list.map((x) => (x.id === nu.id ? nu : x)))}
                  onDeleted={(id) => setRows((list) => list.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
