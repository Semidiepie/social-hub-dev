import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Megaphone, Send, Search, X } from "lucide-react";
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
// push OR in-app), they land here. Dynamic routes (profiles/posts) are handled
// by the Profile/Post pickers below instead.
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

const pageLabelFor = (url) => {
  for (const g of PAGE_GROUPS) {
    const p = g.pages.find((x) => x.url === url);
    if (p) return p.label;
  }
  return url;
};

const MODES = [
  { key: "page", label: "A page" },
  { key: "profile", label: "A profile" },
  { key: "post", label: "A post" },
];

// Admin → Announce update: super-admin web-pushes all subscribed users + drops
// an in-app notification for everyone. Use it right after you Publish a new build.
export default function AdminAnnouncePage() {
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Destination
  const [mode, setMode] = useState("page");        // page | profile | post
  const [pageUrl, setPageUrl] = useState("/");      // selected static page
  const [picked, setPicked] = useState(null);       // { url, label } for a profile/post
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ users: [], posts: [] });
  const [searching, setSearching] = useState(false);

  // Resolve the final destination from the active mode.
  const url = mode === "page" ? pageUrl : (picked?.url || "");
  const urlLabel = mode === "page" ? pageLabelFor(pageUrl) : (picked?.label || "");

  // Debounced live search for profiles/posts.
  useEffect(() => {
    if (mode === "page") return;
    const q = query.trim();
    if (!q) { setResults({ users: [], posts: [] }); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) setResults({ users: r.users || [], posts: r.posts || [] });
      } catch {
        if (!cancelled) setResults({ users: [], posts: [] });
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, mode]);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const switchMode = (m) => {
    setMode(m);
    setPicked(null);
    setQuery("");
    setResults({ users: [], posts: [] });
  };

  const pickUser = (u) => setPicked({ url: `/user/${u.id}`, label: `@${u.username}` });
  const pickPost = (p) => setPicked({
    url: `/posts/${p.id}`,
    label: `Post by @${p.author?.username || "unknown"}${p.caption ? ` · ${p.caption.slice(0, 40)}` : ""}`,
  });

  const send = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    if (!url) { toast.error("Pick a destination first"); return; }
    if (!window.confirm(`Send this announcement to ALL users?\n\nTapping it opens: ${urlLabel} (${url})`)) return;
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

        {/* Destination */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Open this when tapped</label>
          <div className="flex gap-2" data-testid="announce-mode-tabs">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => switchMode(m.key)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${mode === m.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
                data-testid={`announce-mode-${m.key}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "page" && (
            <Select value={pageUrl} onValueChange={setPageUrl}>
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
          )}

          {mode !== "page" && (
            <div className="space-y-2">
              {picked ? (
                <div className="flex items-center justify-between rounded-xl border border-primary bg-primary/10 px-4 py-3" data-testid="announce-picked">
                  <span className="truncate text-sm font-semibold text-primary">{picked.label} <span className="text-primary/60">· {picked.url}</span></span>
                  <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-primary/70 hover:text-primary" data-testid="announce-picked-clear">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={mode === "profile" ? "Search a username or name…" : "Search posts by caption or #tag…"}
                      className="h-11 pl-9"
                      data-testid="announce-search-input"
                    />
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto" data-testid="announce-search-results">
                    {searching && <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>}
                    {!searching && query.trim() && mode === "profile" && results.users.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No profiles found.</p>}
                    {!searching && query.trim() && mode === "post" && results.posts.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No posts found.</p>}

                    {mode === "profile" && results.users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => pickUser(u)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-accent"
                        data-testid={`announce-user-${u.id}`}
                      >
                        <img src={u.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{u.display_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                        </span>
                      </button>
                    ))}

                    {mode === "post" && results.posts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickPost(p)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-accent"
                        data-testid={`announce-post-${p.id}`}
                      >
                        {p.image_url
                          ? <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                          : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">Aa</span>}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{p.caption || "(no caption)"}</span>
                          <span className="block truncate text-xs text-muted-foreground">by @{p.author?.username || "unknown"}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview</div>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">⚡</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{title || "Title"}</div>
              <div className="text-sm text-muted-foreground">{body || "Message"}</div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">Opens: <span className="font-semibold text-foreground">{urlLabel || "— nothing selected —"}</span>{url ? ` (${url})` : ""}</div>
            </div>
          </div>
        </div>

        <Button
          onClick={send}
          disabled={sending || !title.trim() || !body.trim() || !url}
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
