import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Alert({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "error" | "success" | "warning"; className?: string }) {
  const colors = {
    info: "bg-[var(--surface-subtle)] text-[var(--foreground)]",
    error: "bg-[color-mix(in_oklab,var(--destructive)_12%,var(--surface))] text-[var(--foreground)]",
    success: "bg-[color-mix(in_oklab,var(--success)_12%,var(--surface))] text-[var(--foreground)]",
    warning: "bg-[color-mix(in_oklab,var(--warning)_14%,var(--surface))] text-[var(--foreground)]",
  };
  return (
    <div role="alert" aria-live={tone === "error" ? "assertive" : "polite"} className={cn("ui-surface-enter rounded-lg px-4 py-3 text-sm leading-6 shadow-[var(--shadow-card)]", colors[tone], className)}>
      {children}
    </div>
  );
}
