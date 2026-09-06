import { Suspense } from "react";
import { CreateHubPage } from "@/modules/create/components/create-hub";

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32 text-[14px] text-zinc-400">
          正在加载…
        </div>
      }
    >
      <CreateHubPage />
    </Suspense>
  );
}
