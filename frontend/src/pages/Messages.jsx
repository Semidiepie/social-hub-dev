import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Send, MessageSquare, ArrowLeft, Trash2, Phone, Video, BadgeCheck,
  Plus, Users, Settings as SettingsIcon, X, Check, UserPlus, LogOut, Search, ImagePlus, Sparkles, Radio,
} from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { timeAgo, frameOf, badgeCls, badgeStyle } from "@/lib/format";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { SageChat, SAGE } from "@/components/SageChat";
import { AiCharacterChat } from "@/components/AiCharacterChat";
import { toast } from "sonner";

// Compact "active Xm ago" label from an ISO timestamp.
function minsAgo(iso) {
  const m = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { convId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [aiChars, setAiChars] = useState([]);
  const [charForm, setCharForm] = useState(null); // null | {} (new) | character (edit)
  const isAdmin = !!user?.is_super_admin;

  const loadChars = useCallback(async () => {
    if (!user?.is_super_admin) return;
    try { setAiChars(await api.get("/ai-characters")); } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    loadChars();
    const t = setInterval(loadChars, 10000);
    return () => clearInterval(t);
  }, [loadChars, convId]);

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

  const [activeFriends, setActiveFriends] = useState([]);
  const loadActive = useCallback(async () => {
    try {
      const r = await api.get("/presence/active");
      setActiveFriends(r.friends || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    loadActive();
    const t = setInterval(loadActive, 20000);
    return () => clearInterval(t);
  }, [loadActive]);
  const onlineIds = useMemo(
    () => new Set(activeFriends.filter((f) => f.online).map((f) => f.id)),
    [activeFriends],
  );

  const openDm = async (friendId) => {
    try {
      const c = await api.post("/conversations", { member_ids: [friendId] });
      loadConversations();
      navigate(`/messages/${c.id}`);
    } catch (e) {
      toast.error(e.message || "Couldn't open chat");
    }
  };

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
    <div className="grid gap-0 grid-cols-1 md:grid-cols-[320px_1fr] min-w-0 h-[calc(100dvh-140px)] md:h-[calc(100dvh-112px)]">
      <aside className={`min-w-0 overflow-hidden rounded-2xl border border-border bg-card md:mr-4 ${convId ? "hidden md:block" : ""}`}>
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
        {activeFriends.length > 0 && (
          <div className="border-b border-border/60 px-3 py-3" data-testid="active-now-row">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Active now</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {activeFriends.map((f) => (
                <button
                  key={f.id}
                  onClick={() => openDm(f.id)}
                  className="flex w-14 shrink-0 flex-col items-center gap-1"
                  title={f.display_name}
                  data-testid={`active-friend-${f.id}`}
                >
                  <span className="relative">
                    <Avatar src={f.avatar_url} size={48} />
                    {f.online ? (
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-green-500" data-testid={`active-dot-${f.id}`} />
                    ) : null}
                  </span>
                  <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                    {f.online ? f.display_name.split(" ")[0] : minsAgo(f.last_active_at)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <ul className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <li>
              <button
                onClick={() => navigate("/messages/sage")}
                className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-secondary/50 ${
                  convId === "sage" ? "bg-secondary/70" : ""
                }`}
                data-testid="conv-sage"
              >
                <div className="relative">
                  <Avatar src={SAGE.avatar_url} size={44} />
                  <Sparkles size={12} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    Sage AI
                    <BadgeCheck size={14} className="shrink-0 fill-green-500 text-background" />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">Your AI companion · always here to listen</div>
                </div>
              </button>
            </li>

            {/* Admin-managed accounts — appear as normal people */}
            {isAdmin && (
              <li className="border-b border-border/60">
                <div className="flex items-center justify-end px-3 py-1">
                  <button onClick={() => setCharForm({})} title="Add account" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary" data-testid="add-ai-character-btn">
                    <Plus size={15} />
                  </button>
                </div>
                {aiChars.map((ch) => (
                  <div key={ch.id} className="group/char relative">
                    <button
                      onClick={() => navigate(`/messages/ai_${ch.id}`)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 pr-16 text-left hover:bg-secondary/50 ${convId === `ai_${ch.id}` ? "bg-secondary/70" : ""}`}
                      data-testid={`conv-aichar-${ch.id}`}
                    >
                      <Avatar src={ch.avatar_url} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${ch.unread > 0 ? "font-black" : "font-semibold"}`}>{ch.name}</span>
                          {ch.last_message?.created_at && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(ch.last_message.created_at)}</span>
                          )}
                        </div>
                        <div className={`truncate text-xs ${ch.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                          {ch.last_message
                            ? `${ch.last_message.role === "ai" ? "" : "You: "}${ch.last_message.text}`
                            : (ch.persona ? ch.persona.slice(0, 42) : `@${ch.username}`)}
                        </div>
                      </div>
                      {ch.unread > 0 && convId !== `ai_${ch.id}` && (
                        <span className="absolute right-9 top-1/2 -translate-y-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-primary-foreground" data-testid={`aichar-unread-${ch.id}`}>
                          {ch.unread}
                        </span>
                      )}
                    </button>
                    <button onClick={() => setCharForm(ch)} title="Edit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary group-hover/char:opacity-100" data-testid={`edit-aichar-${ch.id}`}>
                      <SettingsIcon size={14} />
                    </button>
                  </div>
                ))}
              </li>
            )}

            {conversations.length === 0 && (
              <li className="p-6 text-center text-xs text-muted-foreground">
                No other conversations yet. Tap <b>New</b> to start a chat or group.
              </li>
            )}
            {conversations.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => navigate(`/messages/${c.id}`)}
                  className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 pr-10 text-left hover:bg-secondary/50 ${
                    convId === c.id ? "bg-secondary/70" : ""
                  }`}
                  data-testid={`conv-${c.id}`}
                >
                  <span className="relative shrink-0">
                    <Avatar src={c.avatar_url} size={44} frame={c.is_group ? null : frameOf(c.peer)} live={!c.is_group && c.peer?.is_live} />
                    {!c.is_group && c.peer && onlineIds.has(c.peer.id) && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" data-testid={`conv-online-${c.id}`} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                        {c.is_group && <Users size={13} className="shrink-0 text-muted-foreground" />}
                        <span className="truncate">{c.title}</span>
                        {!c.is_group && c.peer?.is_verified && <BadgeCheck size={13} className={badgeCls(c.peer, "shrink-0")} style={badgeStyle(c.peer)} />}
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

      {convId === "sage" ? (
        <SageChat onBack={() => navigate("/messages")} />
      ) : convId?.startsWith("ai_") ? (
        <AiCharacterChat characterId={convId.slice(3)} onBack={() => navigate("/messages")} />
      ) : convId ? (
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

      {charForm && (
        <CharacterFormDialog
          character={charForm.id ? charForm : null}
          onClose={() => setCharForm(null)}
          onSaved={() => { setCharForm(null); loadChars(); }}
          onDeleted={(id) => { setCharForm(null); loadChars(); if (convId === `ai_${id}`) navigate("/messages"); }}
        />
      )}
    </div>
  );
}

function CharacterFormDialog({ character, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(character?.name || "");
  const [username, setUsername] = useState(character?.username || "");
  const [persona, setPersona] = useState(character?.persona || "");
  const [yourName, setYourName] = useState(character?.your_name || "");
  const [nickname, setNickname] = useState(character?.nickname || "");
  const [relationship, setRelationship] = useState(character?.relationship || "");
  const [age, setAge] = useState(character?.age ?? "");
  const [affection, setAffection] = useState(character?.affection || "warm");
  const [sleepStart, setSleepStart] = useState(character?.sleep_start ?? "");
  const [sleepEnd, setSleepEnd] = useState(character?.sleep_end ?? "");
  const [allowCalls, setAllowCalls] = useState(character?.allow_calls || false);
  const [allowLive, setAllowLive] = useState(character?.allow_live ?? true);
  const [schedule, setSchedule] = useState(character?.schedule || []);
  const [relationships, setRelationships] = useState(character?.relationships || []);
  const [allChars, setAllChars] = useState([]);
  const [memories, setMemories] = useState(character?.memories || []);
  const [newMem, setNewMem] = useState("");
  const [voice, setVoice] = useState(character?.voice_id || "");
  const [avatarUrl, setAvatarUrl] = useState(character?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = !!character;

  const addBlock = () => setSchedule((s) => [...s, { start: "", end: "", activity: "", busy: false, weekdays_only: false }]);
  const updateBlock = (i, patch) => setSchedule((s) => s.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const removeBlock = (i) => setSchedule((s) => s.filter((_, j) => j !== i));

  useEffect(() => {
    api.get("/ai-characters").then((list) => setAllChars(list || [])).catch(() => {});
  }, []);
  const otherChars = allChars.filter((x) => x.id !== character?.id);
  const addRel = () => setRelationships((r) => [...r, { character_id: "", relation: "" }]);
  const updateRel = (i, patch) => setRelationships((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeRel = (i) => setRelationships((r) => r.filter((_, j) => j !== i));

  const addMemory = async () => {
    if (!newMem.trim() || !editing) return;
    try {
      const r = await api.post(`/ai-characters/${character.id}/memory`, { text: newMem.trim() });
      setMemories(r.memories);
      setNewMem("");
    } catch (e) { toast.error(e.message || "Couldn't save memory"); }
  };
  const removeMemory = async (mid) => {
    try {
      const r = await api.del(`/ai-characters/${character.id}/memory/${mid}`);
      setMemories(r.memories);
    } catch (e) { toast.error(e.message || "Couldn't remove"); }
  };

  const pickAvatar = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadToCloudinary(file, { resourceType: "image" });
      setAvatarUrl(res.secure_url);
    } catch (e) { toast.error(e.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!name.trim() || !username.trim() || !persona.trim()) return toast.error("Name, username and personality are required");
    setSaving(true);
    try {
      const body = { name: name.trim(), username: username.trim(), persona: persona.trim(), voice: voice.trim(), avatar_url: avatarUrl, your_name: yourName.trim(), nickname: nickname.trim(), relationship: relationship.trim(),
        age: age === "" ? null : parseInt(age, 10),
        affection,
        sleep_start: sleepStart === "" ? null : parseInt(sleepStart, 10),
        sleep_end: sleepEnd === "" ? null : parseInt(sleepEnd, 10),
        allow_calls: allowCalls,
        allow_live: allowLive,
        relationships: relationships.filter((r) => r.character_id && r.relation.trim()).map((r) => ({ character_id: r.character_id, relation: r.relation.trim() })),
        schedule: schedule.filter((b) => b.start && b.activity).map((b) => ({ start: b.start, end: b.end || "", activity: b.activity, busy: !!b.busy, weekdays_only: !!b.weekdays_only })) };
      if (editing) await api.put(`/ai-characters/${character.id}`, body);
      else await api.post("/ai-characters", body);
      toast.success(editing ? "Character updated" : "Character created");
      if (voice.trim()) {
        // re-fetch to read voice_valid from the saved record
        try {
          const list = await api.get("/ai-characters");
          const saved = list.find((x) => x.username === username.trim().replace(/^@/, "") && x.name === name.trim());
          if (saved && saved.voice_valid === false) {
            toast.error("Saved, but that Voice ID isn't in your ElevenLabs account — add it in the ElevenLabs Voice Library (or use a premade voice) for it to speak.", { duration: 8000 });
          }
        } catch { /* ignore */ }
      }
      onSaved();
    } catch (e) { toast.error(e.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!window.confirm(`Delete ${character.name}? This removes the character and all its chats.`)) return;
    try { await api.del(`/ai-characters/${character.id}`); toast.success("Deleted"); onDeleted(character.id); }
    catch (e) { toast.error(e.message || "Delete failed"); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={onClose} data-testid="aichar-form">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black"><Sparkles size={18} className="text-primary" /> {editing ? "Edit AI character" : "New AI character"}</h2>
          <button onClick={onClose} data-testid="aichar-form-close"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} size={56} />
          <label className="cursor-pointer rounded-lg bg-secondary px-3 py-2 text-xs font-bold hover:bg-secondary/70" data-testid="aichar-avatar-upload">
            {uploading ? "Uploading…" : "Upload picture"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </label>
        </div>

        <label className="mt-3 block text-[11px] font-bold uppercase text-muted-foreground">Display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Nova" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-name" />

        <label className="mt-3 block text-[11px] font-bold uppercase text-muted-foreground">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} placeholder="nova" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-username" />

        <label className="mt-3 block text-[11px] font-bold uppercase text-muted-foreground">Personality / how they talk</label>
        <textarea value={persona} onChange={(e) => setPersona(e.target.value)} maxLength={1500} rows={3} placeholder="e.g. A witty, upbeat music lover who hypes people up, loves 90s hip-hop and always keeps it playful." className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" data-testid="aichar-persona" />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground">Your name</label>
            <input value={yourName} onChange={(e) => setYourName(e.target.value)} maxLength={60} placeholder="e.g. Alex" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-yourname" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground">What they call you</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={60} placeholder="e.g. champ, babe" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-nickname" />
          </div>
        </div>

        <label className="mt-3 block text-[11px] font-bold uppercase text-muted-foreground">How they know you</label>
        <textarea value={relationship} onChange={(e) => setRelationship(e.target.value)} maxLength={500} rows={2} placeholder="e.g. We've been best friends since college and talk every day." className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" data-testid="aichar-relationship" />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground">Age</label>
            <input type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 9" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-age" />
            <p className="mt-1 text-[10px] text-muted-foreground">Shapes how they talk &amp; when they sleep.</p>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground">How they feel about you</label>
            <select value={affection} onChange={(e) => setAffection(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-affection">
              <option value="adores">Adores you (texts often)</option>
              <option value="warm">Warm &amp; friendly</option>
              <option value="neutral">Neutral</option>
              <option value="distant">Distant</option>
              <option value="dislikes">Dislikes you (rarely texts)</option>
            </select>
          </div>
        </div>

        <label className="mt-3 block text-[11px] font-bold uppercase text-muted-foreground">Sleep schedule (optional — leave blank for age-appropriate)</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Bed</span>
            <input type="number" min={0} max={23} value={sleepStart} onChange={(e) => setSleepStart(e.target.value)} placeholder="e.g. 20" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-sleep-start" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Wake</span>
            <input type="number" min={0} max={23} value={sleepEnd} onChange={(e) => setSleepEnd(e.target.value)} placeholder="e.g. 7" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-sleep-end" />
          </div>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">24h hours. They won&apos;t text you while they&apos;re &quot;asleep&quot; — a 9-year-old who loves you will say goodnight before bed instead.</p>

        <div className="mt-3 flex items-center justify-between">
          <label className="block text-[11px] font-bold uppercase text-muted-foreground">Daily schedule</label>
          <button type="button" onClick={addBlock} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold hover:bg-secondary/70" data-testid="aichar-schedule-add"><Plus size={12} /> Add block</button>
        </div>
        <p className="mb-1 mt-1 text-[10px] text-muted-foreground">Their whole day. They only text/call during <b>free</b> blocks, never while busy. &quot;School days&quot; blocks skip weekends.</p>
        <div className="space-y-1.5">
          {schedule.length === 0 && <p className="text-[11px] text-muted-foreground">No schedule yet — add School, Lunch, Soccer, Dinner, etc.</p>}
          {schedule.map((b, i) => (
            <div key={i} className="rounded-xl border border-border p-2" data-testid={`aichar-schedule-row-${i}`}>
              <div className="flex items-center gap-1.5">
                <input type="time" value={b.start} onChange={(e) => updateBlock(i, { start: e.target.value })} className="h-9 w-[92px] rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" data-testid={`aichar-schedule-start-${i}`} />
                <span className="text-xs text-muted-foreground">–</span>
                <input type="time" value={b.end} onChange={(e) => updateBlock(i, { end: e.target.value })} className="h-9 w-[92px] rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" data-testid={`aichar-schedule-end-${i}`} />
                <input value={b.activity} onChange={(e) => updateBlock(i, { activity: e.target.value })} placeholder="Activity" maxLength={60} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" data-testid={`aichar-schedule-activity-${i}`} />
                <button type="button" onClick={() => removeBlock(i)} className="text-muted-foreground hover:text-destructive" data-testid={`aichar-schedule-remove-${i}`}><X size={14} /></button>
              </div>
              <div className="mt-1.5 flex items-center gap-3 pl-0.5">
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={!!b.busy} onChange={(e) => updateBlock(i, { busy: e.target.checked })} data-testid={`aichar-schedule-busy-${i}`} /> Busy (can&apos;t reach out)</label>
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={!!b.weekdays_only} onChange={(e) => updateBlock(i, { weekdays_only: e.target.checked })} data-testid={`aichar-schedule-weekdays-${i}`} /> School days only</label>
              </div>
            </div>
          ))}
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-border p-3" data-testid="aichar-allow-calls-row">
          <span className="flex items-center gap-2 text-sm font-semibold"><Phone size={15} className="text-green-500" /> Let this character call me</span>
          <input type="checkbox" checked={allowCalls} onChange={(e) => setAllowCalls(e.target.checked)} className="h-5 w-5 accent-primary" data-testid="aichar-allow-calls" />
        </label>
        <p className="mt-1 text-[10px] text-muted-foreground">When on, they may ring you now and then during their free moments (max ~2/day). Your phone rings and you choose to answer.</p>

        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-border p-3" data-testid="aichar-allow-live-row">
          <span className="flex items-center gap-2 text-sm font-semibold"><Radio size={15} className="text-rose-500" /> Let this character join my lives</span>
          <input type="checkbox" checked={allowLive} onChange={(e) => setAllowLive(e.target.checked)} className="h-5 w-5 accent-primary" data-testid="aichar-allow-live" />
        </label>
        <p className="mt-1 text-[10px] text-muted-foreground">When on, they&apos;ll drop by your livestreams during their free time and comment in the live chat (only if they feel warmly toward you). Viewers see their name but can&apos;t open a profile.</p>

        <div className="mt-3 rounded-xl border border-border p-2.5" data-testid="aichar-relationships">
          <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><Users size={12} className="text-primary" /> Family &amp; friends — link to other characters</label>
          <p className="mt-1 text-[10px] text-muted-foreground">Link this character to others and say how they&apos;re related (e.g. mother, daughter, sister, friend). Linked characters know each other, text privately on their own, and if you ask this character to message a relative, they will.</p>
          <div className="mt-2 space-y-1.5">
            {relationships.map((r, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`aichar-rel-${i}`}>
                <select value={r.character_id} onChange={(e) => updateRel(i, { character_id: e.target.value })} className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" data-testid={`aichar-rel-char-${i}`}>
                  <option value="">Select character…</option>
                  {otherChars.map((oc) => <option key={oc.id} value={oc.id}>{oc.name} (@{oc.username})</option>)}
                </select>
                <input value={r.relation} onChange={(e) => updateRel(i, { relation: e.target.value })} placeholder="is my… (e.g. mother)" className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" data-testid={`aichar-rel-type-${i}`} />
                <button type="button" onClick={() => removeRel(i)} className="rounded-lg p-1 text-muted-foreground hover:text-destructive" data-testid={`aichar-rel-remove-${i}`}><X size={14} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRel} className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary" data-testid="aichar-rel-add"><Plus size={13} /> Add relationship</button>
        </div>

        {editing ? (
          <div className="mt-3 rounded-xl border border-border p-2.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><Sparkles size={12} className="text-primary" /> Memory / training — things it never forgets</label>
            <div className="mt-2 space-y-1.5">
              {memories.length === 0 && <p className="text-[11px] text-muted-foreground">No memories yet. Add facts it should always remember.</p>}
              {memories.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5" data-testid={`aichar-memory-${m.id}`}>
                  <span className="flex-1 text-xs">{m.text}</span>
                  <button onClick={() => removeMemory(m.id)} className="text-muted-foreground hover:text-destructive" data-testid={`aichar-memory-remove-${m.id}`}><X size={13} /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={newMem} onChange={(e) => setNewMem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMemory())} maxLength={400} placeholder="e.g. I have a dog named Max" className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary" data-testid="aichar-memory-input" />
              <Button onClick={addMemory} disabled={!newMem.trim()} size="sm" className="h-9 bg-primary text-primary-foreground" data-testid="aichar-memory-add">Add</Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">Tip: after creating, open the character again to <b>train</b> it with memories it will never forget.</p>
        )}

        <label className="mt-3 block text-[11px] font-bold uppercase text-muted-foreground">ElevenLabs voice (ID or link)</label>
        <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Paste Voice ID or ElevenLabs voice link" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="aichar-voice" />
        <p className="mt-1 text-[10px] text-muted-foreground">The voice must be available to the configured ElevenLabs account (premade, in your Library, or an added public voice).</p>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={saving || uploading} className="h-10 flex-1 gap-1.5 bg-primary text-primary-foreground" data-testid="aichar-save">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {editing ? "Save" : "Create"}
          </Button>
          {editing && (
            <Button onClick={del} variant="ghost" className="h-10 gap-1.5 text-muted-foreground hover:text-destructive" data-testid="aichar-delete"><Trash2 size={15} /></Button>
          )}
        </div>
      </div>
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
  const [typingUsers, setTypingUsers] = useState([]);
  const lastTypingPing = useRef(0);
  const listRef = useRef(null);
  const dmFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

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
    setTypingUsers([]);
    load();
    if (!conv) return undefined;
    const t = setInterval(() => {
      load();
      api.get(`/conversations/${conv.id}/typing`).then((r) => setTypingUsers(r.users || [])).catch(() => {});
    }, 3500);
    return () => clearInterval(t);
  }, [conv, load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typingUsers]);

  const onType = (e) => {
    setText(e.target.value);
    const ts = Date.now();
    if (e.target.value && conv && ts - lastTypingPing.current > 2500) {
      lastTypingPing.current = ts;
      api.post(`/conversations/${conv.id}/typing`, {}).catch(() => {});
    }
  };

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

  const sendMedia = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !conv) return;
    const isVideo = file.type.startsWith("video");
    const maxMb = isVideo ? 1024 : 250;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`${isVideo ? "Video" : "Photo"} too large (max ${isVideo ? "1 GB" : "250 MB"}).`);
      return;
    }
    setUploading(true);
    try {
      const up = await uploadToCloudinary(file, { resourceType: isVideo ? "video" : "image" });
      const payload = isVideo ? { video_url: up.secure_url } : { image_url: up.secure_url };
      const m = await api.post(`/conversations/${conv.id}/messages`, payload);
      setMessages((prev) => [...prev, m]);
    } catch (err) {
      toast.error(err.message || "Couldn't send that");
    } finally {
      setUploading(false);
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
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <button onClick={onBack} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary md:hidden">
          <ArrowLeft size={18} />
        </button>
        <Avatar src={conv.avatar_url} size={36} frame={conv.is_group ? null : frameOf(conv.peer)} live={!conv.is_group && conv.peer?.is_live} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate font-bold">
            <span className="truncate">{conv.title}</span>
            {!conv.is_group && conv.peer?.is_verified && <BadgeCheck size={15} className={badgeCls(conv.peer, "shrink-0")} style={badgeStyle(conv.peer)} />}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {typingUsers.length > 0
              ? (conv.is_group ? `${typingUsers[0].display_name} is typing…` : "typing…")
              : (conv.is_group ? `${conv.members.length} members` : `@${conv.peer?.username || ""}`)}
          </div>
        </div>
        <button onClick={() => startCall(conv, "audio")} title="Audio call" aria-label="Audio call"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary" data-testid="call-audio-btn">
          <Phone size={18} />
        </button>
        <button onClick={() => startCall(conv, "video")} title="Video call" aria-label="Video call"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary" data-testid="call-video-btn">
          <Video size={18} />
        </button>
        {conv.is_group && (
          <button onClick={() => setShowSettings(true)} title="Group settings" aria-label="Group settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary" data-testid="group-settings-btn">
            <SettingsIcon size={18} />
          </button>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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
                  <Avatar src={m.sender_avatar} size={28} frame={m.sender_frame} live={m.sender_is_live} className="mb-4" />
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
                      {m.sender_verified && <BadgeCheck size={11} className={badgeCls({ remembering: m.sender_remembering }, "shrink-0")} style={badgeStyle({ verified_color: m.sender_verified_color })} />}
                    </div>
                  )}
                  {m.image_url && <img src={m.image_url} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" data-testid="dm-msg-image" />}
                  {m.video_url && <video src={m.video_url} controls playsInline className="mb-1 max-h-72 w-full rounded-xl" data-testid="dm-msg-video" />}
                  {m.text ? <div className="whitespace-pre-wrap">{m.text}</div> : null}
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
        {typingUsers.length > 0 && (
          <div className="flex items-end gap-2" data-testid="dm-typing">
            <div className="flex gap-1 rounded-2xl bg-secondary px-3 py-2.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input ref={dmFileRef} type="file" accept="image/*,video/*" className="hidden" onChange={sendMedia} data-testid="chat-file-input" />
        <button type="button" onClick={() => dmFileRef.current?.click()} disabled={uploading} title="Send a photo or video"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50" data-testid="chat-attach">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={18} />}
        </button>
        <input value={text} onChange={onType} placeholder="Type a message…"
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
                      {u.is_verified && <BadgeCheck size={13} className={badgeCls(u, "shrink-0")} style={badgeStyle(u)} />}
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
                  {u.is_verified && <BadgeCheck size={12} className={badgeCls(u, "shrink-0")} style={badgeStyle(u)} />}
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
                    <div className="flex items-center gap-1 text-sm font-semibold">{u.display_name}{u.is_verified && <BadgeCheck size={12} className={badgeCls(u, "shrink-0")} style={badgeStyle(u)} />}</div>
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
