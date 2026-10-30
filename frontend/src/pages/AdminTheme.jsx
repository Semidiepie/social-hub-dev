import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Sparkles, Loader2, Wand2, Check, Power, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { AdminTabs } from "@/components/AdminTabs";
import { PACK_LABELS, QUICK_PICKS } from "@/lib/holidayTheme";
import { toast } from "sonner";

const pushPreview = (spec) => {
  window.__pmpHolidayPreview = spec || null;
  window.dispatchEvent(new Event("pmp-holiday-preview"));
};
const refreshGlobal = () => {
  window.__pmpHolidayPreview = null;
  window.dispatchEvent(new Event("pmp-holiday-refresh"));
};

function Swatch({ label, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-7 w-7 rounded-lg border border-border" style={{ background: color }} />
      <div className="leading-tight">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className="font-mono text-xs">{color}</div>
      </div>
    </div>
  );
}

export default function AdminThemePage() {
  const { user, loading: authLoading } = useAuth();
  const [current, setCurrent] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [preview, setPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/theme");
      setCurrent(r);
    } catch (e) { toast.error(e.message || "Failed to load"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Clear any local preview when leaving the page.
  useEffect(() => () => pushPreview(null), []);

  const generate = async (p) => {
    const text = (p ?? prompt).trim();
    if (!text) { toast.error("Tell SAGE which holiday to design"); return; }
    if (p) setPrompt(p);
    setGenerating(true);
    try {
      const r = await api.post("/admin/theme/generate", { prompt: text, explanation: explanation.trim() });
      setPreview(r.spec);
      pushPreview(r.spec);
      toast.success(`SAGE designed a "${r.spec.name}" theme — previewing just for you`);
    } catch (e) {
      toast.error(e.message || "SAGE couldn't design that — try again");
    } finally {
      setGenerating(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await api.post("/admin/theme/apply", { spec: preview });
      setPreview(null);
      refreshGlobal();
      await load();
      toast.success("Theme is now live for everyone 🎉");
    } catch (e) { toast.error(e.message || "Couldn't apply"); } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await api.post("/admin/theme/off", {});
      setPreview(null);
      refreshGlobal();
      await load();
      toast.success("Back to the normal PostMePlex look");
    } catch (e) { toast.error(e.message || "Couldn't turn off"); } finally { setBusy(false); }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const live = current?.active ? current.spec : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-theme-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Sparkles size={24} className="text-primary" /> Holiday Theme Generator
        </h1>
        <p className="mt-1 text-muted-foreground">
          Ask SAGE to dress PostMePlex up for any holiday. Preview it privately, then apply it live for every visitor.
        </p>
      </header>

      <AdminTabs />

      {/* Live status */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4" data-testid="theme-live-status">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${live ? "bg-green-500" : "bg-muted-foreground"}`} />
          {live ? <span>Live theme: <b>{live.name}</b> — everyone sees it</span> : <span>No holiday theme active — normal look</span>}
        </div>
        {live && (
          <Button onClick={turnOff} disabled={busy} variant="outline" size="sm" className="gap-1.5" data-testid="theme-off-btn">
            <Power size={14} /> Turn off
          </Button>
        )}
      </div>

      {/* Quick picks */}
      <div>
        <div className="mb-2 text-sm font-semibold text-muted-foreground">Quick picks</div>
        <div className="flex flex-wrap gap-2">
          {QUICK_PICKS.map((q) => (
            <button key={q.prompt} onClick={() => generate(q.prompt)} disabled={generating}
                    data-testid={`theme-quick-${q.prompt.split(" ")[0].toLowerCase()}`}
                    className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50">
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom prompt */}
      <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Holiday or occasion</label>
          <input
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Diwali, Mardi Gras, our launch day…"
            data-testid="theme-prompt-input"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">What it represents <span className="font-normal text-muted-foreground">(optional — helps SAGE with custom holidays)</span></label>
          <textarea
            value={explanation} onChange={(e) => setExplanation(e.target.value)}
            rows={2} placeholder="Describe the colors, mood and symbols of this holiday so SAGE nails it."
            data-testid="theme-explanation-input"
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <Button onClick={() => generate()} disabled={generating} className="w-full gap-2 bg-primary text-primary-foreground" data-testid="theme-generate-btn">
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {generating ? "SAGE is designing…" : "Generate with SAGE"}
        </Button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-4 rounded-2xl border border-primary/50 bg-primary/5 p-4" data-testid="theme-preview-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold"><Eye size={16} className="text-primary" /> Previewing: {preview.name}</div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
              {PACK_LABELS[preview.pack]} · {preview.effect}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Only you can see this right now. Banner: <span className="text-foreground">“{preview.banner}”</span>
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch label="Primary" color={preview.primary} />
            <Swatch label="Accent" color={preview.accent} />
            <Swatch label="Background" color={preview.background} />
            <Swatch label="Text" color={preview.foreground} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={apply} disabled={busy} className="flex-1 gap-2 bg-primary text-primary-foreground" data-testid="theme-apply-btn">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Apply to everyone
            </Button>
            <Button onClick={() => { setPreview(null); pushPreview(null); }} variant="outline" className="gap-2" data-testid="theme-stop-preview-btn">
              <EyeOff size={16} /> Stop preview
            </Button>
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Themes are generated by SAGE AI from the real colors & symbols of each holiday. Applies to the website for all visitors (web).
      </p>
    </div>
  );
}
