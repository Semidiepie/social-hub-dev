import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, Loader2, Trash2, Search, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Admin → Accounts: search every user and delete leftover test/junk accounts.
export default function AdminAccountsPage() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

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

  const remove = async (u) => {
    if (!window.confirm(`Delete @${u.username}? This removes the account, its posts and follows. This cannot be undone.`)) return;
    setBusyId(u.id);
    try {
      await api.del(`/admin/users/${u.id}`);
      setRows((list) => list.filter((x) => x.id !== u.id));
      toast.success(`Deleted @${u.username}`);
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-accounts-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Users size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Search accounts and remove leftover test/junk profiles.</p>
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
              {rows.map((u) => {
                const protectedAcct = u.is_official || u.is_super_admin;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border p-3" data-testid={`account-row-${u.id}`}>
                    <Avatar src={u.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{u.display_name}</span>
                        {u.is_verified && <BadgeCheck size={14} className="flex-none text-primary" />}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        @{u.username} · {u.posts_count || 0} posts{protectedAcct ? " · protected" : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(u)}
                      disabled={protectedAcct || busyId === u.id}
                      className="flex-none rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                      data-testid={`account-delete-${u.id}`}
                      title={protectedAcct ? "Protected account" : "Delete account"}
                    >
                      {busyId === u.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
