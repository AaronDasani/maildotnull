"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "mailburli:theme";
const CHANGE_EVENT = "mailburli:theme";

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

// The <html> class (set by the inline script in layout.tsx before hydration)
// is the source of truth for the current theme.
function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

/** Whether the app is currently in dark mode; re-renders on theme toggle. */
export function useAppDark() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function ThemeToggle() {
  const isDark = useAppDark();

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Light mode" : "Dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      {isDark ? (
        <Sun className="size-[18px]" />
      ) : (
        <Moon className="size-[18px]" />
      )}
    </button>
  );
}
