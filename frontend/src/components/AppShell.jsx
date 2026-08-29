import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  BookText,
  Video,
  Compass,
  MessageSquare,
  Bell,
  User,
  Settings,
  Radio,
  Plus,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const NAV = [
  { to: "/", label: "Home", icon: Home, testId: "nav-home" },
  { to: "/blogs", label: "Blogs", icon: BookText, testId: "nav-blogs" },
  { to: "/videos", label: "Videos", icon: Video, testId: "nav-videos" },
  { to: "/discover", label: "Discover", icon: Compass, testId: "nav-discover" },
  { to: "/live", label: "Live", icon: Radio, testId: "nav-live" },
  { to: "/messages", label: "Messages", icon: MessageSquare, testId: "nav-messages" },
  { to: "/notifications", label: "Notifications", icon: Bell, testId: "nav-notifications" },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-lg shadow-primary/30">
        P
      </div>
      <div className="leading-tight">
        <div className="text-lg font-black tracking-tight">PostMePlex</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          For creators
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[260px] flex-shrink-0 border-r border-border bg-card/40 backdrop-blur md:flex md:flex-col">
        <Brand />
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.testId}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
          <div className="mt-3 border-t border-border pt-3" />
          <Button
            data-testid="sidebar-compose-blog"
            onClick={() => navigate("/blogs/new")}
            className="justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={16} /> Write a blog
          </Button>
          <Button
            data-testid="sidebar-upload-video"
            variant="outline"
            onClick={() => navigate("/videos/new")}
            className="mt-2 justify-start gap-2 border-border bg-transparent hover:bg-secondary"
          >
            <Video size={16} /> Upload video
          </Button>
        </nav>

        {/* Bottom user card */}
        <div className="border-t border-border p-3">
          {loading ? (
            <Skeleton className="h-14 w-full rounded-xl" />
          ) : user ? (
            <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-2">
              <NavLink to="/profile" className="flex flex-1 items-center gap-3" data-testid="sidebar-profile-link">
                <Avatar src={user.avatar_url} size={40} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold">{user.display_name}</div>
                  <div className="truncate text-xs text-muted-foreground">@{user.username}</div>
                </div>
              </NavLink>
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                data-testid="sidebar-logout"
                title="Log out"
                className="rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-destructive"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Button
              onClick={() => navigate("/login")}
              data-testid="sidebar-login"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </Button>
          )}
          <NavLink
            to="/settings"
            data-testid="sidebar-settings"
            className={({ isActive }) =>
              `mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <Settings size={14} /> Settings
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:hidden">
          <Brand />
          {user ? (
            <NavLink to="/profile" data-testid="topbar-profile-link">
              <Avatar src={user.avatar_url} size={32} />
            </NavLink>
          ) : (
            <Button size="sm" onClick={() => navigate("/login")} data-testid="topbar-login">
              Sign in
            </Button>
          )}
        </div>

        <div className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-24 pt-4 md:px-6 md:pt-6">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-card/95 py-1.5 backdrop-blur md:hidden">
          {NAV.slice(0, 5).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
              data-testid={`bottom-${n.testId}`}
            >
              <n.icon size={20} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}
