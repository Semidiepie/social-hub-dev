import React from "react";
import { AVATAR_FALLBACK, badgeCls, badgeStyle } from "@/lib/format";
import { BadgeCheck } from "lucide-react";

export function Avatar({ src, alt, size = 40, className = "", ring = false, frame = null, frameStyle = null, live = false }) {
  const inner = (
    <div
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-secondary ${
        ring ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${live ? "ring-2 ring-red-500 ring-offset-2 ring-offset-background" : ""} ${frame ? "relative z-10" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src || AVATAR_FALLBACK}
        alt={alt || ""}
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.src = AVATAR_FALLBACK;
        }}
      />
    </div>
  );
  // Custom (Sage-designed) frame renders from an inline spec; preset frames use a CSS class.
  // `frame` may be a preset id string, "custom" (with frameStyle), or a custom spec object.
  const customSpec = frame && typeof frame === "object" ? frame : (frame === "custom" ? frameStyle : null);
  const customRing = customSpec
    ? {
        background: `conic-gradient(from 0deg, ${customSpec.c1}, ${customSpec.c2}, ${customSpec.c3}, ${customSpec.c1})`,
        animation: `pmp-spin ${customSpec.speed || 3}s linear infinite`,
        boxShadow: customSpec.glow ? `0 0 14px 3px ${customSpec.c1}99` : "none",
      }
    : null;
  const presetFrame = typeof frame === "string" && frame !== "custom" ? frame : null;
  const showFrame = !!customRing || !!presetFrame;
  const core = !showFrame ? inner : (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {customRing ? (
        <span className="pmp-frame" style={customRing} aria-hidden />
      ) : (
        <span className={`pmp-frame pmp-frame-${presetFrame}`} aria-hidden />
      )}
      {inner}
    </span>
  );
  if (!live) return core;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} data-testid="avatar-live">
      {core}
      <span
        className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded bg-red-500 px-1 font-black uppercase leading-none text-white"
        style={{ fontSize: Math.max(7, Math.round(size * 0.2)), paddingTop: 2, paddingBottom: 2 }}
        data-testid="avatar-live-pill"
      >
        LIVE
      </span>
    </span>
  );
}

export function UsernameLine({ user, className = "" }) {
  if (!user) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="font-semibold text-foreground">{user.display_name}</span>
      {user.is_verified && (
        <BadgeCheck size={14} className={badgeCls(user)} style={badgeStyle(user)} data-testid="verified-badge" />
      )}
    </span>
  );
}
