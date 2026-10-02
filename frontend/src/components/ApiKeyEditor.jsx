import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Save, FlaskConical, RotateCcw, CheckCircle2, XCircle, AlertTriangle, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const SOURCE = {
  custom: { label: "Custom", cls: "bg-primary/15 text-primary" },
  env: { label: "Default", cls: "bg-secondary text-muted-foreground" },
  unset: { label: "Not set", cls: "bg-yellow-500/15 text-yellow-500" },
};

const TEST_ICON = { ok: CheckCircle2, invalid: XCircle, missing: AlertTriangle, error: AlertTriangle };
const TEST_CLS = { ok: "text-green-500", invalid: "text-red-500", missing: "text-yellow-500", error: "text-orange-500" };

function KeyRow({ k, onChanged }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const src = SOURCE[k.source] || SOURCE.unset;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put(`/admin/keys/${k.name}`, { value: draft });
      setDraft("");
      setResult(null);
      toast.success(`${k.label} saved — live now`);
      onChanged(r);
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post(`/admin/keys/${k.name}/test`, {});
      setResult(r);
    } catch (e) {
      setResult({ status: "error", detail: e.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(`Reset ${k.label} to the platform default?`)) return;
    setSaving(true);
    try {
      const r = await api.put(`/admin/keys/${k.name}`, { value: "" });
      setDraft("");
      setResult(null);
      toast.success(`${k.label} reset to default`);
      onChanged(r);
    } catch (e) {
      toast.error(e.message || "Reset failed");
    } finally {
      setSaving(false);
    }
  };

  const TIcon = result ? TEST_ICON[result.status] || AlertTriangle : null;

  return (
    <div className="rounded-xl border border-border p-3" data-testid={`keyedit-row-${k.name}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{k.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${src.cls}`} data-testid={`keyedit-source-${k.name}`}>
          {src.label}
        </span>
      </div>
      <div className="mt-1 truncate font-mono text-xs text-muted-foreground" data-testid={`keyedit-current-${k.name}`}>
        {k.present ? k.masked : "— not configured —"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          type={k.secret ? "password" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`New value to replace…`}
          className="h-9 flex-1 min-w-[160px] font-mono text-xs"
          data-testid={`keyedit-input-${k.name}`}
        />
        <Button onClick={save} disabled={saving || !draft.trim()} size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground" data-testid={`keyedit-save-${k.name}`}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </Button>
        <Button onClick={test} disabled={testing || !k.present} size="sm" variant="outline" className="h-9 gap-1.5" data-testid={`keyedit-test-${k.name}`}>
          {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Test
        </Button>
        {k.source === "custom" && (
          <Button onClick={reset} disabled={saving} size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground" data-testid={`keyedit-reset-${k.name}`}>
            <RotateCcw size={14} /> Reset
          </Button>
        )}
      </div>
      {result && (
        <div className={`mt-2 flex items-center gap-1.5 text-xs ${TEST_CLS[result.status] || "text-muted-foreground"}`} data-testid={`keyedit-result-${k.name}`}>
          {TIcon && <TIcon size={14} />} {result.detail}
        </div>
      )}
    </div>
  );
}

export function ApiKeyEditor() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/keys/values");
      setKeys(r.keys);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onChanged = (updated) => {
    setKeys((list) => list.map((k) => (k.name === updated.name ? { ...k, ...updated } : k)));
  };

  return (
    <Card data-testid="api-key-editor">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-primary" />
          <h2 className="text-lg font-bold">Update API keys</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste a new value and hit Save — it takes effect immediately, no redeploy needed. Secrets are hidden; only the last few characters are shown.
        </p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <KeyRow key={k.name} k={k} onChanged={onChanged} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
