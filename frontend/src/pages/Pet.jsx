import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Star, Sparkles, Pencil, Gamepad2, Bath, Drumstick,
  Loader2, Heart, Smile, Trash2, Check, X, Send, Wand2, Bell, HeartCrack, Share2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";
import { CatchGame, BubbleBath, FeedToss, InteractionModal } from "./pet/PetPlay";
import { enableBrowserPush, isBrowserPushEnabled, pushSupported } from "@/lib/webpush";

const STATS = [
  { key: "hunger", label: "Hunger", color: "#ef4444", Icon: Drumstick },
  { key: "happiness", label: "Happiness", color: "#f59e0b", Icon: Smile },
  { key: "cleanliness", label: "Cleanliness", color: "#8b5cf6", Icon: Sparkles },
  { key: "health", label: "Health", color: "#22c55e", Icon: Heart },
];

// Family-friendly, descriptive restyle presets (no named studios/brands).
const STUDIO_SUGGESTIONS = [
  "Make it a glossy 3D animated-movie character",
  "Make it bigger, rounder and chunkier",
  "Add warm cinematic movie lighting",
  "Give it a sparkly magical glow",
  "Soft clay-model (claymation) style",
  "Dreamy watercolor storybook style",
];

function fmtCd(secs) {
  if (secs <= 0) return "Ready";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

const GRASS_BG = "https://images.unsplash.com/photo-1709659754396-fea289bf16fe?crop=entropy&cs=srgb&fm=jpg&q=85&w=900";

function StatBar({ stat, value }) {
  const { label, color, Icon } = stat;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 p-3 ring-1 ring-black/5" data-testid={`pet-stat-${stat.key}`}>
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full shadow-sm" style={{ backgroundColor: color }}>
        <Icon size={18} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-emerald-950">{label}</span>
          <span className="text-sm font-black text-emerald-950">{value}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${value}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  );
}

function ActivityTile({ testId, label, color, Icon, ready, cd, busy, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!ready || busy}
      data-testid={testId}
      className={`group flex flex-col items-center gap-2 rounded-3xl p-4 transition-all duration-200 ${ready ? "hover:-translate-y-1 active:scale-95" : "opacity-60"}`}
      style={{ background: `${color}1a` }}
    >
      <span
        className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3"
        style={{ backgroundColor: color }}
      >
        {busy ? <Loader2 className="h-7 w-7 animate-spin text-white" /> : <Icon size={30} className="text-white" />}
      </span>
      <span className="text-sm font-black text-emerald-950">{label}</span>
      <span className="text-[11px] font-semibold text-emerald-700/60">{ready ? "Ready" : fmtCd(cd)}</span>
    </button>
  );
}

