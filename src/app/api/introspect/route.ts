import { NextResponse } from "next/server";
import { withMcpSession, handshakeSummary } from "@/lib/mcp";
import { resolveMcpUrl } from "@/lib/config";
import { resolveOrFetchAccessToken } from "@/lib/auth";
import type { TraceEvent } from "@/lib/types";

/** Token exchange + introspection + handshake + three list calls in one request. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const trace: TraceEvent[] = [];
  const mode: "handshake" | "discover" = body.mode === "discover" ? "discover" : "handshake";

  try {
    const url = resolveMcpUrl(body.endpoint);
    const { token: accessToken, issuedAt, expiresAt } = await resolveOrFetchAccessToken(
      { accessToken: body.accessToken, clientId: body.clientId, clientSecret: body.clientSecret, loginUrl: body.loginUrl },
      trace
    );

    trace.push({ section: "CONNECT", label: "url", data: url });

    const result = await withMcpSession(url, accessToken, async (client) => {
      const handshake = handshakeSummary(client);
      trace.push({ section: "HANDSHAKE", label: "initialize result", data: handshake });

      if (mode === "handshake") {
        return { handshake, tools: [], resources: [], prompts: [] };
      }

      const tools = await client.listTools();
      trace.push({ section: "TOOLS", label: "tools/list", data: tools.tools });

      let resources: unknown[] = [];
      try {
        const resourcesResult = await client.listResources();
        resources = resourcesResult.resources;
        trace.push({ section: "RESOURCES", label: "resources/list", data: resources });
      } catch (err) {
        trace.push({
          section: "RESOURCES",
          label: "not supported",
          data: err instanceof Error ? err.message : String(err),
        });
      }

      let prompts: unknown[] = [];
      try {
        const promptsResult = await client.listPrompts();
        prompts = promptsResult.prompts;
        trace.push({ section: "PROMPTS", label: "prompts/list", data: prompts });
      } catch (err) {
        trace.push({
          section: "PROMPTS",
          label: "not supported",
          data: err instanceof Error ? err.message : String(err),
        });
      }

      return { handshake, tools: tools.tools, resources, prompts };
    });

    return NextResponse.json({ ...result, accessToken, issuedAt, expiresAt, trace });
  } catch (err) {
    // Surfaces in Vercel's Runtime Logs — the trace array only reaches the
    // caller, so without this a failing deployment has no server-side signal.
    console.error(`[/api/introspect] ${mode} failed:`, err);
    trace.push({
      section: "ERROR",
      label: "introspect failed",
      data: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), trace },
      { status: 500 }
    );
  }
}
