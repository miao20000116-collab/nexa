export type AnalyticsEvent =
  | "search_started"
  | "search_completed"
  | "search_failed"
  | "search_result_clicked"
  | "source_added_to_workspace"
  | "source_removed_from_workspace"
  | "overview_feedback_up"
  | "overview_feedback_down";

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === "development") {
    console.log("[analytics]", event, properties ?? {});
  }
}
