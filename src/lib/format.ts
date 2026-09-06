/** Stable zh-CN date (UTC) to avoid SSR/client timezone drift. */
export function formatDateZh(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("zh-CN", { timeZone: "UTC" });
  } catch {
    return iso;
  }
}

/** Stable zh-CN datetime (UTC) for lists and detail views. */
export function formatDateTimeZh(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { timeZone: "UTC" });
  } catch {
    return iso;
  }
}
