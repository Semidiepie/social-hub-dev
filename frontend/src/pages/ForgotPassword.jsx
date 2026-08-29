import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Password reset — supports BOTH backend flows:
 * 1) 4-digit PIN (offline recovery) — /api/auth/forgot-password-pin
 * 2) 6-digit email code — /api/auth/forgot-password → /api/auth/reset-password
 *
 * Step 1: user enters email → we call /api/auth/has-pin to detect which flow.
 * Step 2: dynamic form based on has_pin.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState("email"); // email | pin | code
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [devCode, setDevCode] = useState(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const submitEmail = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const clean = email.trim().toLowerCase();
      const check = await api.post("/auth/has-pin", { email: clean }, false);
      if (check.has_pin) {
        setStep("pin");
      } else {
        const resp = await api.post("/auth/forgot-password", { email: clean }, false);
        if (resp?.dev_code) setDevCode(resp.dev_code);
        setStep("code");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await api.post(
        "/auth/forgot-password-pin",
        { email: email.trim().toLowerCase(), pin, new_password: newPassword },
        false,
      );
      setToken(resp.access_token);
      await refresh();
      toast.success("Password reset — you're logged in.");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid PIN");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await api.post(
        "/auth/reset-password",
        { email: email.trim().toLowerCase(), code, new_password: newPassword },
        false,
      );
      setToken(resp.access_token);
      await refresh();
      toast.success("Password reset — you're logged in.");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={step === "email" ? "Reset password" : step === "pin" ? "Enter your PIN" : "Enter the code"}
      subtitle={
        step === "email"
          ? "We'll figure out the fastest way to recover your account."
          : step === "pin"
            ? "Enter the 4-digit PIN you set on your account."
            : "We emailed you a 6-digit code."
      }
    >
      {step === "email" && (
        <form onSubmit={submitEmail} className="space-y-4" data-testid="forgot-email-form">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="forgot-email-input"
              className="mt-1.5 h-11"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="forgot-continue">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
          </Button>
        </form>
      )}

      {step === "pin" && (
        <form onSubmit={submitPin} className="space-y-4" data-testid="forgot-pin-form">
          <div>
            <Label>4-digit PIN</Label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              data-testid="forgot-pin-input"
              className="mt-1.5 h-11 text-center text-2xl tracking-[0.75em] font-mono"
            />
          </div>
          <div>
            <Label htmlFor="np">New password</Label>
            <Input
              id="np"
              type="password"
              minLength={6}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="forgot-newpass-input"
              className="mt-1.5 h-11"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="forgot-pin-submit">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reset password
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} className="space-y-4" data-testid="forgot-code-form">
          {devCode && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              Dev / sandbox mode: your code is <span className="font-mono font-bold text-primary">{devCode}</span>
            </div>
          )}
          <div>
            <Label>6-digit code</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              data-testid="forgot-code-input"
              className="mt-1.5 h-11 text-center text-2xl tracking-[0.5em] font-mono"
            />
          </div>
          <div>
            <Label htmlFor="np2">New password</Label>
            <Input
              id="np2"
              type="password"
              minLength={6}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="forgot-code-newpass-input"
              className="mt-1.5 h-11"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="forgot-code-submit">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reset password
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
