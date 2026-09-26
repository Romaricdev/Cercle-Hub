import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "../components/shell/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Cercle Complet Sarl",
  description: "Accès sécurisé aux boutiques de Cercle Complet Sarl.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
