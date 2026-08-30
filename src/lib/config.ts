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

/**
 * Hosts this app will POST credentials to. Without this allowlist the loginUrl
 * field is a server-side request forgery vector: the route POSTs to whatever
 * host the caller names and returns the response body in the trace, which on a
 * public deployment makes it an open proxy anyone can drive.
 *
 * Matching is on the parsed hostname, so `https://evil.com/?x=.salesforce.com`,
 * `https://salesforce.com.evil.com`, and `https://evil-salesforce.com` are all
 * rejected. Every Salesforce OAuth token endpoint lives under .salesforce.com
 * (login, test, and My Domain); extend this list if you need another.
 */
const ALLOWED_LOGIN_HOST = "salesforce.com";

export function resolveLoginUrl(loginUrl?: string): string | undefined {
  if (!loginUrl) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(loginUrl);
  } catch {
    throw new Error(`Login URL is not a valid URL: ${loginUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Login URL must use https.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== ALLOWED_LOGIN_HOST && !host.endsWith(`.${ALLOWED_LOGIN_HOST}`)) {
    throw new Error(
      `Login URL host "${host}" is not a Salesforce domain. ` +
        `Expected ${ALLOWED_LOGIN_HOST} or a subdomain of it, ` +
        `e.g. https://<your-domain>.my.salesforce.com.`
    );
  }

  return loginUrl.replace(/\/$/, "");
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
