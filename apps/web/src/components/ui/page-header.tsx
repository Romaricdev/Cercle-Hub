import type { ReactNode } from "react";

export function PageHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em]">{title}</h1>
        {children ? <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">{children}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
