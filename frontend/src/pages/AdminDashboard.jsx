import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, BadgeCheck, Image as ImageIcon, Clapperboard, BookText, Radio, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AdminTabs } from "@/components/AdminTabs";

const CARDS = [
  { key: "users", label: "Total users", icon: Users },
  { key: "verified", label: "Verified accounts", icon: BadgeCheck },
  { key: "posts", label: "Posts", icon: ImageIcon },
  { key: "reels", label: "Reels", icon: Clapperboard },
  { key: "blogs", label: "Published blogs", icon: BookText },
  { key: "pending_blogs", label: "Pending blog approvals", icon: BookText, highlight: true },
  { key: "live_now", label: "Live right now", icon: Radio, highlight: true },
];

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/admin/stats")
      .then((s) => { if (alive) setStats(s); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (authLoading) return null;
  if (!(user?.is_super_admin || user?.is_admin)) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5" data-testid="admin-dashboard">
      <AdminTabs />
      <header>
        <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">A quick pulse on PostMePlex.</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading stats…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="dashboard-stats">
          {CARDS.map((c) => (
            <div
              key={c.key}
              data-testid={`stat-${c.key}`}
              className={`rounded-2xl border p-4 ${c.highlight && stats?.[c.key] > 0 ? "border-primary/40 bg-primary/5" : "border-border bg-card/60"}`}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <c.icon size={16} className={c.highlight && stats?.[c.key] > 0 ? "text-primary" : ""} />
                <span className="text-xs font-semibold uppercase tracking-wide">{c.label}</span>
              </div>
              <div className="mt-2 text-3xl font-black tracking-tight">
                {stats?.[c.key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
