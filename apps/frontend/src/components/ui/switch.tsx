"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] p-[3px] outline-none transition-colors data-checked:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] data-checked:bg-[color-mix(in_srgb,var(--primary)_23%,var(--surface-2))] data-disabled:cursor-not-allowed data-disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-[14px] rounded-full bg-[var(--muted-foreground)] transition-[transform,background-color] data-checked:translate-x-4 data-checked:bg-[var(--primary)]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
