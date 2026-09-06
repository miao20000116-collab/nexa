import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpConnectorId = "browser" | "codegraph";

type McpConnectorConfig = {
  id: McpConnectorId;
  label: string;
  url: string | null;
};

export type McpToolDescriptor = {
  name: string;
  title?: string;
  description?: string;
};

export type McpConnectorStatus = {
  id: McpConnectorId;
  label: string;
  configured: boolean;
  status: "ready" | "unavailable" | "error";
  reason?: string;
  tools?: McpToolDescriptor[];
};

const CONNECTORS: Record<
  McpConnectorId,
  Omit<McpConnectorConfig, "url"> & {
    envKey: "NEXA_MCP_BROWSER_URL" | "NEXA_MCP_CODEGRAPH_URL";
  }
> = {
  browser: {
    id: "browser",
    label: "浏览器 MCP",
    envKey: "NEXA_MCP_BROWSER_URL",
  },
  codegraph: {
    id: "codegraph",
    label: "Codegraph MCP",
    envKey: "NEXA_MCP_CODEGRAPH_URL",
  },
};

function configuredConnector(id: McpConnectorId): McpConnectorConfig {
  const connector = CONNECTORS[id];
  return {
    id: connector.id,
    label: connector.label,
    url: process.env[connector.envKey]?.trim() || null,
  };
}

function resolveConnectorUrl(config: McpConnectorConfig): URL | null {
  if (!config.url) return null;
  try {
    const url = new URL(config.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function isMcpConnectorConfigured(id: McpConnectorId): boolean {
  return resolveConnectorUrl(configuredConnector(id)) !== null;
}

async function withMcpClient<T>(
  id: McpConnectorId,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const config = configuredConnector(id);
  const url = resolveConnectorUrl(config);
  if (!url) throw new Error(`${config.label} 未配置有效的远程地址`);

  const client = new Client({ name: "nexa-agent", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { signal: AbortSignal.timeout(8_000) },
  });

  try {
    await client.connect(transport, { timeout: 8_000 });
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Configuration alone never counts as ready: verify handshake and tools. */
export async function probeMcpConnector(
  id: McpConnectorId
): Promise<McpConnectorStatus> {
  const config = configuredConnector(id);
  if (!resolveConnectorUrl(config)) {
    return {
      id,
      label: config.label,
      configured: Boolean(config.url),
      status: "unavailable",
      reason: config.url ? "远程地址无效" : "尚未配置",
    };
  }

  try {
    const result = await withMcpClient(id, (client) => client.listTools());
    return {
      id,
      label: config.label,
      configured: true,
      status: "ready",
      tools: result.tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
      })),
    };
  } catch (error) {
    return {
      id,
      label: config.label,
      configured: true,
      status: "error",
      reason: error instanceof Error ? error.message : "连接或握手失败",
    };
  }
}

export async function callMcpTool(input: {
  connectorId: McpConnectorId;
  toolName: string;
  arguments?: Record<string, unknown>;
}) {
  return withMcpClient(input.connectorId, (client) =>
    client.callTool({
      name: input.toolName,
      arguments: input.arguments || {},
    })
  );
}
