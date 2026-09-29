import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, MessageCircle, BadgeCheck, Settings as SettingsIcon, Play, Heart, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { shareUrl, origin } from "@/lib/share";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber, timeAgo, badgeCls } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { FollowListDialog } from "@/components/FollowListDialog";
import { toast } from "sonner";

// Referral "Connector" tiers — honest social proof from real invited signups.
function connectorTier(n) {
  n = n || 0;
  if (n >= 10) return { icon: "🔗", label: "Super Connector" };
  if (n >= 5) return { icon: "🔗", label: "Connector" };
  if (n >= 1) return { icon: "🌱", label: "Inviter" };
  return null;
}

export default function ProfilePage() {
  const { user: me } = useAuth();
  const { userId, handle } = useParams();
  const navigate = useNavigate();
  // Resolve by @handle (username) or legacy user id, else fall back to me.
  const lookupKey = handle ? handle.replace(/^@/, "") : userId || me?.id;
  const [target, setTarget] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reels, setReels] = useState([]);
  const [videos, setVideos] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followList, setFollowList] = useState(null); // "followers" | "following" | null

  const isSelf = !!me && !!target && me.id === target.id;

  const load = useCallback(async () => {
    if (!lookupKey) return;
    setLoading(true);
    setContentLoading(true);
    try {
      const u = await api.get(`/users/${encodeURIComponent(lookupKey)}`);
      // Canonical URL: rewrite a legacy /user/:id link to the clean /@handle form.
      if (userId && u.username) {
        navigate(`/@${u.username}`, { replace: true });
        return;
      }
      // Show the header immediately; load tab content behind skeletons.
      setTarget(u);
      setFollowing(u.follows_them);
      setLoading(false);
      const rid = u.id;
      const [p, r, v, b] = await Promise.all([
        api.get(`/users/${rid}/posts`).catch(() => []),
        api.get(`/users/${rid}/reels`).catch(() => []),
        api.get(`/users/${rid}/videos`).catch(() => []),
        api.get(`/blogs/user/${rid}`).catch(() => []),
      ]);
      setPosts(p);
      setReels(r);
      setVideos(v);
      setBlogs(b);
    } catch (e) {
      toast.error(e.message || "User not found");
      navigate("/discover");
    } finally {
      setLoading(false);
      setContentLoading(false);
    }
  }, [lookupKey, userId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!me) return navigate("/login");
    setBusy(true);
    try {
      if (following) await api.del(`/users/${target.id}/follow`);
      else await api.post(`/users/${target.id}/follow`);
      setFollowing((f) => !f);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const startDM = async () => {
    if (!me) return navigate("/login");
    try {
      const c = await api.post("/conversations", { member_ids: [target.id] });
      navigate(`/messages/${c.id}`);
    } catch (e) {
      toast.error(e.message || "Failed");
    }
  };

  const initialTab = useMemo(() => {
    if (reels.length) return "reels";
    if (blogs.length) return "blogs";
    if (videos.length) return "videos";
    return "posts";
  }, [reels.length, blogs.length, videos.length]);

  if (loading || !target) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl" data-testid={`profile-${target.id}`}>
      <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-6">
          <Avatar src={target.avatar_url} size={80} frame={target.frame_enabled ? target.equipped_frame : null} className="h-20 w-20 flex-shrink-0 sm:h-24 sm:w-24" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{target.display_name}</h1>
                  {target.is_verified && <BadgeCheck size={20} className={`flex-shrink-0 ${badgeCls(target)}`} />}
                  {target.is_official && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary" data-testid="official-badge">
                      Official
                    </span>
                  )}
                </div>
                {target.remembering && (
                  <span
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-400"
                    data-testid="remembering-label"
                  >
                    Remembering
                  </span>
                )}
                <p className="mt-1 truncate text-sm text-muted-foreground">@{target.username}</p>
                {connectorTier(target.invites_count) && (
                  <span
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary"
                    data-testid="profile-connector-badge"
                  >
                    {connectorTier(target.invites_count).icon} {connectorTier(target.invites_count).label}
                  </span>
                )}
              </div>
              <div className="flex flex-shrink-0 gap-2">
                {isSelf ? (
                  <>
                    <Button onClick={() => navigate("/settings")} variant="outline" className="flex-1 gap-2 sm:flex-none" data-testid="profile-settings-btn">
                      <SettingsIcon size={16} /> Edit profile
                    </Button>
                    <Button
                      onClick={() =>
                        shareUrl(
                          `${origin()}/api/share/u/${target.username}`,
                          `Join me on PostMePlex`,
                          "Invite link copied — share it to grow your followers!",
                        )
                      }
                      className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none"
                      data-testid="profile-invite-btn"
                    >
                      <Share2 size={16} /> Invite
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={toggleFollow}
                      disabled={busy}
                      className={
                        following
                          ? "flex-1 border-border bg-transparent hover:bg-secondary sm:flex-none"
                          : "flex-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none"
                      }
                      variant={following ? "outline" : "default"}
                      data-testid="profile-follow-btn"
                    >
                      {following ? "Following" : "Follow"}
                    </Button>
                    <Button variant="outline" onClick={startDM} className="flex-1 gap-2 sm:flex-none" data-testid="profile-message-btn">
                      <MessageCircle size={16} /> Message
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => shareUrl(`${origin()}/api/share/u/${target.username}`, `${target.display_name} on PostMePlex`, "Profile link copied!")}
                      className="gap-2"
                      data-testid="profile-share-btn"
                    >
                      <Share2 size={16} />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {target.bio && <p className="mt-3 max-w-lg text-sm">{target.bio}</p>}
            <div className="mt-4 flex items-center gap-5 text-sm sm:gap-6">
              <Stat label="Posts" value={target.posts_count} />
              <Stat
                label="Followers"
                value={target.followers}
                onClick={() => setFollowList("followers")}
                testId="profile-followers-stat"
              />
              <Stat
                label="Following"
                value={target.following}
                onClick={() => setFollowList("following")}
                testId="profile-following-stat"
              />
              {target.invites_count > 0 && (
                <Stat label="Invited" value={target.invites_count} testId="profile-invited-stat" />
              )}
            </div>
          </div>
        </div>
      </header>

      <Tabs defaultValue={initialTab} key={initialTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="posts" data-testid="profile-tab-posts">Posts{contentLoading ? "" : ` · ${posts.length}`}</TabsTrigger>
          <TabsTrigger value="reels" data-testid="profile-tab-reels">Reels{contentLoading ? "" : ` · ${reels.length}`}</TabsTrigger>
          <TabsTrigger value="videos" data-testid="profile-tab-videos">Videos{contentLoading ? "" : ` · ${videos.length}`}</TabsTrigger>
          <TabsTrigger value="blogs" data-testid="profile-tab-blogs">Blogs{contentLoading ? "" : ` · ${blogs.length}`}</TabsTrigger>
        </TabsList>
        <TabsContent value="posts">
          {contentLoading ? <TileGridSkeleton aspect="square" /> : <PostsGrid posts={posts} />}
        </TabsContent>
        <TabsContent value="reels">
          {contentLoading ? <TileGridSkeleton aspect="reel" /> : <ReelsGrid reels={reels} />}
        </TabsContent>
        <TabsContent value="videos">
          {contentLoading ? <VideosSkeleton /> : <VideosGrid videos={videos} />}
        </TabsContent>
        <TabsContent value="blogs">
          {contentLoading ? <BlogsSkeleton /> : <BlogsList blogs={blogs} />}
        </TabsContent>
      </Tabs>

      <FollowListDialog
        open={!!followList}
        onClose={() => setFollowList(null)}
        userId={target.id}
        kind={followList || "followers"}
        title={followList === "following" ? "Following" : "Followers"}
      />
    </div>
  );
}

function Stat({ label, value, onClick, testId }) {
  const content = (
    <>
      <div className="text-lg font-black">{formatNumber(value)}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className="rounded-lg text-left transition-colors hover:text-primary focus:outline-none"
      >
        {content}
      </button>
    );
  }
  return <div>{content}</div>;
}

