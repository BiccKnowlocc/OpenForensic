import * as React from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-paper outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brass",
        className,
      )}
      {...props}
    />
  );
}
