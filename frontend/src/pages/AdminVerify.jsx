import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Search, BadgeCheck, Users, Palette, X } from "lucide-react";
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
  const [colorText, setColorText] = useState({});
  const [colorBusyId, setColorBusyId] = useState(null);

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

  const setColor = async (u, clear = false) => {
    if (colorBusyId) return;
    const description = clear ? "" : (colorText[u.id] || "").trim();
    if (!clear && !description) {
      toast.error("Describe a color first (e.g. “royal gold”)");
      return;
    }
    setColorBusyId(u.id);
    try {
      const resp = await api.post(`/admin/users/${u.id}/verify-color`, { description });
      setUsers((prev) => prev.map((x) => (x.id === resp.id ? { ...x, verified_color: resp.verified_color, is_verified: resp.is_verified } : x)));
      setColorText((prev) => ({ ...prev, [u.id]: "" }));
      toast.success(clear ? "Badge color reset to default" : `Badge color set to ${resp.verified_color}`);
    } catch (e) {
      toast.error(e.message || "Couldn't set color");
    } finally {
      setColorBusyId(null);
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
              <CardContent className="flex flex-col gap-3 p-3">
                <div className="flex items-center gap-3">
                <Avatar src={u.avatar_url} size={44} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-semibold">{u.display_name}</span>
                    {u.is_verified && <BadgeCheck size={15} className="shrink-0 text-background fill-primary" style={u.verified_color ? { fill: u.verified_color } : undefined} data-testid={`admin-verify-badge-${u.username}`} />}
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
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-secondary/40 p-2">
                  <Palette size={16} className="shrink-0 text-muted-foreground" />
                  <Input
                    value={colorText[u.id] || ""}
                    onChange={(e) => setColorText((p) => ({ ...p, [u.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") setColor(u); }}
                    placeholder="Describe badge color — e.g. royal gold, ocean teal"
                    className="h-9 flex-1 text-sm"
                    data-testid={`admin-color-input-${u.username}`}
                  />
                  {u.verified_color && (
                    <span className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: u.verified_color }} />
                      {u.verified_color}
                    </span>
                  )}
                  <Button
                    onClick={() => setColor(u)}
                    disabled={colorBusyId === u.id}
                    variant="outline"
                    className="h-9 shrink-0 gap-1 whitespace-nowrap border-primary text-primary hover:bg-primary/10"
                    data-testid={`admin-color-set-${u.username}`}
                  >
                    {colorBusyId === u.id ? <Loader2 size={14} className="animate-spin" /> : "Set with Sage"}
                  </Button>
                  {u.verified_color && (
                    <button
                      onClick={() => setColor(u, true)}
                      disabled={colorBusyId === u.id}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
                      title="Reset to default color"
                      data-testid={`admin-color-clear-${u.username}`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
