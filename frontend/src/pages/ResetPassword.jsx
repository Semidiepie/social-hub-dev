import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// Detects a mobile device so we can deep-link back into the Expo app for
// auto-sign-in. On desktop we just sign in on the web.
const IS_MOBILE = typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
const APP_SCHEME = "postmeplex";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [deepLink, setDeepLink] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const resp = await api.post("/auth/reset-password", { token, new_password: password }, false);
      setSession(resp.access_token, resp.user);
      setDone(true);
      toast.success("Password updated — you're signed in!");
      if (IS_MOBILE) {
        // Hand the fresh session back to the app for auto-sign-in.
        const link = `${APP_SCHEME}://reset-complete?token=${encodeURIComponent(resp.access_token)}`;
        setDeepLink(link);
        window.location.href = link; // attempt to open the app immediately
      } else {
        setTimeout(() => navigate("/", { replace: true }), 900);
      }
    } catch (err) {
      setError(err.message || "This reset link is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This password reset link is incomplete.">
        <div className="space-y-4" data-testid="reset-no-token">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
            <p className="text-sm text-foreground/90">
              The reset link is missing its token. Please request a new one.
            </p>
          </div>
          <Link to="/forgot-password">
            <Button className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Request a new link
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You're all set.">
        <div className="space-y-5" data-testid="reset-done">
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <p className="text-sm text-foreground/90">
              Your password has been changed and you&apos;re signed in.
              {IS_MOBILE ? " Returning you to the PostMePlex app…" : " Taking you to your feed…"}
            </p>
          </div>
          {IS_MOBILE && deepLink && (
            <a href={deepLink} data-testid="reset-open-app">
              <Button className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Open the PostMePlex app
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => navigate("/", { replace: true })}
            data-testid="reset-continue-web"
          >
            Continue on the web
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password for your account.">
      <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            data-testid="reset-password-input"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            required
            data-testid="reset-confirm-input"
            className="mt-1.5 h-11"
          />
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="reset-error">
            {error}
          </div>
        )}
        <Button
          type="submit"
          disabled={busy}
          className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="reset-submit"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-semibold text-primary hover:underline" data-testid="reset-back-login">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
