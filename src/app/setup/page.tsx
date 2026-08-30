import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Salesforce ECA Setup — Salesforce MCP Playground",
  description:
    "The eight one-time steps to configure a Salesforce org's External Client App for Hosted MCP authentication.",
};

type Step = { title: string; body: React.ReactNode; flag?: React.ReactNode };

const STEPS: Step[] = [
  {
    title: "Activate the Hosted MCP server you need",
    body: (
      <>
        In Setup, search <b>MCP Servers</b> and open <b>Salesforce Servers</b>. Pick the server
        you need &mdash; e.g. <code>headless-360</code> &mdash; click <b>Activate</b>, and copy
        its Server URL and API name.
      </>
    ),
    flag: "Prefer a read-only server for a first test.",
  },
  {
    title: "Create a new External Client App",
    body: (
      <>
        In Setup, search <b>External Client App Manager</b> and click{" "}
        <b>New External Client App</b>. Fill in the app name, API name, and contact email.
      </>
    ),
  },
  {
    title: "Enable OAuth settings",
    body: (
      <>
        Expand <b>API (Enable OAuth Settings)</b> and check <b>Enable OAuth</b>. Set the Callback
        URL to match your client &mdash; for local testing with Postman,{" "}
        <code>https://oauth.pstmn.io/v1/callback</code> works.
      </>
    ),
  },
  {
    title: "Add the mcp_api OAuth scope",
    body: (
      <>
        Add <b>Access Salesforce Hosted MCP Servers (mcp_api)</b> &mdash; it exists so you don&rsquo;t
        have to grant the far broader <code>api</code> scope. Add <code>refresh_token</code> /{" "}
        <code>offline_access</code> too if your client needs long-lived sessions without re-login.
      </>
    ),
  },
  {
    title: "Save, then wait for propagation",
    body: (
      <>
        An ECA can take up to <b>~30 minutes</b> to become fully active, like DNS propagation for
        a new domain.
      </>
    ),
    flag: <span className="text-accent-amber">Don&rsquo;t troubleshoot auth failures before that window has passed.</span>,
  },
  {
    title: "Retrieve the Consumer Key and Secret",
    body: (
      <>
        Open the ECA &rarr; <b>Settings</b> &rarr; <b>OAuth Settings</b> &rarr;{" "}
        <b>Consumer Key and Secret</b>. You may need to verify with an emailed code first. The
        Consumer Key is what your client uses as its OAuth Client ID.
      </>
    ),
  },
  {
    title: "Restrict access with a permission set",
    body: (
      <>
        Optional. By default, any org user can authenticate through the ECA. To limit it: create a
        permission set scoped to the ECA, assign it only to the intended users, and set an app
        policy requiring pre-authorization.
      </>
    ),
  },
  {
    title: "Configure and test your client",
    body: (
      <>
        Set the Server URL and Consumer Key in your MCP client, run the OAuth or
        client-credentials flow to get a bearer token, then send one read-only query first to
        confirm the connection end to end.
      </>
    ),
  },
];

const GOOD_PRACTICES: React.ReactNode[] = [
  <>
    <b className="text-softer">One ECA per client type</b> &mdash; one for this app, one for
    Postman, and so on. Keeps permissions and logging separate, per Salesforce&rsquo;s own
    recommendation.
  </>,
  <>
    <b className="text-softer">Calls run as the authenticated user</b>, not a shared integration
    account. Normal CRUD, field-level security, and sharing rules apply on top of whatever the ECA
    scope allows.
  </>,
  <>
    <b className="text-softer">Tokens are Hosted-MCP-specific</b>, JWT-shaped bearer tokens.
    Don&rsquo;t reuse one minted for a different OAuth flow.
  </>,
];

