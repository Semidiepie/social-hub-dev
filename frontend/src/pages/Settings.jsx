import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, Trash2, KeyRound, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        display_name: user.display_name,
        bio: user.bio || "",
        avatar_url: user.avatar_url || "",
      });
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

      {user.is_super_admin && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} /> Admin</CardTitle></CardHeader>
          <CardContent>
            <button
              onClick={() => navigate("/admin/reset-pins")}
              data-testid="settings-admin-reset-pins"
              className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-secondary"
            >
              <div>
                <div className="font-semibold">Reset PINs</div>
                <p className="text-xs text-muted-foreground">
                  Set a 4-digit password-reset PIN for any user.
                </p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" />
            </button>
          </CardContent>
        </Card>
      )}

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
