import { IconMoon, IconSun } from "@tabler/icons-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { THEME_STORAGE_KEY } from "./theme";

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => {
    observer.disconnect();
  };
};

const getSnapshot = () => document.documentElement.classList.contains("dark");

// The server does not know the choice. The head script applies it before the first paint.
const getServerSnapshot = () => false;

/** Switches between light and dark mode and stores the choice in the browser. */
export const ThemeToggle = () => {
  const isDark = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private mode can refuse storage. The page still changes.
    }
  };

  return (
    <Button
      aria-label={isDark ? "Use light mode" : "Use dark mode"}
      onClick={toggle}
      size="icon"
      variant="ghost"
    >
      {isDark ? (
        <IconSun strokeWidth={1.75} />
      ) : (
        <IconMoon strokeWidth={1.75} />
      )}
    </Button>
  );
};