const REFERENCES = [
  {
    name: "Set Up Your Org",
    desc: "Hosted MCP Servers — prerequisites and org configuration",
    href: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/setup-overview.html",
  },
  {
    name: "Create an External Client App",
    desc: "Full walkthrough of steps 2–6 above, with screenshots",
    href: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html",
  },
  {
    name: "Connect MCP Clients",
    desc: "Client-specific setup for Claude, ChatGPT, Cursor, and Postman",
    href: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/client-connection-overview.html",
  },
  {
    name: "How to Secure Salesforce Hosted MCP Servers",
    desc: "Salesforce Developers Blog — hardening an ECA past step 7",
    href: "https://developer.salesforce.com/blogs/2026/06/how-to-secure-salesforce-hosted-mcp-servers",
  },
];

export default function SetupPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-[var(--surface-header)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[840px] items-center gap-3 px-6 py-3">
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
          <Link href="/" className="btn btn-quiet ml-auto px-0">
            &larr; Playground
          </Link>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[840px] flex-1 px-6 py-10">
        <p className="t-eyebrow flex items-center gap-2.5 text-primary">
          <span className="h-px w-6 bg-[var(--accent-hairline)]" />
          Companion guide
        </p>
        <h2 className="t-h1 mt-3 mb-3">Setting up an External Client App for Hosted MCP</h2>
        <p className="t-body1 mb-9 max-w-[46rem] text-muted">
          A Salesforce org has to be configured once before any MCP client &mdash; this
          playground, Claude, Postman, or a custom agent &mdash; can authenticate to a Hosted MCP
          server. These are the eight steps, in order, done once per org.
        </p>

        <div
          className="mb-10 border border-line bg-[var(--surface-panel)] px-4 py-3"
          style={{ borderLeft: "3px solid var(--accent-amber)" }}
        >
          <p className="t-body2 text-softer">
            <span className="font-bold text-accent-amber">Connected Apps are not supported</span>{" "}
            for MCP authentication. It must be an External Client App (ECA) &mdash; a newer,
            separate mechanism in Setup.
          </p>
        </div>

        <h3 className="t-eyebrow mb-4 border-b border-hairline pb-3 text-[0.72rem] text-dim">
          The eight steps
        </h3>
        <ol className="mb-10 flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex">
              <span className="t-eyebrow flex w-11 shrink-0 items-start justify-center border-r border-line bg-[var(--surface-inset)] pt-4 text-[0.8rem] text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                className="min-w-0 px-5 py-4"
                style={{ borderLeft: "3px solid var(--accent-hairline)" }}
              >
                <p className="t-card-title mb-1.5">{step.title}</p>
                <p className="t-body2 text-muted">{step.body}</p>
                {step.flag && <p className="t-body2 mt-2 text-dim">{step.flag}</p>}
              </div>
            </li>
          ))}
        </ol>

        <div className="card mb-10 p-5">
          <h3 className="t-card-title mb-3.5">Good practices</h3>
          <ul className="flex flex-col gap-2.5">
            {GOOD_PRACTICES.map((item, i) => (
              <li key={i} className="t-body2 flex gap-2.5 text-muted">
                <span className="text-primary" aria-hidden>
                  &middot;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <h3 className="t-eyebrow mb-4 border-b border-hairline pb-3 text-[0.72rem] text-dim">
          References
        </h3>
        <div className="mb-10 flex flex-col gap-2">
          {REFERENCES.map((ref) => (
            <a
              key={ref.href}
              href={ref.href}
              target="_blank"
              rel="noreferrer"
              className="card-inset flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:border-primary"
            >
              <span className="min-w-0">
                <span className="t-body2 block font-bold text-softer">{ref.name}</span>
                <span className="t-body2 mt-0.5 block text-[0.78rem] text-dim">{ref.desc}</span>
              </span>
              <span className="shrink-0 font-mono text-primary" aria-hidden>
                &#8599;
              </span>
            </a>
          ))}
        </div>

        <footer className="t-body2 border-t border-hairline pt-4 text-dim">
          Written for the Salesforce MCP Playground. Steps match Setup as of Summer &rsquo;26 &mdash;
          Salesforce occasionally renames these screens between releases.
        </footer>
      </main>
    </div>
  );
}
