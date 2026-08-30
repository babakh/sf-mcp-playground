"use client";

export function JsonBlock({ title, data, defaultOpen = false }: { title: string; data: unknown; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="card-inset">
      <summary className="t-card-title cursor-pointer px-3 py-2 select-none">
        {title}
      </summary>
      <pre className="max-h-96 overflow-auto border-t border-line p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-soft">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
