import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, Trash2, CornerDownRight, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { timeAgo, userPath, badgeCls } from "@/lib/format";
import { toast } from "sonner";

function normalize(type, c) {
  if (type === "video") return { ...c, parent_id: c.parent_id || null };
  return {
    id: c.id,
    text: c.text,
    parent_id: c.parent_id || null,
    created_at: c.created_at,
    author: {
      id: c.user_id,
      username: c.username,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      is_verified: c.is_verified,
      remembering: c.remembering,
    },
  };
}

function CommentRow({ c, isReply, onReply, onDelete, meId }) {
  return (
    <div className={`flex gap-2.5 ${isReply ? "ml-9" : ""}`} data-testid={`comment-${c.id}`}>
      <Link to={c.author ? userPath(c.author) : "#"}>
        <Avatar src={c.author?.avatar_url} size={isReply ? 28 : 34} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-muted/60 px-3 py-2">
          <div className="flex items-center gap-1">
            <Link to={c.author ? userPath(c.author) : "#"} className="text-sm font-bold hover:underline">
              {c.author?.display_name || c.author?.username || "User"}
            </Link>
            {c.author?.is_verified && <BadgeCheck size={13} className={badgeCls(c.author, "shrink-0")} />}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{c.text}</p>
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
      </div>
    </div>
  );
}

// Shared threaded comments (one level deep) for posts/reels + videos.
export default function CommentThread({ type, id, onCountChange, autoFocus }) {
  const { user } = useAuth();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { topId, mention }
  const [replyText, setReplyText] = useState("");
  const [openThreads, setOpenThreads] = useState({});
  const inputRef = useRef(null);

  const base = type === "video" ? `/videos/${id}/comments` : `/posts/${id}/comments`;

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
    list.filter((c) => c.parent_id).forEach((r) => {
      (repliesOf[r.parent_id] ||= []).push(r);
    });
    Object.values(repliesOf).forEach((arr) => arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return { tops, repliesOf };
  }, [comments]);

  const submit = async (value, parentId) => {
    const v = value.trim();
    if (!v) return;
    if (!user) return toast.error("Sign in to comment");
    setPosting(true);
    try {
      const created = await api.post(base, { text: v, parent_id: parentId || null });
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

  return (
    <div className="flex flex-col" data-testid="comment-thread">
      {/* Composer */}
      {user && (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(text); setText(""); }}
          className="mb-4 flex items-center gap-2"
        >
          <Avatar src={user.avatar_url} size={34} />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            maxLength={type === "video" ? 1000 : 500}
            className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            data-testid="comment-input"
          />
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            data-testid="comment-submit"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      )}

      {/* List */}
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
                <CommentRow c={c} onReply={onReply} onDelete={del} meId={user?.id} />

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
                  <CommentRow key={r.id} c={r} isReply onReply={onReply} onDelete={del} meId={user?.id} />
                ))}

                {/* Inline reply composer */}
                {user && replyTo?.topId === c.id && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); submit(replyText, c.id); setReplyText(""); setReplyTo(null); }}
                    className="ml-11 flex items-center gap-2"
                  >
                    <Avatar src={user.avatar_url} size={28} />
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
