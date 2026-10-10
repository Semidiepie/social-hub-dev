// Web theme (Dark default + Light), persisted in localStorage and applied as a
// class on <html>. The initial class is set pre-paint by a script in index.html.
const KEY = "pmp-theme";

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  // Keep the mobile browser chrome in sync with the surface.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#12141c");
}

export function toggleTheme() {
  const next = getTheme() === "light" ? "dark" : "light";
  applyTheme(next);
  return next;
}
