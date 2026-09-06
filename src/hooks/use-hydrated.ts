"use client";

import { useSyncExternalStore } from "react";

/** True on the client after hydration — safe for localStorage-dependent UI. */
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
