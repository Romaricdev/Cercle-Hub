import type { TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-md border border-[var(--separator)]/70 bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[var(--muted)]/70 hover:border-[var(--separator)] focus-visible:border-[color-mix(in_srgb,var(--focus)_65%,var(--separator))] focus-visible:bg-[var(--surface)] focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--focus)_35%,transparent)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--focus)_8%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}
