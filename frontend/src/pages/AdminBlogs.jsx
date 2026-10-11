import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Check, X, BookText, CheckCircle2, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

// Admin → Blog approvals: review + grant/revoke blog publishing permission.
export default function AdminBlogsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get("/admin/blog-requests");
      setItems(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [load, user]);

  const act = async (r, grant) => {
    if (!grant && !window.confirm(`Deny @${r.username}'s blog request?`)) return;
    setPending((p) => ({ ...p, [r.user_id]: true }));
    try {
      await api.post(`/admin/blogs/${grant ? "grant" : "revoke"}/${r.user_id}`, {});
      setItems((prev) => prev.filter((x) => x.user_id !== r.user_id));
      toast.success(grant ? "Permission granted" : "Request denied");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setPending((p) => {
        const c = { ...p };
        delete c[r.user_id];
        return c;
      });
    }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-blogs-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <BookText size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Approve or deny requests to become a blog publisher.</p>
      </header>

      <AdminTabs />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <CheckCircle2 size={40} className="text-primary" />
          <p className="font-semibold text-foreground">No pending requests</p>
          <p className="text-sm">You&apos;re all caught up.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="admin-blogs-list">
          {items.map((r) => (
            <Card key={r.user_id} data-testid={`admin-blog-row-${r.user_id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar src={r.avatar_url} size={40} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center gap-1">
                      <span className="truncate font-semibold">{r.display_name}</span>
                      {r.is_verified && <BadgeCheck size={14} className="shrink-0 fill-primary text-background" style={r.verified_color ? { fill: r.verified_color } : undefined} />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">@{r.username}</div>
                  </div>
                  {r.requested_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.requested_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {r.reason && <p className="mt-3 text-sm leading-relaxed">{r.reason}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => act(r, false)}
                    disabled={pending[r.user_id]}
                    className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                    data-testid={`admin-blog-deny-${r.user_id}`}
                  >
                    <X size={16} /> Deny
                  </Button>
                  <Button
                    onClick={() => act(r, true)}
                    disabled={pending[r.user_id]}
                    className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid={`admin-blog-grant-${r.user_id}`}
                  >
                    {pending[r.user_id] ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} />} Grant
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
