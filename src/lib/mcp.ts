import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** Opens a fresh MCP connection, runs `fn` with the initialized client, then closes it. */
export async function withMcpSession<T>(
  url: string,
  accessToken: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  const client = new Client({ name: "mcp-playground", version: "0.1.0" });

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export function handshakeSummary(client: Client) {
  return {
    serverInfo: client.getServerVersion(),
    capabilities: client.getServerCapabilities(),
    instructions: client.getInstructions(),
  };
}
