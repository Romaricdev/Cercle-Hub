import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { Button } from "./button";
import { DialogMessage } from "./dialog-message";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
  tone = "primary",
  error,
  success,
  size = "sm",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  tone?: "primary" | "danger";
  error?: string | null;
  success?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="modal-overlay" className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          data-slot="modal-content"
          className={`fixed inset-x-3 top-1/2 z-50 mx-auto flex max-h-[min(90vh,48rem)] w-auto -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-[var(--surface)] shadow-[var(--shadow-float)] focus:outline-none sm:inset-x-6 ${width}`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <Dialog.Title className="font-display text-xl">{title}</Dialog.Title>
            <div className="mt-3 text-[var(--muted)]">{children}</div>
          </div>
          <div className="space-y-3 border-t border-[var(--separator)]/50 px-6 py-4">
            {error ? <DialogMessage tone="error">{error}</DialogMessage> : null}
            {success ? <DialogMessage tone="success">{success}</DialogMessage> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button variant={tone === "danger" ? "danger" : "primary"} disabled={pending} onClick={onConfirm}>
                {pending ? "En cours…" : confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
