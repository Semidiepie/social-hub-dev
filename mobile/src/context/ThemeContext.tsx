import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors as darkColors } from "../theme";

export type ThemeColors = { [K in keyof typeof darkColors]: string };

/** Light palette matching the web app's light mode (same brand orange primary). */
export const lightColors: ThemeColors = {
  ...darkColors,
  bg: "#F6F6F4",
  surface: "#FFFFFF",
  elevated: "#FFFFFF",
  textPrimary: "#111827",
  textSecondary: "#5B6472",
  textMuted: "#8A919E",
  border: "#E5E7EB",
  borderLight: "#D1D5DB",
  primaryMuted: "rgba(255,107,61,0.16)",
  primaryFaint: "rgba(255,107,61,0.08)",
  overlayDim: "rgba(17,24,39,0.55)",
};

export type ThemeMode = "dark" | "light";

type ThemeCtx = {
  mode: ThemeMode;
  isLight: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
};

const Ctx = createContext<ThemeCtx>({
  mode: "dark",
  isLight: false,
  colors: darkColors,
  toggleTheme: () => {},
  setMode: () => {},
});

const STORAGE_KEY = "postmeplex-theme-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark") setModeState(v);
    }).catch(() => {});
  }, []);
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);
  const toggleTheme = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);
  const value = useMemo<ThemeCtx>(
    () => ({ mode, isLight: mode === "light", colors: mode === "light" ? lightColors : darkColors, toggleTheme, setMode }),
    [mode, toggleTheme, setMode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppTheme(): ThemeCtx {
  return useContext(Ctx);
}
