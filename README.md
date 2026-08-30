# Salesforce MCP Playground

*This is a reference implementation maintained on a best-effort basis. PRs welcome; response times
vary.*

A local web tool for exploring Salesforce's hosted **Model Context Protocol (MCP)** servers.
Connect to an endpoint, inspect what it exposes, then chat against it with Claude — and watch
every message on the wire in a live trace log.

It answers three questions that are otherwise awkward to test:

1. **Can I connect?** — does auth work, and what does the MCP server report in its handshake?
2. **What's in there?** — what tools, resources, and prompts does this endpoint expose?
3. **Does it actually work?** — can a model use those tools to answer a real question about my org?

The trace log is the point. Every step — the OAuth exchange, the MCP `initialize` handshake,
each `tools/list`, every request to Claude, and every `tools/call` with its arguments and raw
result — is captured and rendered as a grouped, collapsible timeline.

## How it works

```
Browser (page.tsx)
  │  credentials live only in React state
  ▼
Next.js API routes  ──── OAuth2 client-credentials ───▶  Salesforce login host
  │                 ──── MCP over Streamable HTTP ────▶  Salesforce MCP server
  │                 ──── Messages API ─────────────────▶  Anthropic
  ▼
Trace events returned with each response and appended to the log
```

The API routes exist because the MCP client transport and the Anthropic SDK both need to run
server-side. They are **stateless pass-throughs** — nothing is persisted between requests.

## Requirements

