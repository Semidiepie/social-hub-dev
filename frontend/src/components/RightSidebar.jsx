import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, TrendingUp, Loader2, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { formatNumber, userPath, badgeCls, badgeStyle } from "@/lib/format";

function SearchBox() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/discover?q=${encodeURIComponent(q.trim())}`);
      }}
      className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2.5 focus-within:border-primary/60"
      data-testid="sidebar-search"
    >
      <Search size={17} className="text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search PostMePlex"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        data-testid="sidebar-search-input"
      />
    </form>
  );
}

function Trending() {
  const [tags, setTags] = useState(null);
  useEffect(() => {
    api.get("/discover?filter=tags").then((d) => setTags(d.items || [])).catch(() => setTags([]));
  }, []);
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4" data-testid="sidebar-trending">
      <h3 className="mb-3 flex items-center gap-2 text-base font-black tracking-tight">
        <TrendingUp size={17} className="text-primary" /> Trending
      </h3>
      {tags === null ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : tags.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No trends yet — be the first to tag a post.</p>
      ) : (
        <ul className="space-y-1">
          {tags.slice(0, 6).map((t) => (
            <li key={t.tag}>
              <Link
                to={`/discover?q=${encodeURIComponent("#" + t.tag)}`}
                className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary"
                data-testid={`sidebar-trend-${t.tag}`}
              >
                <span className="truncate text-sm font-bold">#{t.tag}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(t.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FollowBtn({ u }) {
  const { user: me } = useAuth();
  const [following, setFollowing] = useState(!!u.follows_them);
  const [busy, setBusy] = useState(false);
  if (!me || me.id === u.id) return null;
  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      if (following) await api.del(`/users/${u.id}/follow`);
      else await api.post(`/users/${u.id}/follow`);
      setFollowing(!following);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={toggle}
      disabled={busy}
      data-testid={`sidebar-follow-${u.id}`}
      className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
        following
          ? "border border-border text-foreground hover:bg-secondary"
          : "bg-foreground text-background hover:opacity-90"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

function WhoToFollow() {
  const [users, setUsers] = useState(null);
  useEffect(() => {
    api.get("/discover?filter=accounts").then((d) => setUsers(d.items || [])).catch(() => setUsers([]));
  }, []);
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4" data-testid="sidebar-who-to-follow">
      <h3 className="mb-3 text-base font-black tracking-tight">Who to follow</h3>
      {users === null ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : users.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No suggestions right now.</p>
      ) : (
        <ul className="space-y-3">
          {users.slice(0, 4).map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <Link to={userPath(u)} className="flex min-w-0 flex-1 items-center gap-3" data-testid={`sidebar-suggest-${u.id}`}>
                <Avatar src={u.avatar_url} size={40} live={u.is_live} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-bold">{u.display_name}</span>
                    {u.is_verified && <BadgeCheck size={13} className={badgeCls(u, "shrink-0")} style={badgeStyle(u)} />}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                </div>
              </Link>
              <FollowBtn u={u} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RightSidebar() {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[340px] flex-shrink-0 overflow-y-auto border-l border-border px-5 py-5 xl:block"
      data-testid="right-sidebar"
    >
      <div className="space-y-4">
        <SearchBox />
        <Trending />
        <WhoToFollow />
        <div className="px-1 pt-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/70">PostMePlex</span> · The home for creators
        </div>
      </div>
    </aside>
  );
}
