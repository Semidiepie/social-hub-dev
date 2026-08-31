import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Search, BadgeCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Admin → Verify accounts: super-admin grants/revokes the blue verified badge.
export default function AdminVerifyPage() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      const rows = await api.get(`/admin/users?q=${encodeURIComponent(query)}`);
      setUsers(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const toggle = async (u) => {
    if (busyId) return;
    setBusyId(u.id);
    try {
      const resp = await api.post(`/admin/users/${u.id}/verify`);
      setUsers((prev) => prev.map((x) => (x.id === resp.id ? { ...x, is_verified: resp.is_verified } : x)));
      toast.success(resp.is_verified ? "Account verified" : "Verification removed");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-verify-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <BadgeCheck size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Grant or remove the verified badge on any account.</p>
      </header>

      <AdminTabs />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username, name or email…"
          className="h-11 pl-9"
          data-testid="admin-verify-search"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Users size={40} />
          <p>No matches.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="admin-verify-list">
          {users.map((u) => (
            <Card key={u.id} data-testid={`admin-verify-row-${u.username}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <Avatar src={u.avatar_url} size={44} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-semibold">{u.display_name}</span>
                    {u.is_verified && <BadgeCheck size={15} className="shrink-0 text-primary" />}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                  {u.email && <div className="truncate text-[11px] text-muted-foreground/70">{u.email}</div>}
                </div>
                <Button
                  onClick={() => toggle(u)}
                  disabled={busyId === u.id}
                  variant={u.is_verified ? "default" : "outline"}
                  className={
                    u.is_verified
                      ? "min-w-[100px] gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                      : "min-w-[100px] gap-2 border-primary text-primary hover:bg-primary/10"
                  }
                  data-testid={`admin-verify-toggle-${u.username}`}
                >
                  {busyId === u.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : u.is_verified ? (
                    "Verified"
                  ) : (
                    "Verify"
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
