import { PublishHome } from "@/modules/publish/components/publish-home";

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    product?: string;
    marketplace?: string;
    projectId?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <PublishHome
      continuity={{
        from: params.from ?? null,
        product: params.product ?? null,
        marketplace: params.marketplace ?? null,
        projectId: params.projectId ?? null,
      }}
    />
  );
}
