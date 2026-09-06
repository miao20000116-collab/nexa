import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--nexa-radius)] border border-[var(--nexa-border)] bg-white px-3 text-[14px] text-[var(--nexa-fg)] outline-none transition-colors placeholder:text-[var(--nexa-fg-muted)] focus:border-[var(--nexa-border-strong)]",
        className
      )}
      {...props}
    />
  );
}