- **Node.js 20.9+** (required by Next.js 16)
- An **Anthropic API key** — from [console.anthropic.com](https://console.anthropic.com/settings/keys)
- A **Salesforce org** with the Hosted MCP server activated and an External Client App configured
  — see [Salesforce org setup](#salesforce-org-setup)

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

**There is nothing to configure.** No `.env` file, no environment variables — the app reads none.
Every credential is entered in the UI and travels with the request that needs it. See
[Credential handling](#credential-handling) for why.

## Credentials

You need two things: a way to authenticate to Salesforce, and an Anthropic API key.

### Salesforce — option 1: access token

For a token you already hold. Paste it into the *Salesforce access token* field.

**It must be a token minted from an External Client App with the `mcp_api` scope enabled** (see
[Salesforce org setup](#salesforce-org-setup)). A general-purpose org token will authenticate and
then fail at the MCP call — notably, the one from `sf org display` does not carry the scope and
will not work here. In practice this means running
the client-credentials exchange yourself, or using option 2 below and copying the token the app
mints for you.

Tokens expire on your org's session policy. When calls start failing with a 401, get a fresh one.

### Salesforce — option 2: client credentials

Better for a session you don't want to keep re-authenticating. Requires an **External Client App**
set up per [Salesforce org setup](#salesforce-org-setup) below, with the client-credentials flow
enabled and a run-as user assigned. Fill in:

| Field | Value |
|---|---|
| Login URL | `https://<your-domain>.my.salesforce.com` |
| Client ID | The app's consumer key |
| Client Secret | The app's consumer secret |

The app exchanges these for a token at `<Login URL>/services/oauth2/token` on **Connect**, then
reuses that token for Discover and Chat rather than re-running the exchange every request. Editing
any of the three fields clears the cached token.

The Login URL host is checked against an allowlist — it must be `salesforce.com` or a subdomain,
over https. Without that, the field would let anyone POST from this server to any host they name
(see `resolveLoginUrl` in `src/lib/config.ts`).

After connecting, the minted token is shown in the collapsed auth card behind **Reveal** / **Copy**,
along with its expiry where the org allows introspection. Copying it lets you skip the exchange on
your next visit by pasting it under *Access Token*.

The run-as user needs whatever permissions the endpoint's tools require — a read-only endpoint
still needs object and field access to the data you ask about.

### Anthropic API key

Paste into the *Anthropic API key* field, in the Chat panel. It is not a Salesforce credential and
is not needed to connect — Connect and Discover work without it.

## Salesforce org setup

One-time work in your org before any of this connects. The same steps are in the app, collapsed
under *First time here?* in the authentication card.

**Connected Apps are not supported for MCP authentication** — it must be an External Client App
(ECA).

1. **Activate the MCP server.** Setup → **MCP Servers** → **Salesforce Servers**. Pick the server
   you want (e.g. `headless-360`), click **Activate**, and note its Server URL and API name. Prefer
   a read-only server such as `sobject-reads` for a first test.
2. **Create an External Client App.** Setup → **External Client App Manager** → **New External
   Client App**. Fill in the name, API name, and contact email.
3. **Enable OAuth.** Expand **API (Enable OAuth Settings)** and check **Enable OAuth**. Set a
   Callback URL matching your client — `https://oauth.pstmn.io/v1/callback` works for testing.
4. **Add the `mcp_api` scope** — *Access Salesforce Hosted MCP Servers*. This scope exists
   precisely so you don't have to grant the far broader `api` scope (full Platform API access). Add
   `refresh_token` / `offline_access` only if your client needs long-lived sessions.
5. **Enable the client-credentials flow.** Check **Enable Client Credentials Flow** and choose a
   **Run As** user. *Required for this app's Client Credentials tab* — without it, only the Access
   Token tab works.
6. **Save, then wait up to ~30 minutes.** An ECA takes time to propagate. Don't troubleshoot auth
   failures until that window has passed.
7. **Copy the Consumer Key and Secret.** The ECA → **Settings** → **OAuth Settings** → **Consumer
   Key and Secret**; you may need to verify with an emailed code. The Consumer Key is the Client ID
   this app asks for.
8. *(Optional)* **Restrict access.** By default any org user can authenticate through the ECA. To
   limit it, create a permission set scoped to the ECA, assign it to the intended users, and set an
   app policy requiring pre-authorization.

Worth knowing:

- **One ECA per client type** (one for this app, one for Postman, and so on) — keeps permissions
  and logging separate, per Salesforce's own recommendation.
- **Calls run as the authenticated user**, not a shared integration account. Normal CRUD,
  field-level security, and sharing rules apply on top of whatever the ECA scope allows.
- **Tokens are Hosted-MCP-specific**, JWT-shaped bearer tokens. Don't reuse one minted for a
  different OAuth flow.

References: [Set Up Your Org — Hosted MCP Servers](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_mcp_setup.htm)
· [Create an External Client App](https://developer.salesforce.com/docs/atlas.en-us.oas.meta/oas/oas_external_client_app.htm)
· [How to Secure Salesforce Hosted MCP Servers](https://developer.salesforce.com/blogs/2026/06/how-to-secure-salesforce-hosted-mcp-servers)
· [Connect MCP Clients](https://developer.salesforce.com/docs/atlas.en-us.oas.meta/oas/oas_connect_mcp_clients.htm)

## Endpoints

Picked from the dropdown, resolved in `src/lib/config.ts`:

| Endpoint | |
|---|---|
| `sobject-all` | Full sObject access |
| `headless-360` | Default |
| `metadata-experts` | Org metadata |
| `sobject-reads` | Read-only sObject access |
| `sobject-deletes` | sObject deletes |
| `sobject-mutations` | sObject creates and updates |
| `salesforce-api-context` | Salesforce API context |
| `data360` | Data Cloud / Data 360 |

The descriptions above are inferred from the endpoint names — check each server's handshake
`instructions` and its `tools/list` output for what it actually exposes.

Start with a read-only endpoint (`sobject-reads`) while you're finding your footing — several of
these can modify or delete records in a real org.

## Using it

**01 Select an MCP endpoint** — pick one from the dropdown. The URL it resolves to is shown
beneath it.

**02 Authenticate with Salesforce** — choose Access Token or Client Credentials, fill it in, and hit
**Connect to MCP server**. This performs the MCP `initialize` handshake only. On success the card
collapses to a summary — with the minted token, if the app fetched one — and **Change** reopens it.
The full handshake, including the server's declared capabilities and instructions, is in the
Message Log.

**03 Discover what the server offers** — **Show Tools / Resources / Prompts** runs `tools/list`,
`resources/list`, and `prompts/list`, then reports the counts. Servers that don't implement
resources or prompts are handled gracefully — the log records them as unsupported instead of
failing the request.

**Ask Claude to use the tools** — enter your Anthropic key and ask a question. The route sends your
message to Claude with the endpoint's tools
attached, executes any `tools/call` the model requests against the live MCP session, feeds results
back, and repeats until the model produces an answer. The loop is capped at 10 tool-calling turns.

**Message Log** — one collapsible group per operation, each containing the individual steps with a
one-line summary. Errors are expanded by default. **Clear** resets it; the chat history is separate
and persists.

## Project structure

```
src/
├─ app/
│  ├─ page.tsx                  Entire UI — connection, auth, chat, trace log
│  ├─ layout.tsx
│  └─ api/
│     ├─ introspect/route.ts    Handshake + tools/resources/prompts discovery
│     └─ chat/route.ts          Claude ↔ MCP tool-calling loop
├─ components/
│  ├─ TraceLog.tsx              Grouped, collapsible trace timeline
│  └─ JsonBlock.tsx
└─ lib/
   ├─ mcp.ts                    withMcpSession — connect, run, always close
   ├─ auth.ts                   Token passthrough or client-credentials exchange
   ├─ config.ts                 Endpoint map, model, credential resolvers
   └─ types.ts
```

`npm run build` for a production build, `npm run lint` for ESLint.

## Observability

The app ships with [Vercel Web Analytics](https://vercel.com/docs/analytics) and
[Speed Insights](https://vercel.com/docs/speed-insights) (`<Analytics />` / `<SpeedInsights />` in
`src/app/layout.tsx`). Both are no-ops until the project is deployed on Vercel — nothing to
configure, no keys, and they add nothing to local `npm run dev`. Once deployed, traffic and Core
Web Vitals show up under the project's **Analytics** and **Speed Insights** tabs.

Both API routes also `console.error` on failure before returning the error response. The `trace`
array in the response is the only thing the *caller* sees; without a server-side log line, a
failing deployment is invisible to you unless a user reports it. These show up under the project's
**Logs** tab (or `vercel logs` from the CLI). Only the error itself is logged — never a credential,
since none of the caller-supplied secrets are ever included in a thrown error's message.

If you deploy elsewhere (not Vercel), the Analytics/Speed Insights components render nothing and
the `console.error` calls just go to whatever captures your process's stderr.

## Credential handling

**By design, this app has no server-side credential fallback.** There is no `ANTHROPIC_API_KEY`
env var, no stored Salesforce secret, nothing on disk. If it were shared with anyone, a server-held
credential would be silently usable by every visitor — so callers must supply their own per request.

What that means in practice:

- They are sent to this app's own API routes, which forward them to Salesforce and Anthropic.
  They are not written to a database, file, or server-side log.
- **Non-secrets are remembered across visits** in `localStorage`: the selected endpoint, auth
  method, Login URL, and Client ID. None of these is a credential on its own.
- **Secrets are only remembered if you tick "Remember secrets in this tab"**, and then only in
  `sessionStorage` — the access token, client secret, and Anthropic key survive a reload but are
  gone when the tab closes. Unticking the box erases them immediately. `localStorage` is
  deliberately not offered for these: this app is deployed publicly, and a Salesforce client
  secret persisting indefinitely in a shared browser profile is not a sane default.
- **Reset** in the header clears both tiers and reloads to first-run state. It takes two clicks
  and is the only way to clear the `localStorage` tier from the UI — worth using before you hand
  the machine to someone else.
- Storage is not a security boundary — anything that can run JS on this origin can read React
  state or the inputs directly. The two tiers control credential *lifetime*, which is the part
  that actually differs. See `src/lib/persist.ts`.
- Trace events include the token URL and Client ID, and — for the client-credentials flow — the
  token's `instance_url`, `token_type`, and `issued_at`. **The access token itself is never put in
  a trace event**, so the Message Log stays safe to screenshot or share. The client secret is never
  returned at all.
- The minted token *is* returned in the response body, so the browser can cache it across Discover
  and Chat instead of re-running the exchange, and can show it to you behind **Reveal** / **Copy**.

## Known limitations

- **Tool results are parsed optimistically.** `src/app/api/chat/route.ts` assumes an array
  `content` and ignores the MCP `isError` flag, so a tool failure reaches the model as ordinary
  text and an unusual response shape can throw.
- **The pinned model is a generation behind.** `CLAUDE_MODEL` in `src/lib/config.ts` is
  `claude-sonnet-4-6`; `claude-sonnet-5` is both more capable and cheaper.
- **Chat is not streamed.** The route waits for the full agentic loop before responding, so a
  turn with several tool calls can leave the UI idle for 20+ seconds. `maxDuration` is set to
  60s on both routes — the ceiling every Vercel plan accepts. Raise it toward your plan's limit
  if long loops still get cut off.
- **No rate limiting.** Anyone who opens the deployed URL can drive the routes. They can only
  spend their own Salesforce and Anthropic credentials, but the endpoints themselves are open.
- Chat history is client-side only and lost on refresh.
