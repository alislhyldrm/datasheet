"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "theme";

export default function ThemeToggle() {
  // Keep following the OS until the user commits to an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {}
      document.documentElement.setAttribute(
        "data-theme",
        mq.matches ? "dark" : "light",
      );
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  // Both icons are rendered and swapped by CSS: the button never depends on
  // client-only state, so there is nothing for hydration to mismatch on.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Temayı değiştir"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink"
    >
      <Sun size={20} strokeWidth={1.75} className="hidden dark:block" />
      <Moon size={20} strokeWidth={1.75} className="block dark:hidden" />
    </button>
  );
}
