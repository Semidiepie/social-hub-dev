import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, MessageCircle, BadgeCheck, Settings as SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber, timeAgo } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user: me } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();
  const targetId = userId || me?.id;
  const [target, setTarget] = useState(null);
  const [posts, setPosts] = useState([]);
  const [videos, setVideos] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = me?.id === targetId;

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const [u, p, v, b] = await Promise.all([
        api.get(`/users/${targetId}`),
        api.get(`/users/${targetId}/posts`).catch(() => []),
        api.get(`/users/${targetId}/videos`).catch(() => []),
        api.get(`/blogs/user/${targetId}`).catch(() => []),
      ]);
      setTarget(u);
      setFollowing(u.follows_them);
      setPosts(p);
      setVideos(v);
      setBlogs(b);
    } catch (e) {
      toast.error(e.message || "User not found");
      navigate("/discover");
    } finally {
      setLoading(false);
    }
  }, [targetId, navigate]);

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
    if (blogs.length) return "blogs";
    if (videos.length) return "videos";
    return "posts";
  }, [blogs.length, videos.length]);

  if (loading || !target) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl" data-testid={`profile-${target.id}`}>
      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start gap-6">
          <Avatar src={target.avatar_url} size={96} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">{target.display_name}</h1>
              {target.is_verified && <BadgeCheck size={20} className="fill-primary text-background" />}
            </div>
            <p className="text-sm text-muted-foreground">@{target.username}</p>
            {target.bio && <p className="mt-3 max-w-lg text-sm">{target.bio}</p>}
            <div className="mt-4 flex items-center gap-4 text-sm">
              <Stat label="Posts" value={target.posts_count} />
              <Stat label="Followers" value={target.followers} />
              <Stat label="Following" value={target.following} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {isSelf ? (
              <Button onClick={() => navigate("/settings")} variant="outline" className="gap-2" data-testid="profile-settings-btn">
                <SettingsIcon size={16} /> Edit profile
              </Button>
            ) : (
              <>
                <Button
                  onClick={toggleFollow}
                  disabled={busy}
                  className={
                    following
                      ? "border-border bg-transparent hover:bg-secondary"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }
                  variant={following ? "outline" : "default"}
                  data-testid="profile-follow-btn"
                >
                  {following ? "Following" : "Follow"}
                </Button>
                <Button variant="outline" onClick={startDM} className="gap-2" data-testid="profile-message-btn">
                  <MessageCircle size={16} /> Message
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <Tabs defaultValue={initialTab} key={initialTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="posts" data-testid="profile-tab-posts">Posts · {posts.length}</TabsTrigger>
          <TabsTrigger value="videos" data-testid="profile-tab-videos">Videos · {videos.length}</TabsTrigger>
          <TabsTrigger value="blogs" data-testid="profile-tab-blogs">Blogs · {blogs.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="posts">
          <PostsGrid posts={posts} />
        </TabsContent>
        <TabsContent value="videos">
          <VideosGrid videos={videos} />
        </TabsContent>
        <TabsContent value="blogs">
          <BlogsList blogs={blogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-lg font-black">{formatNumber(value)}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function PostsGrid({ posts }) {
  if (posts.length === 0) return <Empty msg="No posts yet." />;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {posts.map((p) => (
        <div key={p.id} className="aspect-square overflow-hidden rounded-xl bg-secondary">
          {p.image_url ? (
            <img src={p.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
              {p.caption || "—"}
            </div>
          )}
        </div>
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
