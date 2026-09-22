import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, getLastAccount, forgetAccount } from "@/context/AuthContext";
import { toast } from "sonner";

export default function LoginPage() {
  const remembered = getLastAccount();
  const [identifier, setIdentifier] = useState(remembered?.identifier || "");
  const [pin, setPin] = useState("");
  const [useDifferent, setUseDifferent] = useState(!remembered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { loginWithPin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError("Enter your 4-digit PIN.");
    if (!identifier.trim()) return setError("Enter your email or username.");
    setBusy(true);
    try {
      await loginWithPin(identifier, pin);
      toast.success("Welcome back!");
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const switchAccount = () => {
    forgetAccount();
    setUseDifferent(true);
    setIdentifier("");
    setPin("");
  };

  return (
    <AuthLayout title="Enter your PIN" subtitle="Sign in with the 4-digit PIN you chose at signup.">
      <form onSubmit={submit} className="space-y-4" data-testid="login-form">
        {!useDifferent && remembered ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3" data-testid="login-remembered-account">
            <Avatar src={remembered.avatar_url} size={44} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{remembered.display_name}</div>
              <div className="truncate text-xs text-muted-foreground">@{remembered.identifier}</div>
            </div>
            <button
              type="button"
              onClick={switchAccount}
              className="text-xs font-semibold text-primary hover:underline"
              data-testid="login-switch-account"
            >
              Not you?
            </button>
          </div>
        ) : (
          <div>
            <Label htmlFor="identifier">Email or username</Label>
            <Input
              id="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              required
              data-testid="login-identifier-input"
              className="mt-1.5 h-11"
            />
          </div>
        )}

        <div>
          <Label htmlFor="pin">PIN</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            required
            autoFocus
            data-testid="login-pin-input"
            className="mt-1.5 h-14 text-center text-2xl font-bold tracking-[0.6em]"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="login-error">
            {error}
          </div>
        )}
        <Button
          type="submit"
          disabled={busy}
          className="h-11 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="login-submit"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound size={16} />} Sign in
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Forgot your PIN? Ask an admin to reset it for you.
        </p>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link to="/register" className="font-semibold text-primary hover:underline" data-testid="login-register-link">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
