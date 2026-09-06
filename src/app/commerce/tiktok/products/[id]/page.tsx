import { CommerceHubRedirect } from "@/modules/commerce/components/commerce-hub-redirect";
import { commerceProductExpandHref } from "@/modules/commerce/lib/expand-product";

export default async function TikTokProductDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CommerceHubRedirect href={commerceProductExpandHref("tiktok", id)} />
  );
}
