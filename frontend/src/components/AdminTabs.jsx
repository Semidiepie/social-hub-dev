import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, BadgeCheck, BookText, KeyRound, Heart, Megaphone,
  ShieldAlert, Sparkles, Users, Gamepad2, BrainCircuit, Wand2, BellRing,
} from "lucide-react";

// Shared nav model for the PostMePlex Studio. Rendered as a sticky left rail by
// AdminLayout on desktop, and as a horizontal scroller (below) on mobile.
export const ADMIN_TABS = [
  { to: "/admin", end: true, key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/verify", key: "verify", label: "Verify accounts", icon: BadgeCheck },
  { to: "/admin/curate", key: "curate", label: "Curated accounts", icon: Sparkles },
  { to: "/admin/accounts", key: "accounts", label: "Accounts", icon: Users },
  { to: "/admin/games", key: "games", label: "Games", icon: Gamepad2 },
  { to: "/admin/ai-characters", key: "ai-characters", label: "AI Characters", icon: BrainCircuit },
  { to: "/admin/notification-sounds", key: "notification-sounds", label: "Notification sounds", icon: BellRing },
  { to: "/admin/theme", key: "theme", label: "Holiday Theme", icon: Wand2 },
  { to: "/admin/blogs", key: "blogs", label: "Blog approvals", icon: BookText },
  { to: "/admin/reset-pins", key: "reset-pins", label: "Reset PINs", icon: KeyRound },
  { to: "/admin/remembering", key: "remembering", label: "Remembering", icon: Heart },
  { to: "/admin/announce", key: "announce", label: "Announce update", icon: Megaphone },
  { to: "/admin/keys", key: "keys", label: "API keys", icon: ShieldAlert },
];

// Mobile-only horizontal nav. The desktop rail lives in AdminLayout.
export function AdminTabs() {
  return (
    <div
      className="mb-4 flex gap-2 overflow-x-auto border-b border-border pb-3 no-scrollbar md:hidden"
      data-testid="admin-tabs"
    >
      {ADMIN_TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          data-testid={`admin-tab-${t.key}`}
          className={({ isActive }) =>
            `flex flex-shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`
          }
        >
          <t.icon size={16} />
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
