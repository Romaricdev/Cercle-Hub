"use client";

import { Laptop, Moon, Sun } from "lucide-react";

import { Button } from "../ui/button";
import { type AppTheme, useAppTheme } from "./theme-provider";

const options = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Laptop },
] as const;

export function ThemeSwitcher() {
  const { theme, mounted, setTheme } = useAppTheme();

  return (
    <div
      role="group"
      aria-label="Thème"
      className="flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,var(--surface-subtle)_78%,transparent)] p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] backdrop-blur"
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            className="min-h-9 min-w-9 rounded-md px-2 text-sm transition-all duration-300 sm:px-3"
            variant={mounted && theme === option.value ? "secondary" : "ghost"}
            aria-pressed={mounted && theme === option.value}
            aria-label={option.label}
            onClick={() => setTheme(option.value as AppTheme)}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="hidden lg:inline">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
