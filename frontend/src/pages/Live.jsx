import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Mic, Radio, Users, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function LivePage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api.get("/rooms");
      setRooms(rows);
    } catch (e) {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const startRoom = async () => {
    if (title.trim().length < 3) return toast.error("Give your room a title (min 3 characters)");
    setStarting(true);
    try {
      await api.post("/rooms/start", { title: title.trim(), topic: topic.trim() || null });
      toast.success("Room created — join from the mobile app to broadcast audio.");
      setOpen(false);
      setTitle("");
      setTopic("");
      load();
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Live rooms</h1>
          <p className="mt-1 text-muted-foreground">Audio livestreams — hosted from mobile, browsable everywhere.</p>
        </div>
        {user && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="live-go-live">
                <Mic size={16} /> Start a room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start an audio room</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What are you talking about?"
                    maxLength={120}
                    autoFocus
                    data-testid="live-composer-title"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Topic (optional)</Label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Music · Gaming · Q&A"
                    maxLength={60}
                    data-testid="live-composer-topic"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-xs">
                  <Smartphone size={16} className="mt-0.5 flex-shrink-0 text-primary" />
                  <span>
                    Web currently supports <b>listening</b> to rooms. To broadcast audio, open the PostMePlex
                    mobile app after starting the room.
                  </span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={starting}>Cancel</Button>
                <Button
                  onClick={startRoom}
                  disabled={starting}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="live-composer-submit"
                >
                  {starting ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />} Go live
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
            <Radio className="text-primary" size={28} />
          </div>
          <h3 className="mt-3 text-xl font-bold">No rooms live right now</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Kick one off — anyone on PostMePlex can hop in.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" data-testid={`room-${r.id}`}>
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Live
              </span>
              <h3 className="text-lg font-bold leading-snug">{r.title}</h3>
              {r.topic && <div className="text-xs text-muted-foreground">{r.topic}</div>}
              <div className="mt-auto flex items-center gap-2">
                <Avatar src={r.host.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.host.display_name}</div>
                  <div className="text-[11px] text-muted-foreground">Host · @{r.host.username}</div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold">
                  <Users size={11} /> {r.audience_count}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
