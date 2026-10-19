import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Megaphone, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

const DEFAULT_TITLE = "PostMePlex just got an update! ⚡";
const DEFAULT_BODY = "A fresh update is live — open the app to see what's new.";

// Every navigable web page, grouped. When a user taps the notification (browser
// push OR in-app), they land here. Dynamic routes (needing a specific id) are
// omitted since they can't be linked to generically.
const PAGE_GROUPS = [
  { group: "Main", pages: [
    { url: "/", label: "Home feed" },
    { url: "/discover", label: "Discover" },
    { url: "/notifications", label: "Notifications" },
    { url: "/profile", label: "My profile" },
    { url: "/settings", label: "Settings" },
  ] },
  { group: "Content", pages: [
    { url: "/blogs", label: "Blogs" },
    { url: "/blogs/new", label: "Write a blog" },
    { url: "/blogs/request", label: "Request a blog" },
    { url: "/videos", label: "Videos" },
    { url: "/videos/new", label: "Upload a video" },
    { url: "/reels", label: "Reels" },
    { url: "/reels/new", label: "Upload a reel" },
    { url: "/music", label: "Music" },
  ] },
  { group: "Social & Live", pages: [
    { url: "/messages", label: "Messages" },
    { url: "/livechat", label: "Live Chat board" },
    { url: "/live", label: "Live feed" },
    { url: "/live/new", label: "Go live" },
  ] },
  { group: "Features", pages: [
    { url: "/market", label: "Marketplace" },
    { url: "/wallet", label: "Wallet" },
    { url: "/pet", label: "Pet" },
    { url: "/games", label: "Games hub" },
  ] },
  { group: "Auth", pages: [
    { url: "/login", label: "Login" },
    { url: "/register", label: "Register" },
  ] },
  { group: "Admin (super-admin only)", pages: [
    { url: "/admin/announce", label: "Announce" },
    { url: "/admin/verify", label: "Verify accounts" },
    { url: "/admin/curate", label: "Curate" },
    { url: "/admin/accounts", label: "Accounts" },
    { url: "/admin/remembering", label: "Remembering" },
    { url: "/admin/blogs", label: "Blogs (admin)" },
    { url: "/admin/reset-pins", label: "Reset PINs" },
    { url: "/admin/keys", label: "API keys" },
    { url: "/admin/games", label: "Games (admin)" },
  ] },
];

const labelFor = (url) => {
  for (const g of PAGE_GROUPS) {
    const p = g.pages.find((x) => x.url === url);
    if (p) return p.label;
  }
  return url;
};

// Admin → Announce update: super-admin web-pushes all subscribed users + drops
// an in-app notification for everyone. Use it right after you Publish a new build.
export default function AdminAnnouncePage() {
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [url, setUrl] = useState("/");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const send = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    if (!window.confirm(`Send this announcement to ALL users?\n\nTapping it opens: ${labelFor(url)} (${url})`)) return;
    setSending(true);
    setResult(null);
    try {
      const r = await api.post("/admin/broadcast", { title: title.trim(), body: body.trim(), url });
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

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Open this page when tapped</label>
          <Select value={url} onValueChange={setUrl}>
            <SelectTrigger className="h-11" data-testid="announce-url-select">
              <SelectValue placeholder="Choose a page" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {PAGE_GROUPS.map((g) => (
                <SelectGroup key={g.group}>
                  <SelectLabel>{g.group}</SelectLabel>
                  {g.pages.map((p) => (
                    <SelectItem key={p.url} value={p.url} data-testid={`announce-url-option-${p.url}`}>
                      {p.label} <span className="text-muted-foreground">· {p.url}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview</div>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">⚡</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{title || "Title"}</div>
              <div className="text-sm text-muted-foreground">{body || "Message"}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Opens: <span className="font-semibold text-foreground">{labelFor(url)}</span> ({url})</div>
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
