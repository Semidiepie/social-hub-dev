import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Heart, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Admin → Remembering requests: approve/deny users who applied to become a
// memorialized ("Remembering") account.
export default function AdminRememberingPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get("/admin/remembering/requests");
      setUsers(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (u, action) => {
    if (busyId) return;
    setBusyId(u.id);
    try {
      await api.post(`/admin/users/${u.id}/remembering`, { action });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success(action === "approve" ? "Account marked as Remembering" : "Request denied");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-remembering-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Heart size={24} className="text-red-400" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Review accounts requesting a “Remembering” label.</p>
      </header>

      <AdminTabs />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Users size={40} />
          <p>No pending requests.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="admin-remembering-list">
          {users.map((u) => (
            <Card key={u.id} data-testid={`admin-remembering-row-${u.username}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <Avatar src={u.avatar_url} size={44} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-semibold">{u.display_name}</div>
                  <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                </div>
                <Button
                  onClick={() => act(u, "approve")}
                  disabled={busyId === u.id}
                  className="min-w-[92px] gap-2 bg-red-500 text-white hover:bg-red-600"
                  data-testid={`admin-remembering-approve-${u.username}`}
                >
                  {busyId === u.id ? <Loader2 size={14} className="animate-spin" /> : "Approve"}
                </Button>
                <Button
                  onClick={() => act(u, "revoke")}
                  disabled={busyId === u.id}
                  variant="outline"
                  className="gap-2 border-border"
                  data-testid={`admin-remembering-deny-${u.username}`}
                >
                  Deny
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
