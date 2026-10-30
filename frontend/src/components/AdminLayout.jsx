import React from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_TABS } from "@/components/AdminTabs";

// PostMePlex Studio — a YouTube-Studio-style admin shell: branded top bar +
// sticky left nav rail (desktop) wrapping every admin tool via <Outlet/>.
export default function AdminLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;
  if (!(user?.is_super_admin || user?.is_admin)) return <Navigate to="/" replace />;

  return (
    <div data-testid="admin-studio">
      {/* Branded Studio top bar */}
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <img src="/logo-512.png" alt="PostMePlex" className="h-9 w-9 rounded-xl" />
          <div className="leading-tight">
            <div className="text-lg font-black tracking-tight">
              PostMePlex <span className="text-primary">Studio</span>
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin control center
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          data-testid="studio-back-to-app"
        >
          <ArrowLeft size={15} /> Back to app
        </button>
      </div>

      <div className="flex gap-6">
        {/* Desktop left rail */}
        <aside className="hidden w-56 flex-shrink-0 md:block">
          <nav className="sticky top-6 flex flex-col gap-1" data-testid="studio-rail">
            {ADMIN_TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                data-testid={`studio-nav-${t.key}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`
                }
              >
                <t.icon size={18} />
                {t.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
