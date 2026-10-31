import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, CornerDownRight, BadgeCheck, ImagePlus, SmilePlus, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { timeAgo, userPath, badgeCls, badgeStyle, frameOf } from "@/lib/format";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const EMOJI_SET = [
  "👍", "❤️", "😂", "😮", "😢", "🔥", "😍", "🥰", "😎", "🤩", "😭", "😅",
  "😊", "🙌", "👏", "🙏", "💯", "✨", "🎉", "💪", "👀", "🤔", "😏", "😤",
  "😱", "🥳", "😇", "😴", "🤤", "🤯", "🫶", "💔", "💀", "🤡", "👻", "🫡",
  "🥲", "😳", "🤗", "😬", "🙄", "😌", "🔫", "⚡", "🌟", "💥", "🏆", "🫠",
];
const MAX_BYTES = 150 * 1024 * 1024; // 150MB clips

function mediaKind(file) {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

function normalize(type, c) {
  const common = { media_url: c.media_url || null, media_type: c.media_type || null, reactions: c.reactions || [] };
  if (type === "video") return { ...c, parent_id: c.parent_id || null, ...common };
  return {
    id: c.id,
    text: c.text,
    parent_id: c.parent_id || null,
    created_at: c.created_at,
    ...common,
    author: {
      id: c.user_id,
      username: c.username,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      is_verified: c.is_verified,
      remembering: c.remembering,
      equipped_frame: c.equipped_frame,
      frame_enabled: c.frame_enabled,
    },
  };
}

function aggregate(reactions, meId) {
  const map = {};
  (reactions || []).forEach((r) => {
    const m = (map[r.emoji] ||= { count: 0, mine: false });
    m.count += 1;
    if (r.user_id === meId) m.mine = true;
  });
  return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v })).sort((a, b) => b.count - a.count);
}

function CommentMedia({ c }) {
  if (!c.media_url) return null;
  if (c.media_type === "video") {
    return (
      <video
        src={c.media_url}
        controls
        playsInline
        className="mt-2 max-h-72 w-auto max-w-full rounded-xl border border-border bg-black"
        data-testid={`comment-media-${c.id}`}
      />
    );
  }
  return (
    <img
      src={c.media_url}
      alt="comment attachment"
      loading="lazy"
      className="mt-2 max-h-72 w-auto max-w-full rounded-xl border border-border object-cover"
      data-testid={`comment-media-${c.id}`}
    />
  );
}

