import React, { useEffect, useRef, useState } from "react";
import { Heart, Send, Gift, Eye, X, BadgeCheck, Share2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { badgeCls } from "@/lib/format";

function FloatingHearts({ floaters }) {
  return (
    <div className="pointer-events-none absolute bottom-24 right-3 z-20 h-72 w-16">
      {floaters.map((f) => (
        <Heart
          key={f.id}
          size={26}
          className="absolute bottom-0 right-2 animate-live-heart fill-rose-500 text-rose-500"
          style={{ left: `${Math.random() * 20}px` }}
        />
      ))}
    </div>
  );
}

function ChatRow({ m }) {
  if (m.kind === "system") {
    return <div className="w-fit rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/70">{m.text}</div>;
  }
  const isGift = m.kind === "gift";
  return (
    <div className="flex items-start gap-2" data-testid="live-chat-row">
      <Avatar src={m.avatar_url} size={24} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0 rounded-2xl bg-black/40 px-2.5 py-1.5">
        <span className="text-[11px] font-bold text-primary">{m.display_name || m.username}</span>
        {m.is_verified && <BadgeCheck size={12} className={badgeCls(m, "ml-0.5 inline-block align-[-1px]")} />}{" "}
        {isGift ? (
          <span className="text-[13px] font-semibold text-amber-300">
            {m.text} <span className="text-base">{m.gift?.glyph}</span>
          </span>
        ) : (
          <span className="break-words text-[13px] text-white">{m.text}</span>
        )}
      </div>
    </div>
  );
}

/**
 * The "TikTok feel" layer that sits over the video: viewer counter, live chat,
 * floating hearts, and a gift tray. Shared by broadcaster and viewer screens.
 */
export function LiveOverlay({
  owner,
  title,
  viewers,
  hearts,
  floaters,
  chat,
  gifts,
  onSendChat,
  onSendHeart,
  onSendGift,
  isOwner,
  onEnd,
  onClose,
  onShare,
}) {
  const [text, setText] = useState("");
  const [giftsOpen, setGiftsOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendChat(text);
    setText("");
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent p-3">
        <div className="flex items-center gap-2 rounded-full bg-black/40 p-1 pr-3 backdrop-blur">
          <Avatar src={owner?.avatar_url} size={34} />
          <div className="leading-tight">
            <div className="text-sm font-bold text-white">{owner?.display_name || owner?.username}</div>
            <div className="text-[11px] text-white/70">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white"
            data-testid="live-badge"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Live
          </span>
          <span className="flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-xs font-bold text-white backdrop-blur" data-testid="live-viewer-count">
            <Eye size={14} /> {viewers}
          </span>
          {onShare && (
            <button
              onClick={onShare}
              data-testid="live-share-btn"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-primary"
              title="Share live link"
            >
              <Share2 size={16} />
            </button>
          )}
          {(isOwner || onClose) && (
            <button
              onClick={isOwner ? onEnd : onClose}
              data-testid={isOwner ? "live-end-btn" : "live-close-btn"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-rose-600"
              title={isOwner ? "End stream" : "Leave"}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <FloatingHearts floaters={floaters} />

      {/* Bottom: chat + composer */}
      <div className="pointer-events-auto bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
        <div
          ref={scrollRef}
          className="mb-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-testid="live-chat-list"
        >
          {chat.length === 0 ? (
            <div className="w-fit rounded-full bg-black/30 px-2.5 py-1 text-[11px] text-white/60">Say hi 👋</div>
          ) : (
            chat.map((m) => <ChatRow key={m.id} m={m} />)
          )}
        </div>

        {giftsOpen && (
          <div className="mb-2 grid grid-cols-4 gap-2 rounded-2xl bg-black/60 p-3 backdrop-blur sm:grid-cols-7" data-testid="live-gift-tray">
            {gifts.map((g) => (
              <button
                key={g.id}
                onClick={() => { onSendGift(g.id); setGiftsOpen(false); }}
                data-testid={`live-gift-${g.id}`}
                className="flex flex-col items-center gap-0.5 rounded-xl bg-white/5 py-2 transition-transform hover:scale-110 active:scale-95"
              >
                <span className="text-2xl">{g.glyph}</span>
                <span className="text-[10px] font-semibold text-amber-300">{g.coins}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            data-testid="live-chat-input"
            maxLength={500}
            className="flex-1 rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none backdrop-blur focus:border-primary"
          />
          <button type="submit" data-testid="live-chat-send" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Send size={18} />
          </button>
          <button
            type="button"
            onClick={() => setGiftsOpen((v) => !v)}
            data-testid="live-gift-toggle"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500 text-black hover:bg-amber-400"
          >
            <Gift size={18} />
          </button>
          <button
            type="button"
            onClick={onSendHeart}
            data-testid="live-heart-btn"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white transition-transform hover:bg-rose-500 active:scale-90"
          >
            <Heart size={18} className="fill-white" />
          </button>
        </form>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-white/70">
          <Heart size={12} className="fill-rose-500 text-rose-500" /> {hearts.toLocaleString()} hearts
        </div>
      </div>
    </div>
  );
}
