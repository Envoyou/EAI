"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  positionMethod,
  variant = "default",
  mobileSheet = false,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "positionMethod"
  > & {
    variant?: "default" | "menu"
    mobileSheet?: boolean
  }) {
  return (
    <PopoverPrimitive.Portal>
      {mobileSheet && (
        <PopoverPrimitive.Backdrop className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-xs md:hidden data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      )}
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod={positionMethod}
        className={cn(
          "isolate z-50",
          mobileSheet &&
            "max-md:!fixed max-md:!inset-x-0 max-md:!bottom-0 max-md:!top-auto max-md:!w-full max-md:!max-w-none max-md:!transform-none max-md:!z-[150]"
        )}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 origin-(--transform-origin) bg-popover text-sm text-popover-foreground outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            variant === "default" &&
              "flex w-72 flex-col gap-2.5 rounded-lg p-2.5 shadow-md ring-1 ring-foreground/10",
            mobileSheet &&
              "max-md:!w-full max-md:!max-h-[80dvh] max-md:!rounded-t-2xl max-md:!rounded-b-none max-md:!border-t max-md:!border-[var(--border)] max-md:bg-[var(--surface-1)] max-md:!shadow-2xl max-md:px-4 max-md:pt-2 max-md:pb-8 max-md:animate-in max-md:slide-in-from-bottom max-md:duration-300",
            className
          )}
          {...props}
        >
          {mobileSheet && (
            <div
              aria-hidden="true"
              className="mx-auto my-2 h-1.5 w-12 shrink-0 rounded-full bg-[var(--border)] opacity-60 md:hidden"
            />
          )}
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
