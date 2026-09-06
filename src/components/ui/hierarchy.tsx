import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { action, layout, type } from "@/lib/ui-hierarchy";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>
        )}
        <h1 className={type.pageTitle}>{title}</h1>
        {description && <p className={type.pageLead}>{description}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function SectionHeader({
  label,
  title,
  description,
  className,
}: {
  label?: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3", className)}>
      {label && <p className={type.sectionLabel}>{label}</p>}
      {title && (
        <h2 className={cn(type.sectionTitle, label && "mt-1")}>{title}</h2>
      )}
      {description && (
        <p className={cn(type.bodyMuted, (label || title) && "mt-1")}>
          {description}
        </p>
      )}
    </div>
  );
}

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn(type.fieldLabel, className)} {...props} />;
}

export function SectionLabel({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn(type.sectionLabel, className)} {...props} />;
}

export function ContentBlock({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(layout.contentBlock, className)} {...props} />;
}

export function DividedSection({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(layout.sectionDivided, className)}>{children}</section>
  );
}

/** Level 3 — Nexa judgment voice (no card wall). */
export function NexaInsight({
  label = "Nexa 判断",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <p className={type.insightLabel}>{label}</p>
      <div className={type.insightBody}>{children}</div>
    </div>
  );
}

/** Level 4 — one primary + secondary + tertiary links. */
export function ActionCluster({
  primary,
  secondary,
  tertiary,
  className,
}: {
  primary?: { href?: string; label: string; onClick?: () => void };
  secondary?: { href?: string; label: string; onClick?: () => void };
  tertiary?: Array<{ href: string; label: string }>;
  className?: string;
}) {
  return (
    <div className={cn("mt-4 flex flex-wrap items-center gap-3", className)}>
      {primary &&
        (primary.href ? (
          <Link href={primary.href} className={action.primary}>
            {primary.label}
          </Link>
        ) : (
          <button type="button" onClick={primary.onClick} className={action.primary}>
            {primary.label}
          </button>
        ))}
      {secondary &&
        (secondary.href ? (
          <Link href={secondary.href} className={action.secondary}>
            {secondary.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={secondary.onClick}
            className={action.secondary}
          >
            {secondary.label}
          </button>
        ))}
      {tertiary?.map((t) => (
        <Link key={t.href + t.label} href={t.href} className={action.tertiary}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Level 1 focus band for “today’s one thing”. */
export function FocusBand({
  rank,
  title,
  children,
  className,
}: {
  rank?: string | number;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(layout.focusBand, className)}>
      {rank !== undefined && <StepIndex value={rank} />}
      <h3 className={cn(type.focusTitle, rank !== undefined && "mt-1.5")}>
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Site-wide back control — Linear/Notion weight, never tiny gray. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(action.back, className)}>
      {children}
    </Link>
  );
}

/** Visible step / rank marker (01 · 优先事项). */
export function StepIndex({
  value,
  label,
  className,
}: {
  value: string | number;
  label?: string;
  className?: string;
}) {
  const display =
    typeof value === "number"
      ? String(value).padStart(2, "0")
      : String(value).trim();
  if (!display && !label) return null;
  return (
    <p className={cn(type.stepIndex, className)}>
      {display && label ? `${display} · ${label}` : display || label}
    </p>
  );
}
