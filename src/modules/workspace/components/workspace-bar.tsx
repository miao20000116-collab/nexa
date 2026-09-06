"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BackLink } from "@/components/ui/hierarchy";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useHydrated } from "@/hooks/use-hydrated";

interface WorkspaceBarProps {
  query?: string;
  workspaceId?: string | null;
  selectionCount?: number;
}

export function WorkspaceBar({
  query,
  workspaceId,
  selectionCount,
}: WorkspaceBarProps) {
  const router = useRouter();
  const mounted = useHydrated();
  const { pendingCount, createWorkspaceFromPending, hydrated } =
    useWorkspaceContext();

  const count = selectionCount ?? pendingCount;

  if (!mounted || !hydrated || count === 0) return null;

  const handleContinue = async () => {
    if (workspaceId) {
      router.push(`/workspace/${workspaceId}`);
      return;
    }
    const ws = await createWorkspaceFromPending(query);
    if (ws) router.push(`/workspace/${ws.id}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-100/90 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-12 w-full max-w-[var(--nexa-content-max)] items-center justify-between px-[var(--nexa-page-pad-x)]">
        <span className="text-[13px] text-zinc-500">
          已选择 {count} 条资料
        </span>
        <div className="flex items-center gap-4">
          {workspaceId && (
            <BackLink href={`/workspace/${workspaceId}`}>← 返回工作区</BackLink>
          )}
          <button
            onClick={() => void handleContinue()}
            className="flex items-center gap-1 text-[13px] font-medium text-zinc-900 hover:text-zinc-600"
          >
            {workspaceId ? "完成收集并用 AI 整理" : "用 AI 整理并继续"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
