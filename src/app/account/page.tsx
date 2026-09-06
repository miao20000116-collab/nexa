import { Suspense } from "react";
import { AccountHomeClient } from "@/modules/account/components/account-home";

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-[14px] text-zinc-400">正在加载…</div>
      }
    >
      <AccountHomeClient />
    </Suspense>
  );
}
