"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AMAZON_NAV,
  TIKTOK_NAV,
  type CommerceNavItem,
} from "@/modules/commerce/components/commerce-nav-config";

export const NEXA_COMMERCE_GOTO_EVENT = "nexa:commerce-goto";

type HubPagerValue = {
  platform: "amazon" | "tiktok";
  base: string;
  items: CommerceNavItem[];
  ids: string[];
  activeId: string;
  goTo: (id: string) => void;
  goNext: () => void;
};

const CommerceHubPagerContext = createContext<HubPagerValue | null>(null);

export function useCommerceHubPager() {
  return useContext(CommerceHubPagerContext);
}

/**
 * One-module-at-a-time hub pager.
 * Mouse wheel stays inside the current module; only side nav / 「下一模块」 switch.
 */
export function CommerceHubPagerProvider({
  platform,
  children,
}: {
  platform: "amazon" | "tiktok";
  children: ReactNode;
}) {
  const items = platform === "amazon" ? AMAZON_NAV : TIKTOK_NAV;
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const base = platform === "amazon" ? "/commerce/amazon" : "/commerce/tiktok";
  const [activeId, setActiveId] = useState(ids[0] ?? "overview");

  const goTo = useCallback(
    (id: string) => {
      if (!ids.includes(id)) return;
      setActiveId(id);
      try {
        window.history.replaceState(null, "", `${base}#${id}`);
      } catch {
        /* ignore */
      }
      // Keep page chrome stable — only the module pane scrolls.
      const pane = document.getElementById("commerce-hub-pane");
      if (pane) pane.scrollTop = 0;
      else window.scrollTo({ top: 0, behavior: "auto" });
    },
    [base, ids]
  );

  const goNext = useCallback(() => {
    const index = Math.max(0, ids.indexOf(activeId));
    const isLast = index >= ids.length - 1;
    goTo(isLast ? ids[0]! : ids[index + 1]!);
  }, [activeId, goTo, ids]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && ids.includes(hash)) setActiveId(hash);
  }, [ids]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && ids.includes(hash)) setActiveId(hash);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [ids]);

  useEffect(() => {
    const onGoto = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) goTo(id);
    };
    window.addEventListener(NEXA_COMMERCE_GOTO_EVENT, onGoto);
    return () => window.removeEventListener(NEXA_COMMERCE_GOTO_EVENT, onGoto);
  }, [goTo]);

  const value = useMemo(
    () => ({ platform, base, items, ids, activeId, goTo, goNext }),
    [platform, base, items, ids, activeId, goTo, goNext]
  );

  return (
    <CommerceHubPagerContext.Provider value={value}>
      {children}
    </CommerceHubPagerContext.Provider>
  );
}

export function requestCommerceGoto(sectionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NEXA_COMMERCE_GOTO_EVENT, { detail: { id: sectionId } })
  );
}