function ReactionBar({ c, meId, onReact, burst }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const chips = aggregate(c.reactions, meId);

  const pick = (emoji) => {
    setOpen(false);
    setShowAll(false);
    onReact(c, emoji);
  };

  return (
    <div className="relative mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
      {chips.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact(c, r.emoji)}
          className={`pmp-reaction-pop flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold transition-all hover:scale-105 ${
            r.mine
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`comment-reaction-${c.id}-${r.emoji}`}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      <button
        onClick={() => { setOpen((v) => !v); setShowAll(false); }}
        className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        data-testid={`comment-react-trigger-${c.id}`}
        aria-label="React to comment"
      >
        <SmilePlus size={14} /> React
      </button>

      {/* Floating burst on react */}
      {burst && (
        <span className="pmp-burst pointer-events-none absolute -top-1 left-2 z-20 text-2xl">{burst}</span>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => { setOpen(false); setShowAll(false); }} />
          <div
            className="pmp-pickin absolute bottom-full left-1 z-30 mb-1 rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur-xl"
            data-testid={`comment-react-popover-${c.id}`}
          >
            <div className="flex items-center gap-1">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => pick(e)}
                  className="rounded-full p-1 text-xl transition-transform hover:scale-125"
                  data-testid={`comment-quick-${c.id}-${e}`}
                >
                  {e}
                </button>
              ))}
              <button
                onClick={() => setShowAll((v) => !v)}
                className={`ml-0.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${showAll ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                data-testid={`comment-react-more-${c.id}`}
                aria-label="More emojis"
              >
                <Plus size={16} />
              </button>
            </div>
            {showAll && (
              <div className="mt-2 grid max-h-44 w-60 grid-cols-8 gap-0.5 overflow-y-auto border-t border-border pt-2">
                {EMOJI_SET.map((e) => (
                  <button
                    key={e}
                    onClick={() => pick(e)}
                    className="rounded-lg p-1 text-lg transition-transform hover:scale-125"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CommentRow({ c, isReply, onReply, onDelete, onReact, burst, meId }) {
  return (
    <div className={`flex gap-2.5 ${isReply ? "ml-9" : ""}`} data-testid={`comment-${c.id}`}>
      <Link to={c.author ? userPath(c.author) : "#"}>
        <Avatar src={c.author?.avatar_url} size={isReply ? 28 : 34} frame={frameOf(c.author)} live={c.author?.is_live} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-muted/60 px-3 py-2">
          <div className="flex items-center gap-1">
            <Link to={c.author ? userPath(c.author) : "#"} className="text-sm font-bold hover:underline">
              {c.author?.display_name || c.author?.username || "User"}
            </Link>
            {c.author?.is_verified && <BadgeCheck size={13} className={badgeCls(c.author, "shrink-0")} style={badgeStyle(c.author)} />}
          </div>
          {c.text && <p className="whitespace-pre-wrap break-words text-sm text-foreground">{c.text}</p>}
          <CommentMedia c={c} />
        </div>
        <div className="mt-1 flex items-center gap-3 pl-1 text-xs text-muted-foreground">
          <span>{timeAgo(c.created_at)}</span>
          <button onClick={() => onReply(c)} className="font-bold hover:text-foreground" data-testid={`comment-reply-${c.id}`}>
            Reply
          </button>
          {meId && c.author?.id === meId && (
            <button onClick={() => onDelete(c)} className="font-bold text-rose-400 hover:text-rose-300" data-testid={`comment-delete-${c.id}`}>
              Delete
            </button>
          )}
        </div>
        <ReactionBar c={c} meId={meId} onReact={onReact} burst={burst} />
      </div>
    </div>
  );
}

function AttachButton({ media, setMedia, uploading, setUploading, testid }) {
  const ref = useRef(null);
  const onFile = async (file) => {
    if (!file) return;
    const kind = mediaKind(file);
    if (!kind) { toast.error("Attach an image, GIF or video"); return; }
    if (file.size > MAX_BYTES) { toast.error("That file is over 150MB"); return; }
    setUploading(true);
    try {
      const up = await uploadToCloudinary(file);
      setMedia({ url: up.secure_url || up.url, type: kind });
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*,video/*,.gif" className="hidden" data-testid={`${testid}-input`} onChange={(e) => onFile(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-40"
        data-testid={testid}
        aria-label="Attach photo, GIF or video"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus size={18} />}
      </button>
    </>
  );
}

function StagedMedia({ media, onClear }) {
  if (!media) return null;
  return (
    <div className="relative mb-2 ml-11 w-fit" data-testid="comment-staged-media">
      {media.type === "video" ? (
        <video src={media.url} className="max-h-40 rounded-xl border border-border bg-black" muted />
      ) : (
        <img src={media.url} alt="attachment preview" className="max-h-40 rounded-xl border border-border object-cover" />
      )}
      <button
        type="button"
        onClick={onClear}
        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border"
        data-testid="comment-staged-clear"
        aria-label="Remove attachment"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Shared threaded comments (one level deep) for posts/reels + videos + games.
// Supports photo/GIF/video attachments and animated emoji reactions on every comment.
export default function CommentThread({ type, id, onCountChange, autoFocus }) {
  const { user } = useAuth();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [openThreads, setOpenThreads] = useState({});
  const [bursts, setBursts] = useState({});
  const inputRef = useRef(null);

  const base = type === "video" ? `/videos/${id}/comments` : type === "game" ? `/games/${id}/comments` : `/posts/${id}/comments`;

  useEffect(() => {
    let alive = true;
    api.get(base)
      .then((rows) => { if (alive) setComments(rows.map((c) => normalize(type, c))); })
      .catch(() => { if (alive) setComments([]); });
    return () => { alive = false; };
  }, [type, id]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const { tops, repliesOf } = useMemo(() => {
    const list = comments || [];
    const tops = list.filter((c) => !c.parent_id);
    const repliesOf = {};
    list.filter((c) => c.parent_id).forEach((r) => { (repliesOf[r.parent_id] ||= []).push(r); });
    Object.values(repliesOf).forEach((arr) => arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return { tops, repliesOf };
  }, [comments]);

  const submit = async (value, parentId, withMedia) => {
    const v = (value || "").trim();
    if (!v && !withMedia) return;
    if (!user) return toast.error("Sign in to comment");
    setPosting(true);
    try {
      const created = await api.post(base, {
        text: v,
        parent_id: parentId || null,
        media_url: withMedia?.url || null,
        media_type: withMedia?.type || null,
      });
      const nc = normalize(type, created);
      setComments((prev) => (parentId ? [...(prev || []), nc] : [nc, ...(prev || [])]));
      onCountChange?.(1);
      if (parentId) setOpenThreads((s) => ({ ...s, [parentId]: true }));
    } catch (e) {
      toast.error(e.message || "Failed to comment");
    } finally {
      setPosting(false);
    }
  };

  const onReply = (c) => {
    const topId = c.parent_id || c.id;
    setReplyTo({ topId, mention: c.author?.username });
    setReplyText(c.author?.username ? `@${c.author.username} ` : "");
    setOpenThreads((s) => ({ ...s, [topId]: true }));
  };

  const del = async (c) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      const r = await api.del(`${base}/${c.id}`);
      setComments((prev) => (prev || []).filter((x) => x.id !== c.id && x.parent_id !== c.id));
      onCountChange?.(-(r?.removed || 1));
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const react = async (c, emoji) => {
    if (!user) return toast.error("Sign in to react");
    const wasMine = (c.reactions || []).some((r) => r.user_id === user.id && r.emoji === emoji);
    if (!wasMine) {
      setBursts((s) => ({ ...s, [c.id]: emoji }));
      setTimeout(() => setBursts((s) => { const n = { ...s }; delete n[c.id]; return n; }), 720);
    }
    try {
      const res = await api.post(`${base}/${c.id}/reactions`, { emoji });
      setComments((prev) => (prev || []).map((x) => (x.id === c.id ? { ...x, reactions: res.reactions } : x)));
    } catch (e) {
      toast.error(e.message || "Couldn't react");
    }
  };

  return (
    <div className="flex flex-col" data-testid="comment-thread">
      {user && (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(text, null, media); setText(""); setMedia(null); }}
          className="mb-4"
        >
          <StagedMedia media={media} onClear={() => setMedia(null)} />
          <div className="flex items-center gap-2">
            <Avatar src={user.avatar_url} size={34} frame={frameOf(user)} />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              maxLength={type === "video" ? 1000 : 500}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              data-testid="comment-input"
            />
            <AttachButton media={media} setMedia={setMedia} uploading={uploading} setUploading={setUploading} testid="comment-attach" />
            <button
              type="submit"
              disabled={posting || uploading || (!text.trim() && !media)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              data-testid="comment-submit"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </form>
      )}

      {comments === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : tops.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-4">
          {tops.map((c) => {
            const replies = repliesOf[c.id] || [];
            const open = openThreads[c.id];
            return (
              <div key={c.id} className="space-y-2">
                <CommentRow c={c} onReply={onReply} onDelete={del} onReact={react} burst={bursts[c.id]} meId={user?.id} />

                {replies.length > 0 && (
                  <button
                    onClick={() => setOpenThreads((s) => ({ ...s, [c.id]: !s[c.id] }))}
                    className="ml-11 flex items-center gap-1.5 text-xs font-bold text-primary"
                    data-testid={`comment-toggle-replies-${c.id}`}
                  >
                    <CornerDownRight size={13} />
                    {open ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                  </button>
                )}

                {open && replies.map((r) => (
                  <CommentRow key={r.id} c={r} isReply onReply={onReply} onDelete={del} onReact={react} burst={bursts[r.id]} meId={user?.id} />
                ))}

                {user && replyTo?.topId === c.id && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); submit(replyText, c.id); setReplyText(""); setReplyTo(null); }}
                    className="ml-11 flex items-center gap-2"
                  >
                    <Avatar src={user.avatar_url} size={28} frame={frameOf(user)} />
                    <input
                      autoFocus
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply${replyTo.mention ? " to @" + replyTo.mention : ""}…`}
                      maxLength={type === "video" ? 1000 : 500}
                      className="flex-1 rounded-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      data-testid={`comment-reply-input-${c.id}`}
                    />
                    <button type="submit" disabled={posting || !replyText.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" data-testid={`comment-reply-submit-${c.id}`}>
                      {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={15} />}
                    </button>
                    <button type="button" onClick={() => { setReplyTo(null); setReplyText(""); }} className="text-xs font-bold text-muted-foreground">Cancel</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
