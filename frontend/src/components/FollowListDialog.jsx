import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, BadgeCheck, Lock, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { userPath } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Modal listing a user's followers or the accounts they follow.
 * `kind` is "followers" | "following". Fetches on open.
 */
export function FollowListDialog({ open, onClose, userId, kind, title }) {
  const { user: me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [priv, setPriv] = useState(false);
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await api.get(`/users/${userId}/${kind}`);
      setPriv(!!data.private);
      setUsers(data.users || []);
    } catch (e) {
      toast.error(e.message || "Couldn't load list");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [userId, kind]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggleFollow = async (u) => {
    if (!me) return toast.error("Sign in to follow");
    const next = !u.follows_them;
    setUsers((rows) => rows.map((r) => (r.id === u.id ? { ...r, follows_them: next } : r)));
    try {
      if (next) await api.post(`/users/${u.id}/follow`);
      else await api.del(`/users/${u.id}/follow`);
    } catch (e) {
      setUsers((rows) => rows.map((r) => (r.id === u.id ? { ...r, follows_them: !next } : r)));
      toast.error(e.message || "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0" data-testid={`follow-list-${kind}`}>
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base capitalize">{title || kind}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : priv ? (
            <EmptyRow icon={<Lock size={26} />} text="This list is private." />
          ) : users.length === 0 ? (
            <EmptyRow
              icon={<Users size={26} />}
              text={kind === "followers" ? "No followers yet." : "Not following anyone yet."}
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2.5" data-testid={`follow-row-${u.id}`}>
                  <Link to={userPath(u)} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar src={u.avatar_url} size={44} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 truncate font-semibold">
                        {u.display_name}
                        {u.is_verified && <BadgeCheck size={14} className="shrink-0 fill-primary text-background" />}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                    </div>
                  </Link>
                  {me && !u.is_me && (
                    <Button
                      size="sm"
                      onClick={() => toggleFollow(u)}
                      variant={u.follows_them ? "outline" : "default"}
                      className={
                        u.follows_them
                          ? "border-border bg-transparent hover:bg-secondary"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }
                      data-testid={`follow-row-btn-${u.id}`}
                    >
                      {u.follows_them ? "Following" : "Follow"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRow({ icon, text }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
