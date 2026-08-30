"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Answer } from "@/components/Answer";
import { SetupGuide } from "@/components/SetupGuide";
import { TraceLog } from "@/components/TraceLog";
import { KNOWN_ENDPOINTS } from "@/lib/config";
import {
  SECRET_KEYS,
  clearAllPersisted,
  clearPersisted,
  readPersisted,
  writePersisted,
} from "@/lib/persist";
import type { ChatMessage, TraceEvent } from "@/lib/types";

type AuthMethod = "token" | "clientCredentials";

type ConnectResult = {
  handshake: unknown;
};

type DiscoverResult = {
  tools: unknown[];
  resources: unknown[];
  prompts: unknown[];
};

export default function Home() {
  const [endpoint, setEndpoint] = useState("headless-360");

  const [authMethod, setAuthMethod] = useState<AuthMethod>("token");
  const [accessToken, setAccessToken] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [resolvedAccessToken, setResolvedAccessToken] = useState<string | null>(null);

  const [anthropicKey, setAnthropicKey] = useState("");

  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** `at` is when the message was sent; `ms` is the round trip that answered it. */
  const [turns, setTurns] = useState<
    { user: string; answer: string; at: number; ms: number }[]
  >([]);
  const [userText, setUserText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Once connected the auth card collapses to a summary; this reopens it so
  // credentials can be changed without losing the existing connection.
  const [editingAuth, setEditingAuth] = useState(false);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  // Once connected, the setup column can fold to a rail so chat and the log
  // get the width. Never collapsed while disconnected — the form is the only
  // thing to do at that point.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  // The key field folds away once set — it is entered once and then just
  // occupies a row between the transcript and the message box.
  const [editingKey, setEditingKey] = useState(false);
  // Reset is destructive (credentials, chat, and log all go), so it takes two
  // clicks rather than a browser confirm dialog.
  const [confirmReset, setConfirmReset] = useState(false);

  // Opt-in, off by default. Governs the sessionStorage tier only.
  const [rememberSecrets, setRememberSecrets] = useState(false);
  // Persisted values load after mount, so the server and first client render
  // agree. Until this flips, the persist effects must not write back.
  const [hydrated, setHydrated] = useState(false);
  // Drives the expiry countdown. Only read once a token exists, so its value
  // never differs between server and client render.
  const [now, setNow] = useState(() => Date.now());

  const transcriptRef = useRef<HTMLDivElement>(null);

  const [trace, setTrace] = useState<TraceEvent[]>([]);

  const [connectMs, setConnectMs] = useState<number | null>(null);
  const [discoverMs, setDiscoverMs] = useState<number | null>(null);

  function appendTrace(events: TraceEvent[], groupLabel: string, groupMs: number) {
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = Date.now();
    setTrace((prev) => [
      ...prev,
      ...events.map((e, i) => ({ ...e, timestamp: base + i, groupId, groupLabel, groupMs })),
    ]);
  }

  /** POSTs JSON and measures elapsed time; groups the response's trace events under one collapsible entry. */
  async function timedPost(url: string, body: unknown, groupLabel: string) {
    const start = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const ms = performance.now() - start;
    appendTrace(data.trace ?? [], groupLabel, ms);
    return { res, data, ms };
  }

  // Auth params for a request that should always mint/verify credentials fresh
  // (used by Connect). Bypasses any cached client-credentials token.
  const bootstrapAuthParams = () => ({
    accessToken: authMethod === "token" ? accessToken || undefined : undefined,
    loginUrl: authMethod === "clientCredentials" ? loginUrl || undefined : undefined,
    clientId: authMethod === "clientCredentials" ? clientId || undefined : undefined,
    clientSecret: authMethod === "clientCredentials" ? clientSecret || undefined : undefined,
  });

  // Auth params for follow-up requests (Discover, Chat): reuse the token
  // cached from Connect instead of re-running the client-credentials exchange
  // on every request.
  const connectionParams = () => ({
    endpoint,
    ...(authMethod === "clientCredentials" && resolvedAccessToken
      ? { accessToken: resolvedAccessToken }
      : bootstrapAuthParams()),
  });

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    setDiscoverResult(null);
    setDiscoverError(null);
    setResolvedAccessToken(null);
    setTokenRevealed(false);
    setTokenCopied(false);
    setTokenExpiresAt(null);
    setConnectMs(null);
    try {
      const { res, data, ms } = await timedPost(
        "/api/introspect",
        { endpoint, ...bootstrapAuthParams(), mode: "handshake" },
        `Connect \u2192 ${endpoint}`
      );
      setConnectMs(ms);
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setConnectResult(data);
      setEditingAuth(false);
      if (authMethod === "clientCredentials" && data.accessToken) {
        setResolvedAccessToken(data.accessToken);
        setTokenExpiresAt(typeof data.expiresAt === "number" ? data.expiresAt : null);
        setNow(Date.now());
      }
    } catch (err) {
      setConnectResult(null);
      setLeftCollapsed(false);
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoverMs(null);
    try {
      const { res, data, ms } = await timedPost(
        "/api/introspect",
        { ...connectionParams(), mode: "discover" },
        "Discover tools/resources/prompts"
      );
      setDiscoverMs(ms);
      if (!res.ok) throw new Error(data.error ?? "Introspection failed");
      setDiscoverResult(data);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSend() {
    if (!userText.trim()) return;
    setSending(true);
    setChatError(null);
    const text = userText;
    setUserText("");
    const sentAt = Date.now();
    try {
      const { res, data, ms } = await timedPost(
        "/api/chat",
        { ...connectionParams(), anthropicKey: anthropicKey || undefined, messages, userText: text },
        `Chat \u2192 "${text.length > 60 ? `${text.slice(0, 60)}\u2026` : text}"`
      );
      if (!res.ok) throw new Error(data.error ?? "Chat turn failed");
      setMessages(data.messages);
      setTurns((prev) => [
        ...prev,
        { user: text, answer: data.answer, at: sentAt, ms },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  /*
   * Mount-time hydration from an external store. This cannot run during render:
   * the page is statically prerendered, so the server has no storage and any
   * value read at init would mismatch the server HTML on hydration.
   *
   * react-hooks/set-state-in-effect exists to catch cascading renders. This runs
   * once, on mount, with an empty dependency array, and is the case the rule
   * does not model — reading an external store on mount is precisely what the
   * React docs prescribe an effect for when SSR is in play.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedEndpoint = readPersisted("local", "endpoint");
    if (savedEndpoint && savedEndpoint in KNOWN_ENDPOINTS) setEndpoint(savedEndpoint);

    const savedMethod = readPersisted("local", "authMethod");
    if (savedMethod === "token" || savedMethod === "clientCredentials") {
      setAuthMethod(savedMethod);
    }

    const savedLoginUrl = readPersisted("local", "loginUrl");
    if (savedLoginUrl) setLoginUrl(savedLoginUrl);
    const savedClientId = readPersisted("local", "clientId");
    if (savedClientId) setClientId(savedClientId);

    const remember = readPersisted("local", "rememberSecrets") === "1";
    setRememberSecrets(remember);
    if (remember) {
      const savedToken = readPersisted("session", "accessToken");
      if (savedToken) setAccessToken(savedToken);
      const savedSecret = readPersisted("session", "clientSecret");
      if (savedSecret) setClientSecret(savedSecret);
      const savedKey = readPersisted("session", "anthropicKey");
      if (savedKey) setAnthropicKey(savedKey);
    }

    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Non-secrets: always remembered, across sessions.
  useEffect(() => {
    if (!hydrated) return;
    writePersisted("local", "endpoint", endpoint);
    writePersisted("local", "authMethod", authMethod);
    writePersisted("local", "loginUrl", loginUrl);
    writePersisted("local", "clientId", clientId);
  }, [hydrated, endpoint, authMethod, loginUrl, clientId]);

  // Secrets: only while opted in, and unticking the box wipes them immediately.
  useEffect(() => {
    if (!hydrated) return;
    writePersisted("local", "rememberSecrets", rememberSecrets ? "1" : "");
    if (!rememberSecrets) {
      clearPersisted("session", SECRET_KEYS);
      return;
    }
    writePersisted("session", "accessToken", accessToken);
    writePersisted("session", "clientSecret", clientSecret);
    writePersisted("session", "anthropicKey", anthropicKey);
  }, [hydrated, rememberSecrets, accessToken, clientSecret, anthropicKey]);

  useEffect(() => {
    if (!confirmReset) return;
    const id = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(id);
  }, [confirmReset]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  useEffect(() => {
    if (tokenExpiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [tokenExpiresAt]);

  /**
   * Wipes both storage tiers, then reloads. The reload is deliberate: it
   * restores first-run state without enumerating twenty setState calls, so no
   * credential can survive because a field was missed from the list.
   */
  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    clearAllPersisted();
    window.location.reload();
  }

  async function copyToken() {
    if (!resolvedAccessToken) return;
    try {
      await navigator.clipboard.writeText(resolvedAccessToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // Clipboard is unavailable outside a secure context; reveal instead so
      // the token can still be selected by hand.
      setTokenRevealed(true);
    }
  }

  // Collapse the auth card once connected, unless the user reopened it.
  const showAuthForm = !connectResult || editingAuth;
  const collapsed = leftCollapsed && connectResult !== null;
  const showKeyField = !anthropicKey || editingKey;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky brand bar — carries the title, so the page needs no second one. */}
      <header className="sticky top-0 z-20 border-b border-line bg-[var(--surface-header)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-6 py-3">
          <a
            href="https://dxsphere.com"
            target="_blank"
            rel="noreferrer"
            className="t-eyebrow text-primary transition-colors hover:text-white"
          >
            DXSphere
          </a>
          <span className="h-4 w-px bg-line" />
          <h1 className="t-card-title">Salesforce MCP Playground</h1>
          <div className="ml-auto flex items-center gap-5">
            <Link href="/setup" target="_blank" className="btn btn-quiet px-0">
              Setup Guide
            </Link>
            <button
              onClick={handleReset}
              onBlur={() => setConfirmReset(false)}
              title="Clear saved settings and credentials from this browser"
              className={`btn btn-quiet px-0 ${confirmReset ? "text-accent-coral" : ""}`}
            >
              {confirmReset ? "Confirm reset" : "Reset"}
            </button>
            <a
              href="https://github.com/babakh/sf-mcp-playground"
              target="_blank"
              rel="noreferrer"
              className="t-eyebrow hidden items-center gap-1.5 text-[0.7rem] text-muted transition-colors hover:text-primary md:flex"
            >
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        {/* Decorative only — absolutely positioned, so the glow costs no height. */}
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-72" />

        <div
          className={`relative grid grid-cols-1 gap-6 lg:gap-x-2 ${
            collapsed
              ? "lg:grid-cols-[3.5rem_1.5rem_1fr]"
              : "lg:grid-cols-[1fr_1.5rem_1fr]"
          }`}
        >
          {/* Left column: connection + introspection */}
          {collapsed ? (
            <section className="card flex items-center gap-3 px-3 py-3 lg:flex-col lg:py-4">
              <button
                onClick={() => setLeftCollapsed(false)}
                className="btn btn-quiet px-0 lg:hidden"
              >
                Show setup
              </button>
              <span
                className="size-2 shrink-0 bg-accent-green"
                aria-hidden
                title="Authenticated"
              />
              <span className="t-eyebrow truncate text-[0.7rem] text-muted lg:[writing-mode:vertical-rl]">
                {endpoint}
              </span>
            </section>
          ) : (
            <section className="flex flex-col gap-6">
              <div className="card">
                <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                  <h2 className="t-eyebrow" id="endpoint-heading">
                    <span className="text-primary">01</span> Select an MCP endpoint
                  </h2>
                  {connectResult && (
                    <button
                      onClick={() => setLeftCollapsed(true)}
                      className="btn btn-quiet px-0 lg:hidden"
                    >
                      Hide setup
                    </button>
                  )}
                </div>
                <div className="p-5">
                  <select
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    aria-labelledby="endpoint-heading"
                    className="input w-full"
                  >
                    <option value="sobject-all">sobject-all</option>
                    <option value="headless-360">headless-360</option>
                    <option value="metadata-experts">metadata-experts</option>
                    <option value="sobject-reads">sobject-reads</option>
                    <option value="sobject-deletes">sobject-deletes</option>
                    <option value="sobject-mutations">sobject-mutations</option>
                    <option value="salesforce-api-context">salesforce-api-context</option>
                    <option value="data360">data360</option>
                  </select>
                  <p className="mt-2 font-mono text-[0.7rem] break-all text-dimmer">
                    {KNOWN_ENDPOINTS[endpoint]}
                  </p>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                  <h2 className="t-eyebrow">
                    <span className={showAuthForm ? "text-primary" : "text-accent-green"}>02</span>{" "}
                    {showAuthForm ? "Authenticate with Salesforce" : "Authenticated"}
                  </h2>
                  {connectResult && (
                    <button
                      onClick={() => setEditingAuth((v) => !v)}
                      className="btn btn-quiet px-0"
                    >
                      {editingAuth ? "Cancel" : "Change"}
                    </button>
                  )}
                </div>
                {!showAuthForm ? (
                  <div className="p-5">
                    {resolvedAccessToken ? (
                      <>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="t-body2 text-muted">Access token</span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setTokenRevealed((v) => !v)}
                              className="btn btn-quiet px-0"
                            >
                              {tokenRevealed ? "Hide" : "Reveal"}
                            </button>
                            <button onClick={copyToken} className="btn btn-quiet px-0">
                              {tokenCopied ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </div>
                        <input
                          readOnly
                          autoComplete="off"
                          type={tokenRevealed ? "text" : "password"}
                          value={resolvedAccessToken}
                          onFocus={(e) => e.currentTarget.select()}
                          className="input w-full font-mono text-[0.75rem]"
                        />
                        <p className="t-body2 mt-2 text-dim">
                          Reuse under <span className="text-softer">Access Token</span> next session.{" "}
                          {tokenExpiresAt === null ? (
                            "Expires on your org\u2019s session policy."
                          ) : tokenExpiresAt <= now ? (
                            <span className="text-accent-coral">
                              Expired &mdash; reconnect to mint a new one.
                            </span>
                          ) : (
                            <>
                              Expires{" "}
                              <span className="text-softer">
                                {new Date(tokenExpiresAt).toLocaleTimeString([], { hour12: false })}
                              </span>
                              , in {formatRemaining(tokenExpiresAt - now)}.
                            </>
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="t-body2 text-muted">
                        {authMethod === "token"
                          ? "Using the access token you provided."
                          : "Token minted from your client credentials."}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-5">
                    <SetupGuide />
                    <p className="t-body2 mb-3 text-muted">
                      Two options: paste an access token you already have, or enter client credentials
                      and let the app mint one.
                    </p>
                    <p className="t-body2 mb-3 border-l-[3px] border-primary pl-3 text-muted">
                      Either way, the token must come from an External Client App with the MCP scope
                      enabled. A general-purpose org token won&rsquo;t work.
                    </p>
                    <p className="t-body2 mb-4 text-dim">
                      Credentials go straight to Salesforce/Anthropic per request &mdash; nothing
                      is stored server-side. The endpoint, Login URL, and Client ID are remembered
                      in this browser; secrets are not, unless you tick the box below.
                    </p>

                    <div className="mb-4 flex border border-line bg-[var(--surface-panel)]">
                      <button
                        onClick={() => setAuthMethod("token")}
                        className={`btn flex-1 ${
                          authMethod === "token" ? "btn-contained" : "btn-quiet"
                        }`}
                      >
                        Access Token
                      </button>
                      <button
                        onClick={() => {
                          setAuthMethod("clientCredentials");
                          setResolvedAccessToken(null);
                        }}
                        className={`btn flex-1 ${
                          authMethod === "clientCredentials" ? "btn-contained" : "btn-quiet"
                        }`}
                      >
                        Client Credentials
                      </button>
                    </div>

                    {authMethod === "token" ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="t-body2 text-muted">Salesforce access token</span>
                        <input
                          type="password"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="required, not stored"
                          className="input"
                        />
                      </label>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="t-body2 text-muted">Login / instance URL</span>
                          <input
                            value={loginUrl}
                            onChange={(e) => {
                              setLoginUrl(e.target.value);
                              setResolvedAccessToken(null);
                            }}
                            placeholder="https://<your-domain>.my.salesforce.com"
                            className="input"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="t-body2 text-muted">Client ID (consumer key)</span>
                          <input
                            value={clientId}
                            onChange={(e) => {
                              setClientId(e.target.value);
                              setResolvedAccessToken(null);
                            }}
                            placeholder="required, not stored"
                            className="input"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="t-body2 text-muted">Client secret (consumer secret)</span>
                          <input
                            type="password"
                            value={clientSecret}
                            onChange={(e) => {
                              setClientSecret(e.target.value);
                              setResolvedAccessToken(null);
                            }}
                            placeholder="required, not stored"
                            className="input"
                          />
                        </label>
                      </div>
                    )}

                    <label className="mt-5 flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={rememberSecrets}
                        onChange={(e) => setRememberSecrets(e.target.checked)}
                        className="mt-0.5 size-3.5 shrink-0 accent-[var(--brand-primary)]"
                      />
                      <span className="t-body2 text-muted">
                        Remember secrets in this tab
                        <span className="block text-dim">
                          Access token, client secret, and Anthropic key are kept until you close
                          the tab, so a reload doesn&rsquo;t lose them. Never written to disk or to
                          the server. Unticking this erases them now.
                        </span>
                      </span>
                    </label>

                    <button
                      onClick={handleConnect}
                      disabled={connecting}
                      className="btn btn-contained mt-4 w-full"
                    >
                      {connecting ? "Connecting…" : "Connect to MCP server"}
                    </button>
                    {connectMs !== null && !connecting && (
                      <p className="t-body2 mt-2 text-dim">Completed in {connectMs.toFixed(0)} ms</p>
                    )}
                    {connectError && (
                      <p className="t-body2 mt-3 border-l-[3px] border-accent-coral pl-3 text-accent-coral">
                        {connectError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {connectResult && (
                <div className="card">
                  <div className="border-b border-hairline px-5 py-3">
                    <h2 className="t-eyebrow">
                      <span className="text-primary">03</span> Discover what the server offers
                    </h2>
                  </div>
                  <div className="p-5">
                    <p className="t-body2 mb-4 text-muted">
                      Ask the server to list everything it exposes — the tools Claude can call,
                      plus any resources and prompts. Connected to{" "}
                      <span className="text-primary">
                        {String(
                          (connectResult.handshake as { serverInfo?: { name?: string } })?.serverInfo
                            ?.name ?? "server"
                        )}
                      </span>
                      . Full handshake details are in the Message Log.
                    </p>
                    <button
                      onClick={handleDiscover}
                      disabled={discovering}
                      className="btn w-full"
                    >
                      {discovering ? "Discovering…" : "Show Tools / Resources / Prompts"}
                    </button>
                    {discoverMs !== null && !discovering && (
                      <p className="t-body2 mt-2 text-dim">Completed in {discoverMs.toFixed(0)} ms</p>
                    )}
                    {discoverError && (
                      <p className="t-body2 mt-3 border-l-[3px] border-accent-coral pl-3 text-accent-coral">
                        {discoverError}
                      </p>
                    )}
                    {discoverResult && (
                      <div className="mt-4 grid grid-cols-3 border border-line">
                        <Stat
                          label="Tools"
                          value={discoverResult.tools.length}
                          color="var(--accent-cyan)"
                        />
                        <Stat
                          label="Resources"
                          value={discoverResult.resources.length}
                          color="var(--accent-periwinkle)"
                        />
                        <Stat
                          label="Prompts"
                          value={discoverResult.prompts.length}
                          color="var(--accent-green)"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Panel splitter. Full-height and always present once connected, so the
              collapse affordance reads as a column control rather than a card action. */}
          {connectResult ? (
            <button
              onClick={() => setLeftCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand setup panel" : "Collapse setup panel"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand setup panel" : "Collapse setup panel"}
              className="hidden border border-line bg-[var(--surface-panel)] text-muted transition-colors hover:border-primary hover:bg-[var(--accent-hairline)] hover:text-primary lg:flex lg:items-center lg:justify-center"
            >
              <span aria-hidden className="text-[0.95rem] leading-none">
                {collapsed ? "\u203A" : "\u2039"}
              </span>
            </button>
          ) : (
            <div aria-hidden className="hidden lg:block" />
          )}

          {/* Right column: chat + trace log */}
          <section className="flex flex-col gap-6">
            <div className="card">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <h2 className="t-eyebrow">Ask Claude to use the tools</h2>
                {anthropicKey && (
                  <div className="flex items-center gap-3">
                    <span className="t-body2 text-dim">API key set</span>
                    <button
                      onClick={() => setEditingKey((v) => !v)}
                      className="btn btn-quiet px-0"
                    >
                      {editingKey ? "Done" : "Change"}
                    </button>
                  </div>
                )}
              </div>
              <div className="p-5">
                {turns.length > 0 && (
                  <div
                    ref={transcriptRef}
                    className="mb-4 flex max-h-[32rem] flex-col divide-y divide-line overflow-auto motion-safe:scroll-smooth"
                  >
                    {turns.map((t, i) => (
                      <div key={i} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                        {/* Speaker label in a fixed gutter; content keeps full width.
                            Both rows carry the same 3px rule so their left edges align —
                            only the colour differs, which is what marks the speaker. */}
                        <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[4.5rem_1fr]">
                          <div className="pt-0.5">
                            <span className="t-eyebrow block text-[0.66rem] text-dim">You</span>
                            <span className="mt-0.5 block font-mono text-[0.62rem] text-dimmer">
                              {new Date(t.at).toLocaleTimeString([], { hour12: false })}
                            </span>
                          </div>
                          <p className="t-body2 min-w-0 border-l-[3px] border-transparent pl-3 text-softer">
                            {t.user}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[4.5rem_1fr]">
                          <div className="pt-0.5">
                            <span className="t-eyebrow block text-[0.66rem] text-primary">
                              Claude
                            </span>
                            <span className="mt-0.5 block font-mono text-[0.62rem] text-dimmer">
                              {t.ms.toFixed(0)} ms
                            </span>
                          </div>
                          <div className="min-w-0 border-l-[3px] border-primary pl-3">
                            <Answer>{t.answer}</Answer>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {turns.length === 0 && (
                  <p className="t-body2 mb-4 text-muted">
                    Ask a question in plain English. Claude decides which of the server&rsquo;s
                    tools to call, runs them against your org, and answers from the results — every
                    request and tool call shows up in the Message Log below.
                  </p>
                )}
                {showKeyField && (
                  <label className="mb-4 flex flex-col gap-1.5">
                    <span className="t-body2 text-muted">Anthropic API key</span>
                    <input
                      type="password"
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="required, not stored"
                      className="input"
                      autoFocus={editingKey}
                    />
                  </label>
                )}
                <div className="flex gap-3">
                  <input
                    value={userText}
                    onChange={(e) => setUserText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Ask about your Salesforce data…"
                    className="input flex-1"
                  />
                  <button onClick={handleSend} disabled={sending} className="btn btn-contained">
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
                {chatError && (
                  <p className="t-body2 mt-3 border-l-[3px] border-accent-coral pl-3 text-accent-coral">
                    {chatError}
                  </p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <h2 className="t-eyebrow">Message Log</h2>
                <div className="flex items-center gap-3">
                  <span className="t-body2 text-dim">every request on the wire</span>
                  {trace.length > 0 && (
                    <button onClick={() => setTrace([])} className="btn btn-quiet px-0">
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="p-5">
                <TraceLog trace={trace} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** Coarse "1h 58m" style remaining-time label. */
function formatRemaining(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "under a minute";
  const hours = Math.floor(mins / 60);
  return hours > 0 ? `${hours}h ${mins % 60}m` : `${mins}m`;
}

/** Single discovery count, coloured from the categorical accent set. */
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border-r border-line px-4 py-3 last:border-r-0">
      <p className="t-h4 font-bold" style={{ color }}>
        {value}
      </p>
      <p className="t-eyebrow text-[0.7rem] text-muted">{label}</p>
    </div>
  );
}
