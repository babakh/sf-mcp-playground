"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a Claude answer as markdown, styled to the flat/square theme.
 *
 * The model returns GFM — tables, bold, lists. Dropping that into a `<p>` shows
 * the source and collapses every newline, which turns a wide table into one
 * run-on paragraph. remark-gfm supplies table/strikethrough support that plain
 * CommonMark lacks.
 *
 * react-markdown does not render raw HTML by default, so model output cannot
 * inject markup here. Do not add rehype-raw.
 */
export function Answer({ children }: { children: string }) {
  return (
    <div className="t-body2 min-w-0 space-y-3 text-softer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Tables get their own scroll container: an org with many columns
          // would otherwise stretch the chat column and break the page grid.
          table: ({ children }) => (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse border border-line text-left">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="t-eyebrow border border-line bg-[var(--surface-panel)] px-2 py-1.5 text-[0.66rem] whitespace-nowrap text-muted">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-line px-2 py-1.5 align-top">{children}</td>
          ),
          code: ({ children, className }) =>
            // Fenced blocks arrive with a language class; bare inline code does not.
            className ? (
              <code className={`${className} font-mono text-[0.8rem]`}>{children}</code>
            ) : (
              <code className="border border-line bg-[var(--surface-panel)] px-1 py-0.5 font-mono text-[0.8rem] text-primary">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto border border-line bg-[var(--surface-panel)] p-3 font-mono text-[0.8rem] text-soft">
              {children}
            </pre>
          ),
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => <h4 className="t-card-title mt-4">{children}</h4>,
          h2: ({ children }) => <h5 className="t-card-title mt-4">{children}</h5>,
          h3: ({ children }) => <h6 className="t-card-title mt-4">{children}</h6>,
          strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
          hr: () => <hr className="border-line" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-primary pl-3 text-muted">
              {children}
            </blockquote>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
