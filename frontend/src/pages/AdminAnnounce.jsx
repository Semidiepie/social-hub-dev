import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Megaphone, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

const DEFAULT_TITLE = "PostMePlex just got an update! ⚡";
const DEFAULT_BODY = "A fresh update is live — open the app to see what's new.";

// Admin → Announce update: super-admin web-pushes all subscribed users + drops
// an in-app notification for everyone. Use it right after you Publish a new build.
export default function AdminAnnouncePage() {
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const send = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    if (!window.confirm("Send this announcement to ALL users?")) return;
    setSending(true);
    setResult(null);
    try {
      const r = await api.post("/admin/broadcast", { title: title.trim(), body: body.trim(), url: "/" });
      setResult(r);
      toast.success(`Sent! ${r.notified_users} users notified, ${r.pushed_users} got a push.`);
    } catch (e) {
      toast.error(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-announce-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Megaphone size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Announce a new live update to everyone — sends a browser push to subscribed users and an in-app alert to all.</p>
      </header>

      <AdminTabs />

      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-5">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="h-11"
            data-testid="announce-title"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={200}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            data-testid="announce-body"
          />
          <p className="text-right text-[11px] text-muted-foreground">{body.length}/200</p>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview</div>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">⚡</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{title || "Title"}</div>
              <div className="text-sm text-muted-foreground">{body || "Message"}</div>
            </div>
          </div>
        </div>

        <Button
          onClick={send}
          disabled={sending || !title.trim() || !body.trim()}
          className="h-12 w-full gap-2 bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
          data-testid="announce-send-btn"
        >
          {sending ? <><Loader2 className="h-5 w-5 animate-spin" /> Sending…</> : <><Send size={18} /> Send to all users</>}
        </Button>

        {result && (
          <p className="text-center text-sm text-muted-foreground" data-testid="announce-result">
            ✅ Notified <span className="font-bold text-foreground">{result.notified_users}</span> users · pushed to{" "}
            <span className="font-bold text-foreground">{result.pushed_users}</span> subscribed browsers.
          </p>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Tip: hit this right after you Publish a new build. Web push only reaches users who enabled browser notifications.
        </p>
      </div>
    </div>
  );
}
