import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Loader2, X, Maximize2, Minimize2, Bookmark, Heart, Megaphone, Eye, EyeOff,
  MoreHorizontal, ExternalLink, Link2, Trash2, Pencil, Gamepad2, ChevronRight, Coins,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function GamePlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, patchUser } = useAuth();
  const isAdmin = !!(user?.is_super_admin || user?.is_admin);

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState([]);
  const [recent, setRecent] = useState([]);
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [earn, setEarn] = useState({ session: 0, remaining: null, capped: false, rate: 5 });
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updates, setUpdates] = useState([]);
  const playAreaRef = useRef(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    loadedRef.current = false;
    setEmbedLoaded(false);
    setEmbedFailed(false);
    try {
      const g = await api.get(`/games/${id}`);
      setGame(g);
      api.post(`/games/${id}/play`).catch(() => {});
      api.get(`/games/${id}/related`).then((r) => setRelated(Array.isArray(r) ? r : [])).catch(() => {});
      api.get("/games/recent").then((r) => setRecent((Array.isArray(r) ? r : []).filter((x) => x.id !== id))).catch(() => {});
    } catch (e) {
      toast.error(e.message || "Couldn't open this game");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const insecure = !!game && /^http:\/\//i.test(game.play_url || "");

  // Major game portals forbid embedding via X-Frame-Options / CSP
  // frame-ancestors (browser-enforced — impossible to iframe). Detect them up
  // front so we show the clean "open in new tab" launch screen, never a black box.
  const blockedHost = (() => {
    if (!game?.play_url) return false;
    try {
      const h = new URL(game.play_url).hostname.replace(/^www\./, "");
      return ["poki.com", "crazygames.com", "y8.com", "miniclip.com", "kongregate.com", "addictinggames.com", "armorgames.com", "coolmathgames.com", "friv.com", "agame.com"]
        .some((d) => h === d || h.endsWith("." + d));
    } catch {
      return false;
    }
  })();
  const cannotEmbed = insecure || blockedHost;

  // We can't read a cross-origin iframe, so detect obvious failures: insecure
  // (mixed-content) URLs and known non-embeddable portals are surfaced
  // immediately; otherwise, if nothing loads within a few seconds, we surface
  // the "open in new tab" fallback.
  useEffect(() => {
    if (!game) return undefined;
    if (cannotEmbed) { setEmbedFailed(true); return undefined; }
    const t = setTimeout(() => { if (!loadedRef.current) setEmbedFailed(true); }, 5000);
    return () => clearTimeout(t);
  }, [game, cannotEmbed]);

  // In-app play = tokens. Heartbeat the backend ~once a minute while the game is
  // open in the PostMePlex player (embedded OR launched from our fallback). The
  // server validates timing + a rolling daily cap. Playing on the game's own
  // site (outside PostMePlex) never calls this, so it earns nothing.
  useEffect(() => {
    if (!game) return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await api.post(`/games/${id}/earn`);
        if (stopped) return;
        setEarn((e) => ({
          session: e.session + (r.granted || 0),
          remaining: r.remaining,
          capped: r.remaining === 0,
          rate: r.rate_per_min || e.rate,
        }));
        if (r.granted > 0) patchUser({ tokens: r.balance });
      } catch { /* noop */ }
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => { stopped = true; clearInterval(iv); };
  }, [game, id, patchUser]);

  const openNewTab = () => window.open(game.play_url, "_blank", "noopener,noreferrer");
  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/games/${id}`);
    toast.success("Link copied!");
  };
  // Fullscreen. Desktop & any browser with the Fullscreen API → the browser's
  // built-in, chrome-less fullscreen (original behavior; Esc exits, CSS
  // `.game-stage:fullscreen` fills the screen). iOS Safari / installed PWA have
  // no Fullscreen API, so there we fall back to an in-app maximized overlay.
  const toggleFullscreen = () => {
    const el = playAreaRef.current;
    if (document.fullscreenEnabled && el && el.requestFullscreen) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else el.requestFullscreen().catch(() => {});
      return;
    }
    setMaximized((m) => !m);
  };

  // Mobile overlay fallback only: Esc to exit + lock body scroll.
  useEffect(() => {
    if (!maximized) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [maximized]);

  const toggleSave = async () => {
    setGame((g) => ({ ...g, saved: !g.saved }));
    try {
      const r = await api.post(`/games/${id}/save`);
      setGame((g) => ({ ...g, saved: r.saved }));
      toast.success(r.saved ? "Saved" : "Removed from saved");
    } catch (e) {
      setGame((g) => ({ ...g, saved: !g.saved }));
      toast.error(e.message || "Failed");
    }
  };

  const toggleFollow = async () => {
    try {
      const r = await api.post(`/games/${id}/follow`);
      setGame((g) => ({ ...g, following: r.following, followers: r.followers }));
    } catch (e) {
      toast.error(e.message || "Failed");
    }
  };

  const setPrivacy = async (visible) => {
    setGame((g) => ({ ...g, activity_visible: visible }));
    try {
      await api.post(`/games/${id}/privacy`, { visible });
    } catch (e) {
      setGame((g) => ({ ...g, activity_visible: !visible }));
      toast.error(e.message || "Failed");
    }
  };

  const openUpdates = async () => {
    setUpdatesOpen(true);
    try {
      setUpdates(await api.get(`/games/${id}/updates`));
      api.post(`/games/${id}/updates/seen`).catch(() => {});
      setGame((g) => ({ ...g, unseen_updates: 0 }));
    } catch {
      setUpdates([]);
    }
  };

  const removeGame = async () => {
    if (!window.confirm(`Delete "${game.name}"?`)) return;
    try {
      await api.del(`/admin/games/${id}`);
      toast.success("Game deleted");
      navigate("/games");
    } catch (e) {
      toast.error(e.message || "Failed");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24" data-testid="game-player-loading"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!game) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        <p>Game not found.</p>
        <Link to="/games" className="mt-2 inline-block font-semibold text-primary">Back to Games</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="game-player-page">
      {/* Slim top bar */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2">
        <img src={game.icon_url} alt="" className="h-7 w-7 rounded-full object-cover" />
        <span className="truncate font-bold">{game.name}</span>
        <div className="flex-1" />
        <button onClick={toggleFullscreen} className="pmp-iconchip" title="Fullscreen" data-testid="game-fullscreen-btn"><Maximize2 size={16} /></button>
        <button onClick={() => navigate(`/games/${id}`)} className="pmp-iconchip" title="Close" data-testid="game-close-btn"><X size={16} /></button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Left: embedded play area */}
        <div className="relative lg:col-span-2">
          {(() => {
            const stageEl = (
              <div
                ref={playAreaRef}
                style={maximized ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2147483000, paddingTop: "max(env(safe-area-inset-top), 24px)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
                className={`game-stage w-full overflow-hidden bg-black ${maximized ? "rounded-none border-0" : "relative h-[62vh] min-h-[380px] rounded-2xl border border-border"}`}
              >
                {!embedLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-white/70" data-testid="game-embed-loading">
                    <Loader2 className="mr-2 animate-spin" /> Loading game…
                  </div>
                )}
                {!cannotEmbed && (
                  <iframe
                    key={game.id}
                    src={game.play_url}
                    title={game.name}
                    onLoad={() => { loadedRef.current = true; setEmbedLoaded(true); }}
                    onError={() => setEmbedFailed(true)}
                    className="h-full w-full"
                    allow="autoplay; fullscreen; gamepad; microphone; camera; clipboard-write; accelerometer; gyroscope"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-orientation-lock allow-presentation allow-fullscreen allow-downloads"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    data-testid="game-iframe"
                  />
                )}
                {maximized && (
                  <button onClick={() => setMaximized(false)} className="absolute left-3 z-20 flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/90" style={{ top: "max(env(safe-area-inset-top), 12px)" }} data-testid="game-exit-fullscreen">
                    <Minimize2 size={14} /> Exit fullscreen
                  </button>
                )}
                {embedFailed && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center" data-testid="game-embed-fallback">
                    {game.banner_url ? <img src={game.banner_url} alt="" className="mb-1 max-h-32 rounded-xl object-cover" /> : <Gamepad2 size={40} className="text-primary" />}
                    <p className="font-semibold text-white">This game can&apos;t be embedded here</p>
                    <p className="max-w-sm text-sm text-white/60">This game&apos;s site blocks loading inside other apps. Open it in a new tab to play — your Save, Follow and updates stay here.</p>
                    <Button onClick={openNewTab} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="game-fallback-newtab">
                      <ExternalLink size={16} /> Open in new tab
                    </Button>
                  </div>
                )}
              </div>
            );
            return maximized ? createPortal(stageEl, document.body) : stageEl;
          })()}
        </div>

        {/* Right: action panel */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card/50 p-4" data-testid="game-currently-playing">
            <div className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Currently playing</div>
            <div className="mt-2 flex items-center gap-3">
              <img src={game.icon_url} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/40" />
              <div className="min-w-0">
                <div className="truncate font-bold">{game.name}</div>
                {game.developer ? <div className="truncate text-xs text-muted-foreground">by {game.developer}</div> : null}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant={game.saved ? "default" : "outline"} onClick={toggleSave} className="gap-2" data-testid="game-save-btn">
                <Bookmark size={16} className={game.saved ? "fill-current" : ""} /> {game.saved ? "Saved" : "Save"}
              </Button>
              <Button variant={game.following ? "default" : "outline"} onClick={toggleFollow} className="gap-2" data-testid="game-follow-btn">
                <Heart size={16} className={game.following ? "fill-current" : ""} /> {game.following ? "Following" : "Follow"}
              </Button>
            </div>
            <button onClick={openUpdates} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:bg-secondary" data-testid="game-updates-open">
              <Megaphone size={16} className="text-primary" /> Game updates
              {game.unseen_updates > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground" data-testid="game-updates-badge">new</span>}
              <ChevronRight size={16} className="ml-auto text-muted-foreground" />
            </button>
            <div className="mt-2 flex items-center justify-between rounded-xl border border-border px-3 py-2.5" data-testid="game-privacy-row">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {game.activity_visible ? <Eye size={16} className="text-primary" /> : <EyeOff size={16} className="text-muted-foreground" />} Show my activity
              </span>
              <Switch checked={game.activity_visible} onCheckedChange={setPrivacy} data-testid="game-privacy-switch" />
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={openNewTab} className="flex-1 gap-2" data-testid="game-open-newtab"><ExternalLink size={16} /> New tab</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="px-3" data-testid="game-more-btn"><MoreHorizontal size={16} /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={openNewTab} data-testid="game-more-newtab"><ExternalLink size={15} /> Open in new tab</DropdownMenuItem>
                  <DropdownMenuItem onClick={copyLink} data-testid="game-more-copy"><Link2 size={15} /> Copy link</DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/admin/games")} data-testid="game-more-edit"><Pencil size={15} /> Edit in admin</DropdownMenuItem>
                      <DropdownMenuItem onClick={removeGame} className="text-destructive" data-testid="game-more-delete"><Trash2 size={15} /> Delete game</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Token earning + label */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="game-earn-card">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-black"><Coins size={16} className="text-primary" /> Earn while you play</span>
              <span className="text-xs font-black text-primary">+{earn.rate}/min</span>
            </div>
            {earn.session > 0 && (
              <div className="mt-2 text-2xl font-black tabular-nums text-primary" data-testid="game-earn-session">
                +{earn.session} <span className="text-sm font-bold text-muted-foreground">tokens this session</span>
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground" data-testid="game-earn-label">
              🎮 You earn tokens <b className="text-foreground">only by playing through PostMePlex</b>. Keep this game open here to keep earning — playing on the game&apos;s own site won&apos;t earn tokens.
            </p>
            {earn.capped && <p className="mt-1.5 text-xs font-semibold text-amber-500" data-testid="game-earn-capped">Daily token cap reached — come back later for more!</p>}
          </div>

          {recent.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/50 p-4" data-testid="game-recent">
              <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">Recently played</div>
              <div className="space-y-1.5">
                {recent.slice(0, 4).map((g) => (
                  <Link key={g.id} to={`/games/${g.id}`} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-secondary" data-testid={`game-recent-${g.id}`}>
                    <img src={g.icon_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    <span className="truncate text-sm font-semibold">{g.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {related.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/50 p-4" data-testid="game-related">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Related games</div>
                <Link to="/games" className="text-xs font-semibold text-primary">See more</Link>
              </div>
              <div className="space-y-1.5">
                {related.slice(0, 5).map((g) => (
                  <Link key={g.id} to={`/games/${g.id}`} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-secondary" data-testid={`game-related-${g.id}`}>
                    <img src={g.icon_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{g.name}</div>
                      {g.category ? <div className="truncate text-[11px] text-muted-foreground">{g.category}</div> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Updates dialog */}
      <Dialog open={updatesOpen} onOpenChange={setUpdatesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="game-updates-view">
          <DialogHeader><DialogTitle>{game.name} — updates</DialogTitle></DialogHeader>
          {updates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No updates yet. Follow to get notified when there are.</p>
          ) : (
            <div className="space-y-2">
              {updates.map((u) => (
                <div key={u.id} className="rounded-xl border border-border p-3" data-testid={`game-update-view-${u.id}`}>
                  <div className="font-semibold">{u.title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{u.message}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
