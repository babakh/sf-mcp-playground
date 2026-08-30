/**
 * Browser-only persistence for the credential form, split into two tiers.
 *
 * `local` (localStorage) holds non-secrets only — endpoint, Login URL, Client
 * ID, auth method. These carry no risk and remove most of the retyping.
 *
 * `session` (sessionStorage) holds secrets, and only when the user opts in. It
 * survives a reload but is cleared when the tab closes, which is the point:
 * this app is deployed publicly, and strangers open it on shared machines. A
 * Salesforce client secret sitting in localStorage indefinitely is not a
 * default worth shipping.
 *
 * Nothing here is a security boundary — anyone who can run JS on this origin
 * can read React state or the inputs directly. The tiers control *lifetime*,
 * which is the thing that actually differs.
 */

const PREFIX = "sf-mcp-playground:";

export type Tier = "local" | "session";

/** Storage access throws in some privacy modes; treat that as "unavailable". */
function store(tier: Tier): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return tier === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPersisted(tier: Tier, key: string): string | null {
  try {
    return store(tier)?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

/** Writing an empty value removes the key rather than storing "". */
export function writePersisted(tier: Tier, key: string, value: string): void {
  const s = store(tier);
  if (!s) return;
  try {
    if (value) s.setItem(PREFIX + key, value);
    else s.removeItem(PREFIX + key);
  } catch {
    // Quota exceeded or storage disabled — persistence is best-effort.
  }
}

export function clearPersisted(tier: Tier, keys: readonly string[]): void {
  const s = store(tier);
  if (!s) return;
  try {
    for (const key of keys) s.removeItem(PREFIX + key);
  } catch {
    // Ignore.
  }
}

/**
 * Removes every key this app owns, from both tiers. Enumerates by prefix rather
 * than by a hardcoded list so a key added later cannot survive a reset.
 */
export function clearAllPersisted(): void {
  for (const tier of ["local", "session"] as const) {
    const s = store(tier);
    if (!s) continue;
    try {
      // Collect first: removing while iterating shifts the remaining indices.
      const owned: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key?.startsWith(PREFIX)) owned.push(key);
      }
      for (const key of owned) s.removeItem(key);
    } catch {
      // Storage unavailable — nothing to clear.
    }
  }
}

/** Secrets, held in sessionStorage only, and only behind the opt-in. */
export const SECRET_KEYS = ["accessToken", "clientSecret", "anthropicKey"] as const;
