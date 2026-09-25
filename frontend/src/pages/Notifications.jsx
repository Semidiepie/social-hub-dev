import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Bell, Heart, MessageCircle, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
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
    if (n.post_id) navigate(`/posts/${n.post_id}`);
    else if (n.actor_id) navigate(`/user/${n.actor_id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">Notifications</h1>
        {items.some((n) => !n.read) && (
          <Button variant="outline" onClick={markAll} data-testid="notifications-mark-all">
            Mark all read
          </Button>
        )}
      </header>

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
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <li
                key={n.id}
                onClick={() => openNotification(n)}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors hover:border-primary/50 ${
                  n.read ? "border-border bg-card/50" : "border-primary/30 bg-primary/5"
                }`}
                data-testid={`notif-${n.id}`}
              >
                <Avatar src={n.actor_avatar} size={40} />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{n.actor_name}</span>{" "}
                  <span className="text-muted-foreground">{n.text}</span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</div>
                </div>
                <Icon size={16} className={n.read ? "text-muted-foreground" : "text-primary"} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
