import {
  resolveAccessToken,
  resolveClientId,
  resolveClientSecret,
  resolveLoginUrl,
} from "@/lib/config";
import type { TraceEvent } from "@/lib/types";

export type TokenResult = {
  token: string;
  /** Epoch ms. Present only when this app minted the token. */
  issuedAt?: number;
  /**
   * Epoch ms. Salesforce omits expires_in/expires_at from token responses, so
   * the only reliable source is the token introspection endpoint's exp claim.
   * Undefined when introspection is unavailable or the caller supplied a token.
   */
  expiresAt?: number;
};

export type AuthParams = {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  loginUrl?: string;
};

/**
 * Resolves an access token: uses the one provided in the request if present,
 * otherwise exchanges a Client ID + Client Secret for one via the OAuth 2.0
 * client-credentials flow against the Salesforce login/instance domain. All
 * values must come from the caller — there is no server-side fallback, since
 * this app is publicly shared and a shared server secret would be usable by
 * every visitor.
 */
export async function resolveOrFetchAccessToken(
  params: AuthParams,
  trace: TraceEvent[]
): Promise<TokenResult> {
  const directToken = resolveAccessToken(params.accessToken);
  if (directToken) return { token: directToken };

  const clientId = resolveClientId(params.clientId);
  const clientSecret = resolveClientSecret(params.clientSecret);
  const loginUrl = resolveLoginUrl(params.loginUrl);

  if (!clientId || !clientSecret || !loginUrl) {
    throw new Error(
      "No access token or client credentials provided. Enter an access token, or a " +
        "Login URL + Client ID + Client Secret, in the UI."
    );
  }

  const tokenUrl = loginUrl.endsWith("/services/oauth2/token")
    ? loginUrl
    : `${loginUrl}/services/oauth2/token`;
  trace.push({
    section: "AUTH",
    label: "requesting client-credentials token",
    data: { tokenUrl, clientId },
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    trace.push({ section: "AUTH", label: `token request failed (${res.status})`, data });
    throw new Error(
      data.error_description || data.error || `Token request failed with status ${res.status}`
    );
  }

  trace.push({
    section: "AUTH",
    label: "obtained access token",
    data: { instance_url: data.instance_url, token_type: data.token_type, issued_at: data.issued_at },
  });

  const token = data.access_token as string;
  const issuedAt = Number(data.issued_at) || undefined;

  return {
    token,
    issuedAt,
    expiresAt: await introspectExpiry(tokenUrl, token, clientId, clientSecret, trace),
  };
}

/**
 * Asks the token introspection endpoint when the token expires. Best-effort:
 * introspection can be disabled on the External Client App, so any failure
 * resolves to undefined rather than breaking the connection.
 */
async function introspectExpiry(
  tokenUrl: string,
  token: string,
  clientId: string,
  clientSecret: string,
  trace: TraceEvent[]
): Promise<number | undefined> {
  const introspectUrl = tokenUrl.replace(/\/token$/, "/introspect");
  try {
    const res = await fetch(introspectUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        token_type_hint: "access_token",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.active || typeof data.exp !== "number") {
      trace.push({
        section: "AUTH",
        label: "token expiry unavailable",
        data: { status: res.status, active: data.active },
      });
      return undefined;
    }

    trace.push({
      section: "AUTH",
      label: "token expiry",
      data: { exp: data.exp, expiresAt: new Date(data.exp * 1000).toISOString() },
    });
    return data.exp * 1000;
  } catch (err) {
    trace.push({
      section: "AUTH",
      label: "token introspection failed",
      data: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
