import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors outline-none select-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "bg-panel-3 text-fg border border-line-strong hover:bg-line-strong/60",
        outline: "border border-line-strong bg-transparent text-fg-dim hover:text-fg hover:bg-panel-3",
        ghost: "text-fg-dim hover:text-fg hover:bg-panel-3",
        buy: "bg-up text-black font-semibold hover:bg-up/85",
        sell: "bg-down text-white font-semibold hover:bg-down/85",
        destructive: "bg-down/15 text-down border border-down/40 hover:bg-down/25",
        segment:
          "text-fg-mute hover:text-fg data-[active=true]:bg-accent-dim data-[active=true]:text-accent",
      },
      size: {
        default: "h-8 px-3 text-xs",
        sm: "h-7 px-2.5 text-[11px]",
        xs: "h-6 px-2 text-[11px]",
        lg: "h-9 px-4 text-sm",
        icon: "size-7",
        "icon-xs": "size-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
