"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { storeThemePreference } from "@/lib/preferences"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  if (!mounted) {
    return <div className="w-8 h-8" />
  }

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark"
    storeThemePreference(nextTheme)
    setTheme(nextTheme)
  }

  return (
    <button
      onClick={toggleTheme}
      className="
        relative w-8 h-8 flex items-center justify-center rounded-md
        text-[var(--muted-foreground)] hover:text-[var(--foreground)]
        hover:bg-[var(--surface-2)]
        transition-all duration-200
        focus-visible:outline focus-visible:outline-[var(--gold)]
      "
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle theme"
    >
      <Sun className="h-[15px] w-[15px] rotate-0 scale-100 transition-all duration-200 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[15px] w-[15px] rotate-90 scale-0 transition-all duration-200 dark:rotate-0 dark:scale-100" />
    </button>
  )
}
