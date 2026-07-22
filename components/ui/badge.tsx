import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-foreground",
        className
      )}
      {...props}
    />
  );
}
