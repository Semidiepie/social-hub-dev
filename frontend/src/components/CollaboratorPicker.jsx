import React, { useEffect, useRef, useState } from "react";
import { X, Search, Loader2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

// Search PostMePlex users and pick exactly one collaborator. Used by the composer
// and the re-invite flow. Calls onSelect(user) with {id, username, display_name, avatar_url}.
export default function CollaboratorPicker({ onSelect, onClose, excludeId }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return undefined; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/search?q=${encodeURIComponent(term)}`);
        setResults((r.users || []).filter((u) => u.id !== excludeId).slice(0, 8));
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, excludeId]);

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-2" data-testid="collaborator-picker">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5">
        <Search size={15} className="text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a creator by name or @username"
          data-testid="collaborator-search-input"
          className="h-9 flex-1 bg-transparent text-sm outline-none"
        />
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" data-testid="collaborator-picker-close" aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>
      {loading && <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-primary" /></div>}
      {!loading && results.length > 0 && (
        <ul className="mt-1 max-h-60 overflow-y-auto">
          {results.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => onSelect(u)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-secondary/60"
                data-testid={`collaborator-result-${u.username}`}
              >
                <Avatar src={u.avatar_url} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{u.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                </span>
                <UserPlus size={15} className="ml-auto text-primary" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && q.trim() && results.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">No creators found</p>
      )}
    </div>
  );
}
