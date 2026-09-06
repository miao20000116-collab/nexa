import { SearchResults } from "@/modules/search/components/search-results";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    workspaceId?: string;
    from?: string;
    product?: string;
    storeId?: string;
    marketplace?: string;
    wf?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const workspaceId = params.workspaceId ?? null;

  return (
    <SearchResults
      initialQuery={query}
      initialWorkspaceId={workspaceId}
      commerceContinuity={{
        from: params.from ?? null,
        product: params.product ?? null,
        storeId: params.storeId ?? null,
        marketplace: params.marketplace ?? null,
        wf: params.wf ?? null,
      }}
    />
  );
}
