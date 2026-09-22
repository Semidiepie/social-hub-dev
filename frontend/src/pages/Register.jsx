import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    username: "",
    display_name: "",
    password: "",
    pin: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(form.pin)) {
      setError("Choose a 4-digit PIN (you'll use it to sign in).");
      return;
    }
    setBusy(true);
    try {
      await register({
        email: form.email.trim().toLowerCase(),
        username: form.username.trim().toLowerCase(),
        display_name: form.display_name.trim(),
        password: form.password,
        pin: form.pin,
      });
      toast.success("Account created — welcome!");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Two minutes. Then start posting.">
      <form onSubmit={submit} className="space-y-4" data-testid="register-form">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={update("email")}
            data-testid="register-email-input"
            className="mt-1.5 h-11"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              minLength={3}
              maxLength={20}
              required
              value={form.username}
              onChange={update("username")}
              placeholder="clutchking"
              data-testid="register-username-input"
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              maxLength={40}
              required
              value={form.display_name}
              onChange={update("display_name")}
              placeholder="Kai"
              data-testid="register-name-input"
              className="mt-1.5 h-11"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={update("password")}
            data-testid="register-password-input"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label htmlFor="pin">Choose a 4-digit PIN</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
            placeholder="••••"
            data-testid="register-pin-input"
            className="mt-1.5 h-11 text-center text-xl font-bold tracking-[0.5em]"
          />
          <p className="mt-1 text-xs text-muted-foreground">You&apos;ll use this PIN to sign back in. Keep it safe.</p>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="register-error">
            {error}
          </div>
        )}
        <Button type="submit" disabled={busy} className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90" data-testid="register-submit">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have one?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline" data-testid="register-login-link">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
