import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "ui-alert group/alert relative w-full text-left text-sm has-data-[slot=alert-action]:pr-18 *:[svg]:shrink-0 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "ui-alert-primary",
        success: "ui-alert-success",
        warning: "ui-alert-warning",
        danger: "ui-alert-danger",
        muted: "ui-alert-muted",
        // Compatibility aliases.
        default: "ui-alert-muted",
        destructive: "ui-alert-danger",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  }
)

function Alert({
  className,
  variant = "muted",
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        role: "alert",
        className: cn(alertVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "alert",
      variant,
    },
  })
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction, alertVariants }