function PostsGrid({ posts }) {
  if (posts.length === 0) return <Empty msg="No posts yet." />;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {posts.map((p) => (
        <Link
          key={p.id}
          to={`/posts/${p.id}`}
          className="group relative aspect-square overflow-hidden rounded-xl bg-secondary"
          data-testid={`post-tile-${p.id}`}
        >
          {p.image_url ? (
            <img src={p.image_url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          ) : p.video_url ? (
            <>
              {p.thumbnail_url ? (
                <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video src={p.video_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              )}
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60">
                <Play size={13} className="fill-white text-white" />
              </span>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
              {p.caption || "—"}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

function ReelsGrid({ reels }) {
  if (reels.length === 0) return <Empty msg="No reels yet." />;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {reels.map((r) => (
        <Link
          key={r.id}
          to={`/reels/${r.id}`}
          className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-secondary"
          data-testid={`reel-tile-${r.id}`}
        >
          {r.thumbnail_url || r.image_url ? (
            <img src={r.thumbnail_url || r.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <video src={r.video_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between text-[11px] font-semibold text-white">
            <span className="inline-flex items-center gap-1"><Play size={12} className="fill-white" /> {formatNumber(r.views || 0)}</span>
            <span className="inline-flex items-center gap-1"><Heart size={12} className="fill-white" /> {formatNumber(r.likes || 0)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function VideosGrid({ videos }) {
  if (videos.length === 0) return <Empty msg="No videos yet." />;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
      {videos.map((v) => (
        <Link key={v.id} to={`/videos/${v.id}`} className="group overflow-hidden rounded-xl border border-border bg-card">
          <div className="aspect-video bg-secondary">
            {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="p-3">
            <div className="line-clamp-2 text-sm font-bold group-hover:text-primary">{v.title}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{timeAgo(v.created_at)}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function BlogsList({ blogs }) {
  if (blogs.length === 0) return <Empty msg="No published blogs yet." />;
  return (
    <div className="mt-4 space-y-3">
      {blogs.map((b) => (
        <Link
          key={b.id}
          to={`/blogs/${b.id}`}
          className="flex gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/40"
        >
          {b.cover_url && (
            <img src={b.cover_url} alt="" className="h-24 w-32 flex-shrink-0 rounded-xl object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 font-bold">{b.title}</div>
            {b.subtitle && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.subtitle}</div>}
            <div className="mt-2 text-[11px] text-muted-foreground">
              {b.reading_time || 1} min · {timeAgo(b.published_at || b.created_at)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card/60 p-10 text-center text-muted-foreground">
      {msg}
    </div>
  );
}

function TileGridSkeleton({ aspect = "square" }) {
  const cols = aspect === "reel" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-2 sm:grid-cols-3";
  const ratio = aspect === "reel" ? "aspect-[9/16]" : "aspect-square";
  return (
    <div className={`mt-4 grid gap-2 ${cols}`} data-testid="profile-tab-skeleton">
      {Array.from({ length: aspect === "reel" ? 8 : 6 }).map((_, i) => (
        <Skeleton key={i} className={`w-full rounded-xl ${ratio}`} />
      ))}
    </div>
  );
}

function VideosSkeleton() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3" data-testid="profile-tab-skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BlogsSkeleton() {
  return (
    <div className="mt-4 space-y-3" data-testid="profile-tab-skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-24 w-32 flex-shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
