import React, { useEffect, useState } from "react";
import { Download, X, Share, Plus, MoreVertical, Smartphone } from "lucide-react";

const DISMISS_KEY = "pmp.install.dismissed";

function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isMobile() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /android|iphone|ipad|ipod/i.test(ua) || window.innerWidth < 768;
}

// Floating "Get the app" button + install guide. Mobile web only, hidden once installed.
export default function InstallAppPrompt() {
  const [platform, setPlatform] = useState("other");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setDismissed(!!localStorage.getItem(DISMISS_KEY));
    setEligible(isMobile() && !isStandalone());

    const onBip = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("open-install-guide", onOpen);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("open-install-guide", onOpen);
    };
  }, []);

  const [tab, setTab] = useState("ios");
  useEffect(() => { setTab(platform === "android" ? "android" : "ios"); }, [platform]);

  const nativeInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setOpen(false);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (!eligible) return null;

  return (
    <>
      {/* Floating pill */}
      {!dismissed && !open && (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2" data-testid="install-app-pill">
          <div className="flex items-center gap-1 rounded-full border border-primary/40 bg-card/95 py-1 pl-1 pr-1 shadow-xl backdrop-blur">
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              data-testid="install-app-open"
            >
              <Download size={16} /> Get the app
            </button>
            <button onClick={dismiss} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" data-testid="install-app-dismiss" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Guide modal */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)} data-testid="install-app-modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Smartphone size={22} />
                </span>
                <div>
                  <h3 className="text-lg font-black">Install PostMePlex</h3>
                  <p className="text-xs text-muted-foreground">Add it to your home screen for a full-screen app.</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" data-testid="install-app-close">
                <X size={18} />
              </button>
            </div>

            {/* Android native install shortcut */}
            {deferred && (
              <button
                onClick={nativeInstall}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-bold text-primary-foreground hover:bg-primary/90"
                data-testid="install-app-native"
              >
                <Download size={18} /> Install app
              </button>
            )}

            {/* Platform tabs */}
            <div className="mb-4 flex gap-2">
              {["ios", "android"].map((p) => (
                <button
                  key={p}
                  onClick={() => setTab(p)}
                  className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${tab === p ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                  data-testid={`install-tab-${p}`}
                >
                  {p === "ios" ? "iPhone (Safari)" : "Android (Chrome)"}
                </button>
              ))}
            </div>

            {tab === "ios" ? (
              <ol className="space-y-3">
                <Step n={1} icon={<Share size={18} />}>Tap the <b>Share</b> icon in Safari&apos;s bottom toolbar.</Step>
                <Step n={2} icon={<Plus size={18} />}>Scroll down and tap <b>&quot;Add to Home Screen&quot;</b>.</Step>
                <Step n={3} icon={<Download size={18} />}>Tap <b>Add</b> — PostMePlex now lives on your home screen.</Step>
              </ol>
            ) : (
              <ol className="space-y-3">
                <Step n={1} icon={<MoreVertical size={18} />}>Tap the <b>⋮ menu</b> (top-right in Chrome).</Step>
                <Step n={2} icon={<Plus size={18} />}>Tap <b>&quot;Add to Home screen&quot;</b> or <b>&quot;Install app&quot;</b>.</Step>
                <Step n={3} icon={<Download size={18} />}>Tap <b>Install</b> — done!</Step>
              </ol>
            )}

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              It installs the web app (no App Store needed) and opens full-screen like a native app.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, icon, children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">{n}</span>
      <div className="flex items-center gap-2 pt-1 text-sm text-foreground">
        <span className="text-primary">{icon}</span>
        <span>{children}</span>
      </div>
    </li>
  );
}
