"use client";

/**
 * Collapsed by default: it is one-time setup, and the auth card is otherwise
 * dense. Steps mirror the Salesforce Hosted MCP setup guide, with step 5 added
 * because this app uses the client-credentials grant.
 */

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Activate the MCP server",
    body: (
      <>
        Setup &rarr; <b>MCP Servers</b> &rarr; <b>Salesforce Servers</b>. Pick the server you want
        (e.g. <code>headless-360</code>) and click <b>Activate</b>. Prefer a read-only server such
        as <code>sobject-reads</code> for a first test &mdash; several of these can modify records.
      </>
    ),
  },
  {
    title: "Create an External Client App",
    body: (
      <>
        Setup &rarr; <b>External Client App Manager</b> &rarr; <b>New External Client App</b>. Fill
        in the name, API name, and contact email.{" "}
        <span className="text-accent-amber">
          Connected Apps do not work for MCP authentication
        </span>{" "}
        &mdash; it must be an External Client App.
      </>
    ),
  },
  {
    title: "Enable OAuth",
    body: (
      <>
        Expand <b>API (Enable OAuth Settings)</b> and check <b>Enable OAuth</b>. Set a Callback URL
        matching your client &mdash; <code>https://oauth.pstmn.io/v1/callback</code> works for
        testing.
      </>
    ),
  },
  {
    title: "Add the mcp_api scope",
    body: (
      <>
        Add <b>Access Salesforce Hosted MCP Servers (mcp_api)</b>. This scope exists so you don&rsquo;t
        have to grant the far broader <code>api</code> scope. Add <code>refresh_token</code> /{" "}
        <code>offline_access</code> only if your client needs long-lived sessions.
      </>
    ),
  },
  {
    title: "Enable the client-credentials flow",
    body: (
      <>
        <span className="text-primary">Needed for the Client Credentials tab here.</span> Check{" "}
        <b>Enable Client Credentials Flow</b> and choose a <b>Run As</b> user. Skip this and only
        the Access Token tab will work.
      </>
    ),
  },
  {
    title: "Save, then wait ~30 minutes",
    body: (
      <>
        An ECA can take up to half an hour to become active, like DNS propagation. Don&rsquo;t
        troubleshoot auth failures until that window has passed &mdash; almost every &ldquo;it
        doesn&rsquo;t work&rdquo; report is really this.
      </>
    ),
  },
  {
    title: "Copy the Consumer Key and Secret",
    body: (
      <>
        Open the ECA &rarr; <b>Settings</b> &rarr; <b>OAuth Settings</b> &rarr;{" "}
        <b>Consumer Key and Secret</b>. You may have to verify with an emailed code. The Consumer
        Key is the Client ID below.
      </>
    ),
  },
];

export function SetupGuide() {
  return (
    <details className="mb-4 border border-line bg-[var(--surface-panel)]">
      <summary className="t-body2 cursor-pointer list-none px-3 py-2 text-primary select-none">
        First time here? Set up an External Client App &rsaquo;
      </summary>
      <div className="border-t border-line px-3 py-3">
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[1.25rem_1fr] gap-x-2">
              <span className="t-eyebrow pt-0.5 text-[0.66rem] text-primary">{i + 1}</span>
              <div className="min-w-0">
                <span className="t-body2 block font-bold">{step.title}</span>
                <span className="t-body2 block text-muted [&_code]:font-mono [&_code]:text-[0.8rem] [&_code]:text-softer">
                  {step.body}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <p className="t-body2 mt-4 border-t border-line pt-3 text-dim">
          Calls run as the authenticated user, so CRUD, field-level security, and sharing rules
          still apply on top of the scope. Use one ECA per client to keep permissions and logging
          separate.{" "}
          <a
            href="https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_mcp_setup.htm"
            target="_blank"
            rel="noreferrer"
            className="text-primary"
          >
            Set up your org &rarr;
          </a>{" "}
          <a
            href="https://developer.salesforce.com/docs/atlas.en-us.oas.meta/oas/oas_external_client_app.htm"
            target="_blank"
            rel="noreferrer"
            className="ml-3 text-primary"
          >
            Create an ECA &rarr;
          </a>{" "}
          <a
            href="https://developer.salesforce.com/blogs/2026/06/how-to-secure-salesforce-hosted-mcp-servers"
            target="_blank"
            rel="noreferrer"
            className="ml-3 text-primary"
          >
            Securing Hosted MCP &rarr;
          </a>
        </p>
      </div>
    </details>
  );
}
