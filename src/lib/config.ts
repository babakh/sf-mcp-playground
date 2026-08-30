export const SF_MCP_BASE = "https://api.salesforce.com/platform/mcp/v1/platform";

export const KNOWN_ENDPOINTS: Record<string, string> = {
  "sobject-all": `${SF_MCP_BASE}/sobject-all`,
  "headless-360": `${SF_MCP_BASE}/headless-360`,
  "metadata-experts": `${SF_MCP_BASE}/metadata-experts`,
  "sobject-reads": `${SF_MCP_BASE}/sobject-reads`,
  "sobject-deletes": `${SF_MCP_BASE}/sobject-deletes`,
  "sobject-mutations": `${SF_MCP_BASE}/sobject-mutations`,
  "salesforce-api-context": `${SF_MCP_BASE}/salesforce-api-context`,
  "data360": "https://api.salesforce.com/platform/mcp/v1/data/data360",
};

export const DEFAULT_ENDPOINT = "headless-360";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export function resolveMcpUrl(endpoint?: string): string {
  return KNOWN_ENDPOINTS[endpoint || DEFAULT_ENDPOINT] ?? KNOWN_ENDPOINTS[DEFAULT_ENDPOINT];
}

// No server-side fallback for credentials: this app is publicly shared, so a
// server env var would be used implicitly by every visitor. Callers must
// supply their own token/keys per request.

export function resolveAccessToken(token?: string): string | undefined {
  return token;
}

export function resolveLoginUrl(loginUrl?: string): string | undefined {
  return loginUrl ? loginUrl.replace(/\/$/, "") : undefined;
}

export function resolveClientId(clientId?: string): string | undefined {
  return clientId;
}

export function resolveClientSecret(clientSecret?: string): string | undefined {
  return clientSecret;
}

export function resolveAnthropicKey(key?: string): string {
  if (!key) {
    throw new Error("No Anthropic API key provided. Enter one in the UI.");
  }
  return key;
}
