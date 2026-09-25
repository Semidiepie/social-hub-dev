import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Search, BadgeCheck, Play } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, timeAgo, userPath, videoPath } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function DiscoverPage() {
  const [tab, setTab] = useState("top");
  const [data, setData] = useState({ type: "top", items: [] });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get(`/discover?filter=${tab}`);
      setData(d);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await api.get(`/search?q=${encodeURIComponent(q.trim())}`);
        setSearchResults(rows);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Discover</h1>
        <p className="mt-1 text-muted-foreground">People and content trending on PostMePlex.</p>
      </header>

      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5">
        <Search size={18} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users, tags, posts…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          data-testid="discover-search-input"
        />
      </div>

      {searchResults ? (
        <SearchResultsView results={searchResults} onOpenUser={(u) => navigate(userPath(u))} />
      ) : (
        <>
          <Tabs value={tab} onValueChange={setTab} className="mb-6">
            <TabsList>
              <TabsTrigger value="top" data-testid="discover-tab-top">Top</TabsTrigger>
              <TabsTrigger value="accounts" data-testid="discover-tab-accounts">Accounts</TabsTrigger>
              <TabsTrigger value="tags" data-testid="discover-tab-tags">Tags</TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : data.type === "accounts" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.items.map((u) => (
                <UserCard key={u.id} user={u} onOpen={() => navigate(userPath(u))} />
              ))}
            </div>
          ) : data.type === "tags" ? (
            <div className="flex flex-wrap gap-2">
              {data.items.length === 0 && <EmptyRow message="No trending tags yet." />}
              {data.items.map((t) => (
                <span key={t.tag} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold">
                  #{t.tag} <span className="ml-1 text-muted-foreground">{t.count}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {data.items.length === 0 && <EmptyRow message="Nothing trending yet." />}
              {data.items.map((p) => {
                const to =
                  p.type === "reel"
                    ? `/reels/${p.id}`
                    : p.type === "video"
                      ? videoPath(p)
                      : p.author?.id
                        ? userPath(p.author)
                        : "/";
                return (
                  <Link
                    key={p.id}
                    to={to}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
                    data-testid={`discover-grid-${p.id}`}
                  >
                    <div className="relative aspect-square bg-secondary">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                      ) : p.thumbnail_url ? (
                        <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          Text post
                        </div>
                      )}
                      {p.type === "reel" && (
                        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                          <Play size={10} className="fill-white" /> Reel
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-xs">{p.caption || "—"}</p>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {p.author?.display_name} · {timeAgo(p.created_at)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyRow({ message }) {
  return (
    <div className="col-span-full rounded-2xl border border-border bg-card/60 p-10 text-center text-muted-foreground">
      {message}
    </div>
  );
}

function SearchResultsView({ results, onOpenUser }) {
  const users = useMemo(() => results?.users || [], [results]);
  const posts = useMemo(() => results?.posts || [], [results]);
  return (
    <div className="space-y-6">
      {users.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-muted-foreground">People</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {users.map((u) => (
              <UserCard key={u.id} user={u} onOpen={() => onOpenUser(u)} />
            ))}
          </div>
        </section>
      )}
      {posts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-muted-foreground">Posts</h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                <p className="line-clamp-2 text-sm">{p.caption}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {users.length === 0 && posts.length === 0 && (
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center text-muted-foreground">
          No results. Try another query.
        </div>
      )}
    </div>
  );
}

function UserCard({ user, onOpen }) {
  const { user: me } = useAuth();
  const [following, setFollowing] = useState(!!user.follows_them);
  const [busy, setBusy] = useState(false);
  const isMe = me?.id === user.id;

  const toggle = async (e) => {
    e.stopPropagation();
    if (!me) return;
    setBusy(true);
    try {
      if (following) await api.del(`/users/${user.id}/follow`);
      else await api.post(`/users/${user.id}/follow`);
      setFollowing(!following);
    } catch (err) {
      toast.error(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
      data-testid={`user-card-${user.id}`}
    >
      <Avatar src={user.avatar_url} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate font-semibold">
          {user.display_name}
          {user.is_verified && <BadgeCheck size={14} className="fill-primary text-background" />}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          @{user.username} · {formatNumber(user.followers)} followers
        </div>
      </div>
      {!isMe && me && (
        <Button
          size="sm"
          onClick={toggle}
          disabled={busy}
          className={
            following
              ? "border-border bg-transparent text-foreground hover:bg-secondary"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }
          variant={following ? "outline" : "default"}
          data-testid={`user-follow-${user.id}`}
        >
          {following ? "Following" : "Follow"}
        </Button>
      )}
    </button>
  );
}
