import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2, Send, MessageSquare, ArrowLeft, Trash2, Phone, Video, BadgeCheck,
  Plus, Users, Settings as SettingsIcon, X, Check, UserPlus, LogOut, Search, ImagePlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { timeAgo, frameOf, badgeCls } from "@/lib/format";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";

export default function MessagesPage() {
  const { user } = useAuth();
  const { convId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

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

  const deleteConversation = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm("Delete this conversation? It will be removed from your list.")) return;
    const prev = conversations;
    setConversations((rows) => rows.filter((c) => c.id !== id));
    if (convId === id) navigate("/messages");
    try {
      await api.del(`/conversations/${id}`);
      toast.success("Conversation deleted");
    } catch (err) {
      setConversations(prev);
      toast.error(err.message || "Failed to delete");
    }
  };

  return (
    <div className="grid gap-0 md:grid-cols-[320px_1fr]" style={{ minHeight: "min(calc(100vh - 120px), 900px)" }}>
      <aside className={`rounded-2xl border border-border bg-card md:mr-4 ${convId ? "hidden md:block" : ""}`}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h1 className="text-xl font-black">Messages</h1>
          <button
            onClick={() => setShowNew(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            data-testid="new-chat-btn"
          >
            <Plus size={16} /> New
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No conversations yet. Tap <b>New</b> to start a chat or group.
          </div>
        ) : (
          <ul className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => navigate(`/messages/${c.id}`)}
                  className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 pr-10 text-left hover:bg-secondary/50 ${
                    convId === c.id ? "bg-secondary/70" : ""
                  }`}
                  data-testid={`conv-${c.id}`}
                >
                  <Avatar src={c.avatar_url} size={44} frame={c.is_group ? null : frameOf(c.peer)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                        {c.is_group && <Users size={13} className="shrink-0 text-muted-foreground" />}
                        <span className="truncate">{c.title}</span>
                        {!c.is_group && c.peer?.is_verified && <BadgeCheck size={13} className={badgeCls(c.peer, "shrink-0")} />}
                      </span>
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
                <button
                  onClick={(e) => deleteConversation(c.id, e)}
                  title="Delete conversation"
                  aria-label="Delete conversation"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  data-testid={`conv-delete-${c.id}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {convId ? (
        <ChatPane conv={active} me={user} onBack={() => navigate("/messages")} onChanged={loadConversations} onGone={() => navigate("/messages")} />
      ) : (
        <div className="hidden items-center justify-center rounded-2xl border border-border bg-card/60 p-10 text-center md:flex">
          <div>
            <MessageSquare size={44} className="mx-auto text-muted-foreground" />
            <h3 className="mt-3 text-lg font-bold">Select a conversation</h3>
            <p className="mt-1 text-sm text-muted-foreground">Or tap New to start a chat or group.</p>
          </div>
        </div>
      )}

      {showNew && (
        <NewChatDialog
          me={user}
          onClose={() => setShowNew(false)}
          onCreated={(c) => { setShowNew(false); loadConversations(); navigate(`/messages/${c.id}`); }}
        />
      )}
    </div>
  );
}

