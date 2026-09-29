import React, { useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// "Featured" label shown on any boosted post/reel/video/live card.
export function FeaturedBadge({ show, className = "" }) {
  if (!show) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary ${className}`}
      data-testid="featured-label"
    >
      <Star size={10} className="fill-primary" /> Featured
    </span>
  );
}

// Admin-only inline toggle to feature/unfeature content. `type` ∈ post|reel|video|live.
export function FeatureToggle({ type, id, featured, onChange, className = "" }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user?.is_super_admin) return null;
  const toggle = async (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post("/admin/feature", { type, id, featured: !featured });
      onChange?.(r.featured);
      toast.success(r.featured ? "Featured — boosted to the top" : "Removed from Featured");
    } catch (err) {
      toast.error(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={toggle}
      disabled={busy}
      data-testid={`feature-toggle-${id}`}
      title={featured ? "Remove Featured" : "Feature this"}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
        featured
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
      } ${className}`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} className={featured ? "fill-primary" : ""} />}
      {featured ? "Featured" : "Feature"}
    </button>
  );
}
