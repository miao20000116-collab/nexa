import { Suspense } from "react";
import WorkspaceResearchPage from "./research-client";

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="px-5 py-10 text-[14px] text-zinc-400">加载中…</p>
      }
    >
      <WorkspaceResearchPage />
    </Suspense>
  );
}
