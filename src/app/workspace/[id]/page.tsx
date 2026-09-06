import { WorkspaceDetailPage } from "@/modules/workspace/components/workspace-page";

export default async function WorkspaceDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceDetailPage workspaceId={id} />;
}
