import { NextResponse } from "next/server";
import {
  probeMcpConnector,
  type McpConnectorId,
} from "@/modules/ai/agent/mcp-client";

export const runtime = "nodejs";

/**
 * Operational status for configured remote MCP connectors.
 * This performs a real handshake and lists the tools; it exposes no endpoint
 * URL, credentials, or tool arguments.
 */
export async function GET() {
  const connectorIds: McpConnectorId[] = ["browser", "codegraph"];
  const connectors = await Promise.all(connectorIds.map(probeMcpConnector));
  return NextResponse.json({ ok: true, connectors });
}
