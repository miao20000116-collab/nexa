import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nexa-ring)] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--nexa-primary)] text-[var(--nexa-primary-fg)] hover:bg-zinc-800",
        secondary:
          "border border-[var(--nexa-border)] bg-white text-[var(--nexa-fg)] hover:bg-[var(--nexa-bg-muted)]",
        ghost: "text-[var(--nexa-fg-tertiary)] hover:text-[var(--nexa-fg)] hover:bg-[var(--nexa-bg-muted)]",
        link: "text-[var(--nexa-fg-secondary)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-[var(--nexa-radius-sm)] px-3 text-[13px]",
        md: "h-9 rounded-[var(--nexa-radius)] px-4 text-[14px]",
        lg: "h-11 rounded-[var(--nexa-radius-lg)] px-5 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
