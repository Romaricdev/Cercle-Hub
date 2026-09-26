import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/app-shell";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return <AppShell role="MANAGER">{children}</AppShell>;
}
