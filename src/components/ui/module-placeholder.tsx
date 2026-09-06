import Link from "next/link";
import { cn } from "@/lib/utils";
import { type as typeStyle } from "@/lib/ui-hierarchy";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  status?: string;
  entries?: Array<{
    title: string;
    description: string;
    status?: string;
    href?: string;
    disabled?: boolean;
  }>;
  className?: string;
}

export function ModulePlaceholder({
  title,
  description,
  status = "后续阶段开放",
  entries,
  className,
}: ModulePlaceholderProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10",
        className
      )}
    >
      <h1 className={typeStyle.pageTitle}>{title}</h1>
      <p className={cn(typeStyle.pageLead, "mb-8")}>{description}</p>

      {entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((item) => {
            const content = (
              <>
                <p className={typeStyle.sectionTitle}>{item.title}</p>
                <p className={cn(typeStyle.bodyMuted, "mt-1.5")}>
                  {item.description}
                </p>
                <p className={cn(typeStyle.meta, "mt-3")}>
                  {item.status ?? status}
                </p>
              </>
            );

            if (item.href && !item.disabled) {
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className="block rounded-[var(--nexa-radius)] border border-[var(--nexa-border-subtle)] px-4 py-5 transition-colors hover:border-[var(--nexa-border)] hover:bg-[var(--nexa-bg-muted)]"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={item.title}
                className="rounded-[var(--nexa-radius)] border border-[var(--nexa-border-subtle)] px-4 py-5"
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={typeStyle.meta}>{status}</p>
      )}
    </div>
  );
}

interface PageShellProps {
  children: React.ReactNode;
  narrow?: boolean;
  className?: string;
}

export function PageShell({ children, narrow, className }: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-[var(--nexa-page-pad-x)] py-8 sm:py-10",
        narrow ? "max-w-[var(--nexa-content-narrow)]" : "max-w-[var(--nexa-content-max)]",
        className
      )}
    >
      {children}
    </div>
  );
}
