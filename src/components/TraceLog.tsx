"use client";

import type { TraceEvent } from "@/lib/types";

const CATEGORY_STYLES: Record<string, { badge: string; border: string }> = {
  CONNECT: { badge: "bg-neutral-700 text-neutral-200", border: "border-l-neutral-500" },
  AUTH: { badge: "bg-purple-900 text-purple-200", border: "border-l-purple-600" },
  HANDSHAKE: { badge: "bg-emerald-900 text-emerald-200", border: "border-l-emerald-600" },
  TOOLS: { badge: "bg-sky-900 text-sky-200", border: "border-l-sky-600" },
  RESOURCES: { badge: "bg-sky-900 text-sky-200", border: "border-l-sky-600" },
  PROMPTS: { badge: "bg-sky-900 text-sky-200", border: "border-l-sky-600" },
  "CLAUDE REQUEST": { badge: "bg-indigo-900 text-indigo-200", border: "border-l-indigo-600" },
  "CLAUDE RESPONSE": { badge: "bg-indigo-900 text-indigo-200", border: "border-l-indigo-600" },
  "MCP CALL_TOOL": { badge: "bg-amber-900 text-amber-200", border: "border-l-amber-600" },
  TIMING: { badge: "bg-teal-900 text-teal-200", border: "border-l-teal-600" },
  ERROR: { badge: "bg-red-900 text-red-200", border: "border-l-red-600" },
};
const DEFAULT_STYLE = { badge: "bg-neutral-700 text-neutral-300", border: "border-l-neutral-600" };

function categoryOf(section: string): string {
  return section.includes(":") ? section.split(":")[0].trim() : section;
}

function truncate(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Best-effort one-line preview of a trace event's payload for quick scanning. */
function summarize(event: TraceEvent): string | null {
  const { section, label, data } = event;

  if (label === "messages" && Array.isArray(data)) {
    return `${data.length} message${data.length === 1 ? "" : "s"} in context`;
  }
  if (section.startsWith("CLAUDE RESPONSE") && Array.isArray(data)) {
    const toolBlocks = data.filter((b) => isJsonRecord(b) && b.type === "tool_use");
    if (toolBlocks.length) {
      return `→ calling ${toolBlocks.map((b) => (b as JsonRecord).name).join(", ")}`;
    }
    const textBlock = data.find((b) => isJsonRecord(b) && b.type === "text") as JsonRecord | undefined;
    if (typeof textBlock?.text === "string") return truncate(textBlock.text);
  }
  if (label === "arguments") return truncate(JSON.stringify(data));
  if (label === "result" && typeof data === "string") return truncate(data);
  if (label === "obtained access token" && isJsonRecord(data)) {
    return `instance: ${data.instance_url ?? "n/a"}`;
  }
  if (label === "initialize result" && isJsonRecord(data) && isJsonRecord(data.serverInfo)) {
    return `${data.serverInfo.name} v${data.serverInfo.version}`;
  }
  if (Array.isArray(data) && /\/list$/.test(label)) {
    return `${data.length} discovered`;
  }
  if (typeof data === "string") return truncate(data);
  return null;
}

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

type Group = {
  groupId: string;
  groupLabel: string;
  events: TraceEvent[];
};

function groupTrace(trace: TraceEvent[]): Group[] {
  const groups: Group[] = [];
  const byId = new Map<string, Group>();

  trace.forEach((event, i) => {
    const groupId = event.groupId ?? `ungrouped-${i}`;
    const groupLabel = event.groupLabel ?? event.section;
    let group = byId.get(groupId);
    if (!group) {
      group = { groupId, groupLabel, events: [] };
      byId.set(groupId, group);
      groups.push(group);
    }
    group.events.push(event);
  });

  return groups;
}

function EventEntry({ event }: { event: TraceEvent }) {
  const category = categoryOf(event.section);
  const style = CATEGORY_STYLES[category] ?? DEFAULT_STYLE;
  const summary = summarize(event);
  const isError = category === "ERROR";

  return (
    <details open={isError} className={`rounded border border-neutral-700 border-l-4 bg-neutral-950 ${style.border}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm select-none">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${style.badge}`}>
          {category}
        </span>
        <span className="truncate text-neutral-200">{event.label}</span>
        {summary && <span className="truncate text-neutral-500">— {summary}</span>}
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-neutral-700 p-3 text-xs text-neutral-300">
        {typeof event.data === "string" ? event.data : JSON.stringify(event.data, null, 2)}
      </pre>
    </details>
  );
}

export function TraceLog({ trace }: { trace: TraceEvent[] }) {
  if (!trace.length) {
    return <p className="text-sm text-neutral-500">No messages exchanged yet.</p>;
  }

  const groups = groupTrace(trace);

  return (
    <div className="flex max-h-[32rem] flex-col gap-2 overflow-auto">
      {groups.map((group) => {
        const hasError = group.events.some((e) => categoryOf(e.section) === "ERROR");
        const timingEvent = group.events.find((e) => categoryOf(e.section) === "TIMING");
        const time = formatTime(group.events[0]?.timestamp);

        return (
          <details key={group.groupId} className="rounded border border-neutral-700 bg-neutral-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm select-none">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                  hasError ? "bg-red-900 text-red-200" : "bg-blue-900 text-blue-200"
                }`}
              >
                {group.events.length}
              </span>
              <span className="truncate font-medium text-neutral-100">{group.groupLabel}</span>
              {typeof timingEvent?.data === "string" && (
                <span className="shrink-0 text-xs text-neutral-500">{timingEvent.data}</span>
              )}
              {time && <span className="ml-auto shrink-0 pl-2 text-[10px] text-neutral-600">{time}</span>}
            </summary>
            <div className="flex flex-col gap-2 border-t border-neutral-700 p-2">
              {group.events.map((event, i) => (
                <EventEntry key={i} event={event} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