function ChatPane({ conv, me, onBack, onChanged, onGone }) {
  const { startCall } = useCall();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
    if (!conv) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [conv, load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
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

  const deleteMessage = async (id) => {
    if (!window.confirm("Delete this message?")) return;
    const prev = messages;
    setMessages((rows) => rows.filter((m) => m.id !== id));
    try {
      await api.del(`/messages/${id}`);
    } catch (err) {
      setMessages(prev);
      toast.error(err.message || "Failed to delete");
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
        <button onClick={onBack} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary md:hidden">
          <ArrowLeft size={18} />
        </button>
        <Avatar src={conv.avatar_url} size={36} frame={conv.is_group ? null : frameOf(conv.peer)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate font-bold">
            <span className="truncate">{conv.title}</span>
            {!conv.is_group && conv.peer?.is_verified && <BadgeCheck size={15} className={badgeCls(conv.peer, "shrink-0")} />}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {conv.is_group ? `${conv.members.length} members` : `@${conv.peer?.username || ""}`}
          </div>
        </div>
        <button onClick={() => startCall(conv, "audio")} title="Audio call" aria-label="Audio call"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary" data-testid="call-audio-btn">
          <Phone size={18} />
        </button>
        <button onClick={() => startCall(conv, "video")} title="Video call" aria-label="Video call"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary" data-testid="call-video-btn">
          <Video size={18} />
        </button>
        {conv.is_group && (
          <button onClick={() => setShowSettings(true)} title="Group settings" aria-label="Group settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary" data-testid="group-settings-btn">
            <SettingsIcon size={18} />
          </button>
        )}
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ minHeight: 300 }}>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="mt-10 text-center text-sm text-muted-foreground">No messages yet. Say hi 👋</div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === me?.id;
            return (
              <div key={m.id} className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && conv.is_group && (
                  <Avatar src={m.sender_avatar} size={28} frame={m.sender_frame} className="mb-4" />
                )}
                {mine && (
                  <button onClick={() => deleteMessage(m.id)} title="Delete message" aria-label="Delete message"
                    className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    data-testid={`msg-delete-${m.id}`}>
                    <Trash2 size={14} />
                  </button>
                )}
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`} data-testid={`msg-${m.id}`}>
                  {!mine && conv.is_group && (
                    <div className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-primary">
                      {m.sender_display_name || m.sender_username}
                      {m.sender_verified && <BadgeCheck size={11} className={badgeCls({ remembering: m.sender_remembering }, "shrink-0")} />}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/60" data-testid="chat-input" />
        <Button type="submit" disabled={sending || !text.trim()}
          className="h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90" data-testid="chat-send">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>

      {showSettings && (
        <GroupSettingsDialog
          conv={conv}
          me={me}
          onClose={() => setShowSettings(false)}
          onChanged={onChanged}
          onLeft={() => { setShowSettings(false); onGone(); onChanged(); }}
        />
      )}
    </section>
  );
}

// ---- User search box (shared) ----
function useUserSearch(me) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/search?q=${encodeURIComponent(term)}`);
        setResults((r.users || []).filter((u) => u.id !== me?.id));
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, me]);
  return { q, setQ, results, searching };
}

