export type TraceEvent = {
  section: string;
  label: string;
  data?: unknown;
  timestamp?: number;
  groupId?: string;
  groupLabel?: string;
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
