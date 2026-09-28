import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const colors = {
    neutral: "bg-[var(--surface-subtle)] text-[var(--foreground)]",
    success: "bg-[color-mix(in_srgb,var(--success)_14%,var(--surface))] text-[var(--success)]",
    warning: "bg-[color-mix(in_srgb,var(--warning,#c9a227)_16%,var(--surface))] text-[var(--foreground)]",
    danger: "bg-[color-mix(in_srgb,var(--destructive)_12%,var(--surface))] text-[var(--destructive)]",
    info: "bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface))] text-[var(--primary)]",
  };
  return (
    <span className={cn("inline-flex h-6 max-w-full items-center truncate rounded-full px-2 text-xs font-medium leading-none", colors[tone])}>
      {children}
    </span>
  );
}
