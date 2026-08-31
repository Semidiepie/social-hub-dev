import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Search, KeyRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Admin → Reset PINs: super-admin sets/updates/clears a 4-digit password-reset
// PIN for any user. Users then reset their password with email + this PIN.
export default function AdminResetPinsPage() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openEditor = (u) => {
    setSelected(u);
    setPin("");
  };

  const savePin = async (clear) => {
    if (!selected) return;
    if (!clear && !/^\d{4}$/.test(pin)) {
      toast.error("Enter a 4-digit PIN.");
      return;
    }
    setSaving(true);
    try {
      const resp = await api.post(
        `/admin/users/${selected.id}/reset-pin`,
        { pin: clear ? null : pin },
        true,
      );
      setUsers((prev) =>
        prev.map((x) => (x.id === resp.id ? { ...x, has_reset_pin: resp.has_reset_pin } : x)),
      );
      toast.success(clear ? "PIN removed" : "PIN saved");
      setSelected(null);
      setPin("");
    } catch (e) {
      toast.error(e.message || "Failed to save PIN");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-reset-pins-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <KeyRound size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">
          Assign a 4-digit PIN a user enters (with their email) to reset their password.
        </p>
      </header>

      <AdminTabs />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username, name or email…"
          className="h-11 pl-9"
          data-testid="admin-reset-pins-search"
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
        <div className="space-y-2" data-testid="admin-reset-pins-list">
          {users.map((u) => (
            <Card key={u.id} data-testid={`admin-reset-pins-row-${u.username}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <Avatar src={u.avatar_url} size={44} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-semibold">{u.display_name}</div>
                  <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] font-bold">
                    <KeyRound
                      size={11}
                      className={u.has_reset_pin ? "text-primary" : "text-muted-foreground"}
                    />
                    <span className={u.has_reset_pin ? "text-primary" : "text-muted-foreground"}>
                      {u.has_reset_pin ? "PIN set" : "No PIN"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => openEditor(u)}
                  className="min-w-[92px] border-primary text-primary hover:bg-primary/10"
                  data-testid={`admin-reset-pins-edit-${u.username}`}
                >
                  {u.has_reset_pin ? "Change" : "Set PIN"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent data-testid="admin-reset-pins-dialog">
          <DialogHeader>
            <DialogTitle>
              {selected?.has_reset_pin ? "Change" : "Set"} PIN for @{selected?.username}
            </DialogTitle>
            <DialogDescription>
              A 4-digit code this user enters (with their email) to reset their password.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            className="h-16 text-center text-3xl font-bold tracking-[0.6em]"
            data-testid="admin-reset-pins-input"
          />
          <Button
            onClick={() => savePin(false)}
            disabled={saving}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="admin-reset-pins-save"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Save PIN
          </Button>
          {selected?.has_reset_pin && (
            <Button
              variant="ghost"
              onClick={() => savePin(true)}
              disabled={saving}
              className="text-destructive hover:text-destructive"
              data-testid="admin-reset-pins-clear"
            >
              Remove PIN
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
