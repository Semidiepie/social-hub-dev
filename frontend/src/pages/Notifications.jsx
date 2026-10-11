import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Bell, Heart, MessageCircle, UserPlus, PawPrint, Megaphone, Radio } from "lucide-react";
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

  // Route a notification to the thing it's about: a follow → the actor's
  // profile; a like/comment → the post/reel it references.
  const openNotification = (n) => {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    if (n.type === "live") navigate(n.link || `/live/${n.live_stream_id || ""}`);
    else if (n.type === "pet") navigate("/pet");
    else if (n.type === "update") navigate("/");
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
