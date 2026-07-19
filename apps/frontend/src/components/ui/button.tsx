import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "ui-btn",
  {
    variants: {
      variant: {
        primary: "ui-btn-primary",
        outline: "ui-btn-outline",
        surface: "ui-btn-surface",
        muted: "ui-btn-muted",
        accent: "ui-btn-accent",
        danger: "ui-btn-danger",
        link: "ui-btn-link",
        // Compatibility aliases for existing shadcn-style consumers.
        default: "ui-btn-primary",
        secondary: "ui-btn-surface",
        ghost: "ui-btn-muted",
        destructive: "ui-btn-danger",
      },
      size: {
        default: null,
        xs: "ui-btn-xs",
        sm: "ui-btn-sm",
        lg: "ui-btn-lg",
        icon: "ui-btn-icon",
        "icon-xs": "ui-btn-icon ui-btn-icon-xs",
        "icon-sm": "ui-btn-icon ui-btn-icon-sm",
        "icon-lg": "ui-btn-icon ui-btn-icon-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        "group/button shrink-0 whitespace-nowrap select-none aria-invalid:ring-2 aria-invalid:ring-[var(--error)]/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

export { Button, buttonVariants }
