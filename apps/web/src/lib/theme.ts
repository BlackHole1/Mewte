import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];

const STORAGE_KEY = "mewte-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

let current = read();

function apply(): void {
  const dark = current === "dark" || (current === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
}

media.addEventListener("change", apply);
apply();

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: the choice still applies for this visit.
  }
  apply();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current);
}
