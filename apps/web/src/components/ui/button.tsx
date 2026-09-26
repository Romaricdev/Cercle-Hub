import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-[box-shadow,background-color,filter,transform] duration-150 active:translate-y-px active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--focus)_10%,transparent)] disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_3px_8px_color-mix(in_srgb,var(--primary)_18%,transparent)] hover:brightness-[1.04] hover:shadow-[0_4px_10px_color-mix(in_srgb,var(--primary)_22%,transparent)]",
        secondary: "bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--separator)]",
        ghost: "bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
        danger: "bg-[var(--destructive)] text-white shadow-[0_2px_6px_color-mix(in_srgb,var(--destructive)_16%,transparent)] hover:brightness-105",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  className,
  variant,
  asChild,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} type={type} {...props} />;
}
