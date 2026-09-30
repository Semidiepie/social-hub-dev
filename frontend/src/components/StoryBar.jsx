import React, { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { StoryComposer } from "@/components/StoryComposer";
import { StoryViewer } from "@/components/StoryViewer";

// Facebook/Instagram-style story bar on the Home feed (web).
export function StoryBar() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get("/stories");
      setGroups(Array.isArray(rows) ? rows : []);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markSeen = (userId) =>
    setGroups((rows) => rows.map((r) => (r.user_id === userId ? { ...r, seen: true } : r)));

  if (!user) return null;

  const myGroup = groups.find((g) => g.is_me);
  const others = groups.filter((g) => !g.is_me);

  const openViewer = (userId) => {
    const idx = groups.findIndex((g) => g.user_id === userId);
    if (idx >= 0) setViewerIndex(idx);
  };

  return (
    <div className="mb-6" data-testid="story-bar">
      <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {/* Your story */}
        <button
          onClick={() => (myGroup ? openViewer(myGroup.user_id) : setComposerOpen(true))}
          className="flex w-[72px] flex-none flex-col items-center gap-1.5"
          data-testid="story-your-story"
        >
          <div className="relative">
            <span className={myGroup && !myGroup.seen ? "inline-block rounded-full p-[2px] ring-2 ring-primary" : "inline-block rounded-full p-[2px] ring-2 ring-border"}>
              <Avatar src={user.avatar_url} size={60} />
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setComposerOpen(true);
              }}
              className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
              data-testid="story-add-btn"
            >
              <Plus size={14} />
            </span>
          </div>
          <span className="max-w-[68px] truncate text-[11px] font-medium text-muted-foreground">Your story</span>
        </button>

        {/* Followed users' stories */}
        {others.map((g) => (
          <button
            key={g.user_id}
            onClick={() => openViewer(g.user_id)}
            className="flex w-[72px] flex-none flex-col items-center gap-1.5"
            data-testid={`story-ring-${g.user_id}`}
          >
            <span className={`inline-block rounded-full p-[2px] ring-2 ${g.seen ? "ring-border" : "ring-primary"}`}>
              <Avatar src={g.avatar_url} size={60} />
            </span>
            <span className="max-w-[68px] truncate text-[11px] font-medium text-foreground">{g.display_name}</span>
          </button>
        ))}
      </div>

      <StoryComposer open={composerOpen} onClose={() => setComposerOpen(false)} onPosted={load} />
      {viewerIndex !== null && (
        <StoryViewer
          groups={groups}
          startIndex={viewerIndex}
          me={user}
          onClose={() => setViewerIndex(null)}
          onSeen={markSeen}
        />
      )}
    </div>
  );
}
