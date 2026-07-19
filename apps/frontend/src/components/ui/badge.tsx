import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "ui-badge group/badge w-fit shrink-0 justify-center overflow-hidden transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        muted: "ui-badge-muted",
        surface: "ui-badge-surface",
        primary: "ui-badge-primary",
        success: "ui-badge-success",
        warning: "ui-badge-warning",
        danger: "ui-badge-danger",
        // Compatibility aliases for existing shadcn-style consumers.
        default: "ui-badge-primary",
        secondary: "ui-badge-surface",
        destructive: "ui-badge-danger",
        outline: "ui-badge-surface",
        ghost: "ui-badge-muted",
        link: "ui-badge-primary underline-offset-4 hover:underline",
      },
      size: {
        default: null,
        xs: "ui-badge-xs",
      },
    },
    defaultVariants: {
      variant: "muted",
      size: "default",
    },
  }
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

function Badge({
  className,
  variant = "muted",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
      size,
    },
  })
}

export { Badge, badgeVariants, type BadgeVariant }
