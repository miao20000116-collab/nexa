/**
 * Soft-fetch for commerce clients: keep last payload while range/query changes
 * so the page does not blank. Module cache softens first paint on remount / nav.
 */

import { useEffect, useRef, useState } from "react";

const queryCache = new Map<string, unknown>();

export function useCommerceQuery<T>(
  url: string | null,
  mapError?: (status: number) => string
): {
  data: T | null;
  error: string | null;
  /** True only on first load with no cached row yet */
  pending: boolean;
  /** True when refreshing with existing data still on screen */
  refreshing: boolean;
} {
  const cached = url ? (queryCache.get(url) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(() => cached ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(() => Boolean(url) && cached == null);
  const [refreshing, setRefreshing] = useState(() => Boolean(url) && cached != null);
  const dataRef = useRef<T | null>(data);
  dataRef.current = data;

  useEffect(() => {
    if (!url) {
      setPending(false);
      setRefreshing(false);
      return;
    }
    let cancelled = false;
    const fromCache = queryCache.get(url) as T | undefined;
    if (fromCache != null && dataRef.current == null) {
      setData(fromCache);
      dataRef.current = fromCache;
    }
    const soft = dataRef.current != null || fromCache != null;
    if (soft) setRefreshing(true);
    else setPending(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(url);
          if (cancelled) return;
          if (!res.ok) {
            setError(
              mapError?.(res.status) ??
                (res.status === 401
                  ? "需要登录后查看。可使用演示账号继续体验。"
                  : "数据加载失败，可稍后重试。")
            );
            if (!soft) setData(null);
            return;
          }
          const json = (await res.json()) as T;
          queryCache.set(url, json);
          setData(json);
        } catch {
          if (!cancelled) {
            setError("网络异常，请稍后重试。");
            if (!soft) setData(null);
          }
        } finally {
          if (!cancelled) {
            setPending(false);
            setRefreshing(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapError is stable enough
  }, [url]);

  return { data, error, pending, refreshing };
}

/** Dim content slightly while soft-refreshing; never unmount. */
export function commerceRefreshingClass(refreshing: boolean): string {
  return refreshing
    ? "opacity-70 transition-opacity duration-200"
    : "transition-opacity duration-200";
}
