import { Label as RadixLabel } from "@radix-ui/react-label";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

export function Label({ className, ...props }: ComponentProps<typeof RadixLabel>) {
  return <RadixLabel className={cn("mb-1 block text-sm font-medium text-[var(--foreground)]", className)} {...props} />;
}
