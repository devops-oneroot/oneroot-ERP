"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Runs in <head> before the first paint (see app/layout.tsx): the saved choice, else light — whatever the device or
 * browser is set to. A plain string so it works before React loads; keep it in step with `preferred` below.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

/** The theme picked with the toggle on this device; light until someone picks dark */
function preferred(): Theme {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "dark") return "dark";
  } catch {}
  return "light";
}

const apply = (theme: Theme) => document.documentElement.classList.toggle("dark", theme === "dark");

/** How long a switch between light and dark takes (keep in step with globals.css) */
const FADE_MS = 500;

/**
 * Switch with a gradual cross-fade instead of an instant jump: the View Transitions API where the browser has it,
 * otherwise a short colour transition on every element. Instant when the user asks for reduced motion.
 */
function applyGradually(theme: Theme) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply(theme);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition) {
    doc.startViewTransition(() => apply(theme));
    return;
  }
  const root = document.documentElement;
  root.classList.add("theme-fading");
  apply(theme);
  window.setTimeout(() => root.classList.remove("theme-fading"), FADE_MS);
}

// The "dark" class on <html> is the source of truth; every toggle on the page follows it
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const snapshot = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
// The server can't know the saved theme: hydrate as light, then React switches to the real value
const serverSnapshot = (): Theme => "light";

/** The current theme and a toggle; the choice is remembered on this device */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  // React's dev remount resets <html>'s class; put it back before paint (a no-op in production)
  useLayoutEffect(() => {
    apply(preferred());
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = snapshot() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    applyGradually(next);
  }, []);

  return { theme, toggle };
}
