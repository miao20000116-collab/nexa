/**
 * V4.6 — Ecosystem integration status helpers
 * Connected / Disconnected / Permission Required / Unsupported
 * Never pretend connected without tokens.
 */

import { getConnectionCatalog } from "@/modules/account/connections/catalog";

export type IntegrationLifecycleState =
  | "connected"
  | "disconnected"
  | "permission_required"
  | "unsupported";

export interface IntegrationStatusView {
  provider: string;
  label: string;
  category: string;
  state: IntegrationLifecycleState;
  stateLabel: string;
  detail: string;
  canConnect: boolean;
  canDisconnect: boolean;
  canSync: boolean;
  isDemo: boolean;
}

function mapState(item: {
  status: string;
  canConnect: boolean;
  isDemo?: boolean;
  detail?: string;
}): IntegrationLifecycleState {
  if (item.isDemo) return "unsupported";
  if (item.status === "connected") return "connected";
  if (item.status === "insufficient_scope" || item.status === "needs_reauth") {
    return "permission_required";
  }
  if (!item.canConnect && item.status !== "connected") return "unsupported";
  return "disconnected";
}

const STATE_LABEL: Record<IntegrationLifecycleState, string> = {
  connected: "已连接",
  disconnected: "未连接",
  permission_required: "需要授权/权限",
  unsupported: "暂不支持 / Demo",
};

export async function listIntegrationStatuses(): Promise<IntegrationStatusView[]> {
  const catalog = await getConnectionCatalog();
  return catalog.map((item) => {
    const state = mapState(item);
    return {
      provider: item.provider,
      label: item.label,
      category: item.category,
      state,
      stateLabel: STATE_LABEL[state],
      detail: item.detail,
      canConnect: item.canConnect && state === "disconnected",
      canDisconnect: state === "connected" && !item.isDemo,
      canSync: state === "connected" && !item.isDemo,
      isDemo: Boolean(item.isDemo),
    };
  });
}
