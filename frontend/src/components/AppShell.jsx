import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { formatTokens } from "@/lib/format";
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
  ShoppingBag,
  User,
  Coins,
  Gamepad2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RightSidebar } from "@/components/RightSidebar";
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
  { to: "/market", label: "Market", icon: ShoppingBag, testId: "nav-market" },
  { to: "/wallet", label: "Wallet", icon: Coins, testId: "nav-wallet" },
  { to: "/blogs", label: "Blogs", icon: BookText, testId: "nav-blogs" },
  { to: "/discover", label: "Discover", icon: Compass, testId: "nav-discover" },
  { to: "/messages", label: "Messages", icon: MessageSquare, testId: "nav-messages" },
  { to: "/notifications", label: "Notifications", icon: Bell, testId: "nav-notifications" },
];

// Label that stays hidden while the rail is collapsed and reveals on hover.
const REVEAL = "w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:w-auto group-hover:opacity-100 group-focus-within:w-auto group-focus-within:opacity-100";

function RailBrand() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <img src="/logo.png" alt="PostMePlex" className="h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-primary/30" />
      <div className={`leading-tight ${REVEAL}`}>
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

function showRightSidebarFor(path) {
  return (
    path === "/" ||
    path === "/discover" ||
    path === "/notifications" ||
    path === "/profile" ||
    path.startsWith("/user/") ||
    path.startsWith("/posts/")
  );
}

export function AppShell({ children }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const showRight = showRightSidebarFor(location.pathname);
  const [gamesCount, setGamesCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    api.get("/games/count").then((r) => setGamesCount(r?.count || 0)).catch(() => setGamesCount(0));
  }, [user, location.pathname]);

  // Single auto-appearing "Games" entry: shown only to logged-in users once a
  // game exists. Placed right after Pet.
  const navItems = user && gamesCount > 0
    ? (() => {
        const items = [...NAV];
        const i = items.findIndex((n) => n.to === "/pet");
        items.splice(i + 1, 0, { to: "/games", label: "Games", icon: Gamepad2, testId: "nav-games" });
        return items;
      })()
    : NAV;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left icon rail — hover to expand labels (X-style) */}
      <aside className="group sticky top-0 z-30 hidden h-screen w-[76px] flex-shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur transition-[width] duration-200 ease-out hover:w-[256px] focus-within:w-[256px] md:flex">
        <RailBrand />

        <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3 no-scrollbar">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.testId}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <n.icon size={20} className="shrink-0" />
              <span className={REVEAL}>{n.label}</span>
            </NavLink>
          ))}

          {/* Prominent orange Post/Create button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="rail-create-button"
                className="mt-3 flex items-center justify-center gap-2 rounded-full bg-primary py-3 font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 group-hover:px-4"
              >
                <Plus size={20} className="shrink-0" />
                <span className={REVEAL}>Post</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-48">
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="sidebar-post-reel" onClick={() => navigate("/reels/new")}>
                <Film size={16} /> Post a reel
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="sidebar-upload-video" onClick={() => navigate("/videos/new")}>
                <Video size={16} /> Upload a video
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="sidebar-compose-blog" onClick={() => navigate("/blogs/new")}>
                <BookText size={16} /> Write a blog
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="create-menu-live" onClick={() => navigate("/live/new")}>
                <Radio size={16} /> Go live
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Bottom: theme toggle + account */}
        <div className="space-y-1 border-t border-border p-3">
          <ThemeToggle variant="rail" />
          <NavLink
            to="/settings"
            data-testid="sidebar-settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`
            }
          >
            <Settings size={20} className="shrink-0" />
            <span className={REVEAL}>Settings</span>
          </NavLink>
          {user?.is_super_admin && (
            <NavLink
              to="/admin/verify"
              data-testid="sidebar-admin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Shield size={20} className="shrink-0" />
              <span className={REVEAL}>Admin</span>
            </NavLink>
          )}

          {loading ? (
            <Skeleton className="h-12 w-full rounded-xl" />
          ) : user ? (
            <div className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-secondary/60">
              <NavLink to="/profile" className="flex min-w-0 flex-1 items-center gap-3" data-testid="sidebar-profile-link">
                <span className="shrink-0">
                  <Avatar src={user.avatar_url} size={36} frame={user.frame_enabled ? user.equipped_frame : null} frameStyle={user.custom_frame} />
                </span>
                <div className="hidden min-w-0 leading-tight group-hover:block group-focus-within:block">
                  <div className="truncate text-sm font-semibold">{user.display_name}</div>
                  <div className="flex items-center gap-1 text-xs font-bold text-primary" data-testid="sidebar-token-balance">
                    <Coins size={12} /> {formatTokens(user.tokens ?? 0)}
                  </div>
                </div>
              </NavLink>
              <button
                onClick={() => { logout(); navigate("/login"); }}
                data-testid="sidebar-logout"
                title="Log out"
                className="hidden shrink-0 rounded-lg p-2 text-muted-foreground hover:text-destructive group-hover:flex group-focus-within:flex"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Button
              onClick={() => navigate("/login")}
              data-testid="sidebar-login"
              className="w-full justify-center bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <User size={16} className="shrink-0 group-hover:hidden" />
              <span className={REVEAL}>Sign in</span>
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="PostMePlex" className="h-9 w-9 rounded-xl" />
            <span className="text-lg font-black tracking-tight">PostMePlex</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <NavLink to="/notifications" className="pmp-iconbtn" data-testid="topbar-icon-notifications" aria-label="Notifications">
              <Bell size={19} />
            </NavLink>
            <NavLink to="/messages" className="pmp-iconbtn" data-testid="topbar-icon-messages" aria-label="Messages">
              <Send size={18} />
            </NavLink>
            {user ? (
              <HamburgerMenu />
            ) : (
              <Button size="sm" onClick={() => navigate("/login")} data-testid="topbar-login">
                Sign in
              </Button>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 pb-24 pt-4 md:px-6 md:pt-6">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
          <nav className="pointer-events-auto flex w-full max-w-[480px] items-center justify-between rounded-3xl border border-border bg-card/95 px-2.5 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur">
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
                  className="flex h-11 w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF8C66] to-[#FF6B3D] text-white shadow-lg shadow-primary/50 transition-transform active:scale-95"
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

      {/* Right sidebar — search / trending / who-to-follow (browse pages, xl screens) */}
      {showRight && <RightSidebar />}
    </div>
  );
}
