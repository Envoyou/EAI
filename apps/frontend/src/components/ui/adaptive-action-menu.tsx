"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { SemanticIconToken } from "@/components/ui/icons/types"
import { cn } from "@/lib/utils"

export interface AdaptiveActionMenuItem {
  key: string
  label: string
  icon: SemanticIconToken
  onSelect: () => void | Promise<void>
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
}

interface AdaptiveActionMenuProps {
  trigger: React.ReactElement
  title: string
  items: AdaptiveActionMenuItem[]
  contentClassName?: string
}

export function AdaptiveActionMenu({
  trigger,
  title,
  items,
  contentClassName,
}: AdaptiveActionMenuProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        positionMethod="fixed"
        variant="menu"
        mobileSheet
        className={cn("ui-menu w-52 p-1", contentClassName)}
      >
        <div className="ui-menu-label md:hidden">{title}</div>
        {items.map((item) => {
          const Icon = item.icon

          return (
            <React.Fragment key={item.key}>
              {item.separatorBefore && <div className="ui-menu-divider" />}
              <Button
                type="button"
                variant="muted"
                disabled={item.disabled}
                className={cn(
                  "ui-menu-item justify-start font-normal",
                  item.danger && "ui-menu-item-danger"
                )}
                onClick={() => {
                  setOpen(false)
                  void item.onSelect()
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.label}</span>
              </Button>
            </React.Fragment>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
