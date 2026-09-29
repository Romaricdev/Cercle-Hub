import { useEffect, useRef, type ReactNode } from "react";

import { Alert } from "./alert";

export function afterDialogClose(callback: () => void): void {
  window.setTimeout(callback, 220);
}

export function DialogMessage({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [children]);
  return (
    <div ref={ref} tabIndex={-1} data-slot="dialog-message" className="outline-none">
      <Alert tone={tone}>{children}</Alert>
    </div>
  );
}
