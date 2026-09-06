"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { showToast } from "@/components/ui/overlay";
import type { SearchResult } from "@/modules/search/types";
import type { Workspace } from "@/modules/workspace/types";
import { snapshotFromSearchResult } from "@/modules/workspace/utils/snapshot";

const STORAGE_KEY = "nexa_active_workspace_id";
const PENDING_KEY = "nexa_pending_sources";

interface PendingSource {
  result: SearchResult;
  query?: string;
}

interface WorkspaceContextValue {
  activeWorkspaceId: string | null;
  workspace: Workspace | null;
  pendingSources: PendingSource[];
  pendingCount: number;
  pendingResultIds: Set<string>;
  setActiveWorkspaceId: (id: string | null) => void;
  addPendingSource: (result: SearchResult, query?: string) => void;
  removePendingSource: (resultId: string) => void;
  togglePendingSource: (result: SearchResult, query?: string) => void;
  clearPendingSources: () => void;
  createWorkspaceFromPending: (query?: string, name?: string) => Promise<Workspace | null>;
  /** Create or update a workspace with pending selections and/or top search results. */
  ensureWorkspaceFromSearch: (
    results: SearchResult[],
    query?: string,
    options?: { topN?: number }
  ) => Promise<Workspace | null>;
  addToActiveWorkspace: (result: SearchResult) => Promise<void>;
  toggleInActiveWorkspace: (result: SearchResult) => Promise<void>;
  isInWorkspace: (resultId: string, url: string) => boolean;
  refreshWorkspace: () => Promise<void>;
  loading: boolean;
  hydrated: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredPending(): PendingSource[] {
  if (typeof window === "undefined") return [];
  try {
    const pending = localStorage.getItem(PENDING_KEY);
    return pending ? (JSON.parse(pending) as PendingSource[]) : [];
  } catch {
    return [];
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(
    null
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setActiveWorkspaceIdState(readStoredWorkspaceId());
      setPendingSources(readStoredPending());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (activeWorkspaceId) {
      localStorage.setItem(STORAGE_KEY, activeWorkspaceId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeWorkspaceId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingSources));
  }, [pendingSources, hydrated]);

  const refreshWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) {
      setWorkspace(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${activeWorkspaceId}`);
      if (res.ok) {
        setWorkspace(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeWorkspaceId) {
        setWorkspace(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/workspace/${activeWorkspaceId}`);
        if (!cancelled && res.ok) {
          setWorkspace(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActiveWorkspaceIdState(id);
    if (!id) setWorkspace(null);
  }, []);

  const addPendingSource = useCallback(
    (result: SearchResult, query?: string) => {
      setPendingSources((prev) => {
        if (prev.some((p) => p.result.url === result.url)) {
          showToast("该内容已在工作区");
          return prev;
        }
        return [...prev, { result, query }];
      });
    },
    []
  );

  const removePendingSource = useCallback((resultId: string) => {
    setPendingSources((prev) =>
      prev.filter((p) => p.result.id !== resultId)
    );
  }, []);

  const togglePendingSource = useCallback(
    (result: SearchResult, query?: string) => {
      setPendingSources((prev) => {
        const exists = prev.some((p) => p.result.url === result.url);
        if (exists) {
          return prev.filter((p) => p.result.url !== result.url);
        }
        return [...prev, { result, query }];
      });
    },
    []
  );

  const clearPendingSources = useCallback(() => {
    setPendingSources([]);
  }, []);

  const createWorkspaceFromPending = useCallback(
    async (query?: string, name?: string) => {
      const sources = pendingSources.map((p) =>
        snapshotFromSearchResult(p.result)
      );
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          sources,
          query: query ?? pendingSources[0]?.query,
          name,
        }),
      });
      if (!res.ok) return null;
      const ws: Workspace = await res.json();
      setActiveWorkspaceId(ws.id);
      setWorkspace(ws);
      clearPendingSources();
      return ws;
    },
    [pendingSources, clearPendingSources, setActiveWorkspaceId]
  );

  const ensureWorkspaceFromSearch = useCallback(
    async (
      results: SearchResult[],
      query?: string,
      options?: { topN?: number }
    ) => {
      const topN = options?.topN ?? 8;
      const topResults = results.slice(0, topN);
      const hasPending = pendingSources.length > 0;
      const hasActiveSources = Boolean(workspace?.sources.length);
      const hasTopResults = topResults.length > 0;

      if (!hasPending && !hasActiveSources && !hasTopResults) {
        return null;
      }

      const byUrl = new Map<string, ReturnType<typeof snapshotFromSearchResult>>();
      for (const p of pendingSources) {
        byUrl.set(p.result.url, snapshotFromSearchResult(p.result));
      }
      for (const r of topResults) {
        if (!byUrl.has(r.url)) {
          byUrl.set(r.url, snapshotFromSearchResult(r));
        }
      }
      // Prefer keeping already-selected pending order, then top results
      const mergedSources = Array.from(byUrl.values());

      if (activeWorkspaceId && (hasActiveSources || hasTopResults || hasPending)) {
        let latest = workspace;
        for (const source of mergedSources) {
          const already = latest?.sources.some(
            (s) => s.url === source.url || s.searchResultId === source.searchResultId
          );
          if (already) continue;
          const res = await fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId: activeWorkspaceId,
              source,
              query,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.workspace) latest = data.workspace as Workspace;
          }
        }
        if (hasPending) clearPendingSources();
        if (latest) {
          setWorkspace(latest);
          return latest;
        }
        const res = await fetch(`/api/workspace/${activeWorkspaceId}`);
        if (res.ok) {
          const ws: Workspace = await res.json();
          setWorkspace(ws);
          return ws;
        }
        return null;
      }

      if (hasPending && !hasTopResults) {
        return createWorkspaceFromPending(query);
      }

      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          sources: mergedSources,
          query: query ?? pendingSources[0]?.query,
        }),
      });
      if (!res.ok) return null;
      const ws: Workspace = await res.json();
      setActiveWorkspaceId(ws.id);
      setWorkspace(ws);
      clearPendingSources();
      return ws;
    },
    [
      pendingSources,
      workspace,
      activeWorkspaceId,
      clearPendingSources,
      createWorkspaceFromPending,
      setActiveWorkspaceId,
    ]
  );

  const addToActiveWorkspace = useCallback(
    async (result: SearchResult) => {
      if (!activeWorkspaceId) {
        addPendingSource(result);
        return;
      }
      const snapshot = snapshotFromSearchResult(result);
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspaceId, source: snapshot }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.added === false) {
          showToast("该内容已在工作区");
        } else {
          showToast("已加入工作区");
        }
        if (data.workspace) setWorkspace(data.workspace);
        else await refreshWorkspace();
      }
    },
    [activeWorkspaceId, addPendingSource, refreshWorkspace]
  );

  const toggleInActiveWorkspace = useCallback(
    async (result: SearchResult) => {
      if (!activeWorkspaceId) {
        togglePendingSource(result);
        return;
      }
      const existing = workspace?.sources.find((s) => s.url === result.url);
      if (existing) {
        const res = await fetch("/api/workspace/remove", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: activeWorkspaceId,
            sourceId: existing.id,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.workspace) setWorkspace(data.workspace);
          else await refreshWorkspace();
        }
      } else {
        await addToActiveWorkspace(result);
      }
    },
    [
      activeWorkspaceId,
      workspace,
      togglePendingSource,
      addToActiveWorkspace,
      refreshWorkspace,
    ]
  );

  const isInWorkspace = useCallback(
    (resultId: string, url: string) => {
      if (activeWorkspaceId && workspace) {
        return workspace.sources.some(
          (s) => s.url === url || s.searchResultId === resultId
        );
      }
      return pendingSources.some((p) => p.result.url === url);
    },
    [activeWorkspaceId, workspace, pendingSources]
  );

  const pendingResultIds = new Set(pendingSources.map((p) => p.result.id));
  const workspaceCount = activeWorkspaceId
    ? (workspace?.sources.length ?? 0)
    : pendingSources.length;

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspaceId,
        workspace,
        pendingSources,
        pendingCount: workspaceCount,
        pendingResultIds,
        setActiveWorkspaceId,
        addPendingSource,
        removePendingSource,
        togglePendingSource,
        clearPendingSources,
        createWorkspaceFromPending,
        ensureWorkspaceFromSearch,
        addToActiveWorkspace,
        toggleInActiveWorkspace,
        isInWorkspace,
        refreshWorkspace,
        loading,
        hydrated,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  }
  return ctx;
}
