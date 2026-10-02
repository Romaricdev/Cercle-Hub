import type { ReactNode } from "react";

const columns = {
  2: "md:grid-cols-2 md:[&>*+*]:border-l md:[&>*+*]:border-t-0",
  3: "lg:grid-cols-3 lg:[&>*+*]:border-l lg:[&>*+*]:border-t-0",
  4: "xl:grid-cols-4 xl:[&>*+*]:border-l xl:[&>*+*]:border-t-0",
};

export function KpiStrip({ children, count = 4 }: { children: ReactNode; count?: 2 | 3 | 4 }) {
  return (
    <div className={`grid overflow-hidden rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-[var(--separator)]/60 ${columns[count]}`}>
      {children}
    </div>
  );
}

export function KpiItem({ icon, value, label, detail, valueClassName = "" }: { icon: ReactNode; value: ReactNode; label: string; detail?: ReactNode; valueClassName?: string }) {
  return (
    <div className="p-5">
      <div className="text-[var(--primary)] [&>svg]:size-5" aria-hidden="true">{icon}</div>
      <p className={`mt-3 font-display text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}
