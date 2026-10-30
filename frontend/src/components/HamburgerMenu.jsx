import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatTokens } from "@/lib/format";
import {
  Menu,
  Coins,
  Gift,
  ChevronRight,
  Video,
  Radio,
  Music2,
  PawPrint,
  BookText,
  Mail,
  ShoppingBag,
  Compass,
  MessageSquare,
  MessagesSquare,
  Bell,
  User,
  Settings,
  Shield,
  Gamepad2,
  Phone,
  Download,
  LogOut,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";

const SHORTCUTS = [
  { label: "Videos", route: "/videos", icon: Video },
  { label: "Live", route: "/live", icon: Radio },
  { label: "Music", route: "/music", icon: Music2 },
  { label: "My Pet", route: "/pet", icon: PawPrint },
  { label: "Blogs", route: "/blogs", icon: BookText },
  { label: "Email", route: "/email", icon: Mail, testId: "menu-email" },
];

const LINKS = [
  { label: "Profile", route: "/profile", icon: User, testId: "menu-profile" },
  { label: "Wallet", route: "/wallet", icon: Coins, testId: "menu-wallet" },
  { label: "Market", route: "/market", icon: ShoppingBag, testId: "menu-market" },
  { label: "Messages", route: "/messages", icon: MessageSquare, testId: "menu-messages" },
  { label: "Live Chat", route: "/livechat", icon: MessagesSquare, testId: "menu-livechat" },
  { label: "Notifications", route: "/notifications", icon: Bell, testId: "menu-notifications" },
  { label: "Discover", route: "/discover", icon: Compass, testId: "menu-discover" },
];

export function HamburgerMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [hasGames, setHasGames] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      setWallet(await api.get("/wallet"));
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadWallet();
      api.get("/games/count").then((r) => setHasGames((r?.count || 0) > 0)).catch(() => {});
    }
  }, [open, loadWallet]);

  const go = (route) => {
    setOpen(false);
    navigate(route);
  };

  const claimDaily = async () => {
    setClaiming(true);
    try {
      const res = await api.post("/wallet/daily");
      toast.success(`+${res.claimed} tokens claimed! 🎉`);
      setWallet((w) => ({ ...w, balance: res.balance, can_claim_daily: false, next_claim_at: res.next_claim_at }));
    } catch (e) {
      toast.error(e.message || "Come back later for your daily reward");
    } finally {
      setClaiming(false);
    }
  };

  if (!user) return null;
  const balance = wallet?.balance ?? user.tokens ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          data-testid="hamburger-menu-trigger"
          aria-label="Menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition-transform active:scale-95"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[88%] max-w-sm flex-col gap-0 overflow-y-auto p-0"
        data-testid="hamburger-menu-panel"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Your account, wallet and shortcuts</SheetDescription>

        <div style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }} className="px-4 pb-3">
          {/* Profile card */}
          <button
            data-testid="menu-profile-card"
            onClick={() => go("/profile")}
            className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-secondary/60 p-3 text-left transition-colors hover:bg-secondary"
          >
            <Avatar src={user.avatar_url} size={48} frame={user.frame_enabled ? user.equipped_frame : null} frameStyle={user.custom_frame} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-base font-black">{user.display_name}</div>
              <div className="truncate text-xs text-muted-foreground">@{user.username}</div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>

          {/* Wallet card */}
          <div
            className="mt-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 to-primary/5 p-3"
            data-testid="menu-wallet-card"
          >
            <div className="flex items-center justify-between">
              <button onClick={() => go("/wallet")} className="flex items-center gap-2.5 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                  <Coins size={20} />
                </span>
                <div className="leading-tight">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Balance</div>
                  <div className="text-xl font-black tabular-nums" data-testid="menu-token-balance">
                    {formatTokens(balance)} <span className="text-sm font-bold text-primary">tokens</span>
                  </div>
                </div>
              </button>
            </div>
            <Button
              data-testid="menu-claim-daily"
              onClick={claimDaily}
              disabled={claiming || (wallet && !wallet.can_claim_daily)}
              className="mt-3 w-full justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              size="sm"
            >
              <Gift size={15} />
              {wallet && !wallet.can_claim_daily
                ? "Daily reward claimed"
                : claiming
                ? "Claiming…"
                : `Claim daily +${wallet?.daily_reward ?? 25}`}
            </Button>
          </div>

          {/* Shortcuts grid */}
          <div className="mt-4 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Your shortcuts</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SHORTCUTS.map((s) => (
              <button
                key={s.route}
                data-testid={`menu-shortcut-${s.label.toLowerCase().replace(/\s/g, "-")}`}
                onClick={() => go(s.route)}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary/50 p-3 transition-colors hover:bg-secondary"
              >
                <s.icon size={22} className="text-primary" />
                <span className="text-xs font-semibold">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Links list */}
        <div className="mt-1 flex flex-col px-2">
          {hasGames && (
            <button
              data-testid="menu-games"
              onClick={() => go("/games")}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Gamepad2 size={20} className="text-muted-foreground" /> Games
            </button>
          )}
          {LINKS.map((l) => (
            <button
              key={l.route}
              data-testid={l.testId}
              onClick={() => go(l.route)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <l.icon size={20} className="text-muted-foreground" />
              {l.label}
            </button>
          ))}
          <button
            data-testid="menu-install"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event("open-install-guide"));
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-secondary"
          >
            <Download size={20} className="text-muted-foreground" /> Install app
          </button>
          <button
            data-testid="menu-settings"
            onClick={() => go("/settings")}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-secondary"
          >
            <Settings size={20} className="text-muted-foreground" /> Settings &amp; privacy
          </button>
          <a
            href="tel:+18005076788"
            data-testid="menu-support"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-secondary"
          >
            <Phone size={20} className="text-muted-foreground" /> Call support · Sage AI
          </a>
          {user.is_super_admin && (
            <button
              data-testid="menu-admin"
              onClick={() => go("/admin/verify")}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Shield size={20} className="text-muted-foreground" /> Admin
            </button>
          )}
        </div>

        <div className="mt-auto border-t border-border p-3">
          <button
            data-testid="menu-logout"
            onClick={() => {
              setOpen(false);
              logout();
              navigate("/login");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut size={20} /> Log out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
