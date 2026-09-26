import type { ReactNode } from "react";

export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-surface-enter rounded-lg bg-[var(--surface)] px-6 py-10 text-center shadow-[var(--shadow-card)]">
      {icon ? <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg bg-[var(--surface-subtle)] text-[var(--primary)]">{icon}</div> : null}
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children ? <p className="mx-auto mt-1.5 max-w-xl text-sm leading-6 text-[var(--muted)]">{children}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
