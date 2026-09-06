import { AssetDetailClient } from "@/modules/assets/components/asset-detail-client";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetDetailClient assetId={id} />;
}
