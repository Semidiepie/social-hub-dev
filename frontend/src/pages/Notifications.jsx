import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Bell, Heart, MessageCircle, UserPlus, PawPrint, Megaphone, Radio, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  pet: PawPrint,
  update: Megaphone,
  live: Radio,
  collab_invite: Users,
  collab_accept: Users,
  collab_decline: Users,
};

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const rows = await api.get("/notifications");
      setItems(rows);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    await api.post("/notifications/read-all").catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const respondCollab = async (e, n, action) => {
    e.stopPropagation();
    try {
      await api.post(`/collab/invites/${n.collab_invite_id}/${action}`, {});
      toast.success(action === "accept" ? "Collab accepted — it's live on both profiles!" : "Invite declined");
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      toast.error(err.message || "Couldn't respond");
      if (String(err.message || "").toLowerCase().includes("handled")) setItems((prev) => prev.filter((x) => x.id !== n.id));
    }
  };

  // Route a notification to the thing it's about: a follow → the actor's
  // profile; a like/comment → the post/reel it references.
  const openNotification = (n) => {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    if (n.type === "live") navigate(n.link || `/live/${n.live_stream_id || ""}`);
    else if (n.type === "pet") navigate("/pet");
    else if (n.type === "update") navigate(n.link || "/");
    else if (n.link) navigate(n.link);
    else if (n.video_id) navigate(`/videos/${n.video_id}`);
    else if (n.post_id) navigate(`/posts/${n.post_id}`);
    else if (n.actor_id) navigate(`/user/${n.actor_id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={Bell}
        title="Notifications"
        right={
          items.some((n) => !n.read) && (
            <Button variant="outline" onClick={markAll} data-testid="notifications-mark-all">
              Mark all read
            </Button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
          <Bell size={30} className="mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold">You&apos;re all caught up</h3>
          <p className="mt-1 text-sm text-muted-foreground">New activity will show here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border" data-testid="notifications-list">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <li
                key={n.id}
                onClick={() => openNotification(n)}
                className={`relative flex cursor-pointer items-center gap-3 px-3 py-3.5 transition-colors hover:bg-secondary/40 ${
                  n.read ? "" : "bg-primary/[0.06]"
                }`}
                data-testid={`notif-${n.id}`}
              >
                {!n.read && <span className="absolute left-0 top-0 h-full w-1 rounded-r bg-primary" />}
                <Avatar src={n.actor_avatar} size={44} />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{n.actor_name}</span>{" "}
                  <span className="text-muted-foreground">{n.text}</span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</div>
                  {n.type === "collab_invite" && n.collab_invite_id && (
                    <>
                    {(n.preview_image || n.preview_caption) && (
                      <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-border bg-background/60 p-2" data-testid={`collab-preview-${n.id}`}>
                        {n.preview_image && (
                          <img src={n.preview_image} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
                        )}
                        <span className="min-w-0 text-xs text-muted-foreground">
                          <span className="font-semibold uppercase tracking-wide text-primary">{n.preview_kind === "reel" ? "Reel" : "Post"}</span>
                          {n.preview_caption ? <span className="ml-1 line-clamp-2">{n.preview_caption}</span> : <span className="ml-1 italic">No caption</span>}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={(e) => respondCollab(e, n, "accept")}
                        className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
                        data-testid={`collab-accept-${n.id}`}
                      >
                        Accept
                      </button>
                      <button
                        onClick={(e) => respondCollab(e, n, "decline")}
                        className="rounded-full border border-border px-3.5 py-1.5 text-xs font-bold hover:border-destructive hover:text-destructive"
                        data-testid={`collab-decline-${n.id}`}
                      >
                        Decline
                      </button>
                    </div>
                    </>
                  )}
                </div>
                <Icon size={16} className={n.read ? "text-muted-foreground" : "text-primary"} />
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
