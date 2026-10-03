"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "./button";

export function useTablePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page, pageSize, totalPages, pageItems, setPage, setPageSize };
}

export function TablePagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange, itemLabel = "élément" }: { page: number; pageSize: number; total: number; totalPages: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void; itemLabel?: string }) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="flex flex-col gap-3 rounded-lg bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination du tableau">
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
        <span>{first}–{last} sur {total} {itemLabel}{total > 1 ? "s" : ""}</span>
        <label className="inline-flex items-center gap-2">Afficher<select aria-label="Nombre de lignes par page" value={pageSize} onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }} className="h-9 rounded-md bg-[var(--surface-subtle)] px-2 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end"><span className="mr-1 text-sm text-[var(--muted)]">Page {page} sur {totalPages}</span><Button className="h-9 px-3" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Précédente</Button><Button className="h-9 px-3" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>Suivante</Button></div>
    </nav>
  );
}
