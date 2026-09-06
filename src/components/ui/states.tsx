import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("py-16 text-center", className)}>
      <p className="text-[15px] text-[var(--nexa-fg-secondary)]">{title}</p>
      {description && (
        <p className="mt-2 text-[13px] text-[var(--nexa-fg-muted)]">
          {description}
        </p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex h-8 items-center rounded-[var(--nexa-radius-sm)] border border-[var(--nexa-border)] px-3 text-[13px] text-[var(--nexa-fg)] hover:bg-[var(--nexa-bg-muted)]"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({
  label = "正在处理…",
  className,
}: LoadingStateProps) {
  return (
    <div className={cn("flex items-center justify-center py-20", className)}>
      <p className="text-[14px] text-[var(--nexa-fg-muted)]">{label}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export function ErrorState({
  title = "出了点问题",
  description = "请稍后再试",
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("py-16 text-center", className)}>
      <p className="text-[15px] text-[var(--nexa-fg-secondary)]">{title}</p>
      <p className="mt-2 text-[13px] text-[var(--nexa-fg-muted)]">{description}</p>
    </div>
  );
}
