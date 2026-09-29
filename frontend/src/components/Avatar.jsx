import React from "react";
import { AVATAR_FALLBACK, badgeCls, badgeStyle } from "@/lib/format";
import { BadgeCheck } from "lucide-react";

export function Avatar({ src, alt, size = 40, className = "", ring = false, frame = null }) {
  const inner = (
    <div
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-secondary ${
        ring ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${frame ? "relative z-10" : ""} ${className}`}
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
  if (!frame) return inner;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <span className={`pmp-frame pmp-frame-${frame}`} aria-hidden />
      {inner}
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
