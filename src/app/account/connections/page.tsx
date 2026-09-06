import { Suspense } from "react";
import { ConnectionsCenterClient } from "@/modules/account/components/connections-center";

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-[14px] text-zinc-400">正在加载…</div>
      }
    >
      <ConnectionsCenterClient />
    </Suspense>
  );
}
