import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Send, MessageSquare, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

export default function MessagesPage() {
  const { user } = useAuth();
  const { convId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    try {
      const rows = await api.get("/conversations");
      setConversations(rows);
    } catch (e) {
      toast.error(e.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 8000);
    return () => clearInterval(t);
  }, [loadConversations]);

  const active = useMemo(
    () => conversations.find((c) => c.id === convId) || null,
    [conversations, convId],
  );

  return (
    <div className="grid gap-0 md:grid-cols-[320px_1fr]" style={{ minHeight: "min(calc(100vh - 120px), 900px)" }}>
      <aside className={`rounded-2xl border border-border bg-card md:mr-4 ${convId ? "hidden md:block" : ""}`}>
        <div className="border-b border-border p-4">
          <h1 className="text-xl font-black">Messages</h1>
        </div>
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No conversations yet. Start one from someone's profile.
          </div>
        ) : (
          <ul className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => navigate(`/messages/${c.id}`)}
                  className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-secondary/50 ${
                    convId === c.id ? "bg-secondary/70" : ""
                  }`}
                  data-testid={`conv-${c.id}`}
                >
                  <Avatar src={c.avatar_url} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-semibold text-sm">{c.title}</span>
                      {c.last_message?.created_at && (
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.last_message.created_at)}</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.last_message?.text || (c.is_group ? "New squad chat" : "Say hi 👋")}
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-primary-foreground">
                      {c.unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {convId ? (
        <ChatPane conv={active} me={user} onBack={() => navigate("/messages")} />
      ) : (
        <div className="hidden items-center justify-center rounded-2xl border border-border bg-card/60 p-10 text-center md:flex">
          <div>
            <MessageSquare size={44} className="mx-auto text-muted-foreground" />
            <h3 className="mt-3 text-lg font-bold">Select a conversation</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Or open someone's profile to DM them.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatPane({ conv, me, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!conv) return;
    try {
      const rows = await api.get(`/conversations/${conv.id}/messages`);
      setMessages(rows);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [conv]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    load();
    if (!conv) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [conv, load]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !conv) return;
    const draft = text.trim();
    setText("");
    setSending(true);
    try {
      const m = await api.post(`/conversations/${conv.id}/messages`, { text: draft });
      setMessages((prev) => [...prev, m]);
    } catch (err) {
      toast.error(err.message || "Failed to send");
      setText(draft);
    } finally {
      setSending(false);
    }
  };

  if (!conv) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card/60 p-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1 text-muted-foreground hover:bg-secondary md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <Avatar src={conv.avatar_url} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{conv.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {conv.members.map((m) => m.display_name).join(", ")}
          </div>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ minHeight: 300 }}>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="mt-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hi 👋
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === me?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                  }`}
                  data-testid={`msg-${m.id}`}
                >
                  {!mine && conv.is_group && (
                    <div className="mb-0.5 text-[10px] font-bold text-primary">{m.sender_username}</div>
                  )}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {timeAgo(m.created_at)}
                  </div>
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
          placeholder="Type a message…"
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/60"
          data-testid="chat-input"
        />
        <Button
          type="submit"
          disabled={sending || !text.trim()}
          className="h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90"
          data-testid="chat-send"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>
    </section>
  );
}
