"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { storeThemePreference } from "@/lib/preferences"

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

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
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            onClick={toggleTheme}
            variant="ghost"
            size="icon"
            className="
              relative text-[var(--muted-foreground)] hover:text-[var(--foreground)]
              hover:bg-[var(--surface-2)]
              transition-all duration-200
              focus-visible:outline focus-visible:outline-[var(--gold)]
            "
            aria-label="Toggle theme"
          >
            <Sun className="h-[15px] w-[15px] rotate-0 scale-100 transition-all duration-200 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[15px] w-[15px] rotate-90 scale-0 transition-all duration-200 dark:rotate-0 dark:scale-100" />
          </Button>
        }
      />
      <TooltipContent side="bottom" className="text-xs">
        {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      </TooltipContent>
    </Tooltip>
  )
}
