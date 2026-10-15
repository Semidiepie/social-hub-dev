import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, Trash2, KeyRound, ChevronRight, Heart, Sparkles, Link2, Circle, Image as ImageIcon, Settings as SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { uploadToCloudinary, cloudinaryAvailable } from "@/lib/cloudinary";
import { enableBrowserPush, disableBrowserPush, isBrowserPushEnabled } from "@/lib/webpush";
import { Bell } from "lucide-react";

export default function SettingsPage() {
  const { user, patchUser, logout, refresh } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({ display_name: "", bio: "", avatar_url: "", username: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [savingPw, setSavingPw] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [remBusy, setRemBusy] = useState(false);
  const [cosmeticBusy, setCosmeticBusy] = useState(false);

  const [social, setSocial] = useState({ connections: [], tiktok_configured: false });
  const [socialBusy, setSocialBusy] = useState(false);

  const [appearOffline, setAppearOffline] = useState(false);
  const [presenceBusy, setPresenceBusy] = useState(false);

  useEffect(() => {
    api.get("/users/me/privacy").then((p) => setAppearOffline(!!p.appear_offline)).catch(() => {});
  }, []);

  const toggleAppearOffline = async () => {
    setPresenceBusy(true);
    try {
      const p = await api.put("/users/me/privacy", { appear_offline: !appearOffline });
      setAppearOffline(!!p.appear_offline);
      toast.success(p.appear_offline ? "You now appear offline" : "Active status is on");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setPresenceBusy(false);
    }
  };

  const loadSocial = useCallback(async () => {
    try { setSocial(await api.get("/social/connections")); } catch { /* noop */ }
  }, []);

  useEffect(() => { loadSocial(); }, [loadSocial]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tiktok") === "connected") {
      toast.success("TikTok connected — your videos are importing to your profile!");
      loadSocial();
      window.history.replaceState({}, "", "/settings");
    }
  }, [loadSocial]);

  const connectTikTok = () => {
    const token = getToken();
    window.location.href = `${process.env.REACT_APP_BACKEND_URL}/api/social/tiktok/login?token=${encodeURIComponent(token || "")}`;
  };
  const reimportTikTok = async () => {
    setSocialBusy(true);
    try {
      const { imported } = await api.post("/social/tiktok/import", {});
      toast.success(`Imported ${imported} TikTok video${imported === 1 ? "" : "s"}.`);
      loadSocial();
    } catch (e) { toast.error(e.message || "Import failed"); }
    finally { setSocialBusy(false); }
  };
  const disconnectTikTok = async () => {
    setSocialBusy(true);
    try { await api.del("/social/tiktok"); toast.success("TikTok disconnected."); loadSocial(); }
    catch (e) { toast.error(e.message || "Failed"); }
    finally { setSocialBusy(false); }
  };
  const tiktokConn = social.connections.find((c) => c.platform === "tiktok");

  const saveCosmetic = async (payload) => {
    setCosmeticBusy(true);
    try {
      const updated = await api.post("/market/cosmetics", payload);
      patchUser(updated);
    } catch (e) {
      toast.error(e.message || "Failed to update");
    } finally {
      setCosmeticBusy(false);
    }
  };

  const applyRemembering = async () => {
    setRemBusy(true);
    try {
      const res = await api.post("/remembering/apply");
      patchUser({ remembering: res.remembering, remembering_status: res.remembering_status });
      toast.success("Request submitted — an admin will review it.");
    } catch (e) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setRemBusy(false);
    }
  };

  useEffect(() => {
    isBrowserPushEnabled().then(setPushOn);
  }, []);

  const toggleBrowserPush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) {
        await disableBrowserPush();
        setPushOn(false);
        toast.success("Browser notifications turned off");
      } else {
        const ok = await enableBrowserPush();
        setPushOn(ok);
        toast[ok ? "success" : "error"](
          ok ? "Browser notifications enabled" : "Permission denied or unsupported"
        );
      }
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    if (user) {
      setProfile({
        display_name: user.display_name,
        bio: user.bio || "",
        avatar_url: user.avatar_url || "",
        cover_url: user.cover_url || "",
        username: user.username || "",
      });
    }
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const payload = { ...profile };
      if (!payload.username || payload.username.length < 3) delete payload.username;
      const updated = await api.put("/auth/me", payload);
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

  const uploadCover = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!cloudinaryAvailable) return toast.error("Uploads aren't configured.");
    setUploadingCover(true);
    try {
      const res = await uploadToCloudinary(f, { resourceType: "image" });
      setProfile((p) => ({ ...p, cover_url: res.secure_url }));
      toast.success("Header photo uploaded — save to apply.");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  };

  const removeCover = () => setProfile((p) => ({ ...p, cover_url: "" }));

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
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Manage your account and preferences." />

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <Label>Header photo</Label>
              <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
                Shown as the cover banner on your profile. A wide image works best (about 3:1).
              </p>
              <div
                className="relative h-28 w-full overflow-hidden rounded-xl border border-border sm:h-36"
                data-testid="settings-cover-preview"
                style={
                  profile.cover_url
                    ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : undefined
                }
              >
                {!profile.cover_url && (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-secondary to-background">
                    <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,107,61,0.20),transparent_55%)]" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <input id="cover-file" type="file" accept="image/*" className="hidden" onChange={uploadCover} />
                  <label htmlFor="cover-file">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={uploadingCover}
                      className="pointer-events-none gap-1.5 rounded-full"
                      data-testid="settings-upload-cover"
                    >
                      {uploadingCover ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
                      {profile.cover_url ? "Change" : "Add photo"}
                    </Button>
                  </label>
                  {profile.cover_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={removeCover}
                      className="gap-1.5 rounded-full"
                      data-testid="settings-remove-cover"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
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
              <Label htmlFor="handle">Channel handle</Label>
              <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-background px-3 h-11 focus-within:border-primary/60">
                <span className="text-sm text-muted-foreground">postmeplex.com/@</span>
                <input
                  id="handle"
                  value={profile.username}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20),
                    }))
                  }
                  maxLength={20}
                  data-testid="settings-username"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Your public channel URL. 3–20 characters: letters, numbers, underscores.
              </p>
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
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell size={18} /> Browser notifications</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Get notified of new activity</div>
            <p className="text-xs text-muted-foreground">
              Alerts show even when PostMePlex is closed. On iPhone/iPad you must first add PostMePlex to your Home Screen (Share → Add to Home Screen) and open it from that icon.
            </p>
          </div>
          <Button
            type="button"
            variant={pushOn ? "outline" : "default"}
            disabled={pushBusy}
            onClick={toggleBrowserPush}
            className={`gap-2 ${pushOn ? "" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            data-testid="settings-toggle-push"
          >
            {pushBusy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            {pushOn ? "Turn off" : "Enable"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Circle size={14} className="fill-green-500 text-green-500" /> Active status</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Show when I&apos;m active</div>
            <p className="text-xs text-muted-foreground">
              Friends you mutually follow see a green dot and an “Active now” badge when you&apos;re online. Turn this off to appear offline — you also won&apos;t see others&apos; active status.
            </p>
          </div>
          <Button
            type="button"
            variant={appearOffline ? "default" : "outline"}
            disabled={presenceBusy}
            onClick={toggleAppearOffline}
            className={`shrink-0 gap-2 ${appearOffline ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
            data-testid="settings-toggle-appear-offline"
          >
            {presenceBusy ? <Loader2 size={14} className="animate-spin" /> : null}
            {appearOffline ? "Appear online" : "Appear offline"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles size={18} /> Cosmetics</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">Show my profile frame</div>
              <p className="text-xs text-muted-foreground">Display your equipped animated frame around your avatar. Get frames in the <button type="button" onClick={() => navigate("/market")} className="font-semibold text-primary underline">Market</button>.</p>
            </div>
            <Button
              type="button"
              variant={user?.frame_enabled ? "outline" : "default"}
              disabled={cosmeticBusy}
              onClick={() => saveCosmetic({ frame_enabled: !user?.frame_enabled })}
              className={`gap-2 ${user?.frame_enabled ? "" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
              data-testid="settings-toggle-frame"
            >
              {user?.frame_enabled ? "Turn off" : "Turn on"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <div className="font-semibold">Seasonal theme &amp; animations</div>
              <p className="text-xs text-muted-foreground">Apply your chosen holiday/season theme (colors + falling animation) across the app.</p>
            </div>
            <Button
              type="button"
              variant={user?.theme_enabled ? "outline" : "default"}
              disabled={cosmeticBusy}
              onClick={() => saveCosmetic({ theme_enabled: !user?.theme_enabled })}
              className={`gap-2 ${user?.theme_enabled ? "" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
              data-testid="settings-toggle-theme"
            >
              {user?.theme_enabled ? "Turn off" : "Turn on"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Link2 size={18} /> Connected accounts</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4" data-testid="settings-tiktok-row">
            <div className="min-w-0">
              <div className="font-semibold">TikTok</div>
              {tiktokConn ? (
                <p className="text-xs text-muted-foreground">
                  Connected{tiktokConn.video_count ? ` · ${tiktokConn.video_count} video${tiktokConn.video_count === 1 ? "" : "s"} on your profile` : ""}.
                  {tiktokConn.needs_reconnect ? " Reconnect needed." : ""} Your videos show on your profile and play via TikTok&apos;s official player.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {social.tiktok_configured
                    ? "Connect to show your TikTok videos on your PostMePlex profile (played via TikTok's official embed)."
                    : "TikTok import turns on once the TikTok developer app is approved and its keys are added in Admin → Keys."}
                </p>
              )}
            </div>
            {tiktokConn ? (
              <div className="flex flex-shrink-0 gap-2">
                <Button type="button" variant="outline" disabled={socialBusy} onClick={reimportTikTok} data-testid="settings-tiktok-reimport">
                  {socialBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-import"}
                </Button>
                <Button type="button" variant="outline" disabled={socialBusy} onClick={disconnectTikTok} className="text-rose-500" data-testid="settings-tiktok-disconnect">
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                disabled={!social.tiktok_configured}
                onClick={connectTikTok}
                className="flex-shrink-0 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="settings-tiktok-connect"
              >
                {social.tiktok_configured ? "Connect TikTok" : "Coming soon"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Heart size={18} /> Remembering account</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Turn this into a Remembering account</div>
            <p className="text-xs text-muted-foreground">
              A memorialized account carries a “Remembering” label. Verified accounts show a red badge. Requires admin approval.
            </p>
          </div>
          {user.remembering ? (
            <span
              className="shrink-0 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-400"
              data-testid="remembering-approved"
            >
              Remembering
            </span>
          ) : user.remembering_status === "pending" ? (
            <span
              className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              data-testid="remembering-pending"
            >
              Pending review
            </span>
          ) : (
            <Button
              type="button"
              onClick={applyRemembering}
              disabled={remBusy}
              className="shrink-0 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="settings-apply-remembering"
            >
              {remBusy ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} />} Apply
            </Button>
          )}
        </CardContent>
      </Card>

      {user.is_super_admin && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} /> Admin</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { to: "/admin/verify", title: "Verify accounts", desc: "Grant or remove the verified badge.", testId: "settings-admin-verify" },
              { to: "/admin/blogs", title: "Blog approvals", desc: "Approve or deny blog-publisher requests.", testId: "settings-admin-blogs" },
              { to: "/admin/reset-pins", title: "Reset PINs", desc: "Set a 4-digit password-reset PIN for any user.", testId: "settings-admin-reset-pins" },
              { to: "/admin/remembering", title: "Remembering requests", desc: "Approve accounts requesting a Remembering label.", testId: "settings-admin-remembering" },
            ].map((item) => (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                data-testid={item.testId}
                className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-secondary"
              >
                <div>
                  <div className="font-semibold">{item.title}</div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight size={18} className="text-muted-foreground" />
              </button>
            ))}
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
