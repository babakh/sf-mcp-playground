import {
  resolveAccessToken,
  resolveClientId,
  resolveClientSecret,
  resolveLoginUrl,
} from "@/lib/config";
import type { TraceEvent } from "@/lib/types";

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
): Promise<string> {
  const directToken = resolveAccessToken(params.accessToken);
  if (directToken) return directToken;

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

  return data.access_token as string;
}
