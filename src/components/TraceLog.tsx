"use client";

import type { TraceEvent } from "@/lib/types";

/** Category -> categorical accent from the brand's 8-colour dimension set. */
const CATEGORY_COLORS: Record<string, string> = {
  CONNECT: "var(--brand-slate-500)",
  AUTH: "var(--accent-purple)",
  HANDSHAKE: "var(--accent-green)",
  TOOLS: "var(--accent-cyan)",
  RESOURCES: "var(--accent-blue)",
  PROMPTS: "var(--accent-pink)",
  "CLAUDE REQUEST": "var(--accent-periwinkle)",
  "CLAUDE RESPONSE": "var(--accent-periwinkle)",
  "MCP CALL_TOOL": "var(--accent-amber)",
  ERROR: "var(--accent-coral)",
};
const DEFAULT_COLOR = "var(--brand-slate-500)";

/** Flat badge: accent text on a translucent wash of the same accent, square, 1px rule. */
function badgeStyle(color: string) {
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
  };
}

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
  durationMs?: number;
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
      group = { groupId, groupLabel, durationMs: event.groupMs, events: [] };
      byId.set(groupId, group);
      groups.push(group);
    }
    group.events.push(event);
  });

  return groups;
}

function EventEntry({ event }: { event: TraceEvent }) {
  const category = categoryOf(event.section);
  const color = CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
  const summary = summarize(event);
  const isError = category === "ERROR";

  return (
    <details
      open={isError}
      className="border border-line bg-[var(--surface-panel)]"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none">
        <span
          className="t-eyebrow shrink-0 px-1.5 py-0.5 text-[0.62rem]"
          style={badgeStyle(color)}
        >
          {category}
        </span>
        <span className="t-body2 truncate text-softer">{event.label}</span>
        {summary && <span className="t-body2 truncate text-dim">— {summary}</span>}
      </summary>
      <pre className="max-h-96 overflow-auto border-t border-line p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-soft">
        {typeof event.data === "string" ? event.data : JSON.stringify(event.data, null, 2)}
      </pre>
    </details>
  );
}

export function TraceLog({ trace }: { trace: TraceEvent[] }) {
  if (!trace.length) {
    return (
      <p className="t-body2 text-dim">
        Nothing on the wire yet. Connect above and the handshake, discovery calls, and every
        Claude/MCP exchange will appear here.
      </p>
    );
  }

  const groups = groupTrace(trace);

  return (
    <div className="flex max-h-[32rem] flex-col gap-2 overflow-auto">
      {groups.map((group) => {
        const hasError = group.events.some((e) => categoryOf(e.section) === "ERROR");
        const time = formatTime(group.events[0]?.timestamp);
        const color = hasError ? "var(--accent-coral)" : "var(--brand-primary)";

        return (
          <details key={group.groupId} className="card-inset">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none">
              <span
                className="t-eyebrow shrink-0 px-1.5 py-0.5 text-[0.62rem]"
                style={badgeStyle(color)}
              >
                {group.events.length}
              </span>
              <span className="t-body2 truncate font-bold">{group.groupLabel}</span>
              {group.durationMs !== undefined && (
                <span className="t-body2 shrink-0 text-dim">
                  {group.durationMs.toFixed(0)} ms
                </span>
              )}
              {time && (
                <span className="ml-auto shrink-0 pl-2 font-mono text-[0.68rem] text-dimmer">
                  {time}
                </span>
              )}
            </summary>
            <div className="flex flex-col gap-2 border-t border-line p-2">
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
