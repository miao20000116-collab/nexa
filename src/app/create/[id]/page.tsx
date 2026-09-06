import { Suspense } from "react";
import { CreationWorkbench } from "@/modules/create/components/creation-workbench";

export default async function CreateProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[960px] px-5 py-16 text-[14px] text-zinc-400">
          加载创作工作台…
        </div>
      }
    >
      <CreationWorkbench projectId={id} />
    </Suspense>
  );
}