function CreatePet({ onCreated }) {
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (description.trim().length < 2) return toast.error("Describe your dream pet first");
    setBusy(true);
    try {
      const { pet } = await api.post("/pet", { description: description.trim(), name: name.trim() || undefined });
      toast.success("Sage AI created your pet!");
      onCreated(pet);
    } catch (e) {
      toast.error(e.message || "Couldn't create your pet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-emerald-800/50 bg-gradient-to-b from-emerald-900/60 to-emerald-950/80 p-6 text-emerald-50">
      <div className="mb-1 flex items-center gap-2 text-2xl font-black">
        <Sparkles className="text-emerald-300" /> Adopt your pet
      </div>
      <p className="mb-5 text-sm text-emerald-200/70">
        Describe your dream pet and <span className="font-bold text-emerald-300">Sage AI</span> will bring it to life.
      </p>
      <label className="text-xs font-bold uppercase tracking-wider text-emerald-300/80">Describe your dream pet</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. a fluffy green baby wolf with glowing markings"
        data-testid="pet-create-description"
        maxLength={200}
        rows={3}
        className="mt-1.5 w-full resize-none rounded-xl border border-emerald-800/60 bg-emerald-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-emerald-200/40 focus:border-emerald-400"
      />
      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-emerald-300/80">Pet name (optional)</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Elliot"
        data-testid="pet-create-name"
        maxLength={40}
        className="mt-1.5 w-full rounded-xl border border-emerald-800/60 bg-emerald-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-emerald-200/40 focus:border-emerald-400"
      />
      <Button
        onClick={create}
        disabled={busy}
        data-testid="pet-create-btn"
        className="mt-6 h-12 w-full gap-2 bg-emerald-500 text-base font-bold text-emerald-950 hover:bg-emerald-400"
      >
        {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Sage AI is painting…</> : <><Sparkles size={20} /> Create with Sage AI</>}
      </Button>
    </div>
  );
}

export default function PetPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleText, setStyleText] = useState("");
  const [bgText, setBgText] = useState("");
  const [studioMsgs, setStudioMsgs] = useState([]);
  const studioRef = useRef(null);
  const [cd, setCd] = useState({ play: 0, feed: 0, bath: 0 });
  const fetchedAt = useRef(Date.now());
  const [interaction, setInteraction] = useState(null); // 'play' | 'feed' | 'bath'
  const [hearts, setHearts] = useState([]);
  const [reactAnim, setReactAnim] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const heartId = useRef(0);

  useEffect(() => {
    if (pushSupported()) isBrowserPushEnabled().then((v) => setPushEnabled(v));
  }, []);

  const enableReminders = async () => {
    const ok = await enableBrowserPush();
    setPushEnabled(ok);
    toast[ok ? "success" : "error"](ok ? "Pet reminders on! 🔔" : "Enable notifications in your browser to get reminders.");
  };

  const petTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const id = ++heartId.current;
    setHearts((h) => [...h, { id, x, r: Math.random() * 30 - 15 }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1400);
    setReactAnim(true);
    setTimeout(() => setReactAnim(false), 500);
  };

  const applyPet = useCallback((p) => {
    setPet(p);
    if (p) {
      setCd(p.cooldowns);
      fetchedAt.current = Date.now();
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const { pet: p } = await api.get("/pet");
      applyPet(p);
    } catch (e) {
      toast.error(e.message || "Couldn't load your pet");
    } finally {
      setLoading(false);
    }
  }, [applyPet]);

  useEffect(() => { load(); }, [load]);

  // Tick cooldowns down locally.
  useEffect(() => {
    if (!pet) return;
    const t = setInterval(() => {
      const elapsed = Math.floor((Date.now() - fetchedAt.current) / 1000);
      setCd({
        play: Math.max(0, pet.cooldowns.play - elapsed),
        feed: Math.max(0, pet.cooldowns.feed - elapsed),
        bath: Math.max(0, pet.cooldowns.bath - elapsed),
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pet]);

  const doCare = async (action) => {
    setBusy(action);
    try {
      const { pet: p } = await api.post(`/pet/${action}`);
      applyPet(p);
      setReactAnim(true);
      setTimeout(() => setReactAnim(false), 700);
    } catch (e) {
      toast.error(e.message?.includes("cooldown") ? "Not ready yet — check back later!" : (e.message || "Action failed"));
    } finally {
      setBusy("");
    }
  };

  const startCare = (action) => {
    if (cd[action] > 0 || busy || pet?.is_dead) return;
    setInteraction(action);
  };

  const finishCare = async (action) => {
    setInteraction(null);
    await doCare(action);
  };

  const saveName = async () => {
    if (nameDraft.trim().length < 1) return;
    try {
      const { pet: p } = await api.patch("/pet", { name: nameDraft.trim() });
      applyPet(p);
      setEditingName(false);
    } catch (e) {
      toast.error(e.message || "Couldn't rename");
    }
  };

  const openStudio = () => {
    setStyleOpen(true);
    if (studioMsgs.length === 0) {
      setStudioMsgs([{
        role: "sage",
        text: "Hey! I'm Sage AI ✨ Tell me how you'd like to restyle your pet — e.g. \"make it a glossy 3D animated-movie character\" or \"make it bigger\". Pick a suggestion or type your own.",
      }]);
    }
  };

  const studioSend = async (preset) => {
    const instruction = (preset ?? styleText).trim();
    if (instruction.length < 2) return toast.error("Tell Sage AI what to change");
    if (busy === "style") return;
    setStudioMsgs((m) => [...m, { role: "you", text: instruction }]);
    setStyleText("");
    setBusy("style");
    setTimeout(() => studioRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 50);
    try {
      const { pet: p } = await api.post("/pet/style", { style: instruction });
      applyPet(p);
      setStudioMsgs((m) => [...m, { role: "sage", text: "Done! Here's the new look ✨", image: p.image_url }]);
    } catch (e) {
      setStudioMsgs((m) => [...m, { role: "sage", text: e.message || "That edit didn't work — try describing it a bit differently." }]);
      toast.error(e.message || "Restyle failed");
    } finally {
      setBusy("");
      setTimeout(() => studioRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 50);
    }
  };

  const generateBackground = async (preset) => {
    const instruction = (preset ?? bgText).trim();
    if (instruction.length < 2) return toast.error("Describe the background you want");
    if (busy === "bg") return;
    setBusy("bg");
    try {
      const { pet: p } = await api.post("/pet/background", { prompt: instruction });
      applyPet(p);
      setBgText("");
      toast.success("Sage AI painted a new background! 🎨");
    } catch (e) {
      toast.error(e.message || "Background generation failed");
    } finally {
      setBusy("");
    }
  };

  const removePet = async () => {
    if (!window.confirm("Release this pet? This cannot be undone.")) return;
    try {
      await api.del("/pet");
      setPet(null);
      toast.success("Pet released");
    } catch (e) {
      toast.error(e.message || "Couldn't remove pet");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>;
  }

  if (!pet) {
    return (
      <div className="py-4">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="pet-back">
          <ArrowLeft size={18} /> Back
        </button>
        {user?.is_verified ? (
          <CreatePet onCreated={applyPet} />
        ) : (
          <div className="mx-auto max-w-md rounded-3xl border border-emerald-800/50 bg-gradient-to-b from-emerald-900/60 to-emerald-950/80 p-8 text-center text-emerald-50" data-testid="pet-verified-gate">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-800/60">
              <BadgeCheck size={32} className="text-emerald-300" />
            </span>
            <h2 className="mt-4 text-2xl font-black">Verified members only</h2>
            <p className="mt-2 text-sm text-emerald-200/70">
              Adopting a Sage AI pet is a perk for verified accounts. Once you&apos;re verified, come back to create your dream pet!
            </p>
            <Button onClick={() => navigate("/")} className="mt-6 bg-emerald-500 font-bold text-emerald-950 hover:bg-emerald-400" data-testid="pet-gate-home">
              Back to Home
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (pet.is_dead) {
    return (
      <div className="mx-auto max-w-md pb-10 text-emerald-50">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="pet-back">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="rounded-3xl border border-rose-900/50 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-8 text-center" data-testid="pet-dead-card">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-900/40">
            <HeartCrack size={32} className="text-rose-400" />
          </span>
          <img src={pet.image_url} alt={pet.name} className="mx-auto mt-4 h-40 w-40 object-contain opacity-40 grayscale" />
          <h2 className="mt-3 text-2xl font-black text-white">{pet.name} has passed away</h2>
          <p className="mt-2 text-sm text-emerald-200/70">
            Your pet didn&apos;t survive the neglect. 🕊️ Release them to rest, then adopt a new companion — and remember to feed, play and bathe daily!
          </p>
          <Button
            onClick={async () => { await api.del("/pet"); setPet(null); toast.success("You can adopt a new pet now"); }}
            className="mt-6 w-full bg-emerald-500 font-bold text-emerald-950 hover:bg-emerald-400"
            data-testid="pet-adopt-new-btn"
          >
            Release &amp; adopt a new pet
          </Button>
        </div>
      </div>
    );
  }

  const level = pet.level;
  const xpPct = Math.round((pet.xp / pet.xp_to_level) * 100);

  return (
    <div className="mx-auto max-w-2xl pb-10 text-emerald-50">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-900/60 text-emerald-100 hover:bg-emerald-800" data-testid="pet-back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black">My {pet.stage} Pet</h1>
        <button
          onClick={async () => {
            const url = `${window.location.origin}/api/share/pet/${user?.username}`;
            try {
              if (navigator.share) await navigator.share({ title: `Meet ${pet.name} 🐾`, url });
              else { await navigator.clipboard.writeText(url); toast.success("Pet link copied — share it!"); }
            } catch { /* cancelled */ }
          }}
          data-testid="pet-share-btn"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-900/60 text-emerald-100 hover:bg-emerald-800"
          aria-label="Share pet"
        >
          <Share2 size={18} />
        </button>
      </div>

      {pushSupported() && !pushEnabled && (
        <button
          onClick={enableReminders}
          data-testid="pet-enable-reminders"
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-left transition-colors hover:bg-amber-500/20"
        >
          <Bell size={18} className="shrink-0 text-amber-400" />
          <span className="text-sm text-amber-100">
            <span className="font-bold">Turn on pet reminders</span> — get notified before your pet gets hungry, dirty or sick.
          </span>
        </button>
      )}

      {/* Pet display card — clean, light, nature scene */}
      <div className="relative overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-black/5" data-testid="pet-card">
        {/* Grass scene with the pet */}
        <div className="relative">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pet.background_url || GRASS_BG})` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-white" />
          <div className="relative z-10 flex items-start justify-between p-4">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-200/95 px-3 py-1.5 text-sm font-black text-emerald-900 shadow" data-testid="pet-level">
              <Star size={15} className="fill-emerald-700 text-emerald-700" /> Lv {level}
            </span>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-black text-emerald-900 shadow" data-testid="pet-xp">{pet.xp}/{pet.xp_to_level} XP</span>
              {pet.ai_styled && (
                <span className="flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow">
                  <Sparkles size={11} /> AI Styled
                </span>
              )}
            </div>
          </div>
          <button
            onClick={petTap}
            className="relative z-10 mx-auto -mt-3 mb-[-2px] flex w-full cursor-pointer select-none justify-center focus:outline-none"
            data-testid="pet-pet-tap"
            aria-label="Pet your pet"
          >
            <img
              src={pet.image_url}
              alt={pet.name}
              data-testid="pet-image"
              draggable={false}
              className={`h-64 w-64 object-contain drop-shadow-2xl sm:h-72 sm:w-72 ${reactAnim ? "animate-pet-bounce" : "animate-pet-idle"}`}
            />
            {hearts.map((h) => (
              <span key={h.id} className="pointer-events-none absolute bottom-1/2 animate-pet-heart text-3xl" style={{ left: `${h.x}%`, "--r": `${h.r}deg` }}>❤️</span>
            ))}
          </button>
        </div>

        {/* Light info area */}
        <div className="relative px-5 pb-5 pt-1 text-center">
          {editingName ? (
            <div className="flex items-center justify-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={40}
                autoFocus
                data-testid="pet-name-input"
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-center text-2xl font-black text-emerald-950 outline-none"
              />
              <button onClick={saveName} data-testid="pet-name-save" className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={18} /></button>
              <button onClick={() => setEditingName(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><X size={18} /></button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-4xl font-black text-emerald-950" data-testid="pet-name">{pet.name}</h2>
              <button
                onClick={() => { setNameDraft(pet.name === "Unnamed" ? "" : pet.name); setEditingName(true); }}
                data-testid="pet-name-edit"
                className="flex h-8 w-8 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100"
              >
                <Pencil size={15} />
              </button>
            </div>
          )}
          <div className="mt-0.5 text-lg font-bold text-emerald-700/80" data-testid="pet-mood">{pet.mood}</div>
          <div className="mt-1.5 flex justify-center"><Heart size={22} className="animate-pet-bounce fill-emerald-500 text-emerald-500" /></div>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-sm font-medium text-emerald-700/60">
            <Sparkles size={13} className="text-emerald-400" /> Tap your pet to pet it <Sparkles size={13} className="text-emerald-400" />
          </div>

          <div className="mx-auto mt-4 max-w-sm">
            <div className="mb-1 text-left text-xs font-semibold text-emerald-700/70">Level {level}/10 · {pet.stage}</div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${xpPct}%` }} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
            {STATS.map((s) => <StatBar key={s.key} stat={s} value={pet[s.key]} />)}
          </div>
        </div>
      </div>

      {/* Activities */}
      <div className="mt-5 rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-black/5">
        <div className="mb-4 text-center text-sm font-black uppercase tracking-widest text-emerald-800/70">Activities</div>
        <div className="grid grid-cols-3 gap-3">
          <ActivityTile testId="pet-feed-btn" label="Feed" color="#f59e0b" Icon={Drumstick} ready={cd.feed <= 0} cd={cd.feed} busy={busy === "feed"} onClick={() => startCare("feed")} />
          <ActivityTile testId="pet-bath-btn" label="Bath" color="#8b5cf6" Icon={Bath} ready={cd.bath <= 0} cd={cd.bath} busy={busy === "bath"} onClick={() => startCare("bath")} />
          <ActivityTile testId="pet-play-btn" label="Play" color="#22c55e" Icon={Gamepad2} ready={cd.play <= 0} cd={cd.play} busy={busy === "play"} onClick={() => startCare("play")} />
        </div>
      </div>

      {/* Sage AI Studio — live restyle chat */}
      <div className="mt-4 rounded-3xl border border-violet-800/40 bg-emerald-900/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
              <Wand2 size={20} />
            </span>
            <div>
              <div className="font-black text-white">Sage AI Studio</div>
              <div className="text-xs text-violet-300">Chat to restyle your pet ✨</div>
            </div>
          </div>
          <button onClick={removePet} data-testid="pet-remove-btn" className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10">
            <Trash2 size={15} /> Release
          </button>
        </div>

        {/* Custom background generator */}
        <div className="mt-4 rounded-2xl border border-emerald-800/50 bg-emerald-950/40 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-100">
            <Wand2 size={15} className="text-violet-300" /> Custom background
          </div>
          <p className="mt-0.5 text-xs text-emerald-200/60">Ask Sage AI to paint a new scene for your pet.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Cozy bedroom at sunset", "Magical forest with fireflies", "Sunny beach", "Snowy winter village", "Candy world"].map((s) => (
              <button
                key={s}
                onClick={() => generateBackground(s)}
                disabled={busy === "bg"}
                data-testid={`pet-bg-chip-${s.slice(0, 8)}`}
                className="rounded-full border border-violet-700/50 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-800/40 disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <input
              value={bgText}
              onChange={(e) => setBgText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generateBackground(); } }}
              placeholder="Describe a background scene…"
              data-testid="pet-bg-input"
              maxLength={200}
              disabled={busy === "bg"}
              className="flex-1 rounded-xl border border-emerald-800/60 bg-emerald-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-emerald-200/40 focus:border-violet-400 disabled:opacity-50"
            />
            <Button onClick={() => generateBackground()} disabled={busy === "bg" || bgText.trim().length < 2} data-testid="pet-bg-submit" className="h-12 gap-2 bg-violet-600 px-4 font-bold text-white hover:bg-violet-500">
              {busy === "bg" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles size={16} />}
            </Button>
          </div>
        </div>

        {styleOpen ? (
          <div className="mt-4">
            {/* Chat thread */}
            <div
              ref={studioRef}
              data-testid="pet-studio-thread"
              className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-emerald-800/50 bg-emerald-950/50 p-3"
            >
              {studioMsgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`} data-testid={`pet-studio-msg-${i}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "you"
                      ? "bg-violet-600 text-white"
                      : "bg-emerald-900/70 text-emerald-50"
                  }`}>
                    {m.role === "sage" && <div className="mb-0.5 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-violet-300"><Sparkles size={11} /> Sage AI</div>}
                    <div>{m.text}</div>
                    {m.image && (
                      <img src={m.image} alt="new look" className="mt-2 h-32 w-32 rounded-xl bg-emerald-950/60 object-contain" />
                    )}
                  </div>
                </div>
              ))}
              {busy === "style" && (
                <div className="flex justify-start" data-testid="pet-studio-thinking">
                  <div className="flex items-center gap-2 rounded-2xl bg-emerald-900/70 px-3 py-2 text-sm text-emerald-200">
                    <Loader2 className="h-4 w-4 animate-spin" /> Sage AI is painting…
                  </div>
                </div>
              )}
            </div>

            {/* Suggestion chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {STUDIO_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => studioSend(s)}
                  disabled={busy === "style"}
                  data-testid={`pet-studio-chip-${s.slice(0, 10)}`}
                  className="rounded-full border border-violet-700/50 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-800/40 disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="mt-3 flex items-end gap-2">
              <input
                value={styleText}
                onChange={(e) => setStyleText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); studioSend(); } }}
                placeholder="Describe the new look…"
                data-testid="pet-style-input"
                maxLength={200}
                disabled={busy === "style"}
                className="flex-1 rounded-xl border border-emerald-800/60 bg-emerald-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-emerald-200/40 focus:border-violet-400 disabled:opacity-50"
              />
              <Button onClick={() => studioSend()} disabled={busy === "style" || styleText.trim().length < 2} data-testid="pet-style-submit" className="h-12 gap-2 bg-violet-600 px-4 font-bold text-white hover:bg-violet-500">
                {busy === "style" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-violet-300/60">Each edit uses a little Sage AI credit — only when you tap send.</p>
          </div>
        ) : (
          <Button onClick={openStudio} data-testid="pet-style-open" className="mt-4 w-full gap-2 bg-violet-600 font-bold text-white hover:bg-violet-500">
            <Wand2 size={18} /> Open Sage AI Studio
          </Button>
        )}
      </div>

      {interaction === "play" && (
        <InteractionModal title="🎮 Treat-Catch" onClose={() => setInteraction(null)}>
          <CatchGame petImage={pet.image_url} onCancel={() => setInteraction(null)} onDone={() => finishCare("play")} />
        </InteractionModal>
      )}
      {interaction === "feed" && (
        <InteractionModal title="🍽️ Feeding time" onClose={() => setInteraction(null)}>
          <FeedToss petImage={pet.image_url} onCancel={() => setInteraction(null)} onDone={() => finishCare("feed")} />
        </InteractionModal>
      )}
      {interaction === "bath" && (
        <InteractionModal title="🛁 Bath time" onClose={() => setInteraction(null)}>
          <BubbleBath petImage={pet.image_url} onCancel={() => setInteraction(null)} onDone={() => finishCare("bath")} />
        </InteractionModal>
      )}
    </div>
  );
}
