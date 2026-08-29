import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, Trash2, KeyRound, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";

export default function SettingsPage() {
  const { user, patchUser, logout, refresh } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({ display_name: "", bio: "", avatar_url: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [savingPw, setSavingPw] = useState(false);

  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [pinCurPw, setPinCurPw] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        display_name: user.display_name,
        bio: user.bio || "",
        avatar_url: user.avatar_url || "",
      });
      setPinEnabled(!!user.reset_pin_enabled);
    }
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.put("/auth/me", profile);
      patchUser(updated);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    setUploadingAvatar(true);
    try {
      const res = await uploadToCloudinary(f, { resourceType: "image" });
      setProfile((p) => ({ ...p, avatar_url: res.secure_url }));
      toast.success("Avatar uploaded — save to apply.");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      await api.post("/auth/change-password", pw);
      toast.success("Password changed");
      setPw({ current_password: "", new_password: "" });
      await refresh();
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setSavingPw(false);
    }
  };

  const togglePin = async () => {
    // When enabling: prompt for pin + current password
    if (pinEnabled) {
      // Disable — send null pin
      setSavingPin(true);
      try {
        await api.post("/auth/reset-pin", { current_password: pinCurPw || prompt("Confirm your password") || "", pin: null });
        toast.success("PIN removed");
        setPinEnabled(false);
        setPin("");
        setPinCurPw("");
        patchUser({ reset_pin_enabled: false });
      } catch (e) {
        toast.error(e.message || "Failed");
      } finally {
        setSavingPin(false);
      }
    } else {
      if (!/^\d{4}$/.test(pin)) return toast.error("Enter a 4-digit PIN");
      if (!pinCurPw) return toast.error("Enter your current password");
      setSavingPin(true);
      try {
        await api.post("/auth/reset-pin", { current_password: pinCurPw, pin });
        toast.success("PIN set — remember it!");
        setPinEnabled(true);
        setPin("");
        setPinCurPw("");
        patchUser({ reset_pin_enabled: true });
      } catch (e) {
        toast.error(e.message || "Failed");
      } finally {
        setSavingPin(false);
      }
    }
  };

  const deleteAccount = useCallback(async () => {
    if (!window.confirm("Permanently delete your account and all content? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.del("/auth/me");
      toast.success("Account deleted");
      logout();
      navigate("/login", { replace: true });
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setDeleting(false);
    }
  }, [logout, navigate]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="settings-page">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your account and preferences.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar src={profile.avatar_url} size={72} />
              <div className="flex-1">
                <input
                  id="avatar-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadAvatar}
                />
                <label htmlFor="avatar-file">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingAvatar}
                    className="pointer-events-none gap-2"
                  >
                    {uploadingAvatar && <Loader2 size={14} className="animate-spin" />} Change avatar
                  </Button>
                </label>
                <p className="mt-2 text-[11px] text-muted-foreground">JPG/PNG, ≤ 5MB.</p>
              </div>
            </div>
            <div>
              <Label htmlFor="dn">Display name</Label>
              <Input
                id="dn"
                value={profile.display_name}
                onChange={(e) => setProfile((p) => ({ ...p, display_name: e.target.value }))}
                maxLength={40}
                data-testid="settings-display-name"
                className="mt-1.5 h-11"
              />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={profile.bio}
                onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                maxLength={160}
                data-testid="settings-bio"
                className="mt-1.5 min-h-[90px]"
              />
            </div>
            <Button
              type="submit"
              disabled={savingProfile}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="settings-save-profile"
            >
              {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} /> Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <Label>Current password</Label>
              <Input
                type="password"
                required
                value={pw.current_password}
                onChange={(e) => setPw((s) => ({ ...s, current_password: e.target.value }))}
                data-testid="settings-current-pw"
                className="mt-1.5 h-11"
              />
            </div>
            <div>
              <Label>New password</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={pw.new_password}
                onChange={(e) => setPw((s) => ({ ...s, new_password: e.target.value }))}
                data-testid="settings-new-pw"
                className="mt-1.5 h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={savingPw}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="settings-change-pw"
            >
              {savingPw && <Loader2 size={14} className="animate-spin" />} Change password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield size={18} /> 4-digit reset PIN</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Password reset via PIN</div>
              <p className="text-xs text-muted-foreground">
                Recover your password offline using a 4-digit PIN.
              </p>
            </div>
            <Switch checked={pinEnabled} disabled={savingPin} onCheckedChange={() => {}} data-testid="settings-pin-switch" />
          </div>
          {!pinEnabled && (
            <div className="mt-4 space-y-3">
              <div>
                <Label>New 4-digit PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  data-testid="settings-pin-input"
                  className="mt-1.5 h-11 text-center text-2xl tracking-[0.75em] font-mono"
                />
              </div>
              <div>
                <Label>Confirm with current password</Label>
                <Input
                  type="password"
                  value={pinCurPw}
                  onChange={(e) => setPinCurPw(e.target.value)}
                  data-testid="settings-pin-current-pw"
                  className="mt-1.5 h-11"
                />
              </div>
              <Button
                onClick={togglePin}
                disabled={savingPin}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="settings-pin-save"
              >
                {savingPin && <Loader2 size={14} className="animate-spin" />} Set PIN
              </Button>
            </div>
          )}
          {pinEnabled && (
            <Button
              onClick={togglePin}
              variant="outline"
              className="mt-4 gap-2"
              disabled={savingPin}
              data-testid="settings-pin-remove"
            >
              {savingPin && <Loader2 size={14} className="animate-spin" />} Remove PIN
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Delete account</div>
            <p className="text-xs text-muted-foreground">
              Permanently removes all your content and cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={deleteAccount}
            disabled={deleting}
            className="gap-2"
            data-testid="settings-delete-account"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
