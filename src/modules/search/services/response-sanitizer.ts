import type { SearchResponse } from "@/modules/search/types";

export function sanitizeSearchResponse(
  response: SearchResponse
): SearchResponse {
  const isDebug = process.env.SEARCH_DEBUG === "true";

  const sanitized: SearchResponse = {
    sessionId: response.sessionId,
    query: response.query,
    normalizedQuery: response.normalizedQuery,
    intent: response.intent,
    status: response.status,
    results: response.results.map((result) => {
      const {
        rawSource: _rawSource,
        retrievalMethod: _retrievalMethod,
        rankScore: _rankScore,
        ...rest
      } = result;
      void _rawSource;
      void _retrievalMethod;
      void _rankScore;
      return rest;
    }),
    overview: response.overview,
    overviewStatus: response.overviewStatus,
    channels: response.channels,
  };

  if (isDebug && response.debug) {
    sanitized.debug = response.debug;
  }

  return sanitized;
}
