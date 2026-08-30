"use client";

import { useState } from "react";
import { TraceLog } from "@/components/TraceLog";
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
  const [turns, setTurns] = useState<{ user: string; answer: string }[]>([]);
  const [userText, setUserText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [trace, setTrace] = useState<TraceEvent[]>([]);

  const [connectMs, setConnectMs] = useState<number | null>(null);
  const [discoverMs, setDiscoverMs] = useState<number | null>(null);
  const [sendMs, setSendMs] = useState<number | null>(null);

  function appendTrace(events: TraceEvent[], groupLabel: string) {
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = Date.now();
    setTrace((prev) => [
      ...prev,
      ...events.map((e, i) => ({ ...e, timestamp: base + i, groupId, groupLabel })),
    ]);
  }

  /** POSTs JSON and measures elapsed time; groups the response's trace events under one collapsible entry. */
  async function timedPost(url: string, body: unknown, label: string, groupLabel = label) {
    const start = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const ms = performance.now() - start;
    const events: TraceEvent[] = data.trace ?? [];
    appendTrace([...events, { section: "TIMING", label, data: `${ms.toFixed(0)} ms` }], groupLabel);
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
    setConnectMs(null);
    try {
      const { res, data, ms } = await timedPost(
        "/api/introspect",
        { endpoint, ...bootstrapAuthParams(), mode: "handshake" },
        "connect",
        `Connect \u2192 ${endpoint}`
      );
      setConnectMs(ms);
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setConnectResult(data);
      if (authMethod === "clientCredentials" && data.accessToken) {
        setResolvedAccessToken(data.accessToken);
      }
    } catch (err) {
      setConnectResult(null);
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
        "discover",
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
    setSendMs(null);
    const text = userText;
    setUserText("");
    try {
      const { res, data, ms } = await timedPost(
        "/api/chat",
        { ...connectionParams(), anthropicKey: anthropicKey || undefined, messages, userText: text },
        "chat",
        `Chat \u2192 "${text.length > 60 ? `${text.slice(0, 60)}\u2026` : text}"`
      );
      setSendMs(ms);
      if (!res.ok) throw new Error(data.error ?? "Chat turn failed");
      setMessages(data.messages);
      setTurns((prev) => [...prev, { user: text, answer: data.answer }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
      <h1 className="mb-6 text-2xl font-semibold">Salesforce MCP Playground</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: connection + introspection */}
        <section className="flex flex-col gap-4">
          <div className="rounded border border-neutral-700 p-4">
            <h2 className="mb-3 font-medium">1. Connection</h2>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex flex-col gap-1">
                Endpoint
                <select
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
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
              </label>
            </div>
          </div>

          <div className="rounded border border-neutral-700 p-4">
            <h2 className="mb-1 font-medium">2. Authentication</h2>
            <p className="mb-3 text-xs text-neutral-500">
              🔒 Credentials entered below are held only in this browser tab for the current
              session and sent directly to Salesforce/Anthropic per request. Nothing is written
              to a database, file, or log on the server &mdash; closing or refreshing this tab
              clears them.
            </p>
            <div className="mb-3 flex gap-1 rounded bg-neutral-900 p-1 text-sm">
              <button
                onClick={() => setAuthMethod("token")}
                className={`flex-1 rounded px-2 py-1 ${
                  authMethod === "token" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Access Token
              </button>
              <button
                onClick={() => {
                  setAuthMethod("clientCredentials");
                  setResolvedAccessToken(null);
                }}
                className={`flex-1 rounded px-2 py-1 ${
                  authMethod === "clientCredentials" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Client Credentials
              </button>
            </div>

            {authMethod === "token" ? (
              <label className="flex flex-col gap-1 text-sm">
                SF Access Token
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="required, not stored"
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                />
              </label>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex flex-col gap-1">
                  Login URL
                  <input
                    value={loginUrl}
                    onChange={(e) => {
                      setLoginUrl(e.target.value);
                      setResolvedAccessToken(null);
                    }}
                    placeholder="https://<your-domain>.my.salesforce.com/services/oauth2/token"
                    className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Client ID
                  <input
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setResolvedAccessToken(null);
                    }}
                    placeholder="required, not stored"
                    className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Client Secret
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => {
                      setClientSecret(e.target.value);
                      setResolvedAccessToken(null);
                    }}
                    placeholder="required, not stored"
                    className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  />
                </label>
              </div>
            )}

            <label className="mt-3 flex flex-col gap-1 text-sm">
              Anthropic API Key
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="required, not stored"
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
              />
            </label>

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
            {connectMs !== null && !connecting && (
              <p className="mt-1 text-xs text-neutral-500">Completed in {connectMs.toFixed(0)} ms</p>
            )}
            {connectError && <p className="mt-2 text-sm text-red-400">{connectError}</p>}
          </div>

          {connectResult && (
            <div className="rounded border border-neutral-700 p-4">
              <h2 className="mb-3 font-medium">3. Introspection</h2>
              <p className="mb-3 text-xs text-neutral-500">
                Connected to {String((connectResult.handshake as { serverInfo?: { name?: string } })?.serverInfo?.name ?? "server")}.
                Full handshake details are in the Message Log.
              </p>
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {discovering ? "Discovering..." : "Show Tools / Resources / Prompts"}
              </button>
              {discoverMs !== null && !discovering && (
                <p className="mt-1 text-xs text-neutral-500">Completed in {discoverMs.toFixed(0)} ms</p>
              )}
              {discoverError && <p className="mt-2 text-sm text-red-400">{discoverError}</p>}
              {discoverResult && (
                <p className="mt-2 text-xs text-neutral-500">
                  Discovered {discoverResult.tools.length} tool{discoverResult.tools.length === 1 ? "" : "s"},{" "}
                  {discoverResult.resources.length} resource{discoverResult.resources.length === 1 ? "" : "s"}, and{" "}
                  {discoverResult.prompts.length} prompt{discoverResult.prompts.length === 1 ? "" : "s"} — see the
                  Message Log for details.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Right column: chat + trace log */}
        <section className="flex flex-col gap-4">
          <div className="rounded border border-neutral-700 p-4">
            <h2 className="mb-3 font-medium">Chat</h2>
            <div className="mb-3 flex max-h-80 flex-col gap-3 overflow-auto">
              {turns.map((t, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <p className="text-sm">
                    <span className="text-neutral-400">You:</span> {t.user}
                  </p>
                  <p className="rounded bg-neutral-900 p-2 text-sm">
                    <span className="text-blue-400">Claude:</span> {t.answer}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask about your Salesforce data..."
                className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleSend}
                disabled={sending}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
            {sendMs !== null && !sending && (
              <p className="mt-1 text-xs text-neutral-500">Completed in {sendMs.toFixed(0)} ms</p>
            )}
            {chatError && <p className="mt-2 text-sm text-red-400">{chatError}</p>}
          </div>

          <div className="rounded border border-neutral-700 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Message Log (handshake, Claude &amp; MCP traffic)</h2>
              {trace.length > 0 && (
                <button
                  onClick={() => setTrace([])}
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Clear
                </button>
              )}
            </div>
            <TraceLog trace={trace} />
          </div>
        </section>
      </div>
    </div>
  );
}

