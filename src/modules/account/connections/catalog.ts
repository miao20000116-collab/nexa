import { listPlatformCapabilities } from "@/modules/publish/capabilities";
import { listConnections } from "@/modules/publish/services/connection-service";
import type {
  ConnectionCatalogItem,
  ConnectionUiStatus,
} from "@/modules/account/types";

const CONTENT_PROVIDERS = ["x", "tiktok", "youtube", "instagram"] as const;

function statusLabel(status: ConnectionUiStatus): string {
  switch (status) {
    case "connected":
      return "已连接";
    case "needs_reauth":
      return "需要重新授权";
    case "insufficient_scope":
      return "权限不足";
    case "demo":
      return "演示数据";
    default:
      return "未连接";
  }
}

function mapConnectionStatus(raw?: string | null): ConnectionUiStatus {
  switch (raw) {
    case "connected":
      return "connected";
    case "expired":
    case "error":
      return "needs_reauth";
    case "insufficient_scope":
      return "insufficient_scope";
    case "pending":
      return "disconnected";
    default:
      return "disconnected";
  }
}

/**
 * Unified connection center catalog.
 * Commerce stores: never Fake Connected — live API missing → Not Connected.
 * Demo data availability is separate from Connected.
 */
export async function getConnectionCatalog(): Promise<ConnectionCatalogItem[]> {
  const [capabilities, connections] = await Promise.all([
    Promise.resolve(listPlatformCapabilities()),
    listConnections(),
  ]);

  const content: ConnectionCatalogItem[] = CONTENT_PROVIDERS.map((provider) => {
    const cap = capabilities.find((c) => c.platform === provider);
    const conn = connections.find((c) => c.provider === provider);
    const status = mapConnectionStatus(conn?.status);
    const detail =
      status === "connected"
        ? conn?.displayName || "已通过官方授权连接"
        : status === "needs_reauth"
          ? "授权已失效或未完成，请重新授权"
          : status === "insufficient_scope"
            ? "当前授权权限不足，请重新授权并勾选所需权限"
              : cap?.oauthConfigured
              ? "未连接，可通过官方 OAuth 授权"
              : "当前平台暂不支持直接发布";

    return {
      id: `content_${provider}`,
      category: "content",
      provider,
      label: cap?.label ?? provider,
      status,
      statusLabel: statusLabel(status),
      detail,
      canConnect: Boolean(cap?.oauthConfigured) && status !== "connected",
      connectionId: conn?.id ?? null,
      isDemo: false,
    };
  });

  const { listCommerceStoresResolved } = await import(
    "@/modules/commerce/store/active-store"
  );
  const commerce: ConnectionCatalogItem[] = listCommerceStoresResolved().map(
    (store) => ({
      id: `commerce_${store.id}`,
      category: "commerce" as const,
      provider:
        store.platform === "Amazon"
          ? `amazon_${store.country.toLowerCase()}`
          : `tiktok_shop_${store.country.toLowerCase()}`,
      label: `${store.platform} · ${store.marketplace}`,
      status: "disconnected" as const,
      statusLabel: "Not Connected",
      detail: store.demoAvailable
        ? `${store.country} · ${store.currency} · Demo 数据可用；真实 OAuth/API 未接入，禁止显示为 Connected。Token 仅 server-side。`
        : `${store.country} · ${store.currency} · ${store.connectionStatus}`,
      canConnect: false,
      connectionId: null,
      isDemo: store.demoAvailable,
    })
  );

  return [...content, ...commerce];
}
