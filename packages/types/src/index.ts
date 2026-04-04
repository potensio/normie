// Provider types
export type Provider = "claude" | "opencode" | "kimi" | "bedrock";

export interface Model {
  value: string;
  label: string;
  desc: string;
  default?: boolean;
}

export interface ProviderModels {
  [key: string]: Model[];
}

// Chat types
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  html?: string;
  toolCalls?: ToolCall[];
  reasoning?: string; // Thinking/reasoning content
  inlineToolCalls?: InlineToolCall[]; // Tool calls displayed inline
}

// Inline tool call within a message
export interface InlineToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
}

export interface Chat {
  id: string;
  title: string;
  provider: Provider;
  model: string;
  sessionId?: string;
  updatedAt: number;
  messages: Message[];
  todos?: Todo[];
  toolCalls?: ToolCall[];
  unread?: boolean;
}

// Tool types
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
}

export interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

// Auth types
export interface User {
  id: string;
  email: string;
  displayName?: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
}

// Stream chunk types
export interface StreamChunk {
  type:
    | "session_init"
    | "text"
    | "tool_use"
    | "tool_result"
    | "done"
    | "error"
    | "aborted";
  provider: string;
  session_id?: string;
  content?: string;
  name?: string;
  input?: Record<string, unknown> | string;
  id?: string;
  result?: unknown;
  tool_use_id?: string;
  isReasoning?: boolean;
  message?: string;
}

// File attachment
export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  data: string;
}

// Thinking mode
export type ThinkingMode = "normal" | "extended";

// Browser session
export interface BrowserSession {
  url: string;
  sessionId: string;
}
