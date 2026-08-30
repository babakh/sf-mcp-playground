import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withMcpSession } from "@/lib/mcp";
import { resolveMcpUrl, resolveAnthropicKey, CLAUDE_MODEL } from "@/lib/config";
import { resolveOrFetchAccessToken } from "@/lib/auth";
import type { TraceEvent, ChatMessage } from "@/lib/types";

type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

/**
 * Safety cap on the agentic loop. Without it a model that keeps requesting tools
 * loops forever: the request hangs and the caller's Anthropic key keeps getting billed.
 */
const MAX_TOOL_TURNS = 10;

/**
 * Generous enough that a turn returning Salesforce records isn't cut off. Truncation
 * is not just ugly here — if generation stops mid-`tool_use`, `stop_reason` becomes
 * `max_tokens` and the loop below exits with a partial answer.
 */
const MAX_TOKENS = 16000;

function toAnthropicTools(tools: McpTool[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const trace: TraceEvent[] = [];

  const {
    endpoint,
    accessToken,
    clientId,
    clientSecret,
    loginUrl,
    anthropicKey,
    messages: incomingMessages,
    userText,
  }: {
    endpoint?: string;
    accessToken?: string;
    clientId?: string;
    clientSecret?: string;
    loginUrl?: string;
    anthropicKey?: string;
    messages: ChatMessage[];
    userText: string;
  } = body;

  try {
    const mcpUrl = resolveMcpUrl(endpoint);
    const token = await resolveOrFetchAccessToken({ accessToken, clientId, clientSecret, loginUrl }, trace);
    const apiKey = resolveAnthropicKey(anthropicKey);
    const anthropic = new Anthropic({ apiKey });

    const messages: ChatMessage[] = [...(incomingMessages ?? []), { role: "user", content: userText }];

    const finalText = await withMcpSession(mcpUrl, token, async (client) => {
      const toolsResult = await client.listTools();
      const anthropicTools = toAnthropicTools(toolsResult.tools as McpTool[]);

      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        trace.push({ section: "CLAUDE REQUEST", label: "messages", data: messages });

        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system:
            "You are a Salesforce assistant. You have tools that can discover and " +
            "query real Salesforce data through an MCP server. Use them whenever the " +
            "user's request needs data you don't already have. Prefer the read-only " +
            "dispatch tool for anything that only reads data.",
          tools: anthropicTools,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
        });

        trace.push({
          section: "CLAUDE RESPONSE",
          label: `stop_reason=${response.stop_reason}`,
          data: response.content,
        });

        if (response.stop_reason === "max_tokens") {
          trace.push({
            section: "ERROR",
            label: "response truncated by max_tokens",
            data: `The model hit the ${MAX_TOKENS}-token output cap, so this answer is incomplete.`,
          });
        }

        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason !== "tool_use") {
          return response.content
            .filter((block) => block.type === "text")
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("");
        }

        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          trace.push({
            section: `MCP CALL_TOOL: ${block.name}`,
            label: "arguments",
            data: block.input,
          });

          const result = await client.callTool({
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });

          const textParts = (result.content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "");
          const resultText = textParts.length ? textParts.join("\n") : "(tool returned no text content)";

          trace.push({ section: `MCP CALL_TOOL: ${block.name}`, label: "result", data: resultText });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        }

        messages.push({ role: "user", content: toolResults });
      }

      trace.push({
        section: "ERROR",
        label: `stopped after ${MAX_TOOL_TURNS} tool-calling turns`,
        data: "The model kept requesting tools without producing a final answer.",
      });
      return `Stopped after ${MAX_TOOL_TURNS} tool-calling turns without a final answer. See the Message Log for the calls that were made.`;
    });

    return NextResponse.json({ answer: finalText, messages, trace });
  } catch (err) {
    trace.push({
      section: "ERROR",
      label: "chat turn failed",
      data: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), trace },
      { status: 500 }
    );
  }
}
