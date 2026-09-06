"use client";

import Link from "next/link";
import type { WorkflowAction } from "@/modules/commerce/workflow/types";
import { ensureWorkflowActions } from "@/modules/commerce/workflow/actions";

/**
 * Primary / Secondary / Inline action hierarchy (V4.5-I).
 * Avoids a wall of equal big buttons.
 */
export function WorkflowActions({
  actions,
  chainLabel,
}: {
  actions: WorkflowAction[] | null | undefined;
  /** Optional scenario chain reminder */
  chainLabel?: string | null;
}) {
  const list = ensureWorkflowActions(actions || []);
  const primary = list.filter((a) => a.priority === "primary");
  const secondary = list.filter((a) => a.priority === "secondary");
  const inline = list.filter((a) => a.priority === "inline");

  return (
    <div className="space-y-3">
      {chainLabel ? (
        <p className="text-[11px] text-zinc-400">{chainLabel}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {primary.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
            title={a.chainHint}
          >
            {a.label}
          </Link>
        ))}
        {secondary.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] text-zinc-800 hover:bg-zinc-50"
            title={a.chainHint}
          >
            {a.label}
          </Link>
        ))}
      </div>

      {inline.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {inline.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
              title={a.chainHint}
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
