import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send, Radio, Trash2, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { timeAgo, badgeCls, badgeStyle } from "@/lib/format";
import { toast } from "sonner";

export default function LiveChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const lastAtRef = useRef("");
  const seenRef = useRef(new Set());

  const atBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const merge = useCallback((incoming) => {
    if (!incoming || incoming.length === 0) return;
    const fresh = incoming.filter((m) => !seenRef.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenRef.current.add(m.id));
    lastAtRef.current = fresh[fresh.length - 1].created_at || lastAtRef.current;
    const stick = atBottom();
    setMessages((prev) => [...prev, ...fresh]);
    if (stick) requestAnimationFrame(scrollToBottom);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await api.get("/livechat", false);
        if (!alive) return;
        rows.forEach((m) => seenRef.current.add(m.id));
        if (rows.length) lastAtRef.current = rows[rows.length - 1].created_at;
        setMessages(rows);
        requestAnimationFrame(scrollToBottom);
      } catch { /* noop */ } finally {
        if (alive) setLoading(false);
      }
    })();
    const t = setInterval(async () => {
      try {
        const q = lastAtRef.current ? `?after=${encodeURIComponent(lastAtRef.current)}` : "";
        const rows = await api.get(`/livechat${q}`, false);
        merge(rows);
      } catch { /* noop */ }
    }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [merge]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (!user) { navigate("/login"); return; }
    setSending(true);
    try {
      const m = await api.post("/livechat", { text: t });
      setText("");
      merge([m]);
      requestAnimationFrame(scrollToBottom);
    } catch (err) {
      toast.error(err.message || "Couldn't send");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    const prev = messages;
    setMessages((rows) => rows.filter((m) => m.id !== id));
    try {
      await api.del(`/livechat/${id}`);
    } catch (err) {
      setMessages(prev);
      toast.error(err.message || "Couldn't delete");
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-1rem)] w-full max-w-3xl flex-col p-2 sm:p-4" data-testid="livechat-page">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-3 border-b border-border p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Radio size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-black">
              Live Chat
              <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">Chat live with the whole PostMePlex community</div>
          </div>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : messages.length === 0 ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">No messages yet — be the first to say hi 👋</div>
          ) : (
            messages.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className="group flex items-start gap-2.5" data-testid={`livechat-msg-${m.id}`}>
                  <button onClick={() => navigate(`/user/${m.user_id}`)} className="shrink-0" aria-label={`${m.username} profile`}>
                    <Avatar src={m.avatar_url} size={38} frame={m.frame} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/user/${m.user_id}`)} className="truncate text-sm font-bold hover:underline">
                        {m.display_name || m.username}
                      </button>
                      {m.is_verified && <BadgeCheck size={14} className={badgeCls(m, "shrink-0")} style={badgeStyle(m)} data-testid="livechat-badge" />}
                      <span className="truncate text-[11px] text-muted-foreground">@{m.username}</span>
                      <span className="text-[11px] text-muted-foreground">· {timeAgo(m.created_at)}</span>
                      {mine && (
                        <button onClick={() => remove(m.id)} title="Delete" aria-label="Delete message"
                          className="ml-auto rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          data-testid={`livechat-delete-${m.id}`}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm text-foreground">{m.text}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={user ? "Message the community…" : "Log in to join the chat"}
            disabled={!user}
            className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/60 disabled:opacity-60"
            data-testid="livechat-input"
          />
          <Button type="submit" disabled={sending || !text.trim()} className="h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90" data-testid="livechat-send">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </form>
      </section>
    </div>
  );
}
