"use client";

export function JsonBlock({ title, data, defaultOpen = false }: { title: string; data: unknown; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded border border-neutral-700 bg-neutral-900">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-neutral-200 select-none">
        {title}
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-neutral-700 p-3 text-xs text-neutral-300">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
