"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppTheme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: AppTheme;
  mounted: boolean;
  setTheme: (theme: AppTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  mounted: false,
  setTheme: () => undefined,
});

function isTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("cc-theme");
    setThemeState(isTheme(stored) ? stored : "system");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.remove("light", "dark", "system");
    root.classList.add(theme);
    root.style.colorScheme = theme === "dark" ? "dark" : "light";
    window.localStorage.setItem("cc-theme", theme);
  }, [mounted, theme]);

  const setTheme = useCallback((nextTheme: AppTheme) => setThemeState(nextTheme), []);
  const value = useMemo(() => ({ theme, mounted, setTheme }), [mounted, setTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
