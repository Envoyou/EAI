"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] p-0.5 outline-none transition-colors data-checked:border-[var(--primary)] data-checked:bg-[var(--primary)] data-disabled:cursor-not-allowed data-disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-5 rounded-full bg-[var(--muted-foreground)] transition-[transform,background-color] shadow-xs data-checked:translate-x-5 data-checked:bg-[var(--primary-foreground)]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
