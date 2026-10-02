import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  BookText,
  Video,
  Compass,
  MessageSquare,
  Bell,
  Settings,
  Plus,
  LogOut,
  Shield,
  Send,
  Film,
  Music2,
  Radio,
  PawPrint,
  Download,
  ShoppingBag,
  User,
  Phone,
  Gamepad2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Home", icon: Home, testId: "nav-home" },
  { to: "/videos", label: "Videos", icon: Video, testId: "nav-videos" },
  { to: "/live", label: "Live", icon: Radio, testId: "nav-live" },
  { to: "/reels", label: "Reels", icon: Film, testId: "nav-reels" },
  { to: "/music", label: "Music", icon: Music2, testId: "nav-music" },
  { to: "/pet", label: "Pet", icon: PawPrint, testId: "nav-pet" },
  { to: "/games", label: "Games", icon: Gamepad2, testId: "nav-games" },
  { to: "/market", label: "Market", icon: ShoppingBag, testId: "nav-market" },
  { to: "/blogs", label: "Blogs", icon: BookText, testId: "nav-blogs" },
  { to: "/discover", label: "Discover", icon: Compass, testId: "nav-discover" },
  { to: "/messages", label: "Messages", icon: MessageSquare, testId: "nav-messages" },
  { to: "/notifications", label: "Notifications", icon: Bell, testId: "nav-notifications" },
];

// Mobile bottom bar is rendered explicitly below (Home / Discover / +FAB / Reels / Profile).

function Brand() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <img
        src="/logo.png"
        alt="PostMePlex"
        className="h-10 w-10 rounded-xl shadow-lg shadow-primary/30"
      />
      <div className="leading-tight">
        <div className="text-lg font-black tracking-tight">PostMePlex</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-primary" />
          <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            The home for creators
          </span>
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
        <nav className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
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
          <Button
            data-testid="sidebar-post-reel"
            variant="outline"
            onClick={() => navigate("/reels/new")}
            className="mt-2 justify-start gap-2 border-border bg-transparent hover:bg-secondary"
          >
            <Film size={16} /> Post a reel
          </Button>
        </nav>

        {/* Bottom user card */}
        <div className="border-t border-border p-3">
          {loading ? (
            <Skeleton className="h-14 w-full rounded-xl" />
          ) : user ? (
            <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-2">
              <NavLink to="/profile" className="flex flex-1 items-center gap-3" data-testid="sidebar-profile-link">
                <Avatar src={user.avatar_url} size={40} frame={user.frame_enabled ? user.equipped_frame : null} />
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
          {user?.is_super_admin && (
            <NavLink
              to="/admin/verify"
              data-testid="sidebar-admin"
              className={({ isActive }) =>
                `mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <Shield size={14} /> Admin
            </NavLink>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
          <Brand />
          <div className="flex items-center gap-1.5">
            <NavLink to="/blogs" className="pmp-iconbtn" data-testid="topbar-icon-blogs" aria-label="Blogs">
              <BookText size={19} />
            </NavLink>
            <NavLink to="/notifications" className="pmp-iconbtn" data-testid="topbar-icon-notifications" aria-label="Notifications">
              <Bell size={19} />
            </NavLink>
            <NavLink to="/messages" className="pmp-iconbtn" data-testid="topbar-icon-messages" aria-label="Messages">
              <Send size={18} />
            </NavLink>
            {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="topbar-menu-trigger" className="rounded-full outline-none focus:ring-2 focus:ring-primary">
                  <Avatar src={user.avatar_url} size={32} frame={user.frame_enabled ? user.equipped_frame : null} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">
                  <div className="text-sm font-semibold">{user.display_name}</div>
                  <div className="text-xs font-normal text-muted-foreground">@{user.username}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="topbar-menu-profile" onClick={() => navigate("/profile")}>
                  <Avatar src={user.avatar_url} size={16} /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-messages" onClick={() => navigate("/messages")}>
                  <MessageSquare size={16} /> Messages
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-videos" onClick={() => navigate("/videos")}>
                  <Video size={16} /> Videos
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-live" onClick={() => navigate("/live")}>
                  <Radio size={16} /> Live
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-music" onClick={() => navigate("/music")}>
                  <Music2 size={16} /> Music
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-pet" onClick={() => navigate("/pet")}>
                  <PawPrint size={16} /> My Pet
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-games" onClick={() => navigate("/games")}>
                  <Gamepad2 size={16} /> Games
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-blogs" onClick={() => navigate("/blogs")}>
                  <BookText size={16} /> Blogs
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-market" onClick={() => navigate("/market")}>
                  <ShoppingBag size={16} /> Market
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-install" onClick={() => window.dispatchEvent(new Event("open-install-guide"))}>
                  <Download size={16} /> Install app
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="topbar-menu-settings" onClick={() => navigate("/settings")}>
                  <Settings size={16} /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem asChild data-testid="topbar-menu-support">
                  <a href="tel:+18005076788" className="cursor-pointer">
                    <Phone size={16} /> Call support · Sage AI
                  </a>
                </DropdownMenuItem>
                {user?.is_super_admin && (
                  <DropdownMenuItem data-testid="topbar-menu-admin" onClick={() => navigate("/admin/verify")}>
                    <Shield size={16} /> Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="topbar-menu-logout"
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  <LogOut size={16} /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" onClick={() => navigate("/login")} data-testid="topbar-login">
              Sign in
            </Button>
          )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-24 pt-4 md:px-6 md:pt-6">
          {children}
        </div>

        {/* Mobile bottom nav — floating pill with gradient create FAB (mobile parity) */}
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
          <nav className="pointer-events-auto flex w-full max-w-[480px] items-center justify-between rounded-3xl border border-white/10 bg-card/95 px-2.5 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur">
            <NavLink to="/" end className={({ isActive }) => `flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${isActive ? "border border-primary/35 bg-primary/20 text-primary" : "text-muted-foreground"}`} data-testid="bottom-nav-home" aria-label="Home">
              <Home size={22} />
            </NavLink>
            <NavLink to="/discover" className={({ isActive }) => `flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${isActive ? "border border-primary/35 bg-primary/20 text-primary" : "text-muted-foreground"}`} data-testid="bottom-nav-discover" aria-label="Discover">
              <Compass size={22} />
            </NavLink>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="bottom-nav-create"
                  aria-label="Create"
                  className="flex h-11 w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF8C66] to-[#FF6B3D] text-background shadow-lg shadow-primary/50 transition-transform active:scale-95"
                >
                  <Plus size={26} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" className="mb-2 w-48">
                <DropdownMenuLabel>Create</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="create-menu-reel" onClick={() => navigate("/reels/new")}>
                  <Film size={16} /> Post a reel
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="create-menu-video" onClick={() => navigate("/videos/new")}>
                  <Video size={16} /> Upload a video
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="create-menu-blog" onClick={() => navigate("/blogs/new")}>
                  <BookText size={16} /> Write a blog
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="create-menu-live" onClick={() => navigate("/live/new")}>
                  <Radio size={16} /> Go live
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NavLink to="/reels" className={({ isActive }) => `flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${isActive ? "border border-primary/35 bg-primary/20 text-primary" : "text-muted-foreground"}`} data-testid="bottom-nav-reels" aria-label="Reels">
              <Film size={22} />
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => `flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${isActive ? "border border-primary/35 bg-primary/20 text-primary" : "text-muted-foreground"}`} data-testid="bottom-nav-profile" aria-label="Profile">
              <User size={22} />
            </NavLink>
          </nav>
        </div>
      </main>
    </div>
  );
}
