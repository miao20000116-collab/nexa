import { Suspense } from "react";
import { CreditsClient } from "@/modules/account/components/credits-client";

export default function CreditsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-[14px] text-zinc-400">正在加载…</div>
      }
    >
      <CreditsClient />
    </Suspense>
  );
}
