import type { ReactNode } from "react";
import { StepIndex } from "@/components/ui/hierarchy";
import { cn } from "@/lib/utils";
import { type as typeStyle } from "@/lib/ui-hierarchy";

/**
 * Numbered section for Commerce pages.
 * Clear step badge + title + divider spacing (not washed-out 11px labels).
 */
export function CommerceSection({
  step,
  label,
  title,
  children,
}: {
  step?: number;
  label?: string;
  title: string;
  children: ReactNode;
}) {
  const isFirst = step === 1;
  return (
    <section
      className={cn(
        "pt-10",
        isFirst ? "mt-4" : "mt-10 border-t border-zinc-200"
      )}
    >
      <div className="mb-5">
        {(step != null || label) && (
          <StepIndex value={step ?? ""} label={label} />
        )}
        <h2 className={`mt-2 ${typeStyle.sectionTitle}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}
