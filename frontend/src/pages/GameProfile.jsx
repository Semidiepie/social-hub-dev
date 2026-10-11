import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Loader2, Play, Bookmark, Heart, Megaphone, Eye, EyeOff, MoreHorizontal,
  ExternalLink, Link2, Trash2, Pencil, Gamepad2, BadgeCheck, Users, Clock, MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar, UsernameLine } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import CommentThread from "@/components/CommentThread";
import { userPath, timeAgo, frameOf } from "@/lib/format";
import { toast } from "sonner";

function UserRow({ u, meta }) {
  return (
    <Link to={userPath(u)} className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary" data-testid={`game-user-${u.id}`}>
      <Avatar src={u.avatar_url} size={40} frame={frameOf(u)} live={u.is_live} />
      <div className="min-w-0 flex-1">
        <UsernameLine user={u} />
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : (u.username ? <div className="truncate text-xs text-muted-foreground">@{u.username}</div> : null)}
      </div>
    </Link>
  );
}

export default function GameProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!(user?.is_super_admin || user?.is_admin);

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState({ count: 0, users: [] });
  const [players, setPlayers] = useState({ count: 0, users: [] });
  const [tab, setTab] = useState("comments");
  const [commentCount, setCommentCount] = useState(0);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updates, setUpdates] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await api.get(`/games/${id}`);
      setGame(g);
      api.get(`/games/${id}/followers`).then((r) => setFollowers(r || { count: 0, users: [] })).catch(() => {});
      api.get(`/games/${id}/players`).then((r) => setPlayers(r || { count: 0, users: [] })).catch(() => {});
      api.get(`/games/${id}/comments`).then((r) => setCommentCount(Array.isArray(r) ? r.length : 0)).catch(() => {});
    } catch (e) {
      toast.error(e.message || "Couldn't open this game");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openNewTab = () => window.open(game.play_url, "_blank", "noopener,noreferrer");
  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/games/${id}`);
    toast.success("Link copied!");
  };

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
      setFollowers((f) => ({ ...f, count: r.followers }));
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
    return <div className="flex justify-center py-24" data-testid="game-profile-loading"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!game) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        <p>Game not found.</p>
        <Link to="/games" className="mt-2 inline-block font-semibold text-primary">Back to Games</Link>
      </div>
    );
  }

  const TABS = [
    { key: "comments", label: "Comments", icon: MessageSquare, n: commentCount },
    { key: "players", label: "Playing", icon: Gamepad2, n: players.count },
    { key: "followers", label: "Followers", icon: Users, n: followers.count },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="game-profile-page">
      {/* Cover + identity */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="relative h-36 w-full bg-secondary sm:h-44">
          {game.banner_url ? (
            <img src={game.banner_url} alt="" className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/30 to-secondary" />
          )}
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end gap-3">
            <img src={game.icon_url} alt="" className="h-20 w-20 flex-none rounded-2xl border-4 border-background object-cover shadow-lg" data-testid="game-profile-icon" />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-xl font-black" data-testid="game-profile-name">{game.name}</h1>
                {game.is_verified && <BadgeCheck size={20} className="flex-none text-sky-500" data-testid="game-verified-badge" />}
              </div>
              {game.developer ? <p className="truncate text-sm text-muted-foreground">by {game.developer}</p> : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {game.category ? <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{game.category}</span> : null}
            <span className="text-muted-foreground"><b className="text-foreground">{followers.count}</b> followers</span>
            <span className="text-muted-foreground"><b className="text-foreground">{players.count}</b> playing</span>
          </div>

          {game.description ? <p className="mt-3 text-sm text-foreground/90" data-testid="game-profile-desc">{game.description}</p> : null}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => navigate(`/games/${id}/play`)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="game-play-btn">
              <Play size={16} className="fill-current" /> Play
            </Button>
            <Button variant={game.saved ? "default" : "outline"} onClick={toggleSave} className="gap-2" data-testid="game-save-btn">
              <Bookmark size={16} className={game.saved ? "fill-current" : ""} /> {game.saved ? "Saved" : "Save"}
            </Button>
            <Button variant={game.following ? "default" : "outline"} onClick={toggleFollow} className="gap-2" data-testid="game-follow-btn">
              <Heart size={16} className={game.following ? "fill-current" : ""} /> {game.following ? "Following" : "Follow"}
            </Button>
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

          {/* Updates + privacy */}
          <button onClick={openUpdates} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:bg-secondary" data-testid="game-updates-open">
            <Megaphone size={16} className="text-primary" /> Game updates
            {game.unseen_updates > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground" data-testid="game-updates-badge">new</span>}
          </button>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-border px-3 py-2.5" data-testid="game-privacy-row">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {game.activity_visible ? <Eye size={16} className="text-primary" /> : <EyeOff size={16} className="text-muted-foreground" />} Show my activity on this game
            </span>
            <Switch checked={game.activity_visible} onCheckedChange={setPrivacy} data-testid="game-privacy-switch" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-card/40 p-1" data-testid="game-profile-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            data-testid={`game-tab-${t.key}`}
          >
            <t.icon size={15} /> {t.label}{t.n ? ` · ${t.n}` : ""}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card/40 p-4">
        {tab === "comments" && (
          <CommentThread type="game" id={id} onCountChange={(d) => setCommentCount((c) => Math.max(0, c + d))} />
        )}

        {tab === "players" && (
          players.users.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground" data-testid="game-players-empty">
              <Gamepad2 size={28} className="mx-auto mb-2 text-primary" />
              No one is sharing their activity yet. Be the first to play!
            </div>
          ) : (
            <div className="space-y-1" data-testid="game-players-list">
              {players.users.map((u) => <UserRow key={u.id} u={u} meta={u.last_played ? `Played ${timeAgo(u.last_played)}` : null} />)}
            </div>
          )
        )}

        {tab === "followers" && (
          followers.users.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground" data-testid="game-followers-empty">
              <Users size={28} className="mx-auto mb-2 text-primary" />
              No followers yet. Follow to get updates about this game.
            </div>
          ) : (
            <div className="space-y-1" data-testid="game-followers-list">
              {followers.users.map((u) => <UserRow key={u.id} u={u} />)}
            </div>
          )
        )}
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
