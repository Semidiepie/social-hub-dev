import React, { useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { themeById } from "@/lib/cosmetics";

// Applies the user's active seasonal theme app-wide: overrides the --primary
// accent + renders a subtle full-screen particle animation. Web only.
export default function ThemeLayer() {
  const { user } = useAuth();
  const theme = useMemo(() => {
    if (!user?.theme_enabled || !user?.active_theme) return null;
    if (user.active_theme === "custom" && user.custom_theme) return user.custom_theme;
    return themeById(user.active_theme);
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) {
      root.style.setProperty("--primary", theme.primary);
      root.style.setProperty("--accent", theme.primary);
      root.style.setProperty("--ring", theme.primary);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--ring");
    }
  }, [theme]);

  if (!theme) return null;

  return (
    <div className="pmp-particles" aria-hidden data-testid="theme-particles">
      {Array.from({ length: 16 }).map((_, i) => (
        <span
          key={i}
          className="pmp-particle"
          style={{
            left: `${(i * 6.3 + Math.random() * 5).toFixed(1)}%`,
            fontSize: 16 + Math.random() * 18,
            animationDuration: `${(6 + Math.random() * 8).toFixed(1)}s`,
            animationDelay: `${(Math.random() * 8).toFixed(1)}s`,
          }}
        >
          {theme.emoji}
        </span>
      ))}
    </div>
  );
}
