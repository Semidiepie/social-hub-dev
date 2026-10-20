import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, BrainCircuit, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminTabs } from "@/components/AdminTabs";
import { toast } from "sonner";

const EXAMPLES = [
  "Send a voice message to Dad because you're thinking about him",
  "Send a text to Dad because you're nervous about your quiz tomorrow",
  "Text Dad a silly joke you just thought of",
];

// Admin → AI Characters: drop a thought into a character's head and she acts on it
// instantly — sends a text, a voice message, or places a call, exactly as the thought says.
export default function AdminAiCharactersPage() {
  const { user, loading: authLoading } = useAuth();
  const [chars, setChars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [charId, setCharId] = useState("");
  const [thought, setThought] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await api.get("/ai-characters");
        setChars(rows || []);
        if (rows?.length) setCharId(rows[0].id);
      } catch (e) {
        toast.error(e.message || "Couldn't load characters");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const selected = chars.find((c) => c.id === charId);

  const send = async () => {
    const t = thought.trim();
    if (!charId) { toast.error("Pick a character first"); return; }
    if (!t) { toast.error("Type a thought first"); return; }
    setSending(true);
    try {
      const r = await api.post(`/ai-characters/${charId}/thought`, { thought: t });
      const name = selected?.name || "She";
      if (r.mode === "call") toast.success(`${name} is calling you now 📞`);
      else if (r.mode === "voice") toast.success(`${name} sent you a voice message 🎤`);
      else toast.success(`${name} texted you: "${r.message}"`);
      setThought("");
    } catch (e) {
      toast.error(e.message || "Couldn't send that thought");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-aicharacters-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <BrainCircuit size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">
          Put a thought in a character&apos;s head. The moment you send it, she acts on it right away —
          texting, leaving a voice message, or calling you, exactly as the thought describes.
        </p>
      </header>

      <AdminTabs />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : chars.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-6 text-center text-muted-foreground" data-testid="aichar-empty">
          No AI characters yet. Create one from the Messages screen first.
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Character</label>
            <Select value={charId} onValueChange={setCharId}>
              <SelectTrigger className="h-11" data-testid="aichar-select">
                <SelectValue placeholder="Pick a character" />
              </SelectTrigger>
              <SelectContent>
                {chars.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`aichar-option-${c.id}`}>
                    {c.name}{c.username ? ` (@${c.username})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">The thought</label>
            <textarea
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              maxLength={600}
              rows={3}
              placeholder={EXAMPLES[1]}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
              data-testid="aichar-thought"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setThought(ex)}
                  className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="aichar-example"
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Tip: mention &quot;voice message&quot; for her to speak it, or &quot;call&quot; for her to ring you — otherwise she&apos;ll text.
            </p>
          </div>

          <Button
            onClick={send}
            disabled={sending || !thought.trim()}
            className="h-11 w-full gap-2 rounded-full font-bold"
            data-testid="aichar-send-thought"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
            Send Thought
          </Button>
        </div>
      )}
    </div>
  );
}
