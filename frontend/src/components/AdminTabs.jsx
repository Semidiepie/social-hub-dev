import React from "react";
import { NavLink } from "react-router-dom";
import { BadgeCheck, BookText, KeyRound, Heart, Megaphone, ShieldAlert, Sparkles, Users, Gamepad2, BrainCircuit, Wand2 } from "lucide-react";

const TABS = [
  { to: "/admin/verify", label: "Verify accounts", icon: BadgeCheck, testId: "admin-tab-verify" },
  { to: "/admin/curate", label: "Curated accounts", icon: Sparkles, testId: "admin-tab-curate" },
  { to: "/admin/accounts", label: "Accounts", icon: Users, testId: "admin-tab-accounts" },
  { to: "/admin/games", label: "Games", icon: Gamepad2, testId: "admin-tab-games" },
  { to: "/admin/ai-characters", label: "AI Characters", icon: BrainCircuit, testId: "admin-tab-ai-characters" },
  { to: "/admin/theme", label: "Holiday Theme", icon: Wand2, testId: "admin-tab-theme" },
  { to: "/admin/blogs", label: "Blog approvals", icon: BookText, testId: "admin-tab-blogs" },
  { to: "/admin/reset-pins", label: "Reset PINs", icon: KeyRound, testId: "admin-tab-reset-pins" },
  { to: "/admin/remembering", label: "Remembering", icon: Heart, testId: "admin-tab-remembering" },
  { to: "/admin/announce", label: "Announce update", icon: Megaphone, testId: "admin-tab-announce" },
  { to: "/admin/keys", label: "API keys", icon: ShieldAlert, testId: "admin-tab-keys" },
];

export function AdminTabs() {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-3" data-testid="admin-tabs">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          data-testid={t.testId}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
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
