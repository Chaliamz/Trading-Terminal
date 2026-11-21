import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "num h-7 w-full min-w-0 rounded-md border border-input bg-panel-2 px-2 text-xs text-fg outline-none transition-colors placeholder:text-fg-mute focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-down",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
