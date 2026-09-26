import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-[var(--surface-subtle)] px-2 text-xs font-medium leading-none text-[var(--foreground)]">
      {children}
    </span>
  );
}
