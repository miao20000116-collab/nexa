"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <nav
      className={cn(
        "flex gap-6 border-b border-[var(--nexa-border-subtle)]",
        className
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "relative -mb-px pb-2.5 text-[14px] transition-colors",
            value === item.id
              ? "font-medium text-[var(--nexa-fg)] after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-[var(--nexa-fg)]"
              : "text-[var(--nexa-fg-muted)] hover:text-[var(--nexa-fg-secondary)]"
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

interface TabPanelProps {
  children: ReactNode;
  className?: string;
}

export function TabPanel({ children, className }: TabPanelProps) {
  return <div className={cn("pt-6", className)}>{children}</div>;
}
