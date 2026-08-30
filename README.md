# Salesforce MCP Playground

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
- A **Salesforce org** with the MCP endpoints enabled, plus credentials (see below)

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

The quickest path. If you have the Salesforce CLI set up:

```bash
sf org display --target-org <your-alias> --verbose
```

Copy the **Access Token** into the *SF Access Token* field. Note that these expire — when calls
start failing with a 401, re-run the command and paste a fresh one.

### Salesforce — option 2: client credentials

Better for a session you don't want to keep re-authenticating. Requires a Connected App (or
External Client App) in your org with the **OAuth 2.0 Client Credentials Flow** enabled and a
run-as user assigned. Fill in:

| Field | Value |
|---|---|
| Login URL | `https://<your-domain>.my.salesforce.com` |
| Client ID | The app's consumer key |
| Client Secret | The app's consumer secret |

The app exchanges these for a token at `<Login URL>/services/oauth2/token` on **Connect**, then
reuses that token for Discover and Chat rather than re-running the exchange every request. Editing
any of the three fields clears the cached token.

The run-as user needs whatever permissions the endpoint's tools require — a read-only endpoint
still needs object and field access to the data you ask about.

### Anthropic API key

Paste into the *Anthropic API Key* field. Used only for the Chat panel; Connect and Discover
work without it.

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

**1. Connection** — pick an endpoint.

**2. Authentication** — choose Access Token or Client Credentials, fill it in, add your Anthropic
key, and hit **Connect**. This performs the MCP `initialize` handshake only. On success you'll see
the server name; the full handshake, including the server's declared capabilities and instructions,
is in the Message Log.

**3. Introspection** — **Show Tools / Resources / Prompts** runs `tools/list`, `resources/list`, and
`prompts/list`. Servers that don't implement resources or prompts are handled gracefully — the log
records them as unsupported instead of failing the request.

**Chat** — ask a question. The route sends your message to Claude with the endpoint's tools
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

## Credential handling

**By design, this app has no server-side credential fallback.** There is no `ANTHROPIC_API_KEY`
env var, no stored Salesforce secret, nothing on disk. If it were shared with anyone, a server-held
credential would be silently usable by every visitor — so callers must supply their own per request.

What that means in practice:

- Credentials live in React state in your browser tab. Refreshing or closing it clears them.
- They are sent to this app's own API routes, which forward them to Salesforce and Anthropic.
  They are not written to a database, file, or server-side log.
- Trace events sent back to the browser include the Client ID and, for the client-credentials
  flow, the resolved access token — the client caches it to skip repeat exchanges. The client
  secret is never returned.

## Known limitations

Treat this as a local development tool, not something to expose publicly:

- **The `loginUrl` field is unvalidated.** The server will POST to whatever host you give it and
  return the response in the trace. On a public deployment that is a server-side request forgery
  vector. Restrict it to Salesforce domains before hosting this anywhere.
- **Tool results are parsed optimistically.** `src/app/api/chat/route.ts` assumes an array
  `content` and ignores the MCP `isError` flag, so a tool failure reaches the model as ordinary
  text and an unusual response shape can throw.
- **No serverless timeout configured.** Neither route exports `maxDuration`; a long tool-calling
  loop will exceed the default function timeout on a platform like Vercel.
- **The pinned model is a generation behind.** `CLAUDE_MODEL` in `src/lib/config.ts` is
  `claude-sonnet-4-6`; `claude-sonnet-5` is both more capable and cheaper.
- Chat history is client-side only and lost on refresh.
