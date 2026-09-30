import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

const IMAGE_MS = 5000;

// Full-screen Instagram/Facebook-style story viewer: auto-advancing progress
// bars, tap left/right to navigate across a user's stories and between users.
export function StoryViewer({ groups, startIndex = 0, me, onClose, onSeen }) {
  const [gi, setGi] = useState(startIndex); // which user group
  const [si, setSi] = useState(0); // which story within the group
  const [stories, setStories] = useState([]);
  const [owner, setOwner] = useState(null);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startRef = useRef(0);

  const group = groups[gi];

  const clearTimer = () => {
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  };

  // Load the current user's stories whenever the group changes.
  useEffect(() => {
    let active = true;
    setStories([]);
    setSi(0);
    if (!group) return;
    api
      .get(`/stories/user/${group.user_id}`)
      .then((data) => {
        if (!active) return;
        setOwner(data.user);
        setStories(data.stories || []);
      })
      .catch(() => active && setStories([]));
    return () => {
      active = false;
    };
  }, [group]);

  const next = useCallback(() => {
    clearTimer();
    if (si < stories.length - 1) {
      setSi((n) => n + 1);
    } else if (gi < groups.length - 1) {
      setGi((n) => n + 1);
    } else {
      onClose();
    }
  }, [si, stories.length, gi, groups.length, onClose]);

  const prev = useCallback(() => {
    clearTimer();
    if (si > 0) setSi((n) => n - 1);
    else if (gi > 0) setGi((n) => n - 1);
  }, [si, gi]);

  const current = stories[si];

  // Mark seen + drive the progress bar / auto-advance for the current story.
  useEffect(() => {
    if (!current) return;
    api.post(`/stories/${current.id}/view`).then(() => onSeen?.(group.user_id)).catch(() => {});
    setProgress(0);
    const isVideo = current.media_type === "video";
    if (isVideo) return; // videos advance on 'ended'
    startRef.current = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - startRef.current) / IMAGE_MS);
      setProgress(p);
      if (p >= 1) next();
      else timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
    return clearTimer;
  }, [current, next, group, onSeen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const removeStory = async () => {
    if (!current || !window.confirm("Delete this story?")) return;
    try {
      await api.del(`/stories/${current.id}`);
      const remaining = stories.filter((s) => s.id !== current.id);
      toast.success("Story deleted");
      if (remaining.length === 0) onClose();
      else {
        setStories(remaining);
        setSi((n) => Math.max(0, Math.min(n, remaining.length - 1)));
      }
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const isOwn = me && group && me.id === group.user_id;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95" data-testid="story-viewer">
      <div className="relative flex h-full max-h-[100dvh] w-full max-w-[440px] flex-col">
        {/* Progress bars */}
        <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 p-3">
          {stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white"
                style={{ width: i < si ? "100%" : i === si ? `${progress * 100}%` : "0%" }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute left-0 right-0 top-4 z-20 flex items-center gap-2 px-3 pt-2">
          <Avatar src={owner?.avatar_url} size={34} ring />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-bold text-white">{owner?.display_name || group?.display_name}</div>
            <div className="text-[11px] text-white/70">{current ? timeAgo(current.created_at) : ""}</div>
          </div>
          {isOwn && (
            <button onClick={removeStory} className="rounded-full p-2 text-white/90 hover:bg-white/10" data-testid="story-delete" aria-label="Delete story">
              <Trash2 size={18} />
            </button>
          )}
          <button onClick={onClose} className="rounded-full p-2 text-white/90 hover:bg-white/10" data-testid="story-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Media */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black">
          {current && current.media_type === "video" ? (
            <video
              key={current.id}
              src={current.media_url}
              autoPlay
              playsInline
              controls={false}
              onEnded={next}
              className="max-h-full w-full object-contain"
            />
          ) : current ? (
            <img key={current.id} src={current.media_url} alt="" className="max-h-full w-full object-contain" />
          ) : null}
        </div>

        {/* Caption */}
        {current?.caption ? (
          <div className="absolute bottom-6 left-0 right-0 z-20 px-5 text-center">
            <span className="inline-block rounded-2xl bg-black/50 px-4 py-2 text-sm font-medium text-white">{current.caption}</span>
          </div>
        ) : null}

        {/* Tap zones */}
        <button className="absolute left-0 top-16 z-10 h-[calc(100%-8rem)] w-1/3" onClick={prev} aria-label="Previous" data-testid="story-prev" />
        <button className="absolute right-0 top-16 z-10 h-[calc(100%-8rem)] w-1/3" onClick={next} aria-label="Next" data-testid="story-next" />

        {/* Desktop arrows */}
        {gi > 0 && (
          <button onClick={prev} className="absolute -left-12 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white md:block">
            <ChevronLeft size={22} />
          </button>
        )}
        {gi < groups.length - 1 && (
          <button onClick={next} className="absolute -right-12 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white md:block">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
