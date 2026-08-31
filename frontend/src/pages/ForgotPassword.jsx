import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() }, false);
      setDevLink(resp?.dev_link || null);
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="A reset link is on its way.">
        <div className="space-y-5" data-testid="forgot-sent">
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <MailCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <p className="text-sm text-foreground/90">
              If an account exists for{" "}
              <span className="font-semibold">{email.trim().toLowerCase()}</span>, we&apos;ve
              emailed a secure link to reset your password. Open it, choose a new password,
              and you&apos;ll be signed straight back in. The link expires in 60 minutes.
            </p>
          </div>
          {devLink && (
            <a href={devLink} data-testid="forgot-dev-link">
              <Button className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Open reset link
              </Button>
            </a>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-semibold text-primary hover:underline" data-testid="forgot-back-login">
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password?" subtitle="Enter your email and we'll send you a reset link.">
      <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
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
            data-testid="forgot-email-input"
            className="mt-1.5 h-11"
          />
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="forgot-error">
            {error}
          </div>
        )}
        <Button
          type="submit"
          disabled={busy}
          className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="forgot-submit"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send reset link
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline" data-testid="forgot-back-login">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
