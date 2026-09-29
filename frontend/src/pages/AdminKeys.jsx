import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, BellRing, BellOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { AdminTabs } from "@/components/AdminTabs";
import { pushSupported, enableBrowserPush, isBrowserPushEnabled } from "@/lib/webpush";
import { toast } from "sonner";

const STATUS = {
  ok: { icon: CheckCircle2, cls: "text-green-500", label: "Healthy" },
  invalid: { icon: XCircle, cls: "text-red-500", label: "Needs updating" },
  missing: { icon: AlertTriangle, cls: "text-yellow-500", label: "Missing" },
  error: { icon: AlertTriangle, cls: "text-orange-500", label: "Unreachable" },
};

// Admin → API keys: super-admin sees the live health of every third-party key and
// gets a browser push + in-app alert the moment one breaks/expires.
export default function AdminKeysPage() {
  const { user, loading: authLoading } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/keys/status");
      setServices(r.services);
    } catch (e) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (pushSupported()) isBrowserPushEnabled().then(setPushOn).catch(() => {});
  }, [load]);

  const recheck = async () => {
    setChecking(true);
    try {
      const r = await api.post("/admin/keys/check", {});
      setServices(r.services);
      const broken = r.alerted?.length || 0;
      toast[broken ? "warning" : "success"](broken ? `${broken} key(s) need attention — alert sent.` : "All keys healthy ✅");
    } catch (e) {
      toast.error(e.message || "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const turnOnPush = async () => {
    try {
      await enableBrowserPush();
      setPushOn(true);
      toast.success("Browser alerts enabled — you'll be notified the moment a key breaks.");
    } catch {
      toast.error("Couldn't enable browser notifications");
    }
  };

  if (authLoading) return null;
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="admin-keys-page">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <ShieldAlert size={24} className="text-primary" /> Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Live health of your API keys. You get an instant browser push + in-app alert whenever one needs updating.</p>
      </header>

      <AdminTabs />

      {pushSupported() && !pushOn && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4" data-testid="keys-enable-push">
          <div className="flex items-center gap-2 text-sm">
            <BellOff size={18} className="text-primary" />
            <span>Turn on browser alerts so you're notified the instant a key breaks.</span>
          </div>
          <Button onClick={turnOnPush} className="bg-primary text-primary-foreground" data-testid="keys-enable-push-btn">Enable</Button>
        </div>
      )}
      {pushOn && (
        <div className="flex items-center gap-2 rounded-2xl border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
          <BellRing size={16} /> Browser alerts are on — you'll be notified right away.
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={recheck} disabled={checking} variant="outline" className="gap-2" data-testid="keys-recheck-btn">
          {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Re-check now
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {services.map((s) => {
            const st = STATUS[s.status] || STATUS.error;
            return (
              <div key={s.service} className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4" data-testid={`key-row-${s.service}`}>
                <st.icon size={20} className={`mt-0.5 shrink-0 ${st.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{s.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Keys are auto-checked every 6 hours and the moment a live request is rejected. Only you (admin) receive these alerts.
      </p>
    </div>
  );
}
