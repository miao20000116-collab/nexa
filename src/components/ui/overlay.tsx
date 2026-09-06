"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 sm:items-center">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-t-[var(--nexa-radius-xl)] bg-white p-6 sm:rounded-[var(--nexa-radius-xl)]",
          className
        )}
      >
        <h3 className="mb-5 text-[17px] font-semibold text-[var(--nexa-fg)]">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--nexa-border-subtle)] bg-white">
        <div className="flex items-center justify-between border-b border-[var(--nexa-border-subtle)] px-5 py-4">
          <h3 className="text-[15px] font-semibold text-[var(--nexa-fg)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-[var(--nexa-fg-muted)] hover:text-[var(--nexa-fg)]"
          >
            关闭
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

type ToastTone = "default" | "error" | "success";

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

let toastId = 0;
const listeners = new Set<(t: ToastState | null) => void>();

export function showToast(message: string, tone: ToastTone = "default") {
  const toast: ToastState = { id: ++toastId, message, tone };
  listeners.forEach((l) => l(toast));
  window.setTimeout(() => {
    listeners.forEach((l) => l(null));
  }, 2800);
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div
        className={cn(
          "rounded-[var(--nexa-radius)] border px-4 py-2.5 text-[13px] shadow-[var(--nexa-shadow-sm)]",
          toast.tone === "error"
            ? "border-red-200 bg-white text-red-700"
            : toast.tone === "success"
              ? "border-zinc-200 bg-white text-zinc-800"
              : "border-[var(--nexa-border)] bg-white text-[var(--nexa-fg-secondary)]"
        )}
      >
        {toast.message}
      </div>
    </div>
  );
}
