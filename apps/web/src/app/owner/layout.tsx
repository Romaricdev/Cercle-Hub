import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/app-shell";

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return <AppShell role="OWNER">{children}</AppShell>;
}
