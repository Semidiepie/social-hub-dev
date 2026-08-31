import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ResetWithPinPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError("Enter the 4-digit PIN.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const resp = await api.post(
        "/auth/reset-with-pin",
        { email: email.trim().toLowerCase(), pin, new_password: password },
        false,
      );
      setSession(resp.access_token, resp.user);
      toast.success("Password updated — you're signed in!");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid email or PIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Reset with PIN" subtitle="Use the 4-digit PIN an admin gave you.">
      <form onSubmit={submit} className="space-y-4" data-testid="reset-pin-form">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            data-testid="reset-pin-email"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label htmlFor="pin">4-digit PIN</Label>
          <Input
            id="pin"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            required
            data-testid="reset-pin-code"
            className="mt-1.5 h-12 text-center text-2xl font-mono tracking-[0.6em]"
          />
        </div>
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
            data-testid="reset-pin-new-password"
            className="mt-1.5 h-11"
          />
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="reset-pin-error">
            {error}
          </div>
        )}
        <Button
          type="submit"
          disabled={busy}
          className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="reset-pin-submit"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
          Reset password
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/forgot-password" className="font-semibold text-primary hover:underline" data-testid="reset-pin-use-email">
            Prefer an email link instead?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
