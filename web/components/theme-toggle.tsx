"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
    try { localStorage.setItem("jobradar-theme", next ? "dark" : "light"); } catch {}
  }
  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark} title={dark ? "Light mode" : "Dark mode"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
