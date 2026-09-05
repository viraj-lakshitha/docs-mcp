import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "notes:theme";
const DARK_CLASS = "dark-mode";
// Colour-transition window; see `.theme-transition` in styles/theme.css.
const TRANSITION_MS = 240;

function systemTheme(): ResolvedTheme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Safari in private mode throws on localStorage access.
  }
  return "system";
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? systemTheme() : choice;
}

// Applies the theme to <html>. Kept as a standalone function (not a hook) so
// the pre-hydration inline script in index.html and this module stay in sync
// on the one thing that matters: the class name on the root element.
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle(DARK_CLASS, resolved === "dark");
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

function applyThemeAnimated(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  applyTheme(resolved);
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove("theme-transition"), TRANSITION_MS);
}

// The theme currently applied to <html>, whoever set it.
//
// Separate from useTheme because the consumers are different: useTheme owns the
// choice, this just observes the result. Rendered documents (Mermaid bakes its
// palette in at init, Excalidraw at export) have to be re-rendered on a theme
// change, so they depend on this value. Watching the class rather than the
// choice means it stays correct no matter what caused the change — a toggle,
// an OS change, or the pre-paint script.
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    typeof document === "undefined"
      ? "light"
      : document.documentElement.classList.contains(DARK_CLASS)
        ? "dark"
        : "light"
  );

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains(DARK_CLASS) ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

// Theme state, persisted to localStorage and defaulting to the OS preference.
//
// The <html> class is set by a blocking script in index.html before first
// paint, so this hook never causes a flash — it only keeps React state in
// sync and handles subsequent changes.
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(storedChoice);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(storedChoice()));

  // Follow the OS while the choice is "system".
  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      applyThemeAnimated(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
    const nextResolved = resolveTheme(next);
    setResolved(nextResolved);
    applyThemeAnimated(nextResolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { choice, resolved, setTheme, toggleTheme };
}
