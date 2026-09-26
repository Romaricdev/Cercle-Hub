import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function Sheet({ open, onOpenChange, title, children, side = "left" }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; side?: "left" | "right" }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in" />
        <Dialog.Content className={`fixed inset-y-0 z-50 flex w-[min(28rem,94vw)] flex-col bg-[var(--surface)] p-5 shadow-[var(--shadow-float)] focus:outline-none ${side === "right" ? "right-0" : "left-0"}`}>
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="font-display text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="grid size-9 place-items-center rounded-md text-xl text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="Fermer">×</Dialog.Close>
          </div>
          <div className="mt-5 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
