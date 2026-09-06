"use client";

import { useEffect } from "react";
import { NEXA_AI_CAPABILITY_EVENT } from "@/modules/ai-workbench/types";

/**
 * Listen for AI Workbench capability clicks and run page-local handlers.
 */
export function useAiCapabilityListener(
  handlers: Record<string, () => void>,
  deps: unknown[] = []
) {
  useEffect(() => {
    const onCap = (e: Event) => {
      const detail = (e as CustomEvent<{ capabilityId?: string }>).detail;
      const id = detail?.capabilityId;
      if (!id) return;
      const fn = handlers[id];
      if (fn) fn();
    };
    window.addEventListener(NEXA_AI_CAPABILITY_EVENT, onCap);
    return () => window.removeEventListener(NEXA_AI_CAPABILITY_EVENT, onCap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
