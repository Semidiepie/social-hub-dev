import React, { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { getTheme, toggleTheme } from "@/lib/theme";

// Dark/Light theme switch. `variant="rail"` renders a labelled row for the nav
// rail; default renders a compact icon button (mobile top bar).
export function ThemeToggle({ variant = "icon", expanded = false }) {
  const [theme, setTheme] = useState(getTheme());
  const isLight = theme === "light";
  const flip = () => setTheme(toggleTheme());

  if (variant === "rail") {
    return (
      <button
        onClick={flip}
        data-testid="theme-toggle"
        title={isLight ? "Switch to dark" : "Switch to light"}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {isLight ? <Moon size={20} className="shrink-0" /> : <Sun size={20} className="shrink-0" />}
        <span className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:w-auto group-hover:opacity-100">
          {isLight ? "Dark mode" : "Light mode"}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={flip}
      data-testid="theme-toggle-mobile"
      aria-label={isLight ? "Switch to dark" : "Switch to light"}
      className="pmp-iconbtn"
    >
      {isLight ? <Moon size={19} /> : <Sun size={19} />}
    </button>
  );
}
