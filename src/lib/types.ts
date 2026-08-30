export type TraceEvent = {
  section: string;
  label: string;
  data?: unknown;
  timestamp?: number;
  groupId?: string;
  groupLabel?: string;
  /** Wall-clock duration of the request this event belongs to, in ms. */
  groupMs?: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: unknown;
};

export type ConnectionParams = {
  endpoint?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  loginUrl?: string;
};
