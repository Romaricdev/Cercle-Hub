import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  const height = size === "xl" ? "min-h-[min(78vh,44rem)]" : "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="modal-overlay" className="fixed inset-0 z-40 bg-[rgb(5_16_30_/_0.48)] backdrop-blur-[2px]" />
        <Dialog.Content
          data-slot="modal-content"
          className={`fixed inset-x-3 top-1/2 z-50 mx-auto flex max-h-[min(88vh,52rem)] w-auto -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-[var(--surface)] shadow-[var(--shadow-float)] focus:outline-none sm:inset-x-6 ${width} ${height}`}
        >
          <header className="flex items-start justify-between gap-5 border-b border-[var(--separator)]/60 px-5 py-4 sm:px-6">
            <div>
              <Dialog.Title className="font-display text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="grid size-9 shrink-0 place-items-center rounded-md text-xl text-[var(--muted)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]" aria-label="Fermer">×</Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
