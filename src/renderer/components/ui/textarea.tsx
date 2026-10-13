import * as React from "react";
import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brass",
        className,
      )}
      {...props}
    />
  );
}
