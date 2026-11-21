import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[10px] font-semibold tracking-wider uppercase whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-accent-dim text-accent",
        up: "bg-up-dim text-up",
        down: "bg-down-dim text-down",
        warn: "bg-warn-dim text-warn",
        muted: "bg-panel-3 text-fg-dim",
        outline: "border border-line-strong text-fg-dim",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
