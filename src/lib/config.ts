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

/**
 * Sentinel endpoint value for a user-supplied MCP server URL — e.g. a custom
 * server exposing Apex classes as MCP tools, which has no fixed name to put
 * in KNOWN_ENDPOINTS. Selecting it in the UI reveals a URL field instead of
 * showing a resolved KNOWN_ENDPOINTS entry.
 */
export const CUSTOM_ENDPOINT = "custom";

export const CLAUDE_MODEL = "claude-sonnet-4-6";

/**
 * Hosts this app will POST to — shared by the Login URL (OAuth token
 * exchange) and a custom MCP server URL. Both are server-side outbound
 * requests driven by caller input, so without this allowlist either field is
 * a server-side request forgery vector: the route would POST to whatever
 * host the caller names and return the response in the trace, which on a
 * public deployment makes it an open proxy anyone can drive.
 *
 * Matching is on the parsed hostname, so `https://evil.com/?x=.salesforce.com`,
 * `https://salesforce.com.evil.com`, and `https://evil-salesforce.com` are all
 * rejected. Every Hosted MCP server and OAuth token endpoint Salesforce issues
 * lives under .salesforce.com (login, test, My Domain, and the api.salesforce.com
 * MCP gateway); extend this list if you need another.
 */
const ALLOWED_SALESFORCE_HOST = "salesforce.com";

function validateSalesforceUrl(url: string, fieldLabel: string, example?: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${fieldLabel} is not a valid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${fieldLabel} must use https.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== ALLOWED_SALESFORCE_HOST && !host.endsWith(`.${ALLOWED_SALESFORCE_HOST}`)) {
    throw new Error(
      `${fieldLabel} host "${host}" is not a Salesforce domain. ` +
        `Expected ${ALLOWED_SALESFORCE_HOST} or a subdomain of it` +
        (example ? `, e.g. ${example}.` : ".")
    );
  }

  return url.replace(/\/$/, "");
}

export function resolveMcpUrl(endpoint?: string, customMcpUrl?: string): string {
  if (endpoint === CUSTOM_ENDPOINT) {
    if (!customMcpUrl) {
      throw new Error("No custom MCP server URL provided. Enter one in the UI.");
    }
    return validateSalesforceUrl(
      customMcpUrl,
      "MCP server URL",
      "https://api.salesforce.com/platform/mcp/v1/platform/<your-server>"
    );
  }
  return KNOWN_ENDPOINTS[endpoint || DEFAULT_ENDPOINT] ?? KNOWN_ENDPOINTS[DEFAULT_ENDPOINT];
}

// No server-side fallback for credentials: this app is publicly shared, so a
// server env var would be used implicitly by every visitor. Callers must
// supply their own token/keys per request.

export function resolveAccessToken(token?: string): string | undefined {
  return token;
}

export function resolveLoginUrl(loginUrl?: string): string | undefined {
  if (!loginUrl) return undefined;
  return validateSalesforceUrl(loginUrl, "Login URL", "https://<your-domain>.my.salesforce.com");
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
