import { AppShell } from "../../components/shell/app-shell";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="OWNER">{children}</AppShell>;
}