function Modal({ title, onClose, children, testId }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose} data-testid={testId}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-black">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-secondary"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewChatDialog({ me, onClose, onCreated }) {
  const { q, setQ, results, searching } = useUserSearch(me);
  const [groupMode, setGroupMode] = useState(false);
  const [selected, setSelected] = useState([]); // user objects
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (u) => {
    if (groupMode) {
      setSelected((s) => (s.find((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));
    } else {
      startOneToOne(u);
    }
  };

  const startOneToOne = async (u) => {
    setBusy(true);
    try {
      const c = await api.post("/conversations", { member_ids: [u.id] });
      onCreated(c);
    } catch (e) {
      toast.error(e.message || "Couldn't start chat");
    } finally { setBusy(false); }
  };

  const createGroup = async () => {
    if (selected.length < 2) { toast.error("Pick at least 2 people for a group"); return; }
    if (!groupName.trim()) { toast.error("Name your group"); return; }
    setBusy(true);
    try {
      const c = await api.post("/conversations", { member_ids: selected.map((u) => u.id), name: groupName.trim() });
      onCreated(c);
    } catch (e) {
      toast.error(e.message || "Couldn't create group");
    } finally { setBusy(false); }
  };

  return (
    <Modal title={groupMode ? "New group" : "New message"} onClose={onClose} testId="new-chat-dialog">
      <div className="p-4">
        <div className="mb-3 flex gap-2">
          <button onClick={() => setGroupMode(false)} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-bold ${!groupMode ? "bg-primary text-primary-foreground" : "bg-secondary"}`} data-testid="new-chat-tab-dm">Direct</button>
          <button onClick={() => setGroupMode(true)} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-bold ${groupMode ? "bg-primary text-primary-foreground" : "bg-secondary"}`} data-testid="new-chat-tab-group">Group</button>
        </div>

        {!groupMode && (
          <p className="mb-2 text-xs text-muted-foreground">You can start a direct chat only with people who follow you back.</p>
        )}

        {groupMode && (
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" maxLength={60}
            className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60" data-testid="group-name-input" />
        )}

        {groupMode && selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selected.map((u) => (
              <span key={u.id} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs font-semibold">
                {u.display_name}
                <button onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="relative mb-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/60" data-testid="user-search-input" />
        </div>

        <div className="max-h-64 overflow-y-auto">
          {searching ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{q ? "No people found." : "Search to find people."}</p>
          ) : (
            results.map((u) => {
              const isSel = !!selected.find((x) => x.id === u.id);
              return (
                <button key={u.id} onClick={() => toggle(u)} disabled={busy}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary/60" data-testid={`user-result-${u.id}`}>
                  <Avatar src={u.avatar_url} size={38} frame={frameOf(u)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm font-semibold">
                      {u.display_name}
                      {u.is_verified && <BadgeCheck size={13} className={badgeCls(u, "shrink-0")} />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                  </div>
                  {groupMode && (
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {isSel && <Check size={14} />}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {groupMode && (
          <Button onClick={createGroup} disabled={busy || selected.length < 2 || !groupName.trim()}
            className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="create-group-btn">
            {busy ? <Loader2 size={16} className="animate-spin" /> : `Create group${selected.length ? ` (${selected.length})` : ""}`}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function GroupSettingsDialog({ conv, me, onClose, onChanged, onLeft }) {
  const { q, setQ, results, searching } = useUserSearch(me);
  const [name, setName] = useState(conv.title);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [members, setMembers] = useState(conv.members);
  const isAdmin = conv.admin_id === me?.id;
  const fileRef = useRef(null);

  const saveName = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/conversations/${conv.id}`, { name: name.trim() });
      toast.success("Group renamed");
      onChanged();
    } catch (e) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  };

  const changePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, { resourceType: "image" });
      await api.patch(`/conversations/${conv.id}`, { avatar_url: url });
      toast.success("Group photo updated");
      onChanged();
    } catch (err) { toast.error(err.message || "Upload failed"); } finally { setUploading(false); }
  };

  const addMember = async (u) => {
    setBusy(true);
    try {
      const updated = await api.post(`/conversations/${conv.id}/members`, { member_ids: [u.id] });
      setMembers(updated.members);
      setQ("");
      toast.success(`Added ${u.display_name}`);
      onChanged();
    } catch (e) { toast.error(e.message || "Failed to add"); } finally { setBusy(false); }
  };

  const removeMember = async (uid) => {
    setBusy(true);
    try {
      await api.del(`/conversations/${conv.id}/members/${uid}`);
      setMembers((m) => m.filter((x) => x.id !== uid));
      onChanged();
    } catch (e) { toast.error(e.message || "Failed to remove"); } finally { setBusy(false); }
  };

  const leave = async () => {
    if (!window.confirm("Leave this group?")) return;
    setBusy(true);
    try {
      await api.del(`/conversations/${conv.id}/members/${me.id}`);
      toast.success("You left the group");
      onLeft();
    } catch (e) { toast.error(e.message || "Failed"); setBusy(false); }
  };

  const memberIds = new Set(members.map((m) => m.id));

  return (
    <Modal title="Group settings" onClose={onClose} testId="group-settings-dialog">
      <div className="max-h-[70vh] overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => isAdmin && fileRef.current?.click()} disabled={!isAdmin || uploading}
            className="relative" title={isAdmin ? "Change photo" : ""} data-testid="group-photo-btn">
            <Avatar src={conv.avatar_url} size={56} />
            {isAdmin && (
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={changePhoto} />
          <div className="flex-1">
            {isAdmin ? (
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60" data-testid="group-rename-input" />
                <Button onClick={saveName} disabled={busy} className="bg-primary text-primary-foreground" data-testid="group-rename-save">Save</Button>
              </div>
            ) : (
              <div className="text-lg font-black">{conv.title}</div>
            )}
          </div>
        </div>

        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Members · {members.length}</div>
        <div className="space-y-1">
          {members.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl px-2 py-2" data-testid={`group-member-${u.id}`}>
              <Avatar src={u.avatar_url} size={36} frame={frameOf(u)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {u.display_name}
                  {u.is_verified && <BadgeCheck size={12} className={badgeCls(u, "shrink-0")} />}
                  {u.id === conv.admin_id && <span className="rounded bg-primary/15 px-1.5 text-[10px] font-bold text-primary">Admin</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
              </div>
              {isAdmin && u.id !== me?.id && (
                <button onClick={() => removeMember(u.id)} disabled={busy} className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`group-remove-${u.id}`}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground"><UserPlus size={13} /> Add members</div>
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/60" data-testid="group-add-search" />
            </div>
            {searching ? (
              <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
            ) : (
              results.filter((u) => !memberIds.has(u.id)).map((u) => (
                <button key={u.id} onClick={() => addMember(u)} disabled={busy}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary/60" data-testid={`group-add-${u.id}`}>
                  <Avatar src={u.avatar_url} size={32} frame={frameOf(u)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm font-semibold">{u.display_name}{u.is_verified && <BadgeCheck size={12} className={badgeCls(u, "shrink-0")} />}</div>
                    <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                  </div>
                  <Plus size={16} className="text-primary" />
                </button>
              ))
            )}
          </div>
        )}

        <button onClick={leave} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10" data-testid="group-leave-btn">
          <LogOut size={16} /> Leave group
        </button>
      </div>
    </Modal>
  );
}
