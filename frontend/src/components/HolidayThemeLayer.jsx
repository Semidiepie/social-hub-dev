import React, { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { applyThemeVars, clearThemeVars } from "@/lib/holidayTheme";
import HolidayDecorations from "@/components/HolidayDecorations";

/* GLOBAL Holiday Theme (admin-applied, SAGE-generated). Fetches the live theme on
   load and applies it for EVERY visitor. The admin panel can push a local-only
   preview via the `pmp-holiday-preview` window event, and signals a re-fetch after
   Apply/Off via `pmp-holiday-refresh`. Web only. */
export default function HolidayThemeLayer() {
  const [globalSpec, setGlobalSpec] = useState(null);
  const [previewSpec, setPreviewSpec] = useState(null);
  const [hideBanner, setHideBanner] = useState(false);

  const fetchGlobal = useCallback(async () => {
    try {
      const r = await api.get("/theme");
      setGlobalSpec(r?.active ? r.spec : null);
    } catch {
      setGlobalSpec(null);
    }
  }, []);

  useEffect(() => { fetchGlobal(); }, [fetchGlobal]);

  useEffect(() => {
    const onPreview = () => setPreviewSpec(window.__pmpHolidayPreview || null);
    const onRefresh = () => { setPreviewSpec(null); window.__pmpHolidayPreview = null; fetchGlobal(); };
    window.addEventListener("pmp-holiday-preview", onPreview);
    window.addEventListener("pmp-holiday-refresh", onRefresh);
    return () => {
      window.removeEventListener("pmp-holiday-preview", onPreview);
      window.removeEventListener("pmp-holiday-refresh", onRefresh);
    };
  }, [fetchGlobal]);

  const spec = previewSpec || globalSpec;

  useEffect(() => {
    if (spec) applyThemeVars(spec);
    else clearThemeVars();
    return () => {};
  }, [spec]);

  useEffect(() => { setHideBanner(false); }, [spec?.name, spec?.banner]);

  if (!spec) return null;

  return (
    <>
      <HolidayDecorations spec={spec} />
      {spec.banner && !hideBanner && (
        <div className="pmp-holiday-banner" data-testid="holiday-banner">
          {previewSpec && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase text-primary-foreground">
              Preview
            </span>
          )}
          <span className="truncate">{spec.banner}</span>
          <span className="pmp-banner-close" role="button" aria-label="Dismiss"
                data-testid="holiday-banner-close" onClick={() => setHideBanner(true)}>
            <X size={14} />
          </span>
        </div>
      )}
    </>
  );
}
